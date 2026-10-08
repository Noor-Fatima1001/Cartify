from django.db import models
from django.conf import settings
from .product import Product


class PurchaseLinkClick(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='purchase_clicks', db_index=True)
    vendor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_clicks', db_index=True)

    # User reference - nullable for guests
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_link_clicks', db_index=True)
    session_id = models.CharField(max_length=255, null=True, blank=True, db_index=True, help_text="Guest identifier (session ID or device ID)")
    device_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    mobile_number = models.CharField(max_length=50, null=True, blank=True, db_index=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True, db_index=True)
    user_agent = models.TextField(blank=True)
    browser = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    operating_system = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    device_type = models.CharField(max_length=50, null=True, blank=True, db_index=True, help_text="Mobile/Desktop/Tablet")
    referrer = models.CharField(max_length=500, null=True, blank=True)

    short_code = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    original_link = models.URLField(max_length=1000, null=True, blank=True)

    clicked_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-clicked_at']
        verbose_name = 'Purchase Link Click'
        verbose_name_plural = 'Purchase Link Clicks'
        indexes = [
            models.Index(fields=['product', '-clicked_at'], name='purchase_click_time_idx'),
            models.Index(fields=['vendor', '-clicked_at'], name='purchase_click_vendor_idx'),
        ]

    def __str__(self):
        who = self.user.username if self.user else f"Guest({self.session_id or self.device_id})"
        return f"{self.product.name} click by {who}"

    @classmethod
    def record_click(cls, product, vendor=None, user=None, session_id=None, device_id=None, mobile_number=None, ip_address=None, user_agent=None, browser=None, operating_system=None, device_type=None, referrer=None, short_code=None, original_link=None):
        return cls.objects.create(
            product=product,
            vendor=vendor,
            user=user,
            session_id=session_id,
            device_id=device_id,
            mobile_number=mobile_number,
            ip_address=ip_address,
            user_agent=user_agent,
            browser=browser,
            operating_system=operating_system,
            device_type=device_type,
            referrer=referrer,
            short_code=short_code,
            original_link=original_link
        )
