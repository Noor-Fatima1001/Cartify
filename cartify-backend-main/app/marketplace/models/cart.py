from django.conf import settings
from django.db import models


class CartItem(models.Model):
    """Product saved to a user's cart. Mirrors Favorite: registered users are
    keyed by user, guests by device_id. Used for campaign targeting and
    analytics only — there is no checkout."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.CASCADE, related_name='cart_items'
    )
    device_id = models.CharField(max_length=255, null=True, blank=True)
    product = models.ForeignKey('marketplace.Product', on_delete=models.CASCADE, related_name='in_carts')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        unique_together = ('user', 'product')
        indexes = [
            models.Index(fields=['device_id', 'product']),
            models.Index(fields=['product', '-created_at']),
        ]

    def __str__(self):
        who = self.user_id or self.device_id
        return f"Cart: {who} → {self.product_id}"
