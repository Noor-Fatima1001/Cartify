from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from django.shortcuts import redirect
from rest_framework.permissions import IsAuthenticated, AllowAny
from app.auth.permissions.auth_token import BearerTokenAuthentication
from app.marketplace.models.product import Product, Favorite
from app.marketplace.models.purchase_click import PurchaseLinkClick
from app.marketplace.models.product_view import ProductView
from app.marketplace.serializers.product_serializer import ProductSerializer, FavoriteSerializer
from app.auth.models.user import User
from django.db.models import Count, F, Q, ExpressionWrapper, FloatField
from django.db import transaction
from django.utils import timezone
from django.utils.deprecation import MiddlewareMixin
from rest_framework.pagination import PageNumberPagination

class TrendingProductPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


def _sponsored_identity(request):
    """Resolve (user, guest_id) for sponsored-product targeting."""
    user = request.user if request.user.is_authenticated else None
    if user and getattr(user, 'role', None) == User.ANONYMOUS:
        user = None
    guest_id = (request.GET.get('device_id') or request.headers.get('X-Device-Id')
                or request.session.get('guest_device_id') or request.session.session_key)
    return user, guest_id


def _serialize_sponsored(request, limit=4, category_id=None, exclude_ids=()):
    """Fetch + serialize sponsored products, flagged with is_sponsored. Fail-soft."""
    try:
        from app.campaigns.service.sponsored_service import get_sponsored_products
        user, guest_id = _sponsored_identity(request)
        sponsored = get_sponsored_products(user=user, guest_id=guest_id, limit=limit,
                                           category_id=category_id, exclude_ids=exclude_ids)
        data = ProductSerializer(sponsored, many=True, context={'request': request}).data
        for item in data:
            item['is_sponsored'] = True
        return data
    except Exception:
        return []

@api_view(['GET'])
@permission_classes([AllowAny])
def product_feed(request):
    from django.db.models import Count
    
    products = Product.objects.filter(is_active=True).annotate(
        favorite_count=Count('favorited_by')
    )
    category_id = request.query_params.get('category')
    if category_id:
        products = products.filter(category_id=category_id)
        
    subcategory_id = request.query_params.get('subcategory')
    if subcategory_id:
        products = products.filter(subcategory_id=subcategory_id)
        
    brand_id = request.query_params.get('vendor')
    if brand_id:
        products = products.filter(vendor_id=brand_id)

    city = request.query_params.get('city')
    if city:
        products = products.filter(vendor__city__iexact=city)

    search = request.query_params.get('search', '').strip()
    if search:
        products = products.filter(Q(name__icontains=search) | Q(description__icontains=search))

    p_type = request.query_params.get('type')
    if p_type:
        products = products.filter(product_type__icontains=p_type)

    sort_query = request.query_params.get('sort', '').strip()
    if sort_query:
        products = products.order_by('-is_premium', sort_query)
    else:
        products = products.order_by('-is_premium', '-created_at')

    # A vendor/brand-scoped feed (e.g. the brand detail page) must only ever
    # show that vendor's own products — injecting another vendor's sponsored
    # ad here would inflate the count shown on the brand page beyond what the
    # brand actually has.
    sponsored_data = [] if brand_id else _serialize_sponsored(
        request, limit=4,
        category_id=int(category_id) if category_id else None,
    )
    if search:
        # Sponsored placements must still be relevant to the query — otherwise a
        # search that matches nothing would still surface an unrelated ad.
        search_lower = search.lower()
        sponsored_data = [
            item for item in sponsored_data
            if search_lower in (item.get('name') or '').lower()
            or search_lower in (item.get('description') or '').lower()
        ]
    sponsored_ids = {item['id'] for item in sponsored_data}
    if sponsored_ids:
        products = products.exclude(id__in=sponsored_ids)

    serializer = ProductSerializer(products, many=True, context={'request': request})
    # Sponsored products lead the feed; each is flagged with is_sponsored.
    return Response(sponsored_data + serializer.data)


