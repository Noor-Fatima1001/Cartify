import logging
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from app.auth.models.user import User
from app.auth.permissions.auth_token import BearerTokenAuthentication
from app.billing.models import (
    CreditLedger,
    Notification,
    PaymentMethod,
    SubscriptionAuditLog,
    SubscriptionPlan,
    TopUpRequest,
    VendorSubscription,
    Wallet,
)
from app.billing.models.wallet import InsufficientCreditsError
from app.billing.service import subscription_service
from app.billing.service.notification_service import notify
from app.billing.service.subscription_service import SubscriptionError
from app.marketplace.views.admin_views import is_admin
from app.marketplace.views.utils import get_paginated_data

from .serializers import (
    audit_log_dict,
    history_list,
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


def _require_admin(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    return None


def _reject_self_review(request, topup):
    """An account that is simultaneously a vendor and an admin (role=VENDOR
    with is_staff/is_superuser also set — is_admin() checks those
    independently of role) must not be able to approve/reject/edit its own
    top-up submission. Call after fetching `topup`, before any mutation."""
    if topup.vendor_id == request.user.id:
        return Response({'error': 'You cannot review your own top-up request'}, status=403)
    return None


# ─── Payment methods ─────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_payment_methods(request):
    err = _require_admin(request)
    if err:
        return err

    if request.method == 'GET':
        methods = PaymentMethod.objects.all()
        return Response({'results': [payment_method_dict(pm) for pm in methods]})

    method_type = (request.data.get('method_type') or '').strip().upper()
    provider_name = (request.data.get('provider_name') or '').strip()
    account_holder = (request.data.get('account_holder') or '').strip()
    account_number = (request.data.get('account_number') or '').strip()

    if method_type not in (PaymentMethod.WALLET, PaymentMethod.BANK):
        return Response({'error': 'method_type must be WALLET or BANK'}, status=400)
    if not provider_name or not account_holder or not account_number:
        return Response({'error': 'provider_name, account_holder and account_number are required'}, status=400)

    pm = PaymentMethod.objects.create(
        method_type=method_type,
        provider_name=provider_name,
        account_holder=account_holder,
        account_number=account_number,
        instructions=(request.data.get('instructions') or '').strip(),
        is_active=bool(request.data.get('is_active', True)),
        sort_order=int(request.data.get('sort_order') or 0),
    )
    return Response({'message': 'Payment method created', 'payment_method': payment_method_dict(pm)}, status=201)


@api_view(['PATCH', 'DELETE'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_payment_method_detail(request, method_id):
    err = _require_admin(request)
    if err:
        return err
    try:
        pm = PaymentMethod.objects.get(id=method_id)
    except PaymentMethod.DoesNotExist:
        return Response({'error': 'Payment method not found'}, status=404)

    if request.method == 'DELETE':
        pm.delete()
        return Response({'message': 'Payment method deleted'})

    if 'method_type' in request.data:
        method_type = (request.data.get('method_type') or '').strip().upper()
        if method_type not in (PaymentMethod.WALLET, PaymentMethod.BANK):
            return Response({'error': 'method_type must be WALLET or BANK'}, status=400)
        pm.method_type = method_type
    for field in ('provider_name', 'account_holder', 'account_number', 'instructions'):
        if field in request.data:
            setattr(pm, field, (request.data.get(field) or '').strip())
    if 'is_active' in request.data:
        pm.is_active = bool(request.data.get('is_active'))
    if 'sort_order' in request.data:
        try:
            pm.sort_order = int(request.data.get('sort_order'))
        except (TypeError, ValueError):
            return Response({'error': 'sort_order must be a number'}, status=400)
    pm.save()
    return Response({'message': 'Payment method updated', 'payment_method': payment_method_dict(pm)})


# ─── Top-up approvals ────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_topups(request):
    err = _require_admin(request)
    if err:
        return err
    queryset = TopUpRequest.objects.select_related('vendor', 'payment_method', 'reviewed_by').all()
    vendor_id = request.query_params.get('vendor')
    if vendor_id:
        queryset = queryset.filter(vendor_id=vendor_id)
    paginated = get_paginated_data(
        queryset, request,
        search_fields=['transaction_id', 'vendor__username', 'vendor__email'],
        status_field='status',
        default_limit=10,
    )
    pending_count = TopUpRequest.objects.filter(status=TopUpRequest.PENDING).count()
    return Response({
        'results': [topup_dict(t, request) for t in paginated['queryset']],
        'pending_count': pending_count,
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
    })


@api_view(['GET', 'PATCH'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_topup_detail(request, topup_id):
    """GET returns full detail + audit trail. PATCH lets an admin correct
    amount/transaction_id/payment_method/screenshot — disallowed once
    APPROVED, since the ledger entry has already been created for the
    original amount and editing afterwards would desync it."""
    err = _require_admin(request)
    if err:
        return err

    if request.method == 'GET':
        try:
            topup = TopUpRequest.objects.select_related('vendor', 'payment_method', 'reviewed_by').get(id=topup_id)
        except TopUpRequest.DoesNotExist:
            return Response({'error': 'Top-up request not found'}, status=404)
        logs = topup.audit_logs.select_related('actor').all()
        data = topup_dict(topup, request)
        data['audit_log'] = [topup_audit_dict(l) for l in logs]
        return Response(data)

    with transaction.atomic():
        try:
            topup = TopUpRequest.objects.select_for_update().get(id=topup_id)
        except TopUpRequest.DoesNotExist:
            return Response({'error': 'Top-up request not found'}, status=404)

        err = _reject_self_review(request, topup)
        if err:
            return err

        if topup.status == TopUpRequest.APPROVED:
            return Response({'error': 'An approved top-up cannot be edited'}, status=400)

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
        if 'payment_method_id' in request.data:
            pm_id = request.data.get('payment_method_id')
            if pm_id:
                try:
                    topup.payment_method = PaymentMethod.objects.filter(id=pm_id, is_active=True).first()
                except (ValueError, TypeError):
                    return Response({'error': 'Invalid payment method'}, status=400)
            else:
                topup.payment_method = None
        new_screenshot = request.FILES.get('screenshot')
        if new_screenshot:
            screenshot_error = validate_screenshot(new_screenshot)
            if screenshot_error:
                return Response({'error': screenshot_error}, status=400)
            topup.screenshot = new_screenshot

        try:
            topup.save()
        except IntegrityError:
            return Response({'error': 'This transaction ID has already been submitted'}, status=400)
        log_topup_audit(
            topup, 'ADMIN_EDITED', actor=request.user,
            previous_state=previous_state, new_state=topup_state_snapshot(topup, request),
        )

    return Response({'message': 'Top-up request updated', 'topup': topup_dict(topup, request)})


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_topup_approve(request, topup_id):
    err = _require_admin(request)
    if err:
        return err

    with transaction.atomic():
        try:
            topup = TopUpRequest.objects.select_for_update().get(id=topup_id)
        except TopUpRequest.DoesNotExist:
            return Response({'error': 'Top-up request not found'}, status=404)

        err = _reject_self_review(request, topup)
        if err:
            return err

        if topup.status not in (TopUpRequest.PENDING, TopUpRequest.INFO_REQUIRED):
            return Response({'error': f'Request is already {topup.get_status_display()}'}, status=400)

        previous_state = topup_state_snapshot(topup, request)
        wallet = Wallet.lock_for(topup.vendor)
        entry = wallet.apply(
            CreditLedger.TOPUP,
            topup.amount,
            description=f'Top-up approved (transaction {topup.transaction_id})',
            reference_type='topup',
            reference_id=topup.id,
            actor=request.user,
        )
        topup.status = TopUpRequest.APPROVED
        topup.reviewed_by = request.user
        topup.reviewed_at = timezone.now()
        topup.ledger_entry = entry
        topup.save()
        log_topup_audit(
            topup, 'APPROVED', actor=request.user,
            previous_state=previous_state, new_state=topup_state_snapshot(topup, request),
        )

    notify(
        topup.vendor,
        Notification.TOPUP_APPROVED,
        'Top-up Approved',
        f'Your top-up of {topup.amount} credits has been approved and added to your wallet. '
        f'New balance: {wallet.balance} credits.',
        data={'topup_id': topup.id, 'amount': str(topup.amount)},
    )
    return Response({'message': 'Top-up approved and credits added', 'topup': topup_dict(topup, request)})


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_topup_reject(request, topup_id):
    err = _require_admin(request)
    if err:
        return err

    reason = (request.data.get('reason') or '').strip()
    if not reason:
        return Response({'error': 'A rejection reason is required'}, status=400)

    with transaction.atomic():
        try:
            topup = TopUpRequest.objects.select_for_update().get(id=topup_id)
        except TopUpRequest.DoesNotExist:
            return Response({'error': 'Top-up request not found'}, status=404)
        err = _reject_self_review(request, topup)
        if err:
            return err
        if topup.status not in (TopUpRequest.PENDING, TopUpRequest.INFO_REQUIRED):
            return Response({'error': f'Request is already {topup.get_status_display()}'}, status=400)
        previous_state = topup_state_snapshot(topup, request)
        topup.status = TopUpRequest.REJECTED
        topup.rejection_reason = reason
        topup.reviewed_by = request.user
        topup.reviewed_at = timezone.now()
        topup.save()
        log_topup_audit(
            topup, 'REJECTED', actor=request.user,
            previous_state=previous_state, new_state=topup_state_snapshot(topup, request),
        )

    notify(
        topup.vendor,
        Notification.TOPUP_REJECTED,
        'Top-up Rejected',
        f'Your top-up request of {topup.amount} credits was rejected.\n\nReason: {reason}',
        data={'topup_id': topup.id, 'reason': reason},
    )
    return Response({'message': 'Top-up rejected', 'topup': topup_dict(topup, request)})


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_topup_request_info(request, topup_id):
    err = _require_admin(request)
    if err:
        return err

    message = (request.data.get('message') or '').strip()
    if not message:
        return Response({'error': 'A message describing the required information is required'}, status=400)

    with transaction.atomic():
        try:
            topup = TopUpRequest.objects.select_for_update().get(id=topup_id)
        except TopUpRequest.DoesNotExist:
            return Response({'error': 'Top-up request not found'}, status=404)
        err = _reject_self_review(request, topup)
        if err:
            return err
        if topup.status != TopUpRequest.PENDING:
            return Response({'error': f'Request is already {topup.get_status_display()}'}, status=400)
        previous_state = topup_state_snapshot(topup, request)
        topup.status = TopUpRequest.INFO_REQUIRED
        topup.info_request_message = message
        topup.reviewed_by = request.user
        topup.reviewed_at = timezone.now()
        topup.save()
        log_topup_audit(
            topup, 'INFO_REQUESTED', actor=request.user,
            previous_state=previous_state, new_state=topup_state_snapshot(topup, request),
        )

    notify(
        topup.vendor,
        Notification.TOPUP_INFO_REQUIRED,
        'Top-up: More Information Required',
        f'The admin needs more information about your top-up request of {topup.amount} credits.\n\n{message}',
        data={'topup_id': topup.id, 'message': message},
    )
    return Response({'message': 'Information requested from vendor', 'topup': topup_dict(topup, request)})


# ─── Subscription plans ──────────────────────────────────────────────────────

PLAN_BOOL_FIELDS = ('allow_cart', 'can_view_viewers', 'can_view_favoriters', 'can_view_cart_users', 'can_view_clickers', 'is_active')


def _apply_plan_fields(plan, data):
    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            return 'Plan name cannot be empty'
        plan.name = name
    if 'description' in data:
        plan.description = (data.get('description') or '').strip()
    if 'price_credits' in data:
        try:
            price = Decimal(str(data.get('price_credits')))
        except (InvalidOperation, TypeError):
            return 'price_credits must be a valid number'
        if price < 0:
            return 'price_credits cannot be negative'
        plan.price_credits = price
    if 'max_active_products' in data:
        try:
            plan.max_active_products = max(0, int(data.get('max_active_products')))
        except (TypeError, ValueError):
            return 'max_active_products must be a number'
    if 'visitor_detail_limit' in data:
        raw = data.get('visitor_detail_limit')
        if raw in (None, '', 'null'):
            plan.visitor_detail_limit = None
        else:
            try:
                plan.visitor_detail_limit = max(0, int(raw))
            except (TypeError, ValueError):
                return 'visitor_detail_limit must be a number or empty for unlimited'
    if 'features' in data and isinstance(data.get('features'), dict):
        plan.features = data['features']
    for field in PLAN_BOOL_FIELDS:
        if field in data:
            setattr(plan, field, bool(data.get(field)))
    return None


@api_view(['GET', 'POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_plans(request):
    err = _require_admin(request)
    if err:
        return err

    if request.method == 'GET':
        plans = SubscriptionPlan.objects.all()
        results = []
        for p in plans:
            data = plan_dict(p)
            data['active_subscribers'] = p.subscriptions.filter(status=VendorSubscription.ACTIVE).count()
            results.append(data)
        return Response({'results': results})

    if not (request.data.get('name') or '').strip():
        return Response({'error': 'Plan name is required'}, status=400)
    plan = SubscriptionPlan()
    error = _apply_plan_fields(plan, request.data)
    if error:
        return Response({'error': error}, status=400)
    plan.save()
    return Response({'message': 'Plan created', 'plan': plan_dict(plan)}, status=201)


@api_view(['PATCH', 'DELETE'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_plan_detail(request, plan_id):
    err = _require_admin(request)
    if err:
        return err
    try:
        plan = SubscriptionPlan.objects.get(id=plan_id)
    except SubscriptionPlan.DoesNotExist:
        return Response({'error': 'Plan not found'}, status=404)

    if request.method == 'DELETE':
        if plan.is_free_default:
            return Response({'error': 'The free default plan cannot be deleted'}, status=400)
        if plan.subscriptions.exists():
            plan.is_active = False
            plan.save(update_fields=['is_active'])
            return Response({'message': 'Plan has subscribers, so it was deactivated instead of deleted'})
        plan.delete()
        return Response({'message': 'Plan deleted'})

    error = _apply_plan_fields(plan, request.data)
    if error:
        return Response({'error': error}, status=400)
    plan.save()
    return Response({'message': 'Plan updated', 'plan': plan_dict(plan)})


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_subscriptions(request):
    err = _require_admin(request)
    if err:
        return err
    queryset = VendorSubscription.objects.select_related('vendor', 'plan')
    status_query = request.query_params.get('status', '').strip().upper()
    if status_query and status_query != 'ALL':
        queryset = queryset.filter(status=status_query)
    paginated = get_paginated_data(
        queryset, request,
        search_fields=['vendor__username', 'vendor__email', 'plan__name'],
        default_limit=10,
    )
    results = []
    for sub in paginated['queryset']:
        data = subscription_dict(sub)
        data['vendor_id'] = sub.vendor_id
        data['vendor_username'] = sub.vendor.username
        results.append(data)
    return Response({
        'results': results,
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
    })


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_vendor_subscription_history(request, vendor_id):
    err = _require_admin(request)
    if err:
        return err
    try:
        vendor = User.objects.get(id=vendor_id, role=User.VENDOR)
    except User.DoesNotExist:
        return Response({'error': 'Vendor not found'}, status=404)

    subs = VendorSubscription.objects.filter(vendor=vendor).select_related('plan')
    renewed_from_ids = vendor_renewed_from_ids(vendor)
    paginated = get_paginated_data(subs, request, default_limit=5)
    logs = SubscriptionAuditLog.objects.filter(vendor=vendor).select_related('actor').order_by('-created_at')[:100]
    return Response({
        'vendor_id': vendor.id,
        'vendor_username': vendor.username,
        'subscriptions': history_list(paginated['queryset'], renewed_from_ids),
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
        'audit_log': [audit_log_dict(l) for l in logs],
    })


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_cancel_subscription(request, vendor_id):
    err = _require_admin(request)
    if err:
        return err
    try:
        vendor = User.objects.get(id=vendor_id, role=User.VENDOR)
    except User.DoesNotExist:
        return Response({'error': 'Vendor not found'}, status=404)

    reason = (request.data.get('reason') or '').strip()
    try:
        sub = subscription_service.cancel_subscription(vendor, actor=request.user, reason=reason)
    except SubscriptionError as e:
        return Response({'error': str(e)}, status=400)
    return Response({
        'message': f'Cancellation scheduled for {sub.expires_at.strftime("%d %b %Y")} — vendor keeps full access until then',
        'subscription': subscription_dict(sub),
    })


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_resume_subscription(request, vendor_id):
    err = _require_admin(request)
    if err:
        return err
    try:
        vendor = User.objects.get(id=vendor_id, role=User.VENDOR)
    except User.DoesNotExist:
        return Response({'error': 'Vendor not found'}, status=404)

    try:
        sub = subscription_service.resume_subscription(vendor, actor=request.user)
    except SubscriptionError as e:
        return Response({'error': str(e)}, status=400)
    return Response({'message': 'Cancellation undone — subscription will continue as normal', 'subscription': subscription_dict(sub)})


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_renew_subscription(request, vendor_id):
    """Renew or activate a plan on behalf of a vendor (e.g. after a manually
    reconciled payment). Charges the vendor's own wallet, same as a
    self-service purchase — this only saves the vendor the extra step."""
    err = _require_admin(request)
    if err:
        return err
    try:
        vendor = User.objects.get(id=vendor_id, role=User.VENDOR)
    except User.DoesNotExist:
        return Response({'error': 'Vendor not found'}, status=404)

    plan = SubscriptionPlan.objects.filter(id=request.data.get('plan_id')).first()
    if not plan:
        return Response({'error': 'Plan not found'}, status=404)
    if plan.is_free_default:
        return Response({'error': 'The free plan does not need to be purchased'}, status=400)

    try:
        sub = subscription_service.purchase_subscription(vendor, plan, actor=request.user)
    except SubscriptionError as e:
        return Response({'error': str(e)}, status=400)
    return Response({'message': 'Subscription renewed on behalf of vendor', 'subscription': subscription_dict(sub)}, status=201)


# ─── Reports ─────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_reports(request):
    err = _require_admin(request)
    if err:
        return err

    from datetime import timedelta

    from django.db.models import Count, Sum
    from django.utils import timezone

    from app.campaigns.models import Campaign, CampaignCharge
    from app.marketplace.models.purchase_click import PurchaseLinkClick

    now = timezone.now()
    month_ago = now - timedelta(days=30)

    def dec(value):
        return str(value or 0)

    topups_all = TopUpRequest.objects.filter(status=TopUpRequest.APPROVED)
    credits_sold_total = topups_all.aggregate(s=Sum('amount'))['s']
    credits_sold_month = topups_all.filter(reviewed_at__gte=month_ago).aggregate(s=Sum('amount'))['s']

    subscription_revenue = VendorSubscription.objects.aggregate(s=Sum('credits_paid'))['s']
    campaign_revenue = CampaignCharge.objects.aggregate(s=Sum('amount'))['s']

    most_clicked = list(
        PurchaseLinkClick.objects.values('product_id', 'product__name', 'vendor__username')
        .annotate(clicks=Count('id'))
        .order_by('-clicks')[:5]
    )

    campaign_spend_by_vendor = {
        row['campaign__vendor_id']: row['spend']
        for row in CampaignCharge.objects.values('campaign__vendor_id').annotate(spend=Sum('amount'))
    }
    sub_spend_by_vendor = {
        row['vendor_id']: row['spend']
        for row in VendorSubscription.objects.values('vendor_id').annotate(spend=Sum('credits_paid'))
    }
    vendor_ids = set(campaign_spend_by_vendor) | set(sub_spend_by_vendor)
    usernames = dict(User.objects.filter(id__in=vendor_ids).values_list('id', 'username'))
    top_vendors = sorted(
        (
            {
                'vendor_id': vid,
                'vendor_username': usernames.get(vid, f'#{vid}'),
                'campaign_spend': dec(campaign_spend_by_vendor.get(vid)),
                'subscription_spend': dec(sub_spend_by_vendor.get(vid)),
                'total_spend': str((campaign_spend_by_vendor.get(vid) or 0) + (sub_spend_by_vendor.get(vid) or 0)),
            }
            for vid in vendor_ids
        ),
        key=lambda item: float(item['total_spend']),
        reverse=True,
    )[:5]

    return Response({
        'credits_sold': {'total': dec(credits_sold_total), 'last_30_days': dec(credits_sold_month)},
        'platform_revenue': {
            'total': str((subscription_revenue or 0) + (campaign_revenue or 0)),
            'subscriptions': dec(subscription_revenue),
            'campaigns': dec(campaign_revenue),
        },
        'active_campaigns': Campaign.objects.filter(status=Campaign.ACTIVE).count(),
        'pending_topups': TopUpRequest.objects.filter(status=TopUpRequest.PENDING).count(),
        'subscription_sales': {
            'total_count': VendorSubscription.objects.count(),
            'last_30_days_count': VendorSubscription.objects.filter(created_at__gte=month_ago).count(),
            'active_count': VendorSubscription.objects.filter(status=VendorSubscription.ACTIVE).count(),
        },
        'most_clicked_products': [
            {
                'product_id': row['product_id'],
                'product_name': row['product__name'],
                'vendor_username': row['vendor__username'],
                'clicks': row['clicks'],
            }
            for row in most_clicked
        ],
        'top_vendors': top_vendors,
        'total_wallet_balance': dec(Wallet.objects.aggregate(s=Sum('balance'))['s']),
    })


# ─── Wallets ─────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_wallets(request):
    err = _require_admin(request)
    if err:
        return err
    queryset = Wallet.objects.select_related('vendor').order_by('-balance')
    paginated = get_paginated_data(
        queryset, request,
        search_fields=['vendor__username', 'vendor__email'],
        default_limit=10,
    )
    return Response({
        'results': [
            {
                'vendor_id': w.vendor_id,
                'vendor_username': w.vendor.username,
                'vendor_email': w.vendor.email,
                'balance': str(w.balance),
                'updated_at': w.updated_at.isoformat(),
            }
            for w in paginated['queryset']
        ],
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
    })


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_wallet_adjust(request, vendor_id):
    err = _require_admin(request)
    if err:
        return err

    try:
        vendor = User.objects.get(id=vendor_id, role=User.VENDOR)
    except User.DoesNotExist:
        return Response({'error': 'Vendor not found'}, status=404)

    try:
        amount = Decimal(str(request.data.get('amount')))
    except (InvalidOperation, TypeError):
        return Response({'error': 'A valid amount is required (positive to add, negative to deduct)'}, status=400)
    if amount == 0:
        return Response({'error': 'Amount cannot be zero'}, status=400)

    description = (request.data.get('description') or '').strip() or 'Manual admin adjustment'

    try:
        with transaction.atomic():
            wallet = Wallet.lock_for(vendor)
            wallet.apply(
                CreditLedger.ADMIN_ADJUSTMENT,
                amount,
                description=description,
                reference_type='admin',
                actor=request.user,
            )
    except InsufficientCreditsError:
        return Response({'error': 'Adjustment would make the balance negative'}, status=400)

    return Response({'message': 'Wallet adjusted', 'balance': str(wallet.balance)})
