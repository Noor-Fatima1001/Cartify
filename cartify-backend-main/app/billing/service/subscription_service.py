import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from app.billing.models import (
    CreditLedger,
    Notification,
    SubscriptionAuditLog,
    SubscriptionPlan,
    VendorSubscription,
    Wallet,
)
from app.billing.models.wallet import InsufficientCreditsError

logger = logging.getLogger(__name__)

SUBSCRIPTION_DURATION_DAYS = 30


class SubscriptionError(Exception):
    """User-facing subscription rule violation."""


def _snapshot(sub):
    if not sub:
        return {}
    return {
        'id': sub.id,
        'plan_id': sub.plan_id,
        'plan_name': sub.plan.name,
        'status': sub.status,
        'started_at': sub.started_at.isoformat(),
        'expires_at': sub.expires_at.isoformat(),
        'credits_paid': str(sub.credits_paid),
        'renewal_count': sub.renewal_count,
        'cancel_at_period_end': sub.cancel_at_period_end,
    }


def get_active_subscription(vendor):
    """Return the vendor's ACTIVE subscription, lazily expiring it if overdue.

    Returns None when the vendor is on the free default plan.
    """
    sub = (
        VendorSubscription.objects.select_related('plan')
        .filter(vendor=vendor, status=VendorSubscription.ACTIVE)
        .order_by('-expires_at')
        .first()
    )
    if not sub:
        return None
    if sub.expires_at <= timezone.now():
        _expire_subscription(sub)
        return None
    return sub


def _expire_subscription(sub):
    """Called when a subscription's `expires_at` has genuinely passed — either
    it just lapsed unrenewed, or a cancellation was previously scheduled for
    this row and its period has now run out. Either way this is the one place
    where access actually drops."""
    from app.billing.service.notification_service import notify

    previous_state = _snapshot(sub)
    was_cancelled = sub.cancel_at_period_end
    sub.status = VendorSubscription.CANCELLED if was_cancelled else VendorSubscription.EXPIRED
    sub.save(update_fields=['status'])
    try:
        enforce_product_limit(sub.vendor)
    except Exception:
        logger.exception('Failed to enforce product limit for vendor %s', sub.vendor_id)
    SubscriptionAuditLog.objects.create(
        vendor=sub.vendor, subscription=sub, actor=None,
        action=SubscriptionAuditLog.CANCELLED if was_cancelled else SubscriptionAuditLog.EXPIRED,
        previous_state=previous_state, new_state=_snapshot(sub),
    )
    if was_cancelled:
        notify(
            sub.vendor,
            Notification.SUBSCRIPTION_CANCELLED,
            'Subscription Ended',
            f'Your "{sub.plan.name}" subscription has ended as scheduled. Products beyond the free limit '
            f'have been deactivated. Purchase a new subscription to reactivate them.',
            data={'subscription_id': sub.id, 'plan': sub.plan.name},
        )
    else:
        notify(
            sub.vendor,
            Notification.SUBSCRIPTION_EXPIRED,
            'Subscription Expired',
            f'Your "{sub.plan.name}" subscription has expired. Products beyond the free limit have been '
            f'deactivated. Purchase a new subscription to reactivate them.',
            data={'subscription_id': sub.id, 'plan': sub.plan.name},
        )


def get_entitlements(vendor):
    """Resolve the vendor's current entitlements from their active plan,
    falling back to the seeded free default plan."""
    sub = get_active_subscription(vendor)
    plan = sub.plan if sub else SubscriptionPlan.get_free_default()

    if plan is None:
        # Free default missing (should be seeded); use conservative built-ins.
        return {
            'plan_id': None,
            'plan_name': 'Free',
            'max_active_products': 4,
            'allow_cart': False,
            'can_view_viewers': False,
            'can_view_favoriters': False,
            'can_view_cart_users': False,
            'can_view_clickers': False,
            'visitor_detail_limit': 4,
            'features': {},
            'subscription': None,
        }

    return {
        'plan_id': plan.id,
        'plan_name': plan.name,
        'max_active_products': plan.max_active_products,
        'allow_cart': plan.allow_cart,
        'can_view_viewers': plan.can_view_viewers,
        'can_view_favoriters': plan.can_view_favoriters,
        'can_view_cart_users': plan.can_view_cart_users,
        'can_view_clickers': plan.can_view_clickers,
        'visitor_detail_limit': plan.visitor_detail_limit,
        'features': plan.features,
        'subscription': sub,
    }


