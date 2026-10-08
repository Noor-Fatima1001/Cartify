import os
import uuid

from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models

SCREENSHOT_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']


def topup_screenshot_path(instance, filename):
    return f"topup_screenshots/{uuid.uuid4().hex}_{os.path.basename(filename)}"


class TopUpRequest(models.Model):
    PENDING = 'PENDING'
    APPROVED = 'APPROVED'
    REJECTED = 'REJECTED'
    INFO_REQUIRED = 'INFO_REQUIRED'

    STATUS_CHOICES = [
        (PENDING, 'Waiting for Approval'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
        (INFO_REQUIRED, 'More Information Required'),
    ]

    vendor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='topup_requests')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    transaction_id = models.CharField(max_length=100)
    screenshot = models.ImageField(
        upload_to=topup_screenshot_path,
        validators=[FileExtensionValidator(allowed_extensions=SCREENSHOT_ALLOWED_EXTENSIONS)],
    )
    payment_method = models.ForeignKey('billing.PaymentMethod', null=True, blank=True, on_delete=models.SET_NULL, related_name='topup_requests')
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=PENDING, db_index=True)
    rejection_reason = models.TextField(blank=True, default='')
    info_request_message = models.TextField(blank=True, default='')
    vendor_note = models.TextField(blank=True, default='')
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    ledger_entry = models.ForeignKey('billing.CreditLedger', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            # Hard backstop against the same real payment being credited
            # twice via a race between two near-simultaneous submissions —
            # the application-level check_duplicate_transaction() query is
            # not atomic on its own. Rejected rows are excluded so a
            # transaction_id can legitimately be resubmitted after rejection.
            models.UniqueConstraint(
                fields=['transaction_id'],
                condition=~models.Q(status='REJECTED'),
                name='unique_non_rejected_transaction_id',
            ),
        ]

    def __str__(self):
        return f"TopUp #{self.pk} {self.vendor_id} {self.amount} [{self.status}]"
