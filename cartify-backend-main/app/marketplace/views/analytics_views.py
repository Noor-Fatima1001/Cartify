from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from app.auth.permissions.auth_token import BearerTokenAuthentication
from app.auth.models.user import User
from app.auth.models.vendor_analytics_permission import VendorAnalyticsPermission
from app.marketplace.models.product import Product
from app.marketplace.serializers.analytics_serializer import (
    ProductAnalyticsSerializer,
    ProductViewHistorySerializer
)
from app.marketplace.service.analytics_service import ProductAnalyticsService
from app.marketplace.views.admin_views import is_admin


def can_vendor_access_analytics(vendor_user):
    if vendor_user.role != User.VENDOR:
        return False

    try:
        permission = VendorAnalyticsPermission.objects.get(vendor=vendor_user)
        return permission.can_access_analytics
    except VendorAnalyticsPermission.DoesNotExist:
        # Default to enabled if no permission record exists
        return True


def vendor_analytics_entitlements(vendor_user, analytics_type):
    """Resolve (allowed, visitor_limit) for a vendor analytics request.

    allowed is False only when the admin kill-switch (VendorAnalyticsPermission)
    disables analytics entirely. Otherwise the subscription plan decides:
    - plan grants the analytics type → plan's visitor_detail_limit (None = unlimited)
    - plan does not grant it → the free default cap (first 4 visitors per product)
    """
    if not can_vendor_access_analytics(vendor_user):
        return False, None

    from app.billing.models.subscription import DEFAULT_FREE_VISITOR_DETAIL_LIMIT
    from app.billing.service.subscription_service import get_entitlements

    flag_map = {
        'views': 'can_view_viewers',
        'favorites': 'can_view_favoriters',
        'cart': 'can_view_cart_users',
        'clicks': 'can_view_clickers',
    }
    try:
        entitlements = get_entitlements(vendor_user)
    except Exception:
        return True, DEFAULT_FREE_VISITOR_DETAIL_LIMIT

    if entitlements.get(flag_map[analytics_type]):
        return True, entitlements.get('visitor_detail_limit')
    return True, DEFAULT_FREE_VISITOR_DETAIL_LIMIT


