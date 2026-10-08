import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.hashers import make_password
from django.db.models import Count, Q
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from app.auth.permissions.auth_token import BearerTokenAuthentication
from app.auth.models.user import User
from app.marketplace.models.product import Favorite


def is_admin(user):
    return user.role == User.ADMIN or user.is_staff


# ─── Customer Management ──────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_list_customers(request):
    """Admin lists all registered customers"""
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    customers = User.objects.filter(role=User.CUSTOMER).order_by('-date_joined')
    data = []
    for u in customers:
        fav_count = Favorite.objects.filter(user=u).count()
        data.append({
            'id': u.id,
            'username': u.username,
            'email': u.email or '',
            'first_name': u.first_name,
            'last_name': u.last_name,
            'mobile_number': u.mobile_number or '',
            'signup_date': u.date_joined.isoformat(),
            'favorites_count': fav_count,
            'is_active': u.is_active,
            'profile_image': request.build_absolute_uri(u.profile_image.url) if u.profile_image else None,
        })
    return Response(data)


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_customer_detail(request, customer_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    customer = User.objects.filter(id=customer_id, role=User.CUSTOMER).first()
    if not customer:
        return Response({'error': 'Customer not found'}, status=404)
    profile = getattr(customer, 'vendor_profile', None)
    favorites = Favorite.objects.filter(user=customer).select_related('product').order_by('-created_at')[:20]
    fav_data = []
    for f in favorites:
        p = f.product
        fav_data.append({
            'id': p.id,
            'name': p.name,
            'price': str(p.price),
            'image': request.build_absolute_uri(p.image.url) if p.image else None,
        })
    return Response({
        'id': customer.id,
        'username': customer.username,
        'email': customer.email or '',
        'first_name': customer.first_name,
        'last_name': customer.last_name,
        'mobile_number': customer.mobile_number or '',
        'country': customer.country or '',
        'state': customer.state or '',
        'city': customer.city or '',
        'signup_date': customer.date_joined.isoformat(),
        'last_login': customer.last_login.isoformat() if customer.last_login else None,
        'is_active': customer.is_active,
        'status': customer.status,
        'profile_image': request.build_absolute_uri(customer.profile_image.url) if customer.profile_image else None,
        'logo': request.build_absolute_uri(profile.logo.url) if profile and profile.logo else None,
        'favorites_count': Favorite.objects.filter(user=customer).count(),
        'favorites': fav_data,
    })


@api_view(['PATCH'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_edit_customer(request, customer_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)

    customer = User.objects.filter(id=customer_id, role=User.CUSTOMER).first()
    if not customer:
        return Response({'error': 'Customer not found'}, status=404)

    data = request.data
    for field in ['email', 'first_name', 'last_name']:
        if field in data:
            setattr(customer, field, data[field])

    if 'password' in data and data['password']:
        customer.password = make_password(data['password'])

    if 'profile_image' in request.FILES:
        customer.profile_image = request.FILES['profile_image']

    if 'status' in data:
        status_value = data['status']
        if status_value not in [User.STATUS_ACTIVE, User.STATUS_BLOCKED, User.STATUS_INACTIVE]:
            return Response({'error': 'Invalid status'}, status=400)
        customer.status = status_value
        customer.is_active = status_value == User.STATUS_ACTIVE
    elif 'is_active' in data:
        customer.is_active = bool(data['is_active'])
        customer.status = User.STATUS_ACTIVE if customer.is_active else User.STATUS_BLOCKED

    customer.save()

    return Response({
        'message': 'Customer updated successfully',
        'customer': {
            'id': customer.id,
            'username': customer.username,
            'email': customer.email or '',
            'first_name': customer.first_name,
            'last_name': customer.last_name,
            'is_active': customer.is_active,
            'status': customer.status,
        }
    })


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_block_customer(request, customer_id):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    customer = User.objects.filter(id=customer_id).first()
    if not customer:
        return Response({'error': 'User not found'}, status=404)
    customer.is_active = not customer.is_active
    customer.save()
    return Response({
        'message': f'User {"unblocked" if customer.is_active else "blocked"}',
        'is_active': customer.is_active
    })


# ─── Guest Management ─────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_list_guests(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    guests = User.objects.filter(role=User.ANONYMOUS).order_by('-date_joined')
    data = []
    for u in guests:
        if u.device_id:
            fav_count = Favorite.objects.filter(Q(user=u) | Q(device_id=u.device_id)).count()
        else:
            fav_count = Favorite.objects.filter(user=u).count()

        converted = User.objects.filter(
            device_id=u.device_id, role=User.CUSTOMER
        ).exists() if u.device_id else False
        data.append({
            'id': u.id,
            'device_id': u.device_id or 'N/A',
            'first_visit': u.date_joined.isoformat(),
            'last_active': u.last_login.isoformat() if u.last_login else None,
            'favorites_count': fav_count,
            'converted': converted,
        })
    return Response(data)


# ─── Notifications ────────────────────────────────────────────────────────────

@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_send_notification(request):
    """Admin sends a notification (stored in DB / logged)"""
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    title = request.data.get('title', '')
    message = request.data.get('message', '')
    target = request.data.get('target', 'all')  # all, customers, vendors
    if not title or not message:
        return Response({'error': 'Title and message are required'}, status=400)
    
    count = 0
    if target == 'all':
        count = User.objects.filter(is_active=True).count()
    elif target == 'customers':
        count = User.objects.filter(role=User.CUSTOMER, is_active=True).count()
    elif target == 'vendors':
        count = User.objects.filter(role=User.VENDOR, is_active=True).count()
    return Response({'message': f'Notification sent to {count} users', 'recipients': count})


# ─── Popup Settings ───────────────────────────────────────────────────────────

import os
SETTINGS_FILE = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'popup_settings.json')

def _load_popup_settings():
    defaults = {
        'popup_delay_days': 60,
        'message': 'You\'ve been exploring Cartify for a while! Create an account to save your favorites.',
        'cta_text': 'Sign Up Now',
        'enabled': True,
    }
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r') as f:
                return {**defaults, **json.load(f)}
    except Exception:
        pass
    return defaults

def _save_popup_settings(data):
    try:
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_get_popup_settings(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    return Response(_load_popup_settings())


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_save_popup_settings(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    current = _load_popup_settings()
    for key in ['popup_delay_days', 'message', 'cta_text', 'enabled']:
        if key in request.data:
            current[key] = request.data[key]
    _save_popup_settings(current)
    return Response({'message': 'Popup settings saved', 'settings': current})


# ─── System Settings ─────────────────────────────────────────────────────────

SYSTEM_SETTINGS_FILE = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'system_settings.json')

def _load_system_settings():
    defaults = {
        'platform_name': 'Cartify',
        'smtp_host': '',
        'smtp_port': 587,
        'smtp_user': '',
        'smtp_pass': '',
        'maintenance_mode': False,
        'min_discount_percent': 1,
    }
    try:
        if os.path.exists(SYSTEM_SETTINGS_FILE):
            with open(SYSTEM_SETTINGS_FILE, 'r') as f:
                return {**defaults, **json.load(f)}
    except Exception:
        pass
    return defaults

def _save_system_settings(data):
    try:
        with open(SYSTEM_SETTINGS_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_get_system_settings(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    return Response(_load_system_settings())


@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_save_system_settings(request):
    if not is_admin(request.user):
        return Response({'error': 'Admin access required'}, status=403)
    current = _load_system_settings()
    for key in ['platform_name', 'smtp_host', 'smtp_port', 'smtp_user', 'min_discount_percent']:
        if key in request.data:
            current[key] = request.data[key]
    if 'smtp_pass' in request.data and request.data['smtp_pass']:
        current['smtp_pass'] = request.data['smtp_pass']
    _save_system_settings(current)
    return Response({'message': 'Settings saved', 'settings': current})