def vendor_allows_cart(vendor):
    try:
        return get_entitlements(vendor)['allow_cart']
    except Exception:
        logger.exception('Failed to resolve cart entitlement for vendor %s', getattr(vendor, 'pk', None))
        return False


def purchase_subscription(vendor, plan, actor=None):
    """Buy a plan with credits. Renewing the same plan extends from the current
    expiry; a different plan replaces the current subscription immediately
    (no proration). Reactivates auto-deactivated products up to the new limit."""
    from app.billing.service.notification_service import notify

    if not plan.is_active:
        raise SubscriptionError('This plan is no longer available')

    with transaction.atomic():
        wallet = Wallet.lock_for(vendor)
        try:
            entry = wallet.apply(
                CreditLedger.SUBSCRIPTION_PURCHASE,
                -plan.price_credits,
                description=f'Subscription purchase: {plan.name}',
                reference_type='subscription',
                actor=actor,
            )
        except InsufficientCreditsError:
            raise SubscriptionError('Insufficient credits to purchase this plan. Please top up first.')

        now = timezone.now()
        current = (
            VendorSubscription.objects.select_for_update()
            .filter(vendor=vendor, status=VendorSubscription.ACTIVE)
            .order_by('-expires_at')
            .first()
        )

        previous_state = _snapshot(current)
        start = now
        renewal_count = 0
        audit_action = SubscriptionAuditLog.PURCHASED
        if current:
            if current.expires_at > now and current.plan_id == plan.id:
                # Renewal: extend from the current expiry.
                start = current.expires_at
                current.status = VendorSubscription.EXPIRED
                renewal_count = current.renewal_count + 1
                audit_action = SubscriptionAuditLog.RENEWED
            elif current.expires_at > now:
                # Plan change: replace immediately.
                current.status = VendorSubscription.CANCELLED
                audit_action = SubscriptionAuditLog.PLAN_SWITCHED
            else:
                current.status = VendorSubscription.EXPIRED
            # Buying again — including on a row with a pending cancellation —
            # supersedes it outright, so any scheduled cancellation on the old
            # row is now moot.
            current.cancel_at_period_end = False
            current.save(update_fields=['status', 'cancel_at_period_end'])

        subscription = VendorSubscription.objects.create(
            vendor=vendor,
            plan=plan,
            status=VendorSubscription.ACTIVE,
            started_at=start,
            expires_at=start + timedelta(days=SUBSCRIPTION_DURATION_DAYS),
            credits_paid=plan.price_credits,
            ledger_entry=entry,
            renewed_from=current,
            renewal_count=renewal_count,
        )
        entry.reference_id = subscription.id
        entry.save(update_fields=['reference_id'])

        SubscriptionAuditLog.objects.create(
            vendor=vendor, subscription=subscription, actor=actor,
            action=audit_action,
            previous_state=previous_state, new_state=_snapshot(subscription),
        )

        reactivated = reactivate_products(vendor)

    notify(
        vendor,
        Notification.SUBSCRIPTION_PURCHASED,
        'Subscription Purchased',
        f'Your "{plan.name}" subscription is active until {subscription.expires_at.strftime("%d %b %Y")}. '
        f'{plan.price_credits} credits were deducted from your wallet.'
        + (f' {reactivated} of your products were reactivated.' if reactivated else ''),
        data={'subscription_id': subscription.id, 'plan': plan.name},
    )
    return subscription


