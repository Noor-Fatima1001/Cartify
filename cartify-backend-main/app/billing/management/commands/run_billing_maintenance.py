import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from app.billing.models import Notification, VendorSubscription
from app.billing.service.notification_service import notify
from app.billing.service.subscription_service import _expire_subscription

logger = logging.getLogger(__name__)

EXPIRY_REMINDER_DAYS = 3


class Command(BaseCommand):
    help = 'Expire overdue subscriptions (enforcing product limits) and send expiring-soon reminders.'

    def handle(self, *args, **options):
        now = timezone.now()
        expired = 0
        reminded = 0

        for sub in (
            VendorSubscription.objects.select_related('vendor', 'plan')
            .filter(status=VendorSubscription.ACTIVE, expires_at__lt=now)
        ):
            try:
                # Shared with the lazy on-read expiry path so a scheduled
                # cancellation resolves to CANCELLED here too, not EXPIRED.
                _expire_subscription(sub)
                expired += 1
            except Exception:
                logger.exception('Failed to expire subscription %s', sub.id)

        soon = now + timedelta(days=EXPIRY_REMINDER_DAYS)
        for sub in (
            VendorSubscription.objects.select_related('vendor', 'plan')
            .filter(
                status=VendorSubscription.ACTIVE,
                expires_at__gte=now,
                expires_at__lte=soon,
                expiry_reminder_sent_at__isnull=True,
                cancel_at_period_end=False,
            )
        ):
            try:
                notify(
                    sub.vendor,
                    Notification.SUBSCRIPTION_EXPIRING,
                    'Subscription Expiring Soon',
                    f'Your "{sub.plan.name}" subscription expires on {sub.expires_at.strftime("%d %b %Y")}. '
                    f'Renew now to keep your products active and your analytics access.',
                    data={'subscription_id': sub.id, 'plan': sub.plan.name},
                )
                sub.expiry_reminder_sent_at = now
                sub.save(update_fields=['expiry_reminder_sent_at'])
                reminded += 1
            except Exception:
                logger.exception('Failed to send expiry reminder for subscription %s', sub.id)

        self.stdout.write(self.style.SUCCESS(
            f'Billing maintenance done: {expired} subscriptions expired, {reminded} reminders sent.'
        ))
