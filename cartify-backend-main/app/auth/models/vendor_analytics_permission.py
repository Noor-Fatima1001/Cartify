from django.db import models
from django.conf import settings


class VendorAnalyticsPermission(models.Model):
    vendor = models.OneToOneField(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='analytics_permission',
        limit_choices_to={'role': 'VENDOR'}
    )
    
    # Permission flags
    can_access_analytics = models.BooleanField(
        default=True,
        help_text="If disabled, vendor cannot access visitor/favorites analytics"
    )
    
    # Audit fields
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_modified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='analytics_permission_modifications'
    )
    
    class Meta:
        verbose_name = "Vendor Analytics Permission"
        verbose_name_plural = "Vendor Analytics Permissions"
        ordering = ['-updated_at']
    
    def __str__(self):
        vendor_name = self.vendor.username if self.vendor else "Unknown"
        status = "Enabled" if self.can_access_analytics else "Disabled"
        return f"{vendor_name} - Analytics {status}"
