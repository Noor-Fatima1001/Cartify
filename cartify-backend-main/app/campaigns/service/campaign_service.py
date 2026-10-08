import logging
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from app.billing.models import CreditLedger, Notification, Wallet
from app.billing.models.wallet import InsufficientCreditsError
from app.billing.service.notification_service import notify
from app.campaigns.models import (
    CAMPAIGN_DURATION_DAYS,
    Campaign,
    CampaignAuditLog,
    CampaignProduct,
)

logger = logging.getLogger(__name__)


class CampaignError(Exception):
    """User-facing campaign rule violation."""


def snapshot(campaign):
    """State snapshot stored in audit logs (budget + targeting/products).

    product_name is denormalized here (not just product_id) so the audit
    trail stays readable even if the product is later deleted.
    """
    return {
        'status': campaign.status,
        'total_budget': str(campaign.total_budget),
        'spent': str(campaign.spent),
        'products': [
            {
                'product_id': cp.product_id,
                'product_name': cp.product.name,
                'objectives': cp.objectives(),
            }
            for cp in campaign.products.select_related('product').all().order_by('product_id')
        ],
    }


def log_action(campaign, action, actor=None, previous_state=None, new_state=None, reason=''):
    try:
        CampaignAuditLog.objects.create(
            campaign=campaign,
            actor=actor,
            action=action,
            previous_state=previous_state or {},
            new_state=new_state if new_state is not None else snapshot(campaign),
            reason=reason or '',
        )
    except Exception:
        logger.exception('Failed to write audit log for campaign %s', campaign.pk)


def _set_campaign_products(campaign, product_entries):
    """product_entries: list of {'product_id': int, 'objectives': {...}} dicts,
    already validated to belong to the campaign vendor."""
    campaign.products.all().delete()
    for entry in product_entries:
        CampaignProduct.objects.create(
            campaign=campaign,
            product_id=entry['product_id'],
            charge_views=entry['objectives'].get('views', False),
            charge_favorites=entry['objectives'].get('favorites', False),
            charge_cart_adds=entry['objectives'].get('cart_adds', False),
            charge_link_clicks=entry['objectives'].get('link_clicks', False),
        )


def create_campaign(vendor, name, budget, product_entries):
    budget = Decimal(budget).quantize(Decimal('0.01'))
    if budget <= 0:
        raise CampaignError('Budget must be greater than zero')

    with transaction.atomic():
        wallet = Wallet.lock_for(vendor)
        try:
            campaign = Campaign.objects.create(vendor=vendor, name=name, total_budget=budget)
            wallet.apply(
                CreditLedger.CAMPAIGN_RESERVE,
                -budget,
                description=f'Budget reserved for campaign "{name}"',
                reference_type='campaign',
                reference_id=campaign.id,
            )
        except InsufficientCreditsError:
            raise CampaignError('Insufficient credits to reserve this budget. Please top up first.')
        _set_campaign_products(campaign, product_entries)
        log_action(campaign, CampaignAuditLog.CREATED, actor=vendor, previous_state={})
    return campaign


def update_campaign_products(campaign, product_entries, actor=None, new_name=None):
    if campaign.status not in (Campaign.DRAFT, Campaign.PAUSED):
        raise CampaignError('Products and objectives can only be edited while the campaign is Draft or Paused')
    with transaction.atomic():
        previous = snapshot(campaign)
        if new_name:
            campaign.name = new_name
            campaign.save(update_fields=['name', 'updated_at'])
        if product_entries is not None:
            _set_campaign_products(campaign, product_entries)
        log_action(campaign, CampaignAuditLog.PRODUCTS_CHANGED, actor=actor, previous_state=previous)


