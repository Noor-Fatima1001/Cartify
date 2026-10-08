from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from app.auth.permissions.auth_token import BearerTokenAuthentication
from app.auth.models.user import User
from app.auth.models.vendor import VendorProfile
from app.auth.models.vendor_analytics_permission import VendorAnalyticsPermission
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count
from app.scrape.models.scrapeModel import Categories
from app.marketplace.models.category_settings import VendorCategorySetting, VendorSubCategorySetting
from app.marketplace.serializers.product_serializer import CategorySerializer

@api_view(['PATCH'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def update_vendor_profile(request):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Only vendors can update their profile'}, status=status.HTTP_403_FORBIDDEN)
    
    try:
        profile = request.user.vendor_profile
    except VendorProfile.DoesNotExist:
        return Response({'error': 'Vendor profile not found'}, status=status.HTTP_404_NOT_FOUND)

    data = request.data
    
    # Fields allowed to be updated by vendor
    allowed_fields = ['brand_name', 'phone_number', 'email', 'address']
    
    with transaction.atomic():
        for field in allowed_fields:
            if field in data:
                setattr(profile, field, data[field])
        
        # Handle logo upload (ImageField)
        if 'logo' in request.FILES:
            profile.logo = request.FILES['logo']
            
        profile.save()

    return Response({
        'message': 'Profile updated successfully',
        'brand_name': profile.brand_name,
        'logo': request.build_absolute_uri(profile.logo.url) if profile.logo else None,
        'phone_number': profile.phone_number,
        'address': profile.address
    })

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def vendor_products(request):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Only vendors can view their products'}, status=status.HTTP_403_FORBIDDEN)
    
    from app.marketplace.models.product import Product
    from app.marketplace.serializers.product_serializer import ProductSerializer
    from app.marketplace.views.utils import get_paginated_data
    
    products = Product.objects.filter(vendor=request.user).annotate(
        favorite_count=Count('favorited_by')
    ).order_by('-created_at')
    
    paginated = get_paginated_data(
        queryset=products,
        request=request,
        search_fields=['name', 'product_type'],
        status_field='is_active',
        default_limit=10
    )
    
    serializer = ProductSerializer(paginated['queryset'], many=True, context={'request': request, 'include_total_views': True})
    product_data = list(serializer.data)

    try:
        permission = VendorAnalyticsPermission.objects.get(vendor=request.user)
        can_access_analytics = permission.can_access_analytics
    except VendorAnalyticsPermission.DoesNotExist:
        can_access_analytics = True

    if not can_access_analytics:
        for item in product_data:
            item['unique_visitors'] = None
            item['total_views'] = None

    return Response({
        'results': product_data,
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
        'limit': paginated['limit']
    })


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def vendor_product_detail(request, product_id):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Only vendors can view their products'}, status=status.HTTP_403_FORBIDDEN)

    from app.marketplace.models.product import Product
    from app.marketplace.serializers.product_serializer import ProductSerializer

    product = Product.objects.filter(id=product_id, vendor=request.user).annotate(
        favorite_count=Count('favorited_by')
    ).first()
    if not product:
        return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = ProductSerializer(product, context={'request': request, 'include_total_views': True})
    data = serializer.data

    try:
        permission = VendorAnalyticsPermission.objects.get(vendor=request.user)
        can_access_analytics = permission.can_access_analytics
    except VendorAnalyticsPermission.DoesNotExist:
        can_access_analytics = True

    if not can_access_analytics:
        data['unique_visitors'] = None
        data['total_views'] = None

    return Response(data)


@api_view(['PATCH'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def edit_vendor_product(request, product_id):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Only vendors can edit products'}, status=status.HTTP_403_FORBIDDEN)

    from app.marketplace.models.product import Product
    from app.marketplace.serializers.product_serializer import ProductSerializer
    
    product = Product.objects.filter(id=product_id, vendor=request.user).first()
    if not product:
        return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

    if product.auto_deactivated:
        return Response(
            {'error': 'This product was deactivated because your subscription expired. Re-subscribe to manage it again.'},
            status=status.HTTP_403_FORBIDDEN
        )

    # Subscription product limit: block reactivating a product if it would
    # push the vendor's active product count past their plan's limit.
    is_activating = 'is_active' in request.data and not product.is_active and \
        str(request.data.get('is_active')).lower() in ('true', '1')
    if is_activating:
        try:
            from app.billing.service.subscription_service import get_entitlements
            max_products = get_entitlements(request.user)['max_active_products']
            active_count = Product.objects.filter(vendor=request.user, is_active=True).exclude(id=product.id).count()
            if active_count >= max_products:
                return Response(
                    {'error': f'Your current plan allows only {max_products} active products. '
                              f'Upgrade your subscription or deactivate another product to activate this one.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        except Exception:
            import logging
            logging.getLogger(__name__).exception('Product-limit check failed')

    # is_premium can only be granted through the paid activate_premium flow —
    # strip it here so a vendor can't set it directly via a raw PATCH.
    data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
    data.pop('is_premium', None)

    serializer = ProductSerializer(product, data=data, partial=True, context={'request': request, 'include_total_views': True})
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def delete_vendor_product(request, product_id):
    """Vendor deletes their own product"""
    if request.user.role != User.VENDOR:
        return Response({'error': 'Only vendors can delete products'}, status=status.HTTP_403_FORBIDDEN)
    
    from app.marketplace.models.product import Product
    
    product = Product.objects.filter(id=product_id, vendor=request.user).first()
    if not product:
        return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

    from app.campaigns.models import Campaign

    blocking_campaign = Campaign.objects.filter(
        products__product=product, status__in=[Campaign.ACTIVE, Campaign.PAUSED]
    ).first()
    if blocking_campaign:
        return Response(
            {'error': f'Cannot delete this product while it is part of the campaign '
                      f'"{blocking_campaign.name}" ({blocking_campaign.get_status_display()}). '
                      f'Stop the campaign or remove the product from it first.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    product.delete()
    return Response({'message': 'Product deleted successfully'})


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def vendor_assigned_categories(request):
    """Return categories assigned to the authenticated vendor (default assigned + custom)."""
    if request.user.role != User.VENDOR:
        return Response({'error': 'Only vendors can access assigned categories'}, status=403)

    vendor = request.user

    # Base/default categories created by admin or with no owner
    base_categories = Categories.objects.filter(User_name__role=User.ADMIN) | Categories.objects.filter(User_name__isnull=True)

    assigned_ids = VendorCategorySetting.objects.filter(vendor=vendor, is_disabled=False).values_list('category_id', flat=True)
    base_categories = base_categories.filter(id__in=assigned_ids)

    # Include custom categories created by the vendor
    custom = Categories.objects.filter(User_name=vendor)

    all_categories = base_categories | custom

    serializer = CategorySerializer(all_categories, many=True, context={'request': request})
    data = serializer.data

    try:
        disabled_subs = set(VendorSubCategorySetting.objects.filter(vendor=vendor, is_disabled=True).values_list('subcategory_id', flat=True))
    except Exception:
        disabled_subs = set()
    for cat in data:
        if 'subcategories' in cat and isinstance(cat['subcategories'], list):
            cat['subcategories'] = [s for s in cat['subcategories'] if s.get('id') not in disabled_subs]

    return Response(data)


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def activate_premium(request, product_id):
    if request.user.role != User.VENDOR:
        return Response({'error': 'Only vendors can activate premium'}, status=403)
    
    from app.marketplace.models.product import Product
    from django.utils import timezone
    from datetime import timedelta
    
    product = Product.objects.filter(id=product_id, vendor=request.user).first()
    if not product:
        return Response({'error': 'Product not found'}, status=404)
    
    product.is_premium = True
    product.save()
    
    return Response({
        'message': 'Premium status activated successfully',
        'is_premium': product.is_premium,
        'is_premium_active': product.is_premium_active
    })
