import logging
from decimal import Decimal, InvalidOperation

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate

from app.auth.permissions.auth_token import BearerTokenAuthentication
from app.campaigns.models import Campaign, CampaignAuditLog, CampaignPricing
from app.campaigns.service import campaign_service
from app.campaigns.service.campaign_service import CampaignError
from app.marketplace.views.admin_views import is_admin
from app.marketplace.views.utils import get_paginated_data

from .serializers import audit_log_dict, campaign_dict, pricing_dict

logger = logging.getLogger(__name__)

PRICE_FIELDS = ('cost_per_view', 'cost_per_favorite', 'cost_per_cart_add', 'cost_per_link_click')


def _require_admin(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    return None


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_campaigns(request):
    err = _require_admin(request)
    if err:
        return err
    queryset = Campaign.objects.select_related('vendor').prefetch_related('products__product')
    vendor_id = request.query_params.get('vendor')
    if vendor_id:
        queryset = queryset.filter(vendor_id=vendor_id)
    paginated = get_paginated_data(
        queryset, request,
        search_fields=['name', 'vendor__username'],
        status_field='status',
        default_limit=10,
    )
    return Response({
        'results': [campaign_dict(c, request) for c in paginated['queryset']],
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
    })


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_campaign_detail(request, campaign_id):
    err = _require_admin(request)
    if err:
        return err

    campaign = Campaign.objects.filter(id=campaign_id).select_related('vendor').prefetch_related('products__product').first()
    if not campaign:
        return Response({'error': 'Campaign not found'}, status=404)

    return Response({'campaign': campaign_dict(campaign, request), 'pricing': pricing_dict(CampaignPricing.load())})


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_campaign_audit_logs(request, campaign_id):
    err = _require_admin(request)
    if err:
        return err

    campaign = Campaign.objects.filter(id=campaign_id).select_related('vendor').first()
    if not campaign:
        return Response({'error': 'Campaign not found'}, status=404)

    paginated = get_paginated_data(campaign.audit_logs.select_related('actor'), request, default_limit=20)
    return Response({
        'results': [audit_log_dict(l) for l in paginated['queryset']],
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
    })


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_pause_campaign(request, campaign_id):
    err = _require_admin(request)
    if err:
        return err
    campaign = Campaign.objects.filter(id=campaign_id).first()
    if not campaign:
        return Response({'error': 'Campaign not found'}, status=404)
    reason = (request.data.get('reason') or '').strip()
    try:
        campaign = campaign_service.pause_campaign(campaign.id, request.user, reason=reason)
    except CampaignError as e:
        return Response({'error': str(e)}, status=400)
    return Response({'message': 'Campaign paused', 'campaign': campaign_dict(campaign, request)})


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_stop_campaign(request, campaign_id):
    err = _require_admin(request)
    if err:
        return err
    campaign = Campaign.objects.filter(id=campaign_id).first()
    if not campaign:
        return Response({'error': 'Campaign not found'}, status=404)
    if campaign.status == Campaign.COMPLETED:
        return Response({'error': 'Campaign is already completed'}, status=400)
    reason = (request.data.get('reason') or '').strip()
    never_started = campaign.started_at is None
    campaign = campaign_service.complete_campaign(
        campaign.id, actor=request.user, reason=reason,
        action=CampaignAuditLog.CANCELLED if never_started else None,
    )
    message = ("Draft campaign cancelled by admin — vendor's reserved budget refunded" if never_started
               else "Campaign stopped by admin — vendor's unused budget refunded")
    return Response({'message': message, 'campaign': campaign_dict(campaign, request)})


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_campaign_analytics(request, campaign_id):
    err = _require_admin(request)
    if err:
        return err

    campaign = Campaign.objects.filter(id=campaign_id).select_related('vendor').first()
    if not campaign:
        return Response({'error': 'Campaign not found'}, status=404)

    charges = campaign.charges.all()

    by_objective = {row['objective']: row for row in charges.values('objective').annotate(
        count=Count('id'), spend=Sum('amount'))}

    def obj_stat(objective):
        row = by_objective.get(objective, {})
        return {'count': row.get('count', 0), 'spend': str(row.get('spend') or '0')}

    daily = [
        {
            'date': row['day'].isoformat(),
            'spend': str(row['spend'] or '0'),
            'views': row['views'],
            'favorites': row['favorites'],
            'cart_adds': row['cart_adds'],
            'link_clicks': row['link_clicks'],
        }
        for row in charges.annotate(day=TruncDate('created_at')).values('day').annotate(
            spend=Sum('amount'),
            views=Count('id', filter=Q(objective='VIEW')),
            favorites=Count('id', filter=Q(objective='FAVORITE')),
            cart_adds=Count('id', filter=Q(objective='CART_ADD')),
            link_clicks=Count('id', filter=Q(objective='LINK_CLICK')),
        ).order_by('day')
    ]

    product_rows = charges.values('product_id', 'product__name').annotate(
        spend=Sum('amount'),
        views=Count('id', filter=Q(objective='VIEW')),
        favorites=Count('id', filter=Q(objective='FAVORITE')),
        cart_adds=Count('id', filter=Q(objective='CART_ADD')),
        link_clicks=Count('id', filter=Q(objective='LINK_CLICK')),
    ).order_by('-spend')

    return Response({
        'campaign': campaign_dict(campaign, request, include_products=False),
        'totals': {
            'total_budget': str(campaign.total_budget),
            'spent': str(campaign.spent),
            'remaining': str(campaign.remaining),
            'views': obj_stat('VIEW'),
            'favorites': obj_stat('FAVORITE'),
            'cart_adds': obj_stat('CART_ADD'),
            'link_clicks': obj_stat('LINK_CLICK'),
        },
        'daily': daily,
        'products': [
            {
                'product_id': row['product_id'],
                'product_name': row['product__name'],
                'spend': str(row['spend'] or '0'),
                'views': row['views'],
                'favorites': row['favorites'],
                'cart_adds': row['cart_adds'],
                'link_clicks': row['link_clicks'],
            }
            for row in product_rows
        ],
    })


@api_view(['GET', 'PUT'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_pricing(request):
    err = _require_admin(request)
    if err:
        return err

    pricing = CampaignPricing.load()
    if request.method == 'GET':
        return Response({'pricing': pricing_dict(pricing)})

    for field in PRICE_FIELDS:
        if field in request.data:
            try:
                value = Decimal(str(request.data.get(field)))
            except (InvalidOperation, TypeError):
                return Response({'error': f'{field} must be a valid number'}, status=400)
            if value < 0:
                return Response({'error': f'{field} cannot be negative'}, status=400)
            setattr(pricing, field, value)
    pricing.updated_by = request.user
    pricing.save()
    return Response({'message': 'Campaign pricing updated', 'pricing': pricing_dict(pricing)})
