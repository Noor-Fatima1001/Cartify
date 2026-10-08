from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from app.auth.permissions.auth_token import BearerTokenAuthentication
from app.scrape.models.scrapeModel import Categories
from app.marketplace.models.category_settings import VendorCategorySetting, VendorSubCategorySetting
from app.auth.models.user import User
from app.marketplace.serializers.product_serializer import CategorySerializer
from app.marketplace.models.product import SubCategory

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def list_categories(request):
    """List categories visible to the authenticated user/vendor."""
    user = request.user
    # Base categories (Admin created or no owner)
    base_categories = Categories.objects.filter(User_name__role=User.ADMIN) | Categories.objects.filter(User_name__isnull=True)

    if getattr(user, 'role', None) == User.VENDOR:
        vendor = user
        assigned_ids = VendorCategorySetting.objects.filter(vendor=vendor, is_disabled=False).values_list('category_id', flat=True)
        base_categories = base_categories.filter(id__in=assigned_ids)
        custom = Categories.objects.filter(User_name=vendor)
        all_categories = base_categories | custom
    else:
        all_categories = base_categories

    serializer = CategorySerializer(all_categories, many=True, context={'request': request})
    data = serializer.data

    if getattr(user, 'role', None) == User.VENDOR:
        try:
            disabled_subs = set(VendorSubCategorySetting.objects.filter(vendor=user, is_disabled=True).values_list('subcategory_id', flat=True))
        except Exception:
            disabled_subs = set()
        for cat in data:
            if 'subcategories' in cat and isinstance(cat['subcategories'], list):
                cat['subcategories'] = [s for s in cat['subcategories'] if s.get('id') not in disabled_subs]

    return Response(data)

@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def manage_category_visibility(request):
    """Vendors can disable default categories"""
    if request.user.role != User.VENDOR:
        return Response({'error': 'Only vendors can manage category visibility'}, status=status.HTTP_403_FORBIDDEN)
        
    category_id = request.data.get('category_id')
    is_disabled = request.data.get('is_disabled', True)
    
    category = Categories.objects.filter(id=category_id).first()
    if not category:
        return Response({'error': 'Category not found'}, status=404)
    if category.User_name and category.User_name.role != User.ADMIN:
        return Response({'error': 'Only default categories can be disabled'}, status=400)
        
    setting, created = VendorCategorySetting.objects.get_or_create(
        vendor=request.user, 
        category=category
    )
    setting.is_disabled = is_disabled
    setting.save()
    
    return Response({'message': f'Category visibility updated'})

@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def create_custom_category(request):
    """Vendors or Admins can create categories"""
    if request.user.role not in [User.ADMIN, User.VENDOR]:
        return Response({'error': 'Only vendors or admins can create categories'}, status=403)
        
    data = request.data


    if isinstance(data, list):
        categories_payload = data
    elif (isinstance(data, dict) or hasattr(data, 'get')) and 'categories' in data:
        categories_payload = data.get('categories') or []
    else:
        categories_payload = [data]

    created = []
    for item in categories_payload:
      
        if not (isinstance(item, dict) or hasattr(item, 'get')):
            continue

        name = item.get('name')
        if not name:
            continue
        image_file = None
        if not isinstance(data, list) and not (isinstance(data, dict) and 'categories' in data):
            image_file = request.FILES.get('image')
            if not image_file:
                return Response({'error': 'Category image is required'}, status=400)

        category = Categories.objects.create(
            User_name=request.user,
            name=name,
            image=image_file
        )

        subcategories_data = item.get('subcategories', []) or []
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

        for sub_item in subcategories_data:
        
            if isinstance(sub_item, dict) or hasattr(sub_item, 'get'):
                try:
                    sub_name = sub_item.get('name')
                except Exception:
                    
                    sub_name = None
                    for v in (getattr(sub_item, 'values', lambda: [])()):
                        if isinstance(v, str) and v.strip():
                            sub_name = v
                            break
            else:
                sub_name = sub_item

            if sub_name and isinstance(sub_name, str):
                sub = SubCategory.objects.create(category=category, name=sub_name.strip())
                subs_created.append({'id': sub.id, 'name': sub.name})

        created.append({
            'id': category.id,
            'name': category.name,
            'subcategories': subs_created
        })

    if not created:
        return Response({'error': 'No valid categories provided'}, status=400)

    if len(created) == 1 and not isinstance(data, list) and not (isinstance(data, dict) and 'categories' in data):
        return Response(created[0], status=201)

    return Response({'categories': created}, status=201)

@api_view(['GET'])
@permission_classes([AllowAny])
def public_vendors_and_categories(request):
    """Returns all active vendors and visible categories for the public."""
    # Base categories (Admin created or no owner)
    base_categories = Categories.objects.filter(User_name__role=User.ADMIN) | Categories.objects.filter(User_name__isnull=True)
    categories_data = CategorySerializer(base_categories, many=True, context={'request': request}).data

    # Active vendors
    vendors = User.objects.filter(role=User.VENDOR, is_active=True).order_by('-date_joined')
    vendors_data = []
    for v in vendors:
        profile = getattr(v, 'vendor_profile', None)
        if profile and profile.is_approved:
            vendors_data.append({
                'id': v.id,
                'username': v.username,
                'brand_name': profile.brand_name,
                'logo': request.build_absolute_uri(profile.logo.url) if profile.logo else None,
                'city': v.city,
            })

    return Response({
        'categories': categories_data,
        'vendors': vendors_data
    })