def change_budget(campaign_id, new_budget, actor):
    new_budget = Decimal(new_budget).quantize(Decimal('0.01'))
    with transaction.atomic():
        campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
        if campaign.status in (Campaign.COMPLETED,):
            raise CampaignError('Completed campaigns cannot be modified')
        if new_budget < campaign.spent:
            raise CampaignError(f'Budget cannot be lower than the amount already spent ({campaign.spent})')
        delta = new_budget - campaign.total_budget
        if delta == 0:
            return campaign

        previous = snapshot(campaign)
        wallet = Wallet.lock_for(campaign.vendor)
        if delta > 0:
            try:
                wallet.apply(
                    CreditLedger.CAMPAIGN_BUDGET_INCREASE,
                    -delta,
                    description=f'Budget increase for campaign "{campaign.name}"',
                    reference_type='campaign',
                    reference_id=campaign.id,
                    actor=actor,
                )
            except InsufficientCreditsError:
                raise CampaignError('Insufficient credits for this budget increase')
        else:
            wallet.apply(
                CreditLedger.CAMPAIGN_BUDGET_DECREASE,
                -delta,  # delta negative → positive refund
                description=f'Budget decrease for campaign "{campaign.name}"',
                reference_type='campaign',
                reference_id=campaign.id,
                actor=actor,
            )

        campaign.total_budget = new_budget
        # A budget increase can revive an out-of-budget campaign.
        if campaign.status == Campaign.OUT_OF_BUDGET and campaign.remaining > 0:
            campaign.status = Campaign.ACTIVE
        campaign.save(update_fields=['total_budget', 'status', 'updated_at'])
        log_action(campaign, CampaignAuditLog.BUDGET_CHANGED, actor=actor, previous_state=previous)
    return campaign


def start_campaign(campaign_id, actor):
    with transaction.atomic():
        campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
        if campaign.status != Campaign.DRAFT:
            raise CampaignError('Only draft campaigns can be started')
        if not campaign.products.exists():
            raise CampaignError('Add at least one product before starting the campaign')
        previous = snapshot(campaign)
        now = timezone.now()
        campaign.status = Campaign.ACTIVE
        campaign.started_at = now
        campaign.ends_at = now + timedelta(days=CAMPAIGN_DURATION_DAYS)
        campaign.save(update_fields=['status', 'started_at', 'ends_at', 'updated_at'])
        log_action(campaign, CampaignAuditLog.STARTED, actor=actor, previous_state=previous)
    return campaign


def pause_campaign(campaign_id, actor, reason=''):
    with transaction.atomic():
        campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
        if campaign.status != Campaign.ACTIVE:
            raise CampaignError('Only active campaigns can be paused')
        previous = snapshot(campaign)
        campaign.status = Campaign.PAUSED
        campaign.save(update_fields=['status', 'updated_at'])
        log_action(campaign, CampaignAuditLog.PAUSED, actor=actor, previous_state=previous, reason=reason)
    return campaign


def resume_campaign(campaign_id, actor):
    with transaction.atomic():
        campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
        if campaign.status != Campaign.PAUSED:
            raise CampaignError('Only paused campaigns can be resumed')
        if campaign.ends_at and campaign.ends_at <= timezone.now():
            raise CampaignError('This campaign has already reached its end date')
        previous = snapshot(campaign)
        campaign.status = Campaign.ACTIVE
        campaign.save(update_fields=['status', 'updated_at'])
        log_action(campaign, CampaignAuditLog.RESUMED, actor=actor, previous_state=previous)
    return campaign


def complete_campaign(campaign_id, actor=None, action=None, notify_vendor=True, reason=''):
    """Stop a campaign and refund the unused budget. Used for manual stop,
    natural 1-month completion, and maintenance sweeps."""
    with transaction.atomic():
        campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
        if campaign.status in (Campaign.COMPLETED,):
            return campaign
        previous = snapshot(campaign)
        refund = campaign.remaining
        if refund > 0:
            wallet = Wallet.lock_for(campaign.vendor)
            wallet.apply(
                CreditLedger.CAMPAIGN_REFUND,
                refund,
                description=f'Unused budget refund for campaign "{campaign.name}"',
                reference_type='campaign',
                reference_id=campaign.id,
                actor=actor,
            )
        campaign.status = Campaign.COMPLETED
        campaign.completed_at = timezone.now()
        campaign.save(update_fields=['status', 'completed_at', 'updated_at'])
        log_action(campaign, action or CampaignAuditLog.STOPPED, actor=actor, previous_state=previous, reason=reason)

    if notify_vendor:
        notify(
            campaign.vendor,
            Notification.CAMPAIGN_COMPLETED,
            'Campaign Completed',
            f'Your campaign "{campaign.name}" has completed. '
            f'Spent: {campaign.spent} credits. Unused budget refunded: {refund} credits.',
            data={'campaign_id': campaign.id, 'refund': str(refund)},
        )
    return campaign


def mark_out_of_budget(campaign, actor=None):
    """Caller must hold the row lock inside a transaction."""
    previous = snapshot(campaign)
    campaign.status = Campaign.OUT_OF_BUDGET
    campaign.save(update_fields=['status', 'updated_at'])
    log_action(campaign, CampaignAuditLog.OUT_OF_BUDGET, actor=actor, previous_state=previous)