@api_view(['GET'])
@permission_classes([AllowAny])
def get_product_analytics(request, product_id):
    try:
        product = Product.objects.get(id=product_id, is_active=True)
    except Product.DoesNotExist:
        return Response(
            {'error': 'Product not found'},
            status=status.HTTP_404_NOT_FOUND
        )

    if product.vendor and getattr(product.vendor, 'role', None) == User.VENDOR and not can_vendor_access_analytics(product.vendor):
        if not is_admin(request.user):
            return Response(
                {'error': 'Analytics access is disabled for this vendor'},
                status=status.HTTP_403_FORBIDDEN
            )

    include_breakdown = is_admin(request.user)
    analytics = ProductAnalyticsService.get_product_analytics(
        product_id,
        include_breakdown=include_breakdown
    )

    if not analytics:
        return Response(
            {'error': 'Could not retrieve analytics'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    if not include_breakdown:
        # Non-admins should not see total_views; only expose product and unique_visitors
        analytics = {
            'product': analytics['product'],
            'unique_visitors': analytics['unique_visitors'],
        }

    serializer = ProductAnalyticsSerializer(analytics)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def get_product_view_history(request, product_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)

    try:
        product = Product.objects.get(id=product_id, is_active=True)
    except Product.DoesNotExist:
        return Response(
            {'error': 'Product not found'},
            status=status.HTTP_404_NOT_FOUND
        )

    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('page_size', 100))

    if page_size > 1000:
        page_size = 1000
    if page < 1:
        page = 1

    history = ProductAnalyticsService.get_product_view_history(
        product_id,
        page=page,
        page_size=page_size
    )

    if not history:
        return Response(
            {'error': 'Could not retrieve view history'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return Response(history, status=status.HTTP_200_OK)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def vendor_detailed_views(request):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Vendor access required'}, status=403)

    allowed, visitor_limit = vendor_analytics_entitlements(request.user, 'views')
    if not allowed:
        return Response({'error': 'Analytics access is disabled for your account'}, status=403)

    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    product_id = request.query_params.get('product_id')
    search = request.query_params.get('search')

    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('limit', request.query_params.get('page_size', 10)))
    granularity = request.query_params.get('granularity', 'visitor')

    service_fn = (
        ProductAnalyticsService.get_view_events_analytics
        if granularity == 'event'
        else ProductAnalyticsService.get_detailed_views_analytics
    )
    data = service_fn(
        request=request,
        vendor=request.user,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        search=search,
        page=page,
        page_size=page_size,
        visitor_limit=visitor_limit
    )
    data['limited'] = visitor_limit is not None
    data['visitor_limit'] = visitor_limit
    return Response(data)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def vendor_detailed_favorites(request):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Vendor access required'}, status=403)

    allowed, visitor_limit = vendor_analytics_entitlements(request.user, 'favorites')
    if not allowed:
        return Response({'error': 'Analytics access is disabled for your account'}, status=403)

    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    product_id = request.query_params.get('product_id')
    search = request.query_params.get('search')

    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('limit', request.query_params.get('page_size', 10)))

    data = ProductAnalyticsService.get_detailed_favorites_analytics(
        request=request,
        vendor=request.user,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        search=search,
        page=page,
        page_size=page_size,
        visitor_limit=visitor_limit
    )
    data['limited'] = visitor_limit is not None
    data['visitor_limit'] = visitor_limit
    return Response(data)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def vendor_detailed_clicks(request):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Vendor access required'}, status=403)

    allowed, visitor_limit = vendor_analytics_entitlements(request.user, 'clicks')
    if not allowed:
        return Response({'error': 'Analytics access is disabled for your account'}, status=403)

    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    product_id = request.query_params.get('product_id')
    search = request.query_params.get('search')

    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('limit', request.query_params.get('page_size', 10)))

    data = ProductAnalyticsService.get_detailed_clicks_analytics(
        request=request,
        vendor=request.user,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        search=search,
        page=page,
        page_size=page_size,
        visitor_limit=visitor_limit
    )
    data['limited'] = visitor_limit is not None
    data['visitor_limit'] = visitor_limit
    return Response(data)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_detailed_clicks(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)

    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    product_id = request.query_params.get('product_id')
    search = request.query_params.get('search')
    vendor_id = request.query_params.get('vendor_id')

    vendor_obj = None
    if vendor_id:
        vendor_obj = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
        if not vendor_obj:
            return Response({'error': 'Vendor not found'}, status=404)

    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('limit', request.query_params.get('page_size', 10)))

    data = ProductAnalyticsService.get_detailed_clicks_analytics(
        request=request,
        vendor=vendor_obj,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        search=search,
        page=page,
        page_size=page_size
    )
    return Response(data)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_detailed_views(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
        
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    product_id = request.query_params.get('product_id')
    search = request.query_params.get('search')
    vendor_id = request.query_params.get('vendor_id')
    
    vendor_obj = None
    if vendor_id:
        vendor_obj = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
        if not vendor_obj:
            return Response({'error': 'Vendor not found'}, status=404)
            
    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('limit', request.query_params.get('page_size', 10)))
    granularity = request.query_params.get('granularity', 'visitor')

    service_fn = (
        ProductAnalyticsService.get_view_events_analytics
        if granularity == 'event'
        else ProductAnalyticsService.get_detailed_views_analytics
    )
    data = service_fn(
        request=request,
        vendor=vendor_obj,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        search=search,
        page=page,
        page_size=page_size
    )
    return Response(data)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_detailed_favorites(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
        
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    product_id = request.query_params.get('product_id')
    search = request.query_params.get('search')
    vendor_id = request.query_params.get('vendor_id')
    customer_id = request.query_params.get('customer_id')
    guest_id = request.query_params.get('guest_id')
    guest_device_id = request.query_params.get('guest_device_id')
    phone_number = request.query_params.get('phone_number')
    
    vendor_obj = None
    guest_obj = None
    user_id = None

    if customer_id:
        try:
            user_id = int(customer_id)
        except (TypeError, ValueError):
            user_id = None

    if guest_id:
        try:
            guest_obj = User.objects.filter(id=int(guest_id), role=User.ANONYMOUS).first()
        except (TypeError, ValueError):
            guest_obj = None
        if guest_obj:
            guest_device_id = guest_obj.device_id
    if vendor_id:
        vendor_obj = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
        if not vendor_obj:
            return Response({'error': 'Vendor not found'}, status=404)
            
    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('limit', request.query_params.get('page_size', 10)))
    
    data = ProductAnalyticsService.get_detailed_favorites_analytics(
        request=request,
        vendor=vendor_obj,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        user_id=user_id,
        guest_id=guest_obj.id if guest_obj else None,
        guest_device_id=guest_device_id,
        search=search,
        page=page,
        page_size=page_size
    )
    return Response(data)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def vendor_detailed_cart(request):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Vendor access required'}, status=403)

    allowed, visitor_limit = vendor_analytics_entitlements(request.user, 'cart')
    if not allowed:
        return Response({'error': 'Analytics access is disabled for your account'}, status=403)

    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    product_id = request.query_params.get('product_id')
    search = request.query_params.get('search')

    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('limit', request.query_params.get('page_size', 10)))

    data = ProductAnalyticsService.get_detailed_cart_analytics(
        request=request,
        vendor=request.user,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        search=search,
        page=page,
        page_size=page_size,
        visitor_limit=visitor_limit
    )
    data['limited'] = visitor_limit is not None
    data['visitor_limit'] = visitor_limit
    return Response(data)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_detailed_cart(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)

    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    product_id = request.query_params.get('product_id')
    search = request.query_params.get('search')
    vendor_id = request.query_params.get('vendor_id')
    customer_id = request.query_params.get('customer_id')
    guest_id = request.query_params.get('guest_id')
    guest_device_id = request.query_params.get('guest_device_id')

    vendor_obj = None
    guest_obj = None
    user_id = None

    if customer_id:
        try:
            user_id = int(customer_id)
        except (TypeError, ValueError):
            user_id = None

    if guest_id:
        try:
            guest_obj = User.objects.filter(id=int(guest_id), role=User.ANONYMOUS).first()
        except (TypeError, ValueError):
            guest_obj = None
        if guest_obj:
            guest_device_id = guest_obj.device_id
    if vendor_id:
        vendor_obj = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
        if not vendor_obj:
            return Response({'error': 'Vendor not found'}, status=404)

    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('limit', request.query_params.get('page_size', 10)))

    data = ProductAnalyticsService.get_detailed_cart_analytics(
        request=request,
        vendor=vendor_obj,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        user_id=user_id,
        guest_id=guest_obj.id if guest_obj else None,
        guest_device_id=guest_device_id,
        search=search,
        page=page,
        page_size=page_size
    )
    return Response(data)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def vendor_merged_analytics(request):
    """
    Merged analytics endpoint for vendor - combines visitor and favorites data.
    Returns both visitor and favorite records with a 'type' field indicating record type.
    """
    if request.user.role != User.VENDOR:
        return Response({'error': 'Vendor access required'}, status=403)

    # Check vendor analytics permission
    if not can_vendor_access_analytics(request.user):
        return Response({'error': 'Analytics access is disabled for your account'}, status=403)

    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    product_id = request.query_params.get('product_id')
    search = request.query_params.get('search')
    interaction_type = request.query_params.get('type') or None
    if interaction_type not in (None, *ProductAnalyticsService.INTERACTION_TYPES):
        return Response({'error': f'Invalid type. Must be one of: {", ".join(ProductAnalyticsService.INTERACTION_TYPES)}'}, status=400)

    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('limit', request.query_params.get('page_size', 10)))

    _, views_limit = vendor_analytics_entitlements(request.user, 'views')
    _, favorites_limit = vendor_analytics_entitlements(request.user, 'favorites')
    _, clicks_limit = vendor_analytics_entitlements(request.user, 'clicks')
    _, cart_limit = vendor_analytics_entitlements(request.user, 'cart')

    data = ProductAnalyticsService.get_merged_analytics(
        request=request,
        vendor=request.user,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        search=search,
        page=page,
        page_size=page_size,
        views_limit=views_limit,
        favorites_limit=favorites_limit,
        clicks_limit=clicks_limit,
        cart_limit=cart_limit,
        interaction_type=interaction_type,
    )
    return Response(data)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_merged_analytics(request):
    """
    Merged analytics endpoint for admin - combines visitor and favorites data.
    Returns both visitor and favorite records with a 'type' field indicating record type.
    """
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
        
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    product_id = request.query_params.get('product_id')
    search = request.query_params.get('search')
    vendor_id = request.query_params.get('vendor_id')
    interaction_type = request.query_params.get('type') or None
    if interaction_type not in (None, *ProductAnalyticsService.INTERACTION_TYPES):
        return Response({'error': f'Invalid type. Must be one of: {", ".join(ProductAnalyticsService.INTERACTION_TYPES)}'}, status=400)

    vendor_obj = None
    if vendor_id:
        vendor_obj = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
        if not vendor_obj:
            return Response({'error': 'Vendor not found'}, status=404)

    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('limit', request.query_params.get('page_size', 10)))

    data = ProductAnalyticsService.get_merged_analytics(
        request=request,
        vendor=vendor_obj,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        search=search,
        page=page,
        page_size=page_size,
        interaction_type=interaction_type
    )
    return Response(data)
