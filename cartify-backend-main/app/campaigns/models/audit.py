from django.conf import settings
from django.db import models


class CampaignAuditLog(models.Model):
    CREATED = 'CREATED'
    STARTED = 'STARTED'
    PAUSED = 'PAUSED'
    RESUMED = 'RESUMED'
    STOPPED = 'STOPPED'
    CANCELLED = 'CANCELLED'
    BUDGET_CHANGED = 'BUDGET_CHANGED'
    PRODUCTS_CHANGED = 'PRODUCTS_CHANGED'
    OUT_OF_BUDGET = 'OUT_OF_BUDGET'
    COMPLETED = 'COMPLETED'

    ACTION_CHOICES = [
        (CREATED, 'Created'),
        (STARTED, 'Started'),
        (PAUSED, 'Paused'),
        (RESUMED, 'Resumed'),
        (STOPPED, 'Stopped'),
        (CANCELLED, 'Cancelled (draft, never started)'),
        (BUDGET_CHANGED, 'Budget Changed'),
        (PRODUCTS_CHANGED, 'Products / Targeting Changed'),
        (OUT_OF_BUDGET, 'Out of Budget'),
        (COMPLETED, 'Completed'),
    ]

    campaign = models.ForeignKey('campaigns.Campaign', on_delete=models.CASCADE, related_name='audit_logs')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    previous_state = models.JSONField(default=dict, blank=True)
    new_state = models.JSONField(default=dict, blank=True)
    reason = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Campaign {self.campaign_id}: {self.action} @ {self.created_at}"
