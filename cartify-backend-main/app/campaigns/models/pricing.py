from decimal import Decimal

from django.conf import settings
from django.db import models


class CampaignPricing(models.Model):
    """Singleton (pk=1) holding the admin-configured per-action costs."""

    cost_per_view = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal('1.0000'))
    cost_per_favorite = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal('2.0000'))
    cost_per_cart_add = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal('3.0000'))
    cost_per_link_click = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal('5.0000'))
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def cost_for(self, objective):
        from .charge import CampaignCharge
        return {
            CampaignCharge.VIEW: self.cost_per_view,
            CampaignCharge.FAVORITE: self.cost_per_favorite,
            CampaignCharge.CART_ADD: self.cost_per_cart_add,
            CampaignCharge.LINK_CLICK: self.cost_per_link_click,
        }[objective]

    def __str__(self):
        return (f"Pricing view={self.cost_per_view} fav={self.cost_per_favorite} "
                f"cart={self.cost_per_cart_add} click={self.cost_per_link_click}")