@api_view(['GET'])
@permission_classes([AllowAny])
def trending_products(request):

    products = Product.objects.filter(is_active=True)

    category = request.GET.get('category')
    subcategory = request.GET.get('subcategory')
    vendor = request.GET.get('vendor')
    city = request.GET.get('city')

    if category:
        products = products.filter(category_id=category)

    if subcategory:
        products = products.filter(subcategory_id=subcategory)

    if vendor:
        products = products.filter(vendor_id=vendor)

    if city:
        products = products.filter(vendor__city__iexact=city)
    from django.db.models import Count, FloatField, ExpressionWrapper, Q
    
    products = products.annotate(
        favorite_count=Count('favorited_by'),
        view_count=Count('views'),
        trending_score=ExpressionWrapper(
            (Count('favorited_by') * 3) + (Count('views') * 1),
            output_field=FloatField()
        )
    )

    products = products.filter(
        Q(favorite_count__gt=0) | Q(view_count__gt=0)
    )

    products = products.order_by('-is_premium', '-trending_score', '-created_at')

    paginator = TrendingProductPagination()
    page = paginator.paginate_queryset(products, request)

    serializer = ProductSerializer(
        page,
        many=True,
        context={'request': request}
    )

    response = paginator.get_paginated_response(serializer.data)
    response.data['sponsored'] = _serialize_sponsored(
        request, limit=4,
        category_id=int(category) if category else None,
        exclude_ids=[p.id for p in page] if page else (),
    )
    return response

