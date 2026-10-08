from django.conf import settings
from django.db import models


class SubscriptionAuditLog(models.Model):
    PURCHASED = 'PURCHASED'
    RENEWED = 'RENEWED'
    PLAN_SWITCHED = 'PLAN_SWITCHED'
    CANCEL_SCHEDULED = 'CANCEL_SCHEDULED'
    REACTIVATED = 'REACTIVATED'
    CANCELLED = 'CANCELLED'
    EXPIRED = 'EXPIRED'

    ACTION_CHOICES = [
        (PURCHASED, 'Purchased'),
        (RENEWED, 'Renewed'),
        (PLAN_SWITCHED, 'Plan Switched'),
        (CANCEL_SCHEDULED, 'Cancellation Scheduled'),
        (REACTIVATED, 'Cancellation Undone'),
        (CANCELLED, 'Cancelled (took effect)'),
        (EXPIRED, 'Expired'),
    ]

    vendor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='subscription_audit_logs')
    subscription = models.ForeignKey(
        'billing.VendorSubscription', null=True, blank=True, on_delete=models.SET_NULL, related_name='audit_logs'
    )
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    reason = models.TextField(blank=True, default='')
    previous_state = models.JSONField(default=dict, blank=True)
    new_state = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Vendor {self.vendor_id}: {self.action} @ {self.created_at}"


class TopUpAuditLog(models.Model):
    CREATED = 'CREATED'
    EDITED = 'EDITED'
    RESUBMITTED = 'RESUBMITTED'
    ADMIN_EDITED = 'ADMIN_EDITED'
    APPROVED = 'APPROVED'
    REJECTED = 'REJECTED'
    INFO_REQUESTED = 'INFO_REQUESTED'

    ACTION_CHOICES = [
        (CREATED, 'Created'),
        (EDITED, 'Edited by Vendor'),
        (RESUBMITTED, 'Resubmitted After Rejection'),
        (ADMIN_EDITED, 'Edited by Admin'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
        (INFO_REQUESTED, 'Information Requested'),
    ]

    topup = models.ForeignKey('billing.TopUpRequest', on_delete=models.CASCADE, related_name='audit_logs')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    previous_state = models.JSONField(default=dict, blank=True)
    new_state = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"TopUp {self.topup_id}: {self.action} @ {self.created_at}"
