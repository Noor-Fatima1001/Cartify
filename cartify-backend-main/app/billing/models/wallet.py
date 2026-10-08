from decimal import Decimal

from django.conf import settings
from django.db import models

from .ledger import CreditLedger


class InsufficientCreditsError(Exception):
    pass


class Wallet(models.Model):
    vendor = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Wallet({self.vendor_id}) = {self.balance}"

    @classmethod
    def get_or_create_for(cls, user):
        wallet, _ = cls.objects.get_or_create(vendor=user)
        return wallet

    @classmethod
    def lock_for(cls, user):
        cls.objects.get_or_create(vendor=user)
        return cls.objects.select_for_update().get(vendor=user)

    def apply(self, entry_type, amount, description='', reference_type='', reference_id=None, actor=None):
    
        amount = Decimal(amount).quantize(Decimal('0.01'))
        balance_before = self.balance
        balance_after = balance_before + amount
        if balance_after < 0:
            raise InsufficientCreditsError(
                f"Insufficient credits: balance {balance_before}, required {-amount}"
            )
        self.balance = balance_after
        self.save(update_fields=['balance', 'updated_at'])
        return CreditLedger.objects.create(
            wallet=self,
            entry_type=entry_type,
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            description=description,
            reference_type=reference_type,
            reference_id=reference_id,
            created_by=actor,
        )