@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def upload_product(request):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Only vendors can upload products'}, status=status.HTTP_403_FORBIDDEN)
    
    # Check KYC approval
    if not hasattr(request.user, 'vendor_profile') or not request.user.vendor_profile.is_approved:
        return Response({'error': 'Vendor account is not approved yet'}, status=status.HTTP_403_FORBIDDEN)

    # Subscription product limit
    try:
        from app.billing.service.subscription_service import get_entitlements
        max_products = get_entitlements(request.user)['max_active_products']
        active_count = Product.objects.filter(vendor=request.user, is_active=True).count()
        if active_count >= max_products:
            return Response(
                {'error': f'Your current plan allows only {max_products} active products. '
                          f'Upgrade your subscription or deactivate a product to add more.'},
                status=status.HTTP_403_FORBIDDEN
            )
    except Exception:
        # Never block uploads if entitlement resolution itself breaks
        import logging
        logging.getLogger(__name__).exception('Product-limit check failed')

    # is_premium can only be granted through the paid activate_premium flow —
    # strip it here so a vendor can't set it directly on creation.
    data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
    data.pop('is_premium', None)

    serializer = ProductSerializer(data=data, context={'request': request})
    if serializer.is_valid():
        serializer.save(vendor=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([AllowAny])
def toggle_favorite(request):
    product_id = request.data.get('product_id')
    device_id = request.data.get('device_id')
    
    if not product_id:
        return Response({'error': 'Product ID is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Verify product exists
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

    if not product.is_active:
        return Response({'error': 'This product is no longer available'}, status=status.HTTP_404_NOT_FOUND)

    user = request.user if request.user.is_authenticated else None
    is_guest_user = user and getattr(user, 'role', None) == User.ANONYMOUS
    
    if is_guest_user and not device_id:
        device_id = user.device_id

    if not user or is_guest_user:
        if not device_id:
            return Response({'error': 'Authentication or Device ID required'}, status=status.HTTP_401_UNAUTHORIZED)

        # If there's an existing guest User row for this device, prefer attaching the favorite to that user.
        guest_user = User.objects.filter(device_id=device_id, role=User.ANONYMOUS).first()
        if not guest_user and device_id and str(device_id).isdigit():
            guest_user = User.objects.filter(id=int(device_id), role=User.ANONYMOUS).first()

        if guest_user:
            # Create/get favorite linked to the guest user. Remove any duplicate device-only favorites.
            favorite, created = Favorite.objects.get_or_create(user=guest_user, product_id=product_id)
            Favorite.objects.filter(device_id=device_id, user__isnull=True, product_id=product_id).exclude(id=favorite.id).delete()
            if favorite.device_id:
                favorite.device_id = None
                favorite.save(update_fields=['device_id'])
        else:
            favorite, created = Favorite.objects.get_or_create(device_id=device_id, product_id=product_id)

        request.session['guest_device_id'] = device_id
        User.objects.filter(device_id=device_id, role=User.ANONYMOUS).update(last_login=timezone.now())
    else:
        favorite, created = Favorite.objects.get_or_create(user=user, product_id=product_id)
        
    if not created:
        favorite.delete()
        return Response({'message': 'Removed from favorites'})

    # Campaign charging (fail-soft; only on add, never on remove)
    try:
        from app.campaigns.service.charging_service import charge_interaction
        charge_interaction(
            product,
            'FAVORITE',
            user=favorite.user,
            guest_id=None if favorite.user else favorite.device_id,
        )
    except Exception:
        pass

    return Response({'message': 'Added to favorites'})


@api_view(['GET'])
@permission_classes([AllowAny])
def list_favorites(request):
    """List the current user's/guest's own favorited products (mirrors get_cart's identity resolution)."""
    device_id = request.GET.get('device_id') or request.headers.get('X-Device-Id') or request.session.get('guest_device_id')
    user = request.user if request.user.is_authenticated else None
    is_guest_user = user and getattr(user, 'role', None) == User.ANONYMOUS

    if is_guest_user and not device_id:
        device_id = getattr(user, 'device_id', None)

    if user and not is_guest_user:
        favorites = Favorite.objects.filter(user=user)
    else:
        if not device_id:
            return Response({'results': []})
        guest_user = User.objects.filter(device_id=device_id, role=User.ANONYMOUS).first()
        if guest_user:
            favorites = Favorite.objects.filter(Q(user=guest_user) | Q(device_id=device_id, user__isnull=True))
        else:
            favorites = Favorite.objects.filter(device_id=device_id, user__isnull=True)

    favorites = favorites.filter(product__is_active=True).select_related('product', 'product__vendor').order_by('-created_at')
    results = [
        {
            'favorite_id': favorite.id,
            'added_at': favorite.created_at.isoformat(),
            'product': ProductSerializer(favorite.product, context={'request': request}).data,
        }
        for favorite in favorites
    ]
    return Response({'results': results, 'total_items': len(results)})


@api_view(['GET'])
@permission_classes([AllowAny])
def get_product_detail(request, product_id):
    try:
        product = Product.objects.annotate(
            favorite_count=Count('favorited_by')
        ).get(id=product_id, is_active=True)
    except Product.DoesNotExist:
        return Response(
            {'error': 'Product not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    user = request.user if request.user.is_authenticated else None
    is_guest_user = user and getattr(user, 'role', None) == User.ANONYMOUS
    device_id = request.GET.get('device_id') or request.headers.get('X-Device-Id') or request.session.get('guest_device_id')
    if is_guest_user and not device_id:
        device_id = getattr(user, 'device_id', None)
    session_id = request.session.session_key

    if device_id and not session_id:
        request.session.create()
        session_id = request.session.session_key

    if device_id:
        request.session['guest_device_id'] = device_id

    if not device_id and not session_id and not user:
        request.session.create()
        session_id = request.session.session_key

    guest_id = device_id or session_id
    if is_guest_user:
        user = None

    ip_address = get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')

    # The "is this visitor new" check and the counter increment must be
    # atomic — otherwise two near-simultaneous requests from the same new
    # visitor (double-click, retry, prefetch) can both see "not seen before"
    # and both increment unique_visitors, letting the counter drift above
    # the true distinct-visitor count. Locking the Product row serializes
    # concurrent requests for the same product through this check.
    with transaction.atomic():
        Product.objects.select_for_update().get(pk=product.pk)

        is_unique_visitor = False
        if user:
            is_unique_visitor = not ProductView.objects.filter(product=product, user=user).exists()
        elif guest_id:
            is_unique_visitor = not ProductView.objects.filter(
                product=product,
                user__isnull=True,
                session_id=guest_id
            ).exists()

        view_record = ProductView.record_view(
            product=product,
            user=user,
            session_id=guest_id,
            ip_address=ip_address,
            user_agent=user_agent
        )

        update_kwargs = {'total_views': F('total_views') + 1}
        if is_unique_visitor:
            update_kwargs['unique_visitors'] = F('unique_visitors') + 1
        Product.objects.filter(pk=product.pk).update(**update_kwargs)

    product.refresh_from_db(fields=['total_views', 'unique_visitors'])

    # Campaign charging (fail-soft; never blocks the response)
    try:
        from app.campaigns.service.charging_service import charge_interaction
        charge_interaction(product, 'VIEW', user=user, guest_id=None if user else guest_id)
    except Exception:
        pass

    serializer = ProductSerializer(product, context={'request': request})
    response_data = serializer.data

    response_data['view_recorded'] = True
    
    return Response(response_data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def related_products(request, product_id):
    """Same-category products with sponsored placements first."""
    try:
        product = Product.objects.get(id=product_id, is_active=True)
    except Product.DoesNotExist:
        return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        limit = min(int(request.query_params.get('limit', 10)), 50)
    except (TypeError, ValueError):
        limit = 10

    sponsored_data = _serialize_sponsored(
        request, limit=4,
        category_id=product.category_id,
        exclude_ids=[product.id],
    )
    sponsored_ids = {item['id'] for item in sponsored_data}

    organic = (
        Product.objects.filter(is_active=True, category_id=product.category_id)
        .exclude(id__in=sponsored_ids | {product.id})
        .annotate(favorite_count=Count('favorited_by'))
        .order_by('-is_premium', '-total_views', '-created_at')[:max(limit - len(sponsored_data), 0)]
    )
    organic_data = ProductSerializer(organic, many=True, context={'request': request}).data

    return Response({'results': sponsored_data + organic_data})


@api_view(['GET'])
@permission_classes([AllowAny])
def purchase_link_redirect(request, short_code):
    try:
        product = Product.objects.get(purchase_short_code=short_code, is_active=True)
    except Product.DoesNotExist:
        return Response({'error': 'Short link not found'}, status=status.HTTP_404_NOT_FOUND)

    if not product.purchase_link:
        return Response({'error': 'Original purchase link is unavailable'}, status=status.HTTP_404_NOT_FOUND)

    # Collect context for tracking
    user = request.user if request.user.is_authenticated else None
    is_guest_user = user and getattr(user, 'role', None) == User.ANONYMOUS

    device_id = request.GET.get('device_id') or request.headers.get('X-Device-Id') or request.session.get('guest_device_id')
    if is_guest_user and not device_id:
        device_id = getattr(user, 'device_id', None)

    session_id = request.session.session_key
    if not session_id:
        try:
            request.session.create()
            session_id = request.session.session_key
        except Exception:
            session_id = None

    guest_id = device_id or session_id

    ip_address = get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    referrer = request.META.get('HTTP_REFERER', '')

    # Basic parsing of UA for browser/os/device type (best-effort)
    ua_lower = user_agent.lower() if user_agent else ''
    if 'mobile' in ua_lower or 'android' in ua_lower or 'iphone' in ua_lower:
        device_type = 'Mobile'
    elif 'ipad' in ua_lower or 'tablet' in ua_lower:
        device_type = 'Tablet'
    else:
        device_type = 'Desktop'

    browser = None
    if 'chrome' in ua_lower and 'safari' in ua_lower and 'edge' not in ua_lower:
        browser = 'Chrome'
    elif 'firefox' in ua_lower:
        browser = 'Firefox'
    elif 'safari' in ua_lower and 'chrome' not in ua_lower:
        browser = 'Safari'
    elif 'edge' in ua_lower or 'edg' in ua_lower:
        browser = 'Edge'
    elif 'opera' in ua_lower or 'opr' in ua_lower:
        browser = 'Opera'

    operating_system = None
    if 'android' in ua_lower:
        operating_system = 'Android'
    elif 'iphone' in ua_lower or 'ipad' in ua_lower or 'ios' in ua_lower:
        operating_system = 'iOS'
    elif 'mac' in ua_lower or 'macintosh' in ua_lower:
        operating_system = 'macOS'
    elif 'windows' in ua_lower:
        operating_system = 'Windows'
    elif 'linux' in ua_lower:
        operating_system = 'Linux'

    mobile_number = None
    if user and getattr(user, 'role', None) != User.ANONYMOUS:
        mobile_number = user.mobile_number
    else:
        # Try to find guest user by device/session
        try:
            guest_user = None
            if device_id:
                guest_user = User.objects.filter(device_id=device_id, role=User.ANONYMOUS).first()
            if not guest_user and guest_id and guest_id.isdigit():
                guest_user = User.objects.filter(id=int(guest_id), role=User.ANONYMOUS).first()
            if guest_user:
                mobile_number = guest_user.mobile_number
        except Exception:
            mobile_number = None

    # Record click before redirecting
    try:
        PurchaseLinkClick.record_click(
            product=product,
            vendor=getattr(product, 'vendor', None),
            user=(user if user and getattr(user, 'role', None) != User.ANONYMOUS else None),
            session_id=guest_id,
            device_id=device_id,
            mobile_number=mobile_number,
            ip_address=ip_address,
            user_agent=user_agent,
            browser=browser,
            operating_system=operating_system,
            device_type=device_type,
            referrer=referrer,
            short_code=short_code,
            original_link=product.purchase_link
        )
    except Exception:
        # Fail silently - tracking should not prevent redirect
        pass

    # Campaign charging (fail-soft; never blocks the redirect)
    try:
        from app.campaigns.service.charging_service import charge_interaction
        registered_user = user if user and getattr(user, 'role', None) != User.ANONYMOUS else None
        charge_interaction(product, 'LINK_CLICK', user=registered_user,
                           guest_id=None if registered_user else guest_id)
    except Exception:
        pass

    return redirect(product.purchase_link)


def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip
