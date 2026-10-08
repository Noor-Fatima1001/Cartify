from decimal import Decimal

from django.conf import settings
from django.db import models

CAMPAIGN_DURATION_DAYS = 30


class Campaign(models.Model):
    DRAFT = 'DRAFT'
    ACTIVE = 'ACTIVE'
    PAUSED = 'PAUSED'
    COMPLETED = 'COMPLETED'
    OUT_OF_BUDGET = 'OUT_OF_BUDGET'

    STATUS_CHOICES = [
        (DRAFT, 'Draft'),
        (ACTIVE, 'Active'),
        (PAUSED, 'Paused'),
        (COMPLETED, 'Completed'),
        (OUT_OF_BUDGET, 'Out of Budget'),
    ]

    vendor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='campaigns')
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=DRAFT, db_index=True)
    total_budget = models.DecimalField(max_digits=12, decimal_places=2)
    spent = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    started_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'ends_at']),
            models.Index(fields=['vendor', 'status']),
        ]

    @property
    def remaining(self):
        return self.total_budget - self.spent

    def __str__(self):
        return f"Campaign #{self.pk} {self.name} [{self.status}]"


class CampaignProduct(models.Model):
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='products')
    product = models.ForeignKey('marketplace.Product', on_delete=models.CASCADE, related_name='campaign_links')
    charge_views = models.BooleanField(default=False)
    charge_favorites = models.BooleanField(default=False)
    charge_cart_adds = models.BooleanField(default=False)
    charge_link_clicks = models.BooleanField(default=False)

    class Meta:
        unique_together = ('campaign', 'product')

    OBJECTIVE_FIELDS = {
        'VIEW': 'charge_views',
        'FAVORITE': 'charge_favorites',
        'CART_ADD': 'charge_cart_adds',
        'LINK_CLICK': 'charge_link_clicks',
    }

    def objectives(self):
        return {
            'views': self.charge_views,
            'favorites': self.charge_favorites,
            'cart_adds': self.charge_cart_adds,
            'link_clicks': self.charge_link_clicks,
        }

    def __str__(self):
        return f"Campaign {self.campaign_id} → Product {self.product_id}"
