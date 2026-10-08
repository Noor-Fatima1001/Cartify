import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

from app.campaigns.models import Campaign, CampaignAuditLog
from app.campaigns.service import campaign_service

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Complete campaigns past their 1-month end date, refunding unused budget to vendor credits.'

    def handle(self, *args, **options):
        now = timezone.now()
        completed = 0
        for campaign in Campaign.objects.filter(
            status__in=[Campaign.ACTIVE, Campaign.PAUSED, Campaign.OUT_OF_BUDGET],
            ends_at__lt=now,
        ):
            try:
                campaign_service.complete_campaign(
                    campaign.id, action=CampaignAuditLog.COMPLETED, notify_vendor=True
                )
                completed += 1
            except Exception:
                logger.exception('Failed to complete campaign %s', campaign.id)

        self.stdout.write(self.style.SUCCESS(
            f'Campaign maintenance done: {completed} campaigns completed.'
        ))
