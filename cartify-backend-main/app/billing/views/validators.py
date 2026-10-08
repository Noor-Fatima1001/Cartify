import os
from decimal import Decimal, InvalidOperation

from app.billing.models.topup import SCREENSHOT_ALLOWED_EXTENSIONS

MAX_SCREENSHOT_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
# Matches TopUpRequest.amount's DecimalField(max_digits=12, decimal_places=2) —
# the largest value that column can actually store without a DB-level overflow.
MAX_AMOUNT = Decimal('9999999999.99')
TRANSACTION_ID_MAX_LENGTH = 100  # matches TopUpRequest.transaction_id max_length


def parse_amount(raw):
    """Returns (Decimal, None) on success or (None, error_message) on failure."""
    try:
        amount = Decimal(str(raw))
    except (InvalidOperation, TypeError):
        return None, 'A valid amount is required'
    if not amount.is_finite():
        return None, 'A valid amount is required'
    if amount <= 0:
        return None, 'Amount must be greater than zero'
    if amount > MAX_AMOUNT:
        return None, f'Amount cannot exceed {MAX_AMOUNT}'
    return amount, None


def validate_transaction_id(raw):
    """Returns (cleaned_value, None) on success or (None, error_message) on failure."""
    value = (raw or '').strip()
    if not value:
        return None, 'Transaction ID is required'
    if len(value) > TRANSACTION_ID_MAX_LENGTH:
        return None, f'Transaction ID cannot be longer than {TRANSACTION_ID_MAX_LENGTH} characters'
    return value, None


def validate_screenshot(file):
    """Returns an error message string, or None if the file is acceptable."""
    if file is None:
        return None
    ext = os.path.splitext(file.name)[1].lstrip('.').lower()
    if ext not in SCREENSHOT_ALLOWED_EXTENSIONS:
        return f"Screenshot must be one of: {', '.join(SCREENSHOT_ALLOWED_EXTENSIONS)}"
    if file.size > MAX_SCREENSHOT_SIZE_BYTES:
        return 'Screenshot must be smaller than 5MB'

    from PIL import Image, UnidentifiedImageError
    try:
        file.seek(0)
        with Image.open(file) as img:
            img.verify()
    except (UnidentifiedImageError, OSError, ValueError):
        return 'Screenshot must be a valid image file'
    finally:
        file.seek(0)
    return None


def check_duplicate_transaction(transaction_id, exclude_pk=None):
    """A transaction_id already used by a non-rejected top-up cannot be reused.
    Backed by TopUpRequest's partial unique constraint (non-rejected rows) as
    the hard DB-level backstop against a concurrent-submission race — this
    query is the friendly pre-check, not the only line of defense."""
    from app.billing.models import TopUpRequest

    queryset = TopUpRequest.objects.filter(transaction_id=transaction_id).exclude(status=TopUpRequest.REJECTED)
    if exclude_pk is not None:
        queryset = queryset.exclude(pk=exclude_pk)
    return queryset.exists()


def log_topup_audit(topup, action, actor=None, previous_state=None, new_state=None):
    from app.billing.models import TopUpAuditLog

    return TopUpAuditLog.objects.create(
        topup=topup,
        actor=actor,
        action=action,
        previous_state=previous_state or {},
        new_state=new_state or {},
    )


def topup_state_snapshot(topup, request=None):
    screenshot_url = None
    if topup.screenshot:
        screenshot_url = topup.screenshot.url
        if request is not None:
            screenshot_url = request.build_absolute_uri(screenshot_url)
    return {
        'amount': str(topup.amount),
        'transaction_id': topup.transaction_id,
        'screenshot_url': screenshot_url,
        'status': topup.status,
        'payment_method_id': topup.payment_method_id,
        'rejection_reason': topup.rejection_reason,
        'info_request_message': topup.info_request_message,
        'vendor_note': topup.vendor_note,
    }
