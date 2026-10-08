import logging

from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from app.auth.models.user import User
from app.auth.permissions.auth_token import BearerTokenAuthentication
from app.billing.models import Notification, PaymentMethod, SubscriptionPlan, TopUpRequest, VendorSubscription, Wallet
from app.billing.service import subscription_service
from app.billing.service.notification_service import notify
from app.billing.service.subscription_service import SubscriptionError
from app.marketplace.views.utils import get_paginated_data

from .serializers import (
    history_list,
    ledger_entry_dict,
    notification_dict,
    payment_method_dict,
    plan_dict,
    subscription_dict,
    topup_audit_dict,
    topup_dict,
    vendor_renewed_from_ids,
)
from .validators import (
    check_duplicate_transaction,
    log_topup_audit,
    parse_amount,
    topup_state_snapshot,
    validate_screenshot,
    validate_transaction_id,
)

logger = logging.getLogger(__name__)


def _notify_admins(notif_type, title, message, data=None):
    admins = User.objects.filter(Q(role=User.ADMIN) | Q(is_staff=True) | Q(is_superuser=True)).distinct()
    for admin in admins:
        notify(admin, notif_type, title, message, data=data)


def _require_vendor(request):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Vendor access required'}, status=403)
    return None


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def get_wallet(request):
    err = _require_vendor(request)
    if err:
        return err
    wallet = Wallet.get_or_create_for(request.user)
    pending_topups = TopUpRequest.objects.filter(
        vendor=request.user, status__in=[TopUpRequest.PENDING, TopUpRequest.INFO_REQUIRED]
    ).count()
    return Response({
        'balance': str(wallet.balance),
        'pending_topups': pending_topups,
        'updated_at': wallet.updated_at.isoformat(),
    })


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def ledger_list(request):
    err = _require_vendor(request)
    if err:
        return err
    wallet = Wallet.get_or_create_for(request.user)
    queryset = wallet.entries.all()
    entry_type = request.query_params.get('entry_type', '').strip().upper()
    if entry_type and entry_type != 'ALL':
        queryset = queryset.filter(entry_type=entry_type)
    paginated = get_paginated_data(queryset, request, search_fields=['description'], default_limit=20)
    return Response({
        'results': [ledger_entry_dict(e) for e in paginated['queryset']],
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
    })


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def payment_methods_list(request):
    methods = PaymentMethod.objects.filter(is_active=True)
    return Response({'results': [payment_method_dict(pm) for pm in methods]})


