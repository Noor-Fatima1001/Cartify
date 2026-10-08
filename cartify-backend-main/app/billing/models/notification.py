from django.conf import settings
from django.db import models


class Notification(models.Model):
    TOPUP_APPROVED = 'TOPUP_APPROVED'
    TOPUP_REJECTED = 'TOPUP_REJECTED'
    TOPUP_INFO_REQUIRED = 'TOPUP_INFO_REQUIRED'
    TOPUP_VENDOR_RESPONDED = 'TOPUP_VENDOR_RESPONDED'
    CAMPAIGN_OUT_OF_BUDGET = 'CAMPAIGN_OUT_OF_BUDGET'
    CAMPAIGN_COMPLETED = 'CAMPAIGN_COMPLETED'
    SUBSCRIPTION_PURCHASED = 'SUBSCRIPTION_PURCHASED'
    SUBSCRIPTION_EXPIRING = 'SUBSCRIPTION_EXPIRING'
    SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED'
    SUBSCRIPTION_CANCEL_SCHEDULED = 'SUBSCRIPTION_CANCEL_SCHEDULED'
    SUBSCRIPTION_REACTIVATED = 'SUBSCRIPTION_REACTIVATED'
    SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED'

    TYPE_CHOICES = [
        (TOPUP_APPROVED, 'Top-up Approved'),
        (TOPUP_REJECTED, 'Top-up Rejected'),
        (TOPUP_INFO_REQUIRED, 'Top-up: More Information Required'),
        (TOPUP_VENDOR_RESPONDED, 'Top-up: Vendor Responded'),
        (CAMPAIGN_OUT_OF_BUDGET, 'Campaign Out of Budget'),
        (CAMPAIGN_COMPLETED, 'Campaign Completed'),
        (SUBSCRIPTION_PURCHASED, 'Subscription Purchased'),
        (SUBSCRIPTION_EXPIRING, 'Subscription Expiring'),
        (SUBSCRIPTION_EXPIRED, 'Subscription Expired'),
        (SUBSCRIPTION_CANCEL_SCHEDULED, 'Subscription Cancellation Scheduled'),
        (SUBSCRIPTION_REACTIVATED, 'Subscription Reactivated'),
        (SUBSCRIPTION_CANCELLED, 'Subscription Cancelled'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    notif_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    title = models.CharField(max_length=150)
    message = models.TextField()
    data = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.notif_type} → {self.user_id}"
