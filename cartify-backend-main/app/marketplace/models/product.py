import secrets
import string
from decimal import Decimal

from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator, MinLengthValidator
from app.scrape.models.scrapeModel import Categories

class SubCategory(models.Model):
    category = models.ForeignKey(Categories, on_delete=models.CASCADE, related_name='subcategories')
    name = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.name} ({self.category.name})"


class Product(models.Model):
    vendor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='vendor_products')

    category = models.ForeignKey(Categories, on_delete=models.CASCADE)
    subcategory = models.ForeignKey(SubCategory, on_delete=models.SET_NULL, null=True, blank=True)

    name = models.CharField(max_length=255, validators=[MinLengthValidator(2)])
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    discount = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
    )
    original_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(Decimal('0.01'))],
    )

    product_type = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)

    image = models.ImageField(upload_to='product_images/', null=True, blank=True)
    images = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    # Set when the system deactivates a product because the vendor's plan limit
    # was exceeded; such products are locked until re-subscription reactivates them.
    auto_deactivated = models.BooleanField(default=False)
    total_views = models.PositiveIntegerField(default=0)
    unique_visitors = models.PositiveIntegerField(default=0)

    # Feature 1 fields
    purchase_link = models.URLField(max_length=500, blank=True, null=True)
    purchase_short_code = models.CharField(max_length=12, unique=True, null=True, blank=True)

    # Feature 5 fields
    is_premium = models.BooleanField(default=False)

    def _generate_unique_purchase_short_code(self, length=8):
        alphabet = string.ascii_letters + string.digits
        for _ in range(10):
            code = ''.join(secrets.choice(alphabet) for _ in range(length))
            if not Product.objects.filter(purchase_short_code=code).exists():
                return code
        while True:
            code = ''.join(secrets.choice(alphabet) for _ in range(length))
            if not Product.objects.filter(purchase_short_code=code).exists():
                return code

    @property
    def purchase_short_link(self):
        if not self.purchase_short_code:
            return None
        return f'/api/marketplace/products/short/{self.purchase_short_code}/'

    def clean(self):
        if self.subcategory:
            if self.subcategory.category != self.category:
                raise ValidationError("Subcategory must belong to selected category")
        else:
            if self.category.subcategories.exists():
                raise ValidationError(
                    "This category has subcategories. You must select a subcategory."
                )

    def save(self, *args, **kwargs):
        self.clean()  # enforce validation on save
        if self.purchase_link:
            if not self.purchase_short_code:
                self.purchase_short_code = self._generate_unique_purchase_short_code()
        else:
            self.purchase_short_code = None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    @property
    def is_premium_active(self):
        """Returns True if product is marked as premium."""
        return self.is_premium

class Favorite(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name='favorites')
    device_id = models.CharField(max_length=255, null=True, blank=True)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='favorited_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'product') # One favorite per product for registered users
        # For anonymous, we rely on device_id in logic
