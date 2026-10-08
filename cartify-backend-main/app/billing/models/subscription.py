from decimal import Decimal

from django.conf import settings
from django.db import models

DEFAULT_FREE_PRODUCT_LIMIT = 4
DEFAULT_FREE_VISITOR_DETAIL_LIMIT = 4


class SubscriptionPlan(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    price_credits = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    max_active_products = models.PositiveIntegerField(default=DEFAULT_FREE_PRODUCT_LIMIT)
    allow_cart = models.BooleanField(default=False, help_text="Whether customers can add this vendor's products to cart")
    can_view_viewers = models.BooleanField(default=False)
    can_view_favoriters = models.BooleanField(default=False)
    can_view_cart_users = models.BooleanField(default=False)
    can_view_clickers = models.BooleanField(default=False)
    visitor_detail_limit = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Max distinct visitors shown in detailed analytics; null = unlimited"
    )
    features = models.JSONField(default=dict, blank=True)
    is_free_default = models.BooleanField(default=False, help_text="Fallback plan applied when a vendor has no active subscription")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['price_credits', 'id']

    def __str__(self):
        return f"{self.name} ({self.price_credits} credits/month)"

    @classmethod
    def get_free_default(cls):
        return cls.objects.filter(is_free_default=True).first()


class VendorSubscription(models.Model):
    ACTIVE = 'ACTIVE'
    EXPIRED = 'EXPIRED'
    CANCELLED = 'CANCELLED'

    STATUS_CHOICES = [
        (ACTIVE, 'Active'),
        (EXPIRED, 'Expired'),
        (CANCELLED, 'Cancelled'),
    ]

    vendor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='subscriptions')
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT, related_name='subscriptions')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=ACTIVE, db_index=True)
    started_at = models.DateTimeField()
    expires_at = models.DateTimeField(db_index=True)
    credits_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    ledger_entry = models.ForeignKey('billing.CreditLedger', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    expiry_reminder_sent_at = models.DateTimeField(null=True, blank=True)
    renewed_from = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name='renewals',
        help_text="Previous subscription row this one continues from (same-plan renewal or plan switch)"
    )
    renewal_count = models.PositiveIntegerField(default=0, help_text="Consecutive same-plan renewals in this chain")
    cancel_at_period_end = models.BooleanField(
        default=False,
        help_text="Cancellation requested but not yet effective — stays ACTIVE with full access until expires_at"
    )
    cancelled_at = models.DateTimeField(null=True, blank=True, help_text="When cancellation was requested (not when it took effect)")
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['vendor', 'status']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['vendor'], condition=models.Q(status='ACTIVE'),
                name='uniq_active_subscription_per_vendor',
            ),
        ]

    def __str__(self):
        return f"{self.vendor_id} → {self.plan.name} [{self.status}]"
