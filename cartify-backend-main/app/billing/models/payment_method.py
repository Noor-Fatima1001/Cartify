from django.db import models


class PaymentMethod(models.Model):
    WALLET = 'WALLET'
    BANK = 'BANK'
    METHOD_TYPE_CHOICES = [
        (WALLET, 'Wallet'),
        (BANK, 'Bank'),
    ]

    method_type = models.CharField(max_length=10, choices=METHOD_TYPE_CHOICES, default=WALLET)
    provider_name = models.CharField(max_length=100, help_text="Wallet or bank name, e.g. JazzCash, Easypaisa, Meezan Bank")
    account_holder = models.CharField(max_length=150)
    account_number = models.CharField(max_length=100)
    instructions = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f"{self.provider_name} ({self.account_number})"
