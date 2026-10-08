import datetime

from django.conf import settings
from django.db import models
from django.db.models import Q


class CampaignCharge(models.Model):
    VIEW = 'VIEW'
    FAVORITE = 'FAVORITE'
    CART_ADD = 'CART_ADD'
    LINK_CLICK = 'LINK_CLICK'

    OBJECTIVE_CHOICES = [
        (VIEW, 'Product View'),
        (FAVORITE, 'Favorite'),
        (CART_ADD, 'Cart Add'),
        (LINK_CLICK, 'Link Click'),
    ]

    campaign = models.ForeignKey('campaigns.Campaign', on_delete=models.CASCADE, related_name='charges')
    product = models.ForeignKey('marketplace.Product', on_delete=models.CASCADE, related_name='campaign_charges')
    objective = models.CharField(max_length=12, choices=OBJECTIVE_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=4)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    guest_id = models.CharField(max_length=255, null=True, blank=True)
    # Charge dedup granularity: one charge per visitor per objective per product per day.
    charge_date = models.DateField(default=datetime.date.today)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=['campaign', '-created_at']),
            models.Index(fields=['campaign', 'product', 'objective']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['campaign', 'product', 'objective', 'user', 'charge_date'],
                condition=Q(user__isnull=False),
                name='uniq_campaign_charge_user_day',
            ),
            models.UniqueConstraint(
                fields=['campaign', 'product', 'objective', 'guest_id', 'charge_date'],
                condition=Q(guest_id__isnull=False),
                name='uniq_campaign_charge_guest_day',
            ),
        ]

    def __str__(self):
        return f"{self.objective} {self.amount} (campaign {self.campaign_id}, product {self.product_id})"
