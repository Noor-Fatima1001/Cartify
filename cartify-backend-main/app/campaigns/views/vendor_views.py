import logging
from decimal import Decimal, InvalidOperation

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from app.auth.models.user import User
from app.auth.permissions.auth_token import BearerTokenAuthentication
from app.campaigns.models import Campaign, CampaignAuditLog, CampaignPricing
from app.campaigns.service import campaign_service
from app.campaigns.service.campaign_service import CampaignError
from app.marketplace.models.product import Product
from app.marketplace.views.utils import get_paginated_data

from .serializers import audit_log_dict, campaign_dict, pricing_dict

logger = logging.getLogger(__name__)

OBJECTIVE_KEYS = ('views', 'favorites', 'cart_adds', 'link_clicks')


def _require_vendor(request):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Vendor access required'}, status=403)
    return None


def _parse_product_entries(request, raw_products):
    """Validate [{product_id, objectives:{views,favorites,cart_adds,link_clicks}}]."""
    if not isinstance(raw_products, list) or not raw_products:
        raise CampaignError('At least one product is required')

    entries = []
    seen = set()
    for raw in raw_products:
        try:
            product_id = int(raw.get('product_id'))
        except (TypeError, ValueError, AttributeError):
            raise CampaignError('Each product entry needs a product_id')
        if product_id in seen:
            raise CampaignError('Duplicate product in campaign')
        seen.add(product_id)

        objectives = raw.get('objectives') or {}
        cleaned = {k: bool(objectives.get(k)) for k in OBJECTIVE_KEYS}
        if not any(cleaned.values()):
            raise CampaignError('Each product must have at least one objective enabled')
        entries.append({'product_id': product_id, 'objectives': cleaned})

    owned = set(
        Product.objects.filter(vendor=request.user, id__in=seen).values_list('id', flat=True)
    )
    missing = seen - owned
    if missing:
        raise CampaignError('You can only promote your own products')
    return entries


def _get_own_campaign(request, campaign_id):
    return Campaign.objects.filter(id=campaign_id, vendor=request.user).first()


@api_view(['GET', 'POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def campaigns(request):
    err = _require_vendor(request)
    if err:
        return err

    if request.method == 'GET':
        queryset = Campaign.objects.filter(vendor=request.user).prefetch_related('products__product')
        paginated = get_paginated_data(queryset, request, search_fields=['name'], status_field='status', default_limit=10)
        return Response({
            'results': [campaign_dict(c, request) for c in paginated['queryset']],
            'pricing': pricing_dict(CampaignPricing.load()),
            'total_items': paginated['total_items'],
            'total_pages': paginated['total_pages'],
            'current_page': paginated['current_page'],
        })

    name = (request.data.get('name') or '').strip()
    if not name:
        return Response({'error': 'Campaign name is required'}, status=400)
    try:
        budget = Decimal(str(request.data.get('budget')))
    except (InvalidOperation, TypeError):
        return Response({'error': 'A valid budget is required'}, status=400)

    try:
        entries = _parse_product_entries(request, request.data.get('products'))
        campaign = campaign_service.create_campaign(request.user, name, budget, entries)
    except CampaignError as e:
        return Response({'error': str(e)}, status=400)

    return Response({'message': 'Campaign created — budget reserved from your credits',
                     'campaign': campaign_dict(campaign, request)}, status=201)


@api_view(['GET', 'PATCH'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def campaign_detail(request, campaign_id):
    err = _require_vendor(request)
    if err:
        return err
    campaign = _get_own_campaign(request, campaign_id)
    if not campaign:
        return Response({'error': 'Campaign not found'}, status=404)

    if request.method == 'GET':
        return Response({'campaign': campaign_dict(campaign, request),
                         'pricing': pricing_dict(CampaignPricing.load())})

    new_name = (request.data.get('name') or '').strip() or None
    raw_products = request.data.get('products')
    try:
        entries = _parse_product_entries(request, raw_products) if raw_products is not None else None
        campaign_service.update_campaign_products(campaign, entries, actor=request.user, new_name=new_name)
    except CampaignError as e:
        return Response({'error': str(e)}, status=400)

    campaign.refresh_from_db()
    return Response({'message': 'Campaign updated', 'campaign': campaign_dict(campaign, request)})


def _lifecycle_action(request, campaign_id, service_fn, success_message):
    err = _require_vendor(request)
    if err:
        return err
    campaign = _get_own_campaign(request, campaign_id)
    if not campaign:
        return Response({'error': 'Campaign not found'}, status=404)
    try:
        campaign = service_fn(campaign.id, request.user)
    except CampaignError as e:
        return Response({'error': str(e)}, status=400)
    return Response({'message': success_message, 'campaign': campaign_dict(campaign, request)})


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def start_campaign(request, campaign_id):
    return _lifecycle_action(request, campaign_id, campaign_service.start_campaign,
                             'Campaign started — it will run for 1 month')


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def pause_campaign(request, campaign_id):
    err = _require_vendor(request)
    if err:
        return err
    campaign = _get_own_campaign(request, campaign_id)
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
def resume_campaign(request, campaign_id):
    return _lifecycle_action(request, campaign_id, campaign_service.resume_campaign, 'Campaign resumed')


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def stop_campaign(request, campaign_id):
    err = _require_vendor(request)
    if err:
        return err
    campaign = _get_own_campaign(request, campaign_id)
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
    message = ('Draft campaign cancelled — reserved budget refunded to your credits' if never_started
               else 'Campaign stopped — unused budget refunded to your credits')
    return Response({'message': message, 'campaign': campaign_dict(campaign, request)})


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def change_budget(request, campaign_id):
    err = _require_vendor(request)
    if err:
        return err
    campaign = _get_own_campaign(request, campaign_id)
    if not campaign:
        return Response({'error': 'Campaign not found'}, status=404)
    try:
        new_budget = Decimal(str(request.data.get('new_budget')))
    except (InvalidOperation, TypeError):
        return Response({'error': 'A valid new_budget is required'}, status=400)
    try:
        campaign = campaign_service.change_budget(campaign.id, new_budget, request.user)
    except CampaignError as e:
        return Response({'error': str(e)}, status=400)
    return Response({'message': 'Budget updated', 'campaign': campaign_dict(campaign, request)})


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def campaign_analytics(request, campaign_id):
    err = _require_vendor(request)
    if err:
        return err
    campaign = _get_own_campaign(request, campaign_id)
    if not campaign:
        return Response({'error': 'Campaign not found'}, status=404)

    from django.db.models import Count, Q, Sum
    from django.db.models.functions import TruncDate

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


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def audit_logs(request, campaign_id):
    err = _require_vendor(request)
    if err:
        return err
    campaign = _get_own_campaign(request, campaign_id)
    if not campaign:
        return Response({'error': 'Campaign not found'}, status=404)
    paginated = get_paginated_data(campaign.audit_logs.select_related('actor'), request, default_limit=20)
    return Response({
        'results': [audit_log_dict(l) for l in paginated['queryset']],
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
    })
