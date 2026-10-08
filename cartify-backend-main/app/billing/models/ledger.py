from django.conf import settings
from django.db import models


class CreditLedger(models.Model):
    TOPUP = 'TOPUP'
    CAMPAIGN_RESERVE = 'CAMPAIGN_RESERVE'
    CAMPAIGN_REFUND = 'CAMPAIGN_REFUND'
    CAMPAIGN_BUDGET_INCREASE = 'CAMPAIGN_BUDGET_INCREASE'
    CAMPAIGN_BUDGET_DECREASE = 'CAMPAIGN_BUDGET_DECREASE'
    SUBSCRIPTION_PURCHASE = 'SUBSCRIPTION_PURCHASE'
    ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT'

    ENTRY_TYPE_CHOICES = [
        (TOPUP, 'Top-up Approved'),
        (CAMPAIGN_RESERVE, 'Campaign Budget Reserved'),
        (CAMPAIGN_REFUND, 'Campaign Budget Refund'),
        (CAMPAIGN_BUDGET_INCREASE, 'Campaign Budget Increase'),
        (CAMPAIGN_BUDGET_DECREASE, 'Campaign Budget Decrease'),
        (SUBSCRIPTION_PURCHASE, 'Subscription Purchase'),
        (ADMIN_ADJUSTMENT, 'Manual Admin Adjustment'),
    ]

    wallet = models.ForeignKey('billing.Wallet', on_delete=models.PROTECT, related_name='entries')
    entry_type = models.CharField(max_length=30, choices=ENTRY_TYPE_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2, help_text="Signed amount; negative for debits")
    balance_before = models.DecimalField(max_digits=12, decimal_places=2)
    balance_after = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255, blank=True, default='')
    reference_type = models.CharField(max_length=30, blank=True, default='', help_text="e.g. topup, campaign, subscription")
    reference_id = models.PositiveIntegerField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['wallet', '-created_at']),
        ]

    def __str__(self):
        return f"{self.entry_type} {self.amount} (wallet {self.wallet_id})"
