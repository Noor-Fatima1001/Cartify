import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from app.billing.models import Notification
from app.billing.service.notification_service import notify
from app.campaigns.models import Campaign, CampaignCharge, CampaignPricing, CampaignProduct
from app.campaigns.service import campaign_service

logger = logging.getLogger(__name__)

OBJECTIVE_FLAG = {
    CampaignCharge.VIEW: 'charge_views',
    CampaignCharge.FAVORITE: 'charge_favorites',
    CampaignCharge.CART_ADD: 'charge_cart_adds',
    CampaignCharge.LINK_CLICK: 'charge_link_clicks',
}


def charge_interaction(product, objective, user=None, guest_id=None):
    """Charge an active campaign for a completed interaction.

    Never raises — tracking endpoints must not break if charging fails.
    Dedup: one charge per visitor per product per objective per campaign per day
    (enforced by DB unique constraints).
    """
    try:
        _charge(product, objective, user=user, guest_id=guest_id)
    except Exception:
        logger.exception('charge_interaction failed (product=%s objective=%s)', getattr(product, 'pk', None), objective)


def _charge(product, objective, user=None, guest_id=None):
    if objective not in OBJECTIVE_FLAG:
        return

    # Vendors are never charged for interacting with their own products.
    if user is not None and getattr(user, 'pk', None) == product.vendor_id:
        return

    # Anonymous with no identity at all: cannot dedup, do not charge.
    if user is None and not guest_id:
        return

    # Cheap pre-check without locks.
    links = list(
        CampaignProduct.objects.filter(
            product=product,
            campaign__status=Campaign.ACTIVE,
            **{OBJECTIVE_FLAG[objective]: True},
        ).select_related('campaign').order_by('campaign__ends_at')
    )
    if not links:
        return

    now = timezone.now()
    for link in links:
        campaign = link.campaign

        # Lazy natural-completion backstop.
        if campaign.ends_at and campaign.ends_at <= now:
            try:
                campaign_service.complete_campaign(
                    campaign.id, action='COMPLETED', notify_vendor=True
                )
            except Exception:
                logger.exception('Failed to lazily complete campaign %s', campaign.id)
            continue

        if _charge_campaign(campaign.id, product, objective, user=user, guest_id=guest_id):
            return  # charge at most one campaign per interaction


def _charge_campaign(campaign_id, product, objective, user=None, guest_id=None):
    """Returns True if this campaign handled the interaction (charged or deduped)."""
    price = CampaignPricing.load().cost_for(objective)
    if price <= 0:
        return True

    out_of_budget_campaign = None
    charged = False
    with transaction.atomic():
        campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
        if campaign.status != Campaign.ACTIVE:
            return False

        if campaign.remaining < price:
            campaign_service.mark_out_of_budget(campaign)
            out_of_budget_campaign = campaign
        else:
            charged = True
            try:
                with transaction.atomic():  # savepoint so IntegrityError doesn't poison the outer transaction
                    CampaignCharge.objects.create(
                        campaign=campaign,
                        product=product,
                        objective=objective,
                        amount=price,
                        user=user if user is not None else None,
                        guest_id=None if user is not None else str(guest_id),
                    )
            except IntegrityError:
                # Already charged this visitor today for this objective.
                return True

            campaign.spent = campaign.spent + price
            campaign.save(update_fields=['spent', 'updated_at'])
            if campaign.remaining <= 0:
                campaign_service.mark_out_of_budget(campaign)
                out_of_budget_campaign = campaign

    if out_of_budget_campaign is not None:
        notify(
            out_of_budget_campaign.vendor,
            Notification.CAMPAIGN_OUT_OF_BUDGET,
            'Campaign Out of Budget',
            f'Your campaign "{out_of_budget_campaign.name}" has used its full budget of '
            f'{out_of_budget_campaign.total_budget} credits and has been stopped. '
            f'Increase the budget to resume it.',
            data={'campaign_id': out_of_budget_campaign.id},
        )
    # If this campaign just ran out of budget, let the caller try the vendor's
    # next active campaign for the same product.
    return charged