def cancel_subscription(vendor, actor, reason=''):
    """Schedule cancellation of the vendor's active subscription (self or
    admin-initiated). This does NOT cut off access immediately: the vendor
    keeps their current plan's entitlements in full until `expires_at`, at
    which point the maintenance job (or a lazy check) finalizes it — see
    `_expire_subscription`. Credits already paid are not refunded. Can be
    undone any time before it takes effect via `resume_subscription`.
    """
    from app.billing.service.notification_service import notify

    with transaction.atomic():
        sub = (
            VendorSubscription.objects.select_for_update()
            .filter(vendor=vendor, status=VendorSubscription.ACTIVE)
            .order_by('-expires_at')
            .first()
        )
        if not sub:
            raise SubscriptionError('This vendor has no active subscription to cancel')
        if sub.cancel_at_period_end:
            raise SubscriptionError(
                f'Cancellation is already scheduled for {sub.expires_at.strftime("%d %b %Y")}'
            )

        previous_state = _snapshot(sub)
        sub.cancel_at_period_end = True
        sub.cancelled_at = timezone.now()
        sub.cancelled_by = actor
        sub.save(update_fields=['cancel_at_period_end', 'cancelled_at', 'cancelled_by'])

        SubscriptionAuditLog.objects.create(
            vendor=vendor, subscription=sub, actor=actor,
            action=SubscriptionAuditLog.CANCEL_SCHEDULED, reason=reason,
            previous_state=previous_state, new_state=_snapshot(sub),
        )

    notify(
        vendor,
        Notification.SUBSCRIPTION_CANCEL_SCHEDULED,
        'Subscription Cancellation Scheduled',
        f'Your "{sub.plan.name}" subscription is set to end on {sub.expires_at.strftime("%d %b %Y")}'
        + (' (cancelled by an admin' + (f': {reason}' if reason else '') + ')' if actor and actor.pk != vendor.pk else '')
        + '. You keep full access until then — nothing changes right now. You can undo this any time '
          'before it takes effect.',
        data={'subscription_id': sub.id, 'plan': sub.plan.name},
    )
    return sub


def resume_subscription(vendor, actor):
    """Undo a scheduled cancellation while it's still pending (before
    `expires_at`). No charge — the subscription simply continues as normal."""
    from app.billing.service.notification_service import notify

    with transaction.atomic():
        sub = (
            VendorSubscription.objects.select_for_update()
            .filter(vendor=vendor, status=VendorSubscription.ACTIVE)
            .order_by('-expires_at')
            .first()
        )
        if not sub:
            raise SubscriptionError('This vendor has no active subscription')
        if not sub.cancel_at_period_end:
            raise SubscriptionError('There is no scheduled cancellation to undo')

        previous_state = _snapshot(sub)
        sub.cancel_at_period_end = False
        sub.cancelled_at = None
        sub.cancelled_by = None
        sub.save(update_fields=['cancel_at_period_end', 'cancelled_at', 'cancelled_by'])

        SubscriptionAuditLog.objects.create(
            vendor=vendor, subscription=sub, actor=actor,
            action=SubscriptionAuditLog.REACTIVATED,
            previous_state=previous_state, new_state=_snapshot(sub),
        )

    notify(
        vendor,
        Notification.SUBSCRIPTION_REACTIVATED,
        'Subscription Reactivated',
        f'Your "{sub.plan.name}" subscription will now continue as normal and renew reminders will '
        f'resume — the scheduled cancellation has been undone.',
        data={'subscription_id': sub.id, 'plan': sub.plan.name},
    )
    return sub


def reactivate_products(vendor):
    """Bring auto-deactivated products back up to the current plan limit
    (oldest first). If the new plan allows fewer than currently active,
    enforce the limit instead."""
    from app.marketplace.models.product import Product

    limit = get_entitlements(vendor)['max_active_products']
    active_count = Product.objects.filter(vendor=vendor, is_active=True).count()
    slots = limit - active_count
    if slots <= 0:
        if slots < 0:
            enforce_product_limit(vendor)
        return 0
    ids = list(
        Product.objects.filter(vendor=vendor, auto_deactivated=True)
        .order_by('created_at')
        .values_list('id', flat=True)[:slots]
    )
    if ids:
        Product.objects.filter(id__in=ids).update(is_active=True, auto_deactivated=False)
    return len(ids)


def enforce_product_limit(vendor):
    """Deactivate products beyond the vendor's current plan limit.

    Keeps the oldest N (by created_at) active; the rest become inactive and
    are flagged auto_deactivated so they can be restored on re-subscription.
    """
    from app.marketplace.models.product import Product

    limit = get_entitlements(vendor)['max_active_products']
    active_ids = list(
        Product.objects.filter(vendor=vendor, is_active=True)
        .order_by('created_at')
        .values_list('id', flat=True)
    )
    overflow_ids = active_ids[limit:]
    if overflow_ids:
        Product.objects.filter(id__in=overflow_ids).update(is_active=False, auto_deactivated=True)
    return len(overflow_ids)
