from django.db import models
from django.conf import settings
from .product import Product


class ProductView(models.Model):
    
    # Product being viewed - required
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='views',
        db_index=True
    )
    
    # User reference - nullable for guest visitors
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_views',
        db_index=True
    )
    session_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        db_index=True,
        help_text="Guest identifier for anonymous visitors (session ID or device ID)"
    )

    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        db_index=True,
        help_text="IP address of the visitor"
    )
    
    user_agent = models.TextField(
        blank=True,
        help_text="User agent string from request headers"
    )
    
    viewed_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="When the product was viewed"
    )
    
    class Meta:
        ordering = ['-viewed_at']
        indexes = [
            models.Index(fields=['product', '-viewed_at'], name='product_view_time_idx'),
            models.Index(fields=['product', 'user'], name='product_user_idx'),
            models.Index(fields=['product', 'session_id'], name='product_session_idx'),
            models.Index(fields=['-viewed_at'], name='viewed_time_idx'),
        ]
        verbose_name = 'Product View'
        verbose_name_plural = 'Product Views'
    
    def __str__(self):
        viewer = self.user.username if self.user else f"Guest({self.session_id})"
        return f"{self.product.name} viewed by {viewer}"
    
    @classmethod
    def record_view(cls, product, user=None, session_id=None, ip_address=None, user_agent=None):
        return cls.objects.create(
            product=product,
            user=user,
            session_id=session_id,
            ip_address=ip_address,
            user_agent=user_agent
        )
