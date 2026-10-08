import csv
from django.http import HttpResponse
from django.contrib.auth.hashers import make_password
from django.core.exceptions import ValidationError
from django.db.models import Count, Q, OuterRef, Subquery, IntegerField, F, Sum
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
import logging
import json
from app.auth.permissions.auth_token import BearerTokenAuthentication
from app.auth.models.user import User
from app.auth.models.vendor import VendorProfile
from app.auth.models.vendor_analytics_permission import VendorAnalyticsPermission
from app.marketplace.models.product import Product, Favorite, SubCategory
from app.marketplace.models.product_view import ProductView
from app.marketplace.models.purchase_click import PurchaseLinkClick
from app.marketplace.serializers.product_serializer import ProductSerializer, CategorySerializer
from app.scrape.models.scrapeModel import Categories
from .utils import get_paginated_data


def is_admin(user):
    if not user or not user.is_authenticated:
        return False
    return user.role == User.ADMIN or user.is_staff or user.is_superuser


# ─── Vendors ──────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def list_vendors(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    kyc_filter = request.query_params.get('kyc') if hasattr(request, 'query_params') else None
    vendors = User.objects.filter(role=User.VENDOR)
    if kyc_filter:
        vendors = vendors.filter(vendor_profile__kyc_status=kyc_filter.upper())

    vendors = vendors.order_by('-date_joined')
    
    paginated = get_paginated_data(
        queryset=vendors,
        request=request,
        search_fields=['username', 'email', 'vendor_profile__brand_name'],
        status_field='status',
        default_limit=10
    )
    
    data = []
    for v in paginated['queryset']:
        profile = getattr(v, 'vendor_profile', None)
        product_count = Product.objects.filter(vendor=v).count()
        
        # Calculate aggregated visitor and favorite counts
        vendor_products = Product.objects.filter(vendor=v)
        total_visitors = sum(p.unique_visitors or 0 for p in vendor_products)
        total_favorites = Favorite.objects.filter(product__vendor=v).values('id').distinct().count()
        total_clicks = PurchaseLinkClick.objects.filter(vendor=v).count()
        
        # Get most recent activity (latest view or favorite)
        from django.db.models import Max
        latest_view = ProductView.objects.filter(product__vendor=v).aggregate(Max('viewed_at'))['viewed_at__max']
        latest_favorite = Favorite.objects.filter(product__vendor=v).aggregate(Max('created_at'))['created_at__max']
        recent_activity = max(filter(None, [latest_view, latest_favorite]), default=v.date_joined)
        
        data.append({
            'id': v.id,
            'username': v.username,
            'email': v.email,
            'brand_name': profile.brand_name if profile else None,
            'phone': profile.phone_number if profile else None,
            'address': profile.address if profile else None,
            'is_approved': profile.is_approved if profile else False,
            'kyc_status': profile.kyc_status if profile else 'PENDING',
            'rejection_reason': profile.rejection_reason if profile else None,
            'is_active': v.is_active,
            'status': v.status,
            'product_count': product_count,
            'total_visitors': total_visitors,
            'total_favorites': total_favorites,
            'total_clicks': total_clicks,
            'created_at': v.date_joined.isoformat(),
            'date_joined': v.date_joined.isoformat() if v.date_joined else None,
            'recent_activity': recent_activity.isoformat(),
            'logo': request.build_absolute_uri(profile.logo.url) if profile and profile.logo else None,
            'kyc_details': {
                'phone': profile.phone_number if profile else None,
                'address': profile.address if profile else None,
            } if profile else None,
        })
    
    # Sort by engagement: total_visitors (desc), total_favorites (desc), recent_activity (desc)
    # sort by tuple and reverse for descending order
    data.sort(key=lambda x: (x.get('total_visitors', 0), x.get('total_favorites', 0), x.get('recent_activity', '')), reverse=True)
        
    return Response({
        'results': data,
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
        'limit': paginated['limit']
    })


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def get_vendor_detail(request, vendor_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    vendor = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
    if not vendor:
        return Response({'error': 'Vendor not found'}, status=404)
    profile = getattr(vendor, 'vendor_profile', None)
    logo_url = None
    if profile and profile.logo:
        try:
            logo_url = request.build_absolute_uri(profile.logo.url)
        except Exception:
            logo_url = None
    product_count = Product.objects.filter(vendor=vendor).count()
    categories_created = Categories.objects.filter(User_name=vendor).count()
    from app.marketplace.models.category_settings import VendorCategorySetting, VendorSubCategorySetting
    assigned_categories = list(VendorCategorySetting.objects.filter(vendor=vendor, is_disabled=False).values_list('category_id', flat=True))
    # compute assigned subcategories (those not explicitly disabled)
    assigned_subcategories = []
    try:
        # all subcategories under assigned categories
        all_subs = list(SubCategory.objects.filter(category_id__in=assigned_categories).values_list('id', flat=True))
        disabled_subs = list(VendorSubCategorySetting.objects.filter(vendor=vendor, is_disabled=True).values_list('subcategory_id', flat=True))
        assigned_subcategories = [s for s in all_subs if s not in disabled_subs]
        # debug logging
        logger = logging.getLogger(__name__)
        logger.info('get_vendor_detail vendor=%s assigned_categories=%s all_subs=%s disabled_subs=%s assigned_subcategories=%s', vendor_id, assigned_categories, all_subs, disabled_subs, assigned_subcategories)
    except Exception as e:
        logging.exception('Error computing assigned_subcategories for vendor %s: %s', vendor_id, e)
        assigned_subcategories = []
    try:
        permission = VendorAnalyticsPermission.objects.get(vendor=vendor)
        can_access_analytics = permission.can_access_analytics
    except VendorAnalyticsPermission.DoesNotExist:
        can_access_analytics = True
    return Response({
        'id': vendor.id,
        'username': vendor.username,
        'email': vendor.email,
        'first_name': vendor.first_name,
        'last_name': vendor.last_name,
        'phone': profile.phone_number if profile else None,
        'address': profile.address if profile else None,
        'is_active': vendor.is_active,
        'brand_name': profile.brand_name if profile else None,
        'is_approved': profile.is_approved if profile else False,
        'kyc_status': profile.kyc_status if profile else 'PENDING',
        'rejection_reason': profile.rejection_reason if profile else None,
        'product_count': product_count,
        'categories_created': categories_created,
        'assigned_categories': assigned_categories,
        'assigned_subcategories': assigned_subcategories,
        'date_joined': vendor.date_joined.isoformat() if vendor.date_joined else None,
        'created_at': vendor.date_joined.isoformat() if vendor.date_joined else None,
        'can_access_analytics': can_access_analytics,
        'analytics_permission': {
            'can_access_analytics': can_access_analytics
        },
        'kyc': {
            'phone': profile.phone_number if profile else None,
            'address': profile.address if profile else None,
            'email': profile.email if profile else None,
            'logo': logo_url,
            'created_at': profile.created_at.isoformat() if profile else None,
        }
    })


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_assign_categories(request, vendor_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
        
    vendor = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
    if not vendor:
        return Response({'error': 'Vendor not found'}, status=404)
        
    category_ids = request.data.get('category_ids', []) # list of category IDs to assign
    disabled_subcategories = request.data.get('disabled_subcategories', []) or []

    # Normalize incoming ids to integers for safety. Accept lists, single ints, or comma-separated strings.
    try:
        if isinstance(category_ids, (list, tuple)):
            category_ids = [int(x) for x in category_ids if x is not None and str(x) != '']
        elif isinstance(category_ids, str):
            parts = [p.strip() for p in category_ids.split(',') if p.strip()]
            category_ids = [int(x) for x in parts]
        else:
            # single numeric value
            category_ids = [int(category_ids)]
    except Exception:
        category_ids = []

    try:
        if isinstance(disabled_subcategories, (list, tuple)):
            disabled_subcategories = [int(x) for x in disabled_subcategories if x is not None and str(x) != '']
        elif isinstance(disabled_subcategories, str):
            parts = [p.strip() for p in disabled_subcategories.split(',') if p.strip()]
            disabled_subcategories = [int(x) for x in parts]
        else:
            disabled_subcategories = [int(disabled_subcategories)]
    except Exception:
        disabled_subcategories = []

    # Base/Default categories (Admin created or no owner)
    all_categories = Categories.objects.filter(Q(User_name__role=User.ADMIN) | Q(User_name__isnull=True))
    
    from app.marketplace.models.category_settings import VendorCategorySetting, VendorSubCategorySetting
    logger = logging.getLogger(__name__)
    logger.info('admin_assign_categories payload for vendor %s: category_ids=%s disabled_subcategories=%s', vendor_id, category_ids, disabled_subcategories)
    # update category-level settings
    for category in all_categories:
        is_disabled = category.id not in category_ids
        VendorCategorySetting.objects.update_or_create(
            vendor=vendor,
            category=category,
            defaults={'is_disabled': is_disabled}
        )

    # update subcategory-level exceptions: mark subcategories explicitly disabled or enabled
    try:
        # allow frontend to send explicit assigned_subcategories instead of disabled list
        assigned_subs_raw = request.data.get('assigned_subcategories', None)
        assigned_subcategories_from_payload = None
        if assigned_subs_raw is not None:
            try:
                if isinstance(assigned_subs_raw, (list, tuple)):
                    assigned_subcategories_from_payload = [int(x) for x in assigned_subs_raw if x is not None and str(x) != '']
                else:
                    assigned_subcategories_from_payload = [int(assigned_subs_raw)]
            except Exception:
                assigned_subcategories_from_payload = None

        # Only consider subcategories under the assigned categories for explicit enables/disables
        subs_under_assigned = SubCategory.objects.filter(category_id__in=category_ids)
        subs_under_assigned_ids = list(subs_under_assigned.values_list('id', flat=True))

        # If assigned_subcategories provided, derive disabled_subcategories from it
        if assigned_subcategories_from_payload is not None:
            # only keep those that belong to the assigned categories
            assigned_subs_filtered = [int(s) for s in assigned_subcategories_from_payload if int(s) in subs_under_assigned_ids]
            disabled_subcategories = [s for s in subs_under_assigned_ids if s not in assigned_subs_filtered]

        for sub in subs_under_assigned:
            is_disabled = sub.id in disabled_subcategories
            VendorSubCategorySetting.objects.update_or_create(
                vendor=vendor,
                subcategory=sub,
                defaults={'is_disabled': is_disabled}
            )
    except Exception as e:
        logging.exception('Failed to update vendor subcategory settings: %s', e)

    # Return the effective assigned categories and subcategories for verification
    try:
        effective_assigned_categories = list(VendorCategorySetting.objects.filter(vendor=vendor, is_disabled=False).values_list('category_id', flat=True))
        all_subs_under_assigned = SubCategory.objects.filter(category_id__in=effective_assigned_categories).values_list('id', flat=True)
        disabled_subs_after = list(VendorSubCategorySetting.objects.filter(vendor=vendor, is_disabled=True).values_list('subcategory_id', flat=True))
        effective_assigned_subcategories = [s for s in all_subs_under_assigned if s not in disabled_subs_after]
    except Exception:
        effective_assigned_categories = []
        effective_assigned_subcategories = []

    logger.info('admin_assign_categories result for vendor %s: assigned_categories=%s assigned_subcategories=%s', vendor_id, effective_assigned_categories, effective_assigned_subcategories)

    return Response({
        'message': 'Categories and subcategory exceptions assigned successfully',
        'assigned_categories': effective_assigned_categories,
        'assigned_subcategories': effective_assigned_subcategories
    })


@api_view(['PATCH'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_edit_vendor(request, vendor_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    vendor = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
    if not vendor:
        return Response({'error': 'Vendor not found'}, status=404)
    profile = getattr(vendor, 'vendor_profile', None)
    data = request.data

    # Update user fields
    for field in ['email', 'first_name', 'last_name']:
        if field in data:
            setattr(vendor, field, data[field])
    if 'password' in data and data['password']:
        vendor.password = make_password(data['password'])

    if profile:
        # Update profile fields from the form payload.
        for field in ['brand_name', 'phone_number', 'address', 'email']:
            if field in data:
                setattr(profile, field, data[field])

        # Handle logo upload for admin edit as well.
        if 'logo' in request.FILES:
            profile.logo = request.FILES['logo']

        profile.save()

    vendor.save()

    if 'can_access_analytics' in data or 'visitor_analytics_enabled' in data:
        can_access_analytics = data.get('can_access_analytics', data.get('visitor_analytics_enabled'))
        try:
            permission, created = VendorAnalyticsPermission.objects.get_or_create(
                vendor=vendor,
                defaults={
                    'can_access_analytics': bool(can_access_analytics),
                    'last_modified_by': request.user
                }
            )
            if not created:
                permission.can_access_analytics = bool(can_access_analytics)
                permission.last_modified_by = request.user
                permission.save()
        except Exception as e:
            logging.exception('Failed to update analytics permission for vendor %s: %s', vendor_id, e)
            return Response({'error': 'Failed to update analytics permission'}, status=500)

    return Response({
        'message': 'Vendor updated successfully',
        'vendor': {
            'id': vendor.id,
            'username': vendor.username,
            'email': vendor.email,
            'first_name': vendor.first_name,
            'last_name': vendor.last_name,
            'brand_name': profile.brand_name if profile else None,
            'phone_number': profile.phone_number if profile else None,
            'address': profile.address if profile else None,
        }
    })


@api_view(['DELETE'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_delete_vendor(request, vendor_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    vendor = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
    if not vendor:
        return Response({'error': 'Vendor not found'}, status=404)
    vendor.delete()
    return Response({'message': 'Vendor deleted successfully'})


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def approve_vendor(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    
    vendor_id = request.data.get('vendor_id')
    status_req = request.data.get('status')  # 'APPROVED' or 'REJECTED'
    reason = request.data.get('reason', '')

    vendor = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
    if not vendor:
        return Response({'error': 'Vendor not found'}, status=404)
    
    profile = getattr(vendor, 'vendor_profile', None)
    if not profile:
        return Response({'error': 'Vendor profile missing'}, status=400)

    if status_req not in ['APPROVED', 'REJECTED']:
        return Response({'error': "Status must be either 'APPROVED' or 'REJECTED'"}, status=400)

    if status_req == 'APPROVED':
        profile.kyc_status = VendorProfile.KYC_APPROVED
        profile.is_approved = True
        vendor.is_active = True
    else:
        profile.kyc_status = VendorProfile.KYC_REJECTED
        profile.is_approved = False
        profile.rejection_reason = reason
        vendor.is_active = False
    
    profile.save()
    vendor.save()
    
    return Response({
        'message': f'Vendor {status_req.lower()}',
        'kyc_status': profile.kyc_status,
        'is_active': vendor.is_active
    })


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def toggle_vendor_active(request, vendor_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    vendor = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
    if not vendor:
        return Response({'error': 'Vendor not found'}, status=404)
    
    target_status = request.data.get('status')
    if target_status:
        if target_status not in [User.STATUS_ACTIVE, User.STATUS_BLOCKED, User.STATUS_INACTIVE]:
            return Response({'error': 'Invalid status'}, status=400)
        vendor.status = target_status
        vendor.is_active = (target_status == User.STATUS_ACTIVE)
    else:
        # Default toggle logic if no status is specified
        if vendor.status == User.STATUS_ACTIVE:
            vendor.status = User.STATUS_BLOCKED
            vendor.is_active = False
        else:
            vendor.status = User.STATUS_ACTIVE
            vendor.is_active = True
            
    vendor.save()
    return Response({
        'message': f'Vendor status updated to {vendor.status}',
        'status': vendor.status,
        'is_active': vendor.is_active
    })


# ─── Products ─────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_list_products(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    vendor_id = request.query_params.get('vendor_id')
    # Include favorite counts so frontend can render favorites without extra queries
    products = Product.objects.annotate(favorite_count=Count('favorited_by')).all().order_by('-created_at')
    if vendor_id:
        products = products.filter(vendor_id=vendor_id)
        
    paginated = get_paginated_data(
        queryset=products,
        request=request,
        search_fields=['name', 'vendor__username', 'vendor__vendor_profile__brand_name', 'product_type'],
        status_field='is_active',
        default_limit=10
    )
    
    serializer = ProductSerializer(paginated['queryset'], many=True, context={'request': request})
    return Response({
        'results': serializer.data,
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
        'limit': paginated['limit']
    })


@api_view(['GET', 'DELETE'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_delete_product(request, product_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    product = Product.objects.filter(id=product_id).annotate(favorite_count=Count('favorited_by')).first()
    if not product:
        return Response({'error': 'Product not found'}, status=404)

    if request.method == 'DELETE':
        product.delete()
        return Response({'message': 'Product deleted successfully'})

    serializer = ProductSerializer(product, context={'request': request})
    return Response(serializer.data)


@api_view(['PATCH'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_edit_product(request, product_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    product = Product.objects.filter(id=product_id).first()
    if not product:
        return Response({'error': 'Product not found'}, status=404)
    
    serializer = ProductSerializer(product, data=request.data, partial=True, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_toggle_product(request, product_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    product = Product.objects.filter(id=product_id).first()
    if not product:
        return Response({'error': 'Product not found'}, status=404)
    product.is_active = not product.is_active
    product.save()
    return Response({'message': f'Product {"shown" if product.is_active else "hidden"}', 'is_active': product.is_active})


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_post_product(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    vendor_id = request.data.get('vendor_id')
    if not vendor_id:
        return Response({'error': 'Vendor ID is required'}, status=400)
    vendor = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
    if not vendor:
        return Response({'error': 'Vendor not found'}, status=404)
    serializer = ProductSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        serializer.save(vendor=vendor)
        return Response(serializer.data, status=201)
    return Response(serializer.errors, status=400)


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_create_vendor(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    data = request.data
    required = ['username', 'email', 'first_name', 'last_name', 'password', 'brand_name', 'phone_number', 'address']
    errors = {}
    for field in required:
        if not data.get(field):
            errors[field] = f"{field} is required"
    if errors:
        return Response({'errors': errors}, status=400)
    try:
        user = User.objects.create(
            username=data.get('username'),
            email=data.get('email'),
            first_name=data.get('first_name'),
            last_name=data.get('last_name'),
            password=make_password(data.get('password')),
            role=User.VENDOR,
            country=data.get('country'),
            state=data.get('state'),
            city=data.get('city'),
            latitude=data.get('latitude'),
            longitude=data.get('longitude')
        )
        VendorProfile.objects.create(
            user=user,
            brand_name=data.get('brand_name'),
            phone_number=data.get('phone_number'),
            email=data.get('email'),
            address=data.get('address'),
            logo=request.FILES.get('logo'),
            kyc_status=VendorProfile.KYC_APPROVED,
            is_approved=True
        )
        return Response({'message': 'Vendor created and approved', 'user_id': user.id}, status=201)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger = logging.getLogger(__name__)
        logger.error('admin_create_vendor error: %s\n%s', str(e), tb)
        return Response({'error': str(e), 'traceback': tb}, status=400)


# ─── Categories ───────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_list_categories(request):
    if not (is_admin(request.user) or request.user.role == User.VENDOR):
        return Response({'error': 'Unauthorized'}, status=403)
    
    if request.user.role == User.VENDOR:
        from app.marketplace.models.category_settings import VendorCategorySetting
        assigned_ids = VendorCategorySetting.objects.filter(vendor=request.user, is_disabled=False).values_list('category_id', flat=True)
        categories = Categories.objects.filter(
            Q(id__in=assigned_ids) | Q(User_name=request.user)
        ).distinct().order_by('id')
    else:
        categories = Categories.objects.all().order_by('id')
        
   
    categories = categories.distinct()

    paginated = get_paginated_data(
        queryset=categories,
        request=request,
        search_fields=['name'],
        status_field='is_active',
        default_limit=10
    )

    serializer = CategorySerializer(paginated['queryset'], many=True, context={'request': request})
    return Response({
        'results': serializer.data,
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
        'limit': paginated['limit']
    })


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_create_category(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
        
    name = request.data.get('name')
    if not name:
        return Response({'error': 'Category name is required'}, status=400)

    # Image is required when creating a category
    image_file = request.FILES.get('image')
    if not image_file:
        return Response({'error': 'Category image is required'}, status=400)

    is_active = request.data.get('is_active', True)
    # Normalize boolean-like string values (multipart/form-data sends strings)
    if isinstance(is_active, str):
        if is_active.lower() in ['true', '1', 'yes', 'on']:
            is_active = True
        elif is_active.lower() in ['false', '0', 'no', 'off']:
            is_active = False

    category = Categories.objects.create(User_name=request.user, name=name, is_active=is_active, image=image_file)
    
    subcategories_data = request.data.get('subcategories', []) or []
    subs_created = []
    import json

    if isinstance(subcategories_data, str):
        try:
            subcategories_data = json.loads(subcategories_data)
        except Exception:
            subcategories_data = [s.strip() for s in subcategories_data.split(',') if s.strip()]

    if not isinstance(subcategories_data, list):
        try:
            if hasattr(subcategories_data, 'values'):
                subcategories_data = list(subcategories_data.values())
            else:
                subcategories_data = list(subcategories_data)
        except Exception:
            subcategories_data = [subcategories_data]

    if isinstance(subcategories_data, list):
        for item in subcategories_data:
            if isinstance(item, dict):
                sub_name = item.get('name')
            else:
                sub_name = item

            if sub_name and isinstance(sub_name, str):
                sub = SubCategory.objects.create(category=category, name=sub_name.strip())
                subs_created.append({'id': sub.id, 'name': sub.name})

    return Response({
        'id': category.id, 
        'name': category.name,
        'subcategories': subs_created
    }, status=201)

@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_create_subcategory(request, category_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    category = Categories.objects.filter(id=category_id).first()
    if not category:
        return Response({'error': 'Category not found'}, status=404)
    name = request.data.get('name')
    if not name:
        return Response({'error': 'Subcategory name is required'}, status=400)
    sub = SubCategory.objects.create(category=category, name=name)
    return Response({'id': sub.id, 'name': sub.name, 'category_id': category.id}, status=201)


@api_view(['PATCH'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_edit_subcategory(request, subcategory_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    sub = SubCategory.objects.filter(id=subcategory_id).first()
    if not sub:
        return Response({'error': 'Subcategory not found'}, status=404)
    if 'name' in request.data:
        sub.name = request.data['name']
    if 'category' in request.data:
        new_category = Categories.objects.filter(id=request.data['category']).first()
        if not new_category:
            return Response({'error': 'Target category not found'}, status=404)
        sub.category = new_category
    sub.save()
    return Response({'id': sub.id, 'name': sub.name, 'category_id': sub.category_id})


@api_view(['DELETE'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_delete_subcategory(request, subcategory_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    sub = SubCategory.objects.filter(id=subcategory_id).first()
    if not sub:
        return Response({'error': 'Subcategory not found'}, status=404)
    sub.delete()
    return Response({'message': 'Subcategory deleted'})


@api_view(['PATCH'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_edit_category(request, category_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    category = Categories.objects.filter(id=category_id).first()
    if not category:
        return Response({'error': 'Category not found'}, status=404)
    try:
        logger = logging.getLogger(__name__)
        logger.info('admin_edit_category called: content_type=%s, data_keys=%s, files=%s',
                    getattr(request, 'content_type', None), list(request.data.keys()), list(request.FILES.keys()))
        if 'name' in request.data:
            category.name = request.data['name']
        if hasattr(category, 'is_active') and 'is_active' in request.data:
            is_act = request.data['is_active']
            if isinstance(is_act, str):
                if is_act.lower() in ['true', '1']:
                    is_act = True
                elif is_act.lower() in ['false', '0']:
                    is_act = False
            category.is_active = is_act
        new_image = request.FILES.get('image')
        if new_image:
            try:
                if category.image:
                    category.image.delete(save=False)
            except Exception:
                pass
            category.image = new_image
        category.save()

        if 'subcategories' not in request.data:
            serializer = CategorySerializer(category, context={'request': request})
            return Response(serializer.data)

        if 'subcategories' in request.data:
            subcategories_data = request.data['subcategories']
            if isinstance(subcategories_data, str):
                try:
                    subcategories_data = json.loads(subcategories_data)
                except Exception:
                    logger.warning('Failed to parse subcategories JSON string')

            if isinstance(subcategories_data, list):
                existing_subs = {sub.id: sub for sub in category.subcategories.all()}
                processed_ids = []
                
                for item in subcategories_data:
                    if isinstance(item, dict):
                        sub_id = item.get('id')
                        sub_name = item.get('name')
                        if not sub_name: continue
                        
                        if sub_id and sub_id in existing_subs:
                            sub = existing_subs[sub_id]
                            sub.name = sub_name.strip()
                            sub.save()
                            processed_ids.append(sub.id)
                        else:
                            sub = SubCategory.objects.create(category=category, name=sub_name.strip())
                            processed_ids.append(sub.id)
                    elif isinstance(item, str):
                        sub = SubCategory.objects.create(category=category, name=item.strip())
                        processed_ids.append(sub.id)
                
                # Delete subcategories that were not in the payload
                for sub_id, sub in existing_subs.items():
                    if sub_id not in processed_ids:
                        sub.delete()
                
            # Serialize the updated category
            serializer = CategorySerializer(category, context={'request': request})
            return Response(serializer.data)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        return Response({'error': str(e), 'traceback': tb}, status=500)


@api_view(['DELETE'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_delete_category(request, category_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    category = Categories.objects.filter(id=category_id).first()
    if not category:
        return Response({'error': 'Category not found'}, status=404)
    category.delete()
    return Response({'message': 'Category deleted'})


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_toggle_category(request, category_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    category = Categories.objects.filter(id=category_id).first()
    if not category:
        return Response({'error': 'Category not found'}, status=404)
    if hasattr(category, 'is_active'):
        category.is_active = not category.is_active
        category.save()
        return Response({'id': category.id, 'is_active': category.is_active})
    return Response({'message': 'Toggle not supported on this model'}, status=400)


# ─── Favorites Monitoring ─────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_favorites(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    products = Product.objects.annotate(
        fav_count=Count('favorited_by'),
        unique_users=Count('favorited_by__user', distinct=True)
    ).filter(fav_count__gt=0).order_by('-fav_count')[:50]
    data = []
    for p in products:
        profile = getattr(p.vendor, 'vendor_profile', None)
        data.append({
            'id': p.id,
            'name': p.name,
            'vendor_name': profile.brand_name if profile else p.vendor.username,
            'favorites_count': p.fav_count,
            'unique_users_count': p.unique_users,
            'price': str(p.price),
            'original_price': str(p.original_price) if p.original_price else None,
            'image': request.build_absolute_uri(p.image.url) if p.image else None,
        })
    return Response(data)

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_list_customers(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    customers = User.objects.filter(role=User.CUSTOMER).order_by('-date_joined')
    
    paginated = get_paginated_data(
        queryset=customers,
        request=request,
        search_fields=['username', 'email'],
        status_field='status',
        default_limit=10
    )
    
    data = []
    for u in paginated['queryset']:
        profile = getattr(u, 'vendor_profile', None)
        data.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'mobile_number': u.mobile_number or '',
            'date_joined': u.date_joined.isoformat() if u.date_joined else None,
            'is_active': u.is_active,
            'status': u.status,
            'favorites_count': int(Favorite.objects.filter(user=u).count() or 0),
            'profile_image': request.build_absolute_uri(u.profile_image.url) if u.profile_image else None,
            'logo': request.build_absolute_uri(profile.logo.url) if profile and profile.logo else None,
            'first_name': u.first_name,
            'last_name': u.last_name,
        })
        
    return Response({
        'results': data,
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
        'limit': paginated['limit']
    })

@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_toggle_customer(request, customer_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    customer = User.objects.filter(id=customer_id, role=User.CUSTOMER).first()
    if not customer:
        return Response({'error': 'Customer not found'}, status=404)
        
    target_status = request.data.get('status')
    if target_status:
        if target_status not in [User.STATUS_ACTIVE, User.STATUS_BLOCKED, User.STATUS_INACTIVE]:
            return Response({'error': 'Invalid status'}, status=400)
        customer.status = target_status
        customer.is_active = (target_status == User.STATUS_ACTIVE)
    else:
        if customer.status == User.STATUS_ACTIVE:
            customer.status = User.STATUS_BLOCKED
            customer.is_active = False
        else:
            customer.status = User.STATUS_ACTIVE
            customer.is_active = True
            
    customer.save()
    return Response({
        'message': f'Customer status updated to {customer.status}', 
        'status': customer.status,
        'is_active': customer.is_active
    })

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_list_guests(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    
    favorites_subquery = Favorite.objects.filter(
        Q(user=OuterRef('pk')) | Q(device_id=OuterRef('device_id'))
    ).order_by().annotate(count=Count('id')).values('count')
    guests = User.objects.filter(role=User.ANONYMOUS).annotate(
        favorites_count=Coalesce(Subquery(favorites_subquery), 0)
    ).order_by('-date_joined')
    
    # Custom status filtering for guests
    status_query = request.query_params.get('status', '').strip().upper()
    if status_query == 'HAS_FAVORITES':
        guests = guests.filter(favorites_count__gt=0)
    elif status_query == 'NO_FAVORITES':
        guests = guests.filter(favorites_count=0)
        
    paginated = get_paginated_data(
        queryset=guests,
        request=request,
        search_fields=['device_id'],
        status_field=None,
        default_limit=10
    )
    
    data = []
    for u in paginated['queryset']:
        data.append({
            'id': u.id,
            'device_id': u.device_id,
            'mobile_number': getattr(u, 'mobile_number', None),
            'first_visit': u.date_joined.isoformat() if u.date_joined else None,
            'last_active': u.last_login.isoformat() if u.last_login else None,
            'favorites_count': u.favorites_count
        })
        
    return Response({
        'results': data,
        'total_items': paginated['total_items'],
        'total_pages': paginated['total_pages'],
        'current_page': paginated['current_page'],
        'limit': paginated['limit']
    })

# ─── Analytics ────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_analytics(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)

    from django.utils import timezone
    from datetime import timedelta
    from django.db.models.functions import TruncDate

    from app.billing.models import TopUpRequest, VendorSubscription, SubscriptionPlan, SubscriptionAuditLog
    from app.campaigns.models import Campaign, CampaignCharge, CampaignProduct
    from app.marketplace.models.cart import CartItem

    now = timezone.now()
    last_30 = now - timedelta(days=30)
    last_7 = now - timedelta(days=7)

    def dec(value):
        return str(value or 0)

    total_vendors = User.objects.filter(role=User.VENDOR).count()
    active_vendors = User.objects.filter(role=User.VENDOR, is_active=True).count()
    pending_kyc = VendorProfile.objects.filter(is_approved=True , kyc_status='PENDING').count()
    total_products = Product.objects.count()
    active_products = Product.objects.filter(is_active=True).count()
    total_customers = User.objects.filter(role=User.CUSTOMER).count()
    total_guests = User.objects.filter(role=User.ANONYMOUS).count()
    total_categories = Categories.objects.filter(
        Q(User_name__role=User.ADMIN) | Q(User_name__isnull=True)
    ).count()
    total_favorites = Favorite.objects.count()

    # Monthly vendor signups (last 6 months)
    vendor_growth = []
    for i in range(5, -1, -1):
        month_start = (now - timedelta(days=i * 30)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = (month_start + timedelta(days=32)).replace(day=1)
        count = User.objects.filter(role=User.VENDOR, date_joined__gte=month_start, date_joined__lt=month_end).count()
        vendor_growth.append({'month': month_start.strftime('%b %Y'), 'count': count})

    # Daily product posts (last 7 days)
    product_posts = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date()
        count = Product.objects.filter(created_at__date=day).count()
        product_posts.append({'day': day.strftime('%a'), 'count': count})

    # User growth (last 6 months)
    user_growth = []
    for i in range(5, -1, -1):
        month_start = (now - timedelta(days=i * 30)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = (month_start + timedelta(days=32)).replace(day=1)
        customers = User.objects.filter(role=User.CUSTOMER, date_joined__gte=month_start, date_joined__lt=month_end).count()
        guests = User.objects.filter(role=User.ANONYMOUS, date_joined__gte=month_start, date_joined__lt=month_end).count()
        user_growth.append({'month': month_start.strftime('%b %Y'), 'customers': customers, 'guests': guests})

    # Top vendors by product count
    top_vendors = []
    for v in User.objects.filter(role=User.VENDOR, is_active=True):
        pc = Product.objects.filter(vendor=v).count()
        fc = Favorite.objects.filter(product__vendor=v).count()
        if pc > 0:
            profile = getattr(v, 'vendor_profile', None)
            top_vendors.append({'name': profile.brand_name if profile else v.username, 'products': pc, 'favorites': fc})
    top_vendors = sorted(top_vendors, key=lambda x: x['favorites'], reverse=True)[:5]

    # Guest conversion rate
    converted = User.objects.filter(role=User.CUSTOMER, device_id__isnull=False).count()
    conversion_rate = round((converted / total_guests * 100), 1) if total_guests > 0 else 0

    # Revenue trend (last 6 months) — subscriptions purchased, campaign spend, top-ups approved
    revenue_trend = []
    for i in range(5, -1, -1):
        month_start = (now - timedelta(days=i * 30)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = (month_start + timedelta(days=32)).replace(day=1)
        subs = VendorSubscription.objects.filter(
            created_at__gte=month_start, created_at__lt=month_end
        ).aggregate(s=Sum('credits_paid'))['s'] or 0
        camp = CampaignCharge.objects.filter(
            created_at__gte=month_start, created_at__lt=month_end
        ).aggregate(s=Sum('amount'))['s'] or 0
        topup = TopUpRequest.objects.filter(
            status=TopUpRequest.APPROVED, reviewed_at__gte=month_start, reviewed_at__lt=month_end
        ).aggregate(s=Sum('amount'))['s'] or 0
        revenue_trend.append({
            'month': month_start.strftime('%b %Y'),
            'subscriptions': float(subs),
            'campaigns': float(camp),
            'topups': float(topup),
            'total': float(subs) + float(camp) + float(topup),
        })

    # Wallet top-up volume (last 7 days)
    topup_trend = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date()
        row = TopUpRequest.objects.filter(status=TopUpRequest.APPROVED, reviewed_at__date=day).aggregate(
            amount=Sum('amount'), count=Count('id')
        )
        topup_trend.append({'day': day.strftime('%a'), 'amount': float(row['amount'] or 0), 'count': row['count'] or 0})

    # Subscription plan distribution (active subscriptions, plus vendors with no active plan = free/default)
    active_subs_count = VendorSubscription.objects.filter(status=VendorSubscription.ACTIVE).count()
    plan_distribution = [
        {'plan': row['plan__name'], 'vendor_count': row['c']}
        for row in VendorSubscription.objects.filter(status=VendorSubscription.ACTIVE)
        .values('plan__name').annotate(c=Count('id')).order_by('-c')
    ]
    plan_distribution.append({'plan': 'No active plan (Free)', 'vendor_count': max(total_vendors - active_subs_count, 0)})

    # Subscription activity (last 30 days) from audit log
    activity_rows = SubscriptionAuditLog.objects.filter(created_at__gte=last_30).values('action').annotate(c=Count('id'))
    activity_by_action = {row['action']: row['c'] for row in activity_rows}
    subscription_activity = {
        'purchased': activity_by_action.get(SubscriptionAuditLog.PURCHASED, 0),
        'renewed': activity_by_action.get(SubscriptionAuditLog.RENEWED, 0),
        'plan_switched': activity_by_action.get(SubscriptionAuditLog.PLAN_SWITCHED, 0),
        'cancel_scheduled': activity_by_action.get(SubscriptionAuditLog.CANCEL_SCHEDULED, 0),
        'cancelled': activity_by_action.get(SubscriptionAuditLog.CANCELLED, 0),
        'expired': activity_by_action.get(SubscriptionAuditLog.EXPIRED, 0),
    }

    # Upcoming subscription expirations
    upcoming_qs = VendorSubscription.objects.filter(
        status=VendorSubscription.ACTIVE, expires_at__gte=now
    ).select_related('vendor', 'plan')
    upcoming_expirations = {
        'next_7_days': upcoming_qs.filter(expires_at__lt=now + timedelta(days=7)).count(),
        'next_30_days': upcoming_qs.filter(expires_at__lt=now + timedelta(days=30)).count(),
        'soonest': [
            {
                'vendor_username': sub.vendor.username,
                'plan': sub.plan.name,
                'expires_at': sub.expires_at.isoformat(),
                'cancel_at_period_end': sub.cancel_at_period_end,
            }
            for sub in upcoming_qs.filter(expires_at__lt=now + timedelta(days=30)).order_by('expires_at')[:5]
        ],
    }

    # Campaign spend by objective (all-time)
    objective_rows = CampaignCharge.objects.values('objective').annotate(count=Count('id'), spend=Sum('amount'))
    objective_labels = dict(CampaignCharge.OBJECTIVE_CHOICES)
    campaign_objective_spend = [
        {'objective': objective_labels.get(row['objective'], row['objective']), 'count': row['count'], 'spend': float(row['spend'] or 0)}
        for row in objective_rows
    ]

    # Platform-wide engagement trend (last 7 days)
    engagement_trend = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date()
        engagement_trend.append({
            'day': day.strftime('%a'),
            'views': ProductView.objects.filter(viewed_at__date=day).count(),
            'favorites': Favorite.objects.filter(created_at__date=day).count(),
            'cart_adds': CartItem.objects.filter(created_at__date=day).count(),
            'link_clicks': PurchaseLinkClick.objects.filter(clicked_at__date=day).count(),
        })

    # Conversion funnel (last 30 days)
    funnel_views = ProductView.objects.filter(viewed_at__gte=last_30).count()
    funnel_cart_adds = CartItem.objects.filter(created_at__gte=last_30).count()
    funnel_clicks = PurchaseLinkClick.objects.filter(clicked_at__gte=last_30).count()
    conversion_funnel = {
        'views': funnel_views,
        'cart_adds': funnel_cart_adds,
        'link_clicks': funnel_clicks,
        'view_to_cart_rate': round((funnel_cart_adds / funnel_views * 100), 1) if funnel_views else 0,
        'view_to_click_rate': round((funnel_clicks / funnel_views * 100), 1) if funnel_views else 0,
    }

    # Sponsored vs organic performance (last 30 days) — sponsored = product currently linked to an active campaign
    sponsored_product_ids = set(
        CampaignProduct.objects.filter(campaign__status=Campaign.ACTIVE).values_list('product_id', flat=True)
    )

    def engagement_stats(product_ids_filter):
        views_qs = ProductView.objects.filter(viewed_at__gte=last_30)
        clicks_qs = PurchaseLinkClick.objects.filter(clicked_at__gte=last_30)
        if product_ids_filter is not None:
            views_qs = views_qs.filter(product_id__in=product_ids_filter)
            clicks_qs = clicks_qs.filter(product_id__in=product_ids_filter)
        else:
            views_qs = views_qs.exclude(product_id__in=sponsored_product_ids)
            clicks_qs = clicks_qs.exclude(product_id__in=sponsored_product_ids)
        views = views_qs.count()
        clicks = clicks_qs.count()
        return {
            'products': len(product_ids_filter) if product_ids_filter is not None else max(total_products - len(sponsored_product_ids), 0),
            'views': views,
            'link_clicks': clicks,
            'ctr': round((clicks / views * 100), 1) if views else 0,
        }

    sponsored_vs_organic = {
        'sponsored': engagement_stats(sponsored_product_ids),
        'organic': engagement_stats(None),
    }

    return Response({
        'stats': {
            'total_vendors': total_vendors,
            'active_vendors': active_vendors,
            'pending_kyc': pending_kyc,
            'total_products': total_products,
            'active_products': active_products,
            'total_customers': total_customers,
            'total_guests': total_guests,
            'total_categories': total_categories,
            'total_favorites': total_favorites,
            'conversion_rate': conversion_rate,
        },
        'vendor_growth': vendor_growth,
        'product_posts': product_posts,
        'user_growth': user_growth,
        'top_vendors': top_vendors,
        'revenue_trend': revenue_trend,
        'topup_trend': topup_trend,
        'plan_distribution': plan_distribution,
        'subscription_activity': subscription_activity,
        'upcoming_expirations': upcoming_expirations,
        'campaign_objective_spend': campaign_objective_spend,
        'engagement_trend': engagement_trend,
        'conversion_funnel': conversion_funnel,
        'sponsored_vs_organic': sponsored_vs_organic,
    })


# ─── CSV Export ───────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_export_csv(request, report_type):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{report_type}_report.csv"'
    writer = csv.writer(response)

    if report_type == 'vendors':
        writer.writerow(['ID', 'Brand Name', 'Email', 'Phone', 'Status', 'KYC', 'Products', 'Joined'])
        for v in User.objects.filter(role=User.VENDOR):
            profile = getattr(v, 'vendor_profile', None)
            writer.writerow([
                v.id, profile.brand_name if profile else '', v.email,
                profile.phone_number if profile else '',
                'Active' if v.is_active else 'Inactive',
                'Approved' if (profile and profile.is_approved) else 'Pending',
                Product.objects.filter(vendor=v).count(),
                v.date_joined.strftime('%Y-%m-%d'),
            ])

    elif report_type == 'products':
        writer.writerow(['ID', 'Name', 'Vendor', 'Category', 'Original Price', 'Discounted Price', 'Discount %', 'Status', 'Created'])
        for p in Product.objects.all().order_by('-created_at'):
            profile = getattr(p.vendor, 'vendor_profile', None)
            writer.writerow([
                p.id, p.name,
                profile.brand_name if profile else p.vendor.username,
                p.category.name if p.category else '',
                p.original_price, p.price, p.discount,
                'Active' if p.is_active else 'Hidden',
                p.created_at.strftime('%Y-%m-%d'),
            ])

    elif report_type == 'customers':
        writer.writerow(['ID', 'Username', 'Email', 'Signup Date', 'Favorites', 'Status'])
        for u in User.objects.filter(role=User.CUSTOMER):
            writer.writerow([
                u.id, u.username, u.email,
                u.date_joined.strftime('%Y-%m-%d'),
                Favorite.objects.filter(user=u).count(),
                'Active' if u.is_active else 'Blocked',
            ])

    elif report_type == 'guests':
        writer.writerow(['ID', 'Device ID', 'First Visit', 'Favorites', 'Converted'])
        for u in User.objects.filter(role=User.ANONYMOUS):
            writer.writerow([
                u.id, u.device_id or '',
                u.date_joined.strftime('%Y-%m-%d'),
                Favorite.objects.filter(device_id=u.device_id).count(),
                'Yes' if u.role == User.CUSTOMER else 'No',
            ])

    elif report_type == 'favorites':
        writer.writerow(['Product', 'Vendor', 'Favorites Count'])
        for p in Product.objects.annotate(fav_count=Count('favorited_by')).filter(fav_count__gt=0).order_by('-fav_count'):
            profile = getattr(p.vendor, 'vendor_profile', None)
            writer.writerow([p.name, profile.brand_name if profile else p.vendor.username, p.fav_count])

    return response


# ─── Public vendor profile ────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def vendor_public_profile(request, vendor_id):
    vendor = User.objects.filter(id=vendor_id, role=User.VENDOR).first()
    if not vendor:
        return Response({'error': 'Vendor not found'}, status=404)
    profile = getattr(vendor, 'vendor_profile', None)
    if not profile or not profile.is_approved:
        return Response({'error': 'Vendor profile not available'}, status=404)
    logo_url = None
    if profile.logo:
        try:
            logo_url = request.build_absolute_uri(profile.logo.url)
        except Exception:
            logo_url = None
    products = Product.objects.filter(vendor=vendor, is_active=True).order_by('-created_at')
    return Response({
        'id': vendor.id,
        'brand_name': profile.brand_name,
        'logo': logo_url,
        'products': ProductSerializer(products, many=True, context={'request': request}).data
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def top_vendors(request):
    """Approved vendors ranked by all-time product views + purchase-link clicks,
    optionally scoped to a city. Uses independent subquery aggregates (rather than
    combining two reverse-FK annotations) to avoid join fan-out inflating counts."""
    city = request.query_params.get('city')
    try:
        limit = min(int(request.query_params.get('limit', 10)), 50)
    except (TypeError, ValueError):
        limit = 10

    vendors = User.objects.filter(role=User.VENDOR, is_active=True, vendor_profile__is_approved=True)
    if city:
        vendors = vendors.filter(city__iexact=city)

    views_sq = (
        Product.objects.filter(vendor=OuterRef('pk'), is_active=True)
        .order_by().values('vendor').annotate(total=Sum('total_views')).values('total')
    )
    clicks_sq = (
        PurchaseLinkClick.objects.filter(vendor=OuterRef('pk'))
        .order_by().values('vendor').annotate(total=Count('id')).values('total')
    )

    vendors = vendors.annotate(
        product_count=Count('vendor_products', filter=Q(vendor_products__is_active=True), distinct=True),
        total_views=Coalesce(Subquery(views_sq, output_field=IntegerField()), 0),
        total_clicks=Coalesce(Subquery(clicks_sq, output_field=IntegerField()), 0),
    ).filter(product_count__gt=0)

    vendors = vendors.annotate(
        brand_score=F('total_views') + F('total_clicks')
    ).order_by('-brand_score', '-product_count')[:limit]

    results = []
    for v in vendors:
        profile = v.vendor_profile
        logo_url = None
        if profile.logo:
            try:
                logo_url = request.build_absolute_uri(profile.logo.url)
            except Exception:
                logo_url = None
        results.append({
            'id': v.id,
            'brand_name': profile.brand_name,
            'logo': logo_url,
            'city': v.city,
            'product_count': v.product_count,
            'brand_score': v.brand_score,
        })

    return Response({'results': results})


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def manage_premium(request, product_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
        
    product = Product.objects.filter(id=product_id).first()
    if not product:
        return Response({'error': 'Product not found'}, status=404)
        
    data = request.data
    if 'is_premium' in data:
        product.is_premium = bool(data.get('is_premium'))
        product.save()
        
    return Response({
        'message': 'Premium product status updated successfully',
        'is_premium': product.is_premium,
        'is_premium_active': product.is_premium_active
    })