@api_view(['GET', 'POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def topups(request):
    err = _require_vendor(request)
    if err:
        return err

    if request.method == 'GET':
        queryset = TopUpRequest.objects.filter(vendor=request.user).select_related('payment_method', 'vendor', 'reviewed_by')
        status_query = request.query_params.get('status', '').strip().upper()
        if status_query and status_query != 'ALL':
            queryset = queryset.filter(status=status_query)
        paginated = get_paginated_data(queryset, request, search_fields=['transaction_id'], default_limit=10)
        return Response({
            'results': [topup_dict(t, request) for t in paginated['queryset']],
            'total_items': paginated['total_items'],
            'total_pages': paginated['total_pages'],
            'current_page': paginated['current_page'],
        })

    # POST — create a top-up request
    amount_raw = request.data.get('amount')
    screenshot = request.FILES.get('screenshot')
    payment_method_id = request.data.get('payment_method_id') or request.data.get('payment_method')

    amount, error = parse_amount(amount_raw)
    if error:
        return Response({'error': error}, status=400)
    transaction_id, error = validate_transaction_id(request.data.get('transaction_id'))
    if error:
        return Response({'error': error}, status=400)
    if not screenshot:
        return Response({'error': 'Payment screenshot is required'}, status=400)
    screenshot_error = validate_screenshot(screenshot)
    if screenshot_error:
        return Response({'error': screenshot_error}, status=400)
    if check_duplicate_transaction(transaction_id):
        return Response({'error': 'This transaction ID has already been submitted'}, status=400)

    if not payment_method_id:
        return Response({'error': 'Payment method is required'}, status=400)
    try:
        payment_method = PaymentMethod.objects.filter(id=payment_method_id, is_active=True).first()
    except (ValueError, TypeError):
        return Response({'error': 'Invalid payment method'}, status=400)
    if not payment_method:
        return Response({'error': 'Invalid payment method'}, status=400)

    try:
        with transaction.atomic():
            topup = TopUpRequest.objects.create(
                vendor=request.user,
                amount=amount,
                transaction_id=transaction_id,
                screenshot=screenshot,
                payment_method=payment_method,
                vendor_note=(request.data.get('vendor_note') or '').strip(),
            )
    except IntegrityError:
        return Response({'error': 'This transaction ID has already been submitted'}, status=400)

    log_topup_audit(
        topup, 'CREATED', actor=request.user,
        previous_state={}, new_state=topup_state_snapshot(topup, request),
    )
    return Response({'message': 'Top-up request submitted', 'topup': topup_dict(topup, request)}, status=201)


@api_view(['GET', 'PATCH'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def topup_update(request, topup_id):
    """GET returns the vendor's own top-up detail (with audit trail).
    PATCH lets the vendor respond to an INFO_REQUIRED request, or resubmit
    a REJECTED one; either way it goes back to PENDING."""
    err = _require_vendor(request)
    if err:
        return err

    if request.method == 'GET':
        try:
            topup = TopUpRequest.objects.select_related('payment_method', 'vendor', 'reviewed_by').get(id=topup_id, vendor=request.user)
        except TopUpRequest.DoesNotExist:
            return Response({'error': 'Top-up request not found'}, status=404)
        logs = topup.audit_logs.select_related('actor').all()
        data = topup_dict(topup, request)
        data['audit_log'] = [topup_audit_dict(l) for l in logs]
        return Response(data)

    with transaction.atomic():
        try:
            topup = TopUpRequest.objects.select_for_update().get(id=topup_id, vendor=request.user)
        except TopUpRequest.DoesNotExist:
            return Response({'error': 'Top-up request not found'}, status=404)

        if topup.status not in (TopUpRequest.INFO_REQUIRED, TopUpRequest.REJECTED):
            return Response({'error': 'Only requests awaiting more information or rejected requests can be updated'}, status=400)

        was_rejected = topup.status == TopUpRequest.REJECTED
        previous_state = topup_state_snapshot(topup, request)

        if 'amount' in request.data:
            amount, error = parse_amount(request.data.get('amount'))
            if error:
                return Response({'error': error}, status=400)
            topup.amount = amount
        if 'transaction_id' in request.data:
            transaction_id, error = validate_transaction_id(request.data.get('transaction_id'))
            if error:
                return Response({'error': error}, status=400)
            if check_duplicate_transaction(transaction_id, exclude_pk=topup.id):
                return Response({'error': 'This transaction ID has already been submitted'}, status=400)
            topup.transaction_id = transaction_id
        new_screenshot = request.FILES.get('screenshot')
        if new_screenshot:
            screenshot_error = validate_screenshot(new_screenshot)
            if screenshot_error:
                return Response({'error': screenshot_error}, status=400)
            topup.screenshot = new_screenshot
        if 'vendor_note' in request.data:
            topup.vendor_note = (request.data.get('vendor_note') or '').strip()

        topup.status = TopUpRequest.PENDING
        if was_rejected:
            topup.rejection_reason = ''
        try:
            topup.save()
        except IntegrityError:
            return Response({'error': 'This transaction ID has already been submitted'}, status=400)

        new_state = topup_state_snapshot(topup, request)
        if was_rejected:
            # Clearing rejection_reason here is an automatic side effect of
            # resubmission, not a meaningful edit — don't surface it as a
            # diff line in the audit trail.
            new_state['rejection_reason'] = previous_state['rejection_reason']

        log_topup_audit(
            topup, 'RESUBMITTED' if was_rejected else 'EDITED', actor=request.user,
            previous_state=previous_state, new_state=new_state,
        )

    _notify_admins(
        Notification.TOPUP_VENDOR_RESPONDED,
        'Vendor Responded to Top-up Request',
        f"{request.user.username} {'resubmitted a rejected' if was_rejected else 'provided more information for a'} "
        f"top-up request of {topup.amount} credits.",
        data={'topup_id': topup.id},
    )
    return Response({'message': 'Top-up request updated', 'topup': topup_dict(topup, request)})


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def plans_list(request):
    plans = SubscriptionPlan.objects.all()
    return Response({'results': [plan_dict(p) for p in plans]})


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def get_subscription(request):
    err = _require_vendor(request)
    if err:
        return err
    from app.marketplace.models.product import Product

    sub = subscription_service.get_active_subscription(request.user)
    entitlements = subscription_service.get_entitlements(request.user)
    entitlements.pop('subscription', None)
    return Response({
        'subscription': subscription_dict(sub) if sub else None,
        'entitlements': entitlements,
        'active_products': Product.objects.filter(vendor=request.user, is_active=True).count(),
        'auto_deactivated_products': Product.objects.filter(vendor=request.user, auto_deactivated=True).count(),
    })


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def purchase_subscription(request):
    err = _require_vendor(request)
    if err:
        return err
    plan = SubscriptionPlan.objects.filter(id=request.data.get('plan_id')).first()
    if not plan:
        return Response({'error': 'Plan not found'}, status=404)
    if plan.is_free_default:
        return Response({'error': 'The free plan does not need to be purchased'}, status=400)
    try:
        sub = subscription_service.purchase_subscription(request.user, plan, actor=request.user)
    except SubscriptionError as e:
        return Response({'error': str(e)}, status=400)
    return Response({'message': 'Subscription purchased', 'subscription': subscription_dict(sub)}, status=201)


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def cancel_subscription(request):
    err = _require_vendor(request)
    if err:
        return err
    reason = (request.data.get('reason') or '').strip()
    try:
        sub = subscription_service.cancel_subscription(request.user, actor=request.user, reason=reason)
    except SubscriptionError as e:
        return Response({'error': str(e)}, status=400)
    return Response({
        'message': f'Cancellation scheduled for {sub.expires_at.strftime("%d %b %Y")} — you keep full access until then',
        'subscription': subscription_dict(sub),
    })


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def resume_subscription(request):
    err = _require_vendor(request)
    if err:
        return err
    try:
        sub = subscription_service.resume_subscription(request.user, actor=request.user)
    except SubscriptionError as e:
        return Response({'error': str(e)}, status=400)
    return Response({'message': 'Cancellation undone — your subscription will continue as normal', 'subscription': subscription_dict(sub)})


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def subscription_history(request):
    err = _require_vendor(request)
    if err:
        return err
    queryset = VendorSubscription.objects.filter(vendor=request.user).select_related('plan')
    renewed_from_ids = vendor_renewed_from_ids(request.user)
    paginated = get_paginated_data(queryset, request, default_limit=5)
    return Response({
        'results': history_list(paginated['queryset'], renewed_from_ids),
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
    })


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def notifications_list(request):
    queryset = Notification.objects.filter(user=request.user)
    if request.query_params.get('unread') in ('1', 'true', 'True'):
        queryset = queryset.filter(is_read=False)
    paginated = get_paginated_data(queryset, request, search_fields=['title', 'message'], default_limit=15)
    unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
    return Response({
        'results': [notification_dict(n) for n in paginated['queryset']],
        'unread_count': unread_count,
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
    })


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def notifications_mark_read(request):
    ids = request.data.get('ids')
    queryset = Notification.objects.filter(user=request.user, is_read=False)
    if ids and not request.data.get('all'):
        queryset = queryset.filter(id__in=ids)
    updated = queryset.update(is_read=True)
    return Response({'message': f'{updated} notifications marked as read'})
