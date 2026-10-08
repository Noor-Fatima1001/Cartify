import json
import logging
import re
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from app.auth.permissions.auth_token import BearerTokenAuthentication

from rest_framework.response import Response
from .permissions.auth_token import BearerTokenAuthentication
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
import uuid
from .models import PasswordResetOTP
from .models.auth_token import AuthToken
from .requestValidation import RegisterValidator, LoginValidator, ResetPasswordValidator, ConfirmResetValidator
from .service import EmailService
from django.contrib.auth.decorators import login_required
from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from app.auth.permissions.auth_token import BearerTokenAuthentication
from app.auth.models.vendor_analytics_permission import VendorAnalyticsPermission
from app.marketplace.models.product_view import ProductView

User = get_user_model()

SESSION_TOKEN_KEY = 'auth_token'
SESSION_REFRESH_TOKEN_EXPIRY_MINUTES = 1440 

def generate_token():
    return str(uuid.uuid4())


def issue_auth_token(user, minutes=SESSION_REFRESH_TOKEN_EXPIRY_MINUTES):
    auth_token = AuthToken.objects.create(
        user=user,
        token=generate_token(),
        expires_at=timezone.now() + timedelta(minutes=minutes)
    )
    return auth_token.token



@csrf_exempt
def register(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        if request.content_type == 'application/json':
            data = json.loads(request.body)
            files = {}
        else:
            data = request.POST.dict()
            files = request.FILES

        validator = RegisterValidator(data, files)
        if not validator.validate():
            return JsonResponse({'errors': validator.errors}, status=400)

        role = data.get('role', User.CUSTOMER).upper()
        if role not in [User.VENDOR, User.CUSTOMER, User.ADMIN]:
            return JsonResponse({'errors': {'role': 'Invalid role'}}, status=400)

        user = User.objects.create(
            username=data['username'],
            email=data['email'],
            first_name=data['first_name'],
            last_name=data['last_name'],
            password=make_password(data['password']),
            role=role,
            mobile_number=data.get('mobile_number'),
            country=data.get('country'),
            state=data.get('state'),
            city=data.get('city'),
            latitude=data.get('latitude'),
            longitude=data.get('longitude')
        )
        
        if role == User.VENDOR:
            from .models import VendorProfile
            is_approved = data.get('is_approved_by_admin', False)
            if isinstance(is_approved, str):
                is_approved = is_approved.lower() == 'true'
            
            VendorProfile.objects.create(
                user=user,
                brand_name=data['brand_name'],
                phone_number=data['phone_number'],
                email=data['email'],
                address=data['address'],
                logo=files.get('logo'),
                is_approved=is_approved
            )
        
        authenticated_user = authenticate(username=data['username'], password=data['password'])
        
        if authenticated_user:
            token = issue_auth_token(authenticated_user)

            return JsonResponse({
                'message': 'User registered successfully',
                'user_id': authenticated_user.id,
                'token': token,
                'role': authenticated_user.role
            })
        else:
            return JsonResponse({'message': 'User registered but could not be authenticated'}, status=201)
    
    except Exception as e:
        logging.exception('Error in register view')
        return JsonResponse({'error': str(e)}, status=500)







@csrf_exempt
def guest_login(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = json.loads(request.body)
        device_id = data.get('device_id')
        mobile_number = data.get('mobile_number')
        if not device_id:
            return JsonResponse({'error': 'device_id is required'}, status=400)
        if not mobile_number:
            return JsonResponse({'error': 'mobile_number is required'}, status=400)

        pk_pattern = r'^(\+92|0)?3\d{9}$'
        in_pattern = r'^(\+91|0)?[6-9]\d{9}$'
        normalized_mobile = str(mobile_number).strip().replace(' ', '').replace('-', '')
        if not (re.match(pk_pattern, normalized_mobile) or re.match(in_pattern, normalized_mobile)):
            return JsonResponse({'error': 'Enter a valid Pakistani or Indian mobile number'}, status=400)

        existing_user_by_mobile = User.objects.filter(mobile_number=mobile_number).exclude(device_id=device_id).first()
        if existing_user_by_mobile and existing_user_by_mobile.role != User.ANONYMOUS:
            return JsonResponse({'error': 'Mobile number already registered by another user'}, status=400)

        if existing_user_by_mobile:
            # Same guest logging in again from a new/changed device_id (reinstall, cleared
            # storage, different device). Re-use their existing guest account and just move
            # it onto the new device_id instead of blocking them with a duplicate error.
            user = existing_user_by_mobile
            user.device_id = device_id
            created = False
        else:
            user, created = User.objects.get_or_create(
                device_id=device_id,
                defaults={
                    'username': f'guest_{uuid.uuid4().hex[:10]}',
                    'role': User.ANONYMOUS,
                    'is_active': True,
                    'mobile_number': mobile_number,
                    'country': data.get('country'),
                    'state': data.get('state'),
                    'city': data.get('city'),
                    'latitude': data.get('latitude'),
                    'longitude': data.get('longitude')
                }
            )

        if not created:
            user.mobile_number = mobile_number

        token = issue_auth_token(user)
        user.last_login = timezone.now()
        user.save(update_fields=['last_login', 'mobile_number', 'device_id'])

        request.session['guest_device_id'] = device_id

        session_key = request.session.session_key
        if not session_key:
            request.session.create()
            session_key = request.session.session_key

        if session_key and session_key != device_id:
            ProductView.objects.filter(user__isnull=True, session_id=session_key).update(session_id=device_id)

        show_popup = (timezone.now() - user.date_joined).days >= 60
        
        return JsonResponse({
            'message': 'Guest access granted',
            'token': token,
            'user_id': user.id,
            'role': user.role,
            'mobile_number': user.mobile_number,
            'show_registration_popup': show_popup
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
def convert_guest(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = json.loads(request.body)
        device_id = data.get('device_id')
        if not device_id:
            return JsonResponse({'error': 'device_id is required'}, status=400)

        required_fields = ['username', 'email', 'first_name', 'last_name', 'password']
        field_errors = {}
        for field in required_fields:
            if not data.get(field):
                field_errors[field] = f'{field} is required to convert a guest account'

        if field_errors:
            return JsonResponse({'errors': field_errors}, status=400)

        if len(data.get('password', '')) < 8:
            field_errors['password'] = 'Password must be at least 8 characters'

        if field_errors:
            return JsonResponse({'errors': field_errors}, status=400)

        with transaction.atomic():
            user = User.objects.select_for_update().filter(device_id=device_id, role=User.ANONYMOUS).first()
            if not user:
                # No prior guest session was ever established on this device
                # (e.g. they went straight to sign-up without browsing/verifying
                # a phone first) — register a fresh account instead of failing,
                # while the migration below still picks up any device-scoped
                # cart/favourite/view activity recorded before this signup.
                user = User(device_id=device_id, is_active=True)

            if User.objects.filter(username=data['username']).exclude(id=user.id).exists():
                return JsonResponse({'error': 'Username already taken'}, status=400)
            if User.objects.filter(email=data['email']).exclude(id=user.id).exists():
                return JsonResponse({'error': 'Email already registered'}, status=400)
            # Determine mobile number: prefer supplied value, otherwise fall back to guest's mobile
            supplied_mobile = data.get('mobile_number')
            mobile_number = supplied_mobile if supplied_mobile else user.mobile_number

            if mobile_number and User.objects.filter(mobile_number=mobile_number).exclude(id=user.id).exists():
                return JsonResponse({'error': 'Mobile number already registered by another user'}, status=400)

            user.username = data['username']
            user.email = data['email']
            user.first_name = data['first_name']
            user.last_name = data['last_name']
            user.password = make_password(data['password'])
            user.mobile_number = mobile_number
            user.role = User.CUSTOMER
            user.is_active = True

            # Keep guest location unless the customer supplied updated values.
            if 'country' in data: user.country = data['country']
            if 'state' in data: user.state = data['state']
            if 'city' in data: user.city = data['city']
            if 'latitude' in data: user.latitude = data['latitude']
            if 'longitude' in data: user.longitude = data['longitude']

            user.save()

            token = issue_auth_token(user)
            request.session['guest_device_id'] = device_id

            # Migrate device-only favorites to the converted customer and remove duplicates.
            from app.marketplace.models.product import Favorite
            guest_favorites = Favorite.objects.select_for_update().filter(
                device_id=device_id,
                user__isnull=True
            )
            for favorite in guest_favorites:
                duplicate_exists = Favorite.objects.filter(
                    user=user,
                    product=favorite.product
                ).exclude(id=favorite.id).exists()

                if duplicate_exists:
                    favorite.delete()
                    continue

                favorite.user = user
                favorite.device_id = None
                favorite.save(update_fields=['user', 'device_id'])

            # Migrate guest product views (session/device-based views) to the converted customer
            try:
                from app.marketplace.models.product_view import ProductView
                ProductView.objects.filter(session_id=device_id, user__isnull=True).update(user=user, session_id=None)
            except Exception:
                pass

            # Migrate device-only cart items to the converted customer and remove duplicates.
            try:
                from app.marketplace.models.cart import CartItem
                guest_cart_items = CartItem.objects.select_for_update().filter(
                    device_id=device_id,
                    user__isnull=True
                )
                for item in guest_cart_items:
                    duplicate_exists = CartItem.objects.filter(
                        user=user,
                        product=item.product
                    ).exclude(id=item.id).exists()

                    if duplicate_exists:
                        item.delete()
                        continue

                    item.user = user
                    item.device_id = None
                    item.save(update_fields=['user', 'device_id'])
            except Exception:
                pass
        
        return JsonResponse({
            'message': 'Account converted successfully',
            'token': token,
            'user_id': user.id,
            'role': user.role,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'mobile_number': user.mobile_number,
                'role': user.role,
                'country': user.country,
                'state': user.state,
                'city': user.city,
                'latitude': user.latitude,
                'longitude': user.longitude,
            }
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
def signin(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        data = json.loads(request.body)
        validator = LoginValidator(data)
        
        if not validator.validate():
            return JsonResponse({'errors': validator.errors}, status=400)
        
        username_or_email = data['username_or_email']
        password = data['password']
        # Portal information: optional but recommended. Can be 'admin' or 'vendor'
        portal = (data.get('portal') or '').strip().lower()
        referer = request.META.get('HTTP_REFERER', '') or request.META.get('HTTP_ORIGIN', '') or ''
        user = None
        if '@' in username_or_email:
            try:
                user = User.objects.get(email=username_or_email)
                username = user.username if user else None
                userid=user.id
            except User.DoesNotExist:
                username = None
                userid=None
        else:
            username = username_or_email
        pre_user = None
        try:
            pre_user = User.objects.filter(username=username).first() if username else None
        except Exception:
            pre_user = None

        if not pre_user and '@' in username_or_email:
            try:
                pre_user = User.objects.filter(email=username_or_email).first()
            except Exception:
                pre_user = None

        if pre_user:
            if not getattr(pre_user, 'is_active', True) or getattr(pre_user, 'status', None) == User.STATUS_INACTIVE:
                return JsonResponse({
                    'error': 'Your account has been deactivated. Please contact the administrator.'
                }, status=403)

            if getattr(pre_user, 'status', None) == User.STATUS_BLOCKED:
                return JsonResponse({
                    'error': 'Your account has been blocked. Please contact the administrator.'
                }, status=403)

        user = authenticate(username=username, password=password)
        if user:
            if not getattr(user, 'is_active', True) or getattr(user, 'status', None) == User.STATUS_INACTIVE:
                return JsonResponse({
                    'error': 'Your account has been deactivated. Please contact the administrator.'
                }, status=403)

            if getattr(user, 'status', None) == User.STATUS_BLOCKED:
                return JsonResponse({
                    'error': 'Your account has been blocked. Please contact the administrator.'
                }, status=403)

            if user.role == User.VENDOR and hasattr(user, 'vendor_profile'):
                kyc_status = user.vendor_profile.kyc_status.upper()
                if kyc_status == 'PENDING':
                    return JsonResponse({
                        'error': 'Your vendor account is pending admin approval.'
                    }, status=403)
                elif kyc_status == 'REJECTED':
                    return JsonResponse({
                        'error': 'Your vendor account has been rejected by the admin.'
                    }, status=403)
                elif kyc_status != 'APPROVED':
                    return JsonResponse({
                        'error': 'Your vendor account is not approved.'
                    }, status=403)
            
                # Log attempt details for debugging (do NOT log passwords)
                logging.info(f"Signin attempt username_or_email={username_or_email} portal_param={portal} referer={referer}")

                # Determine requested portal. Prefer explicit portal param, fall back to referer.
                if portal in ('admin', 'vendor'):
                    requested_portal = portal
                else:
                    requested_portal = 'admin' if '/admin-dbits' in referer else 'vendor'

                logging.info(f"Resolved requested_portal={requested_portal} user_role={getattr(user, 'role', None)}")

                # Enforce role-based access: ensure user role matches requested portal
                if requested_portal == 'admin' and user.role != User.ADMIN:
                    logging.warning(f"Portal access denied: expected ADMIN, got {user.role} for {username_or_email}")
                    return JsonResponse({'error': 'You are not authorized to access the Admin Portal.'}, status=403)
                if requested_portal == 'vendor' and user.role != User.VENDOR:
                    logging.warning(f"Portal access denied: expected VENDOR, got {user.role} for {username_or_email}")
                    return JsonResponse({'error': 'You are not authorized to access the Vendor Portal.'}, status=403)

            token = issue_auth_token(user)

            user_data = {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'mobile_number': user.mobile_number,
                'role': user.role,
                'country': user.country,
                'state': user.state,
                'city': user.city,
                'latitude': user.latitude,
                'longitude': user.longitude,
            }
            if user.role == User.VENDOR and hasattr(user, 'vendor_profile'):
                profile = user.vendor_profile
                user_data['brand_name'] = profile.brand_name
                user_data['logo'] = request.build_absolute_uri(profile.logo.url) if profile.logo else None
                user_data['phone_number'] = profile.phone_number
                user_data['address'] = profile.address

                try:
                    permission = VendorAnalyticsPermission.objects.get(vendor=user)
                    can_access_analytics = permission.can_access_analytics
                except VendorAnalyticsPermission.DoesNotExist:
                    can_access_analytics = True

                user_data['can_access_analytics'] = can_access_analytics
                user_data['analytics_permission'] = {'can_access_analytics': can_access_analytics}

            return JsonResponse({
                'message': 'Login successful',
                'token': token,
                'user': user_data
            })
        else:
            return JsonResponse({'error': 'Invalid credentials'}, status=401)
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def extend_session(request):
    """Slide the caller's own auth token expiry forward. Called by the frontend
    on user activity so an actively-working user is never logged out mid-task,
    while a genuinely idle user still expires on schedule."""
    auth_token = request.auth
    auth_token.expires_at = timezone.now() + timedelta(minutes=SESSION_REFRESH_TOKEN_EXPIRY_MINUTES)
    auth_token.save(update_fields=['expires_at'])

    return Response({
        'message': 'Session extended',
        'expires_at': auth_token.expires_at.isoformat(),
    })


@csrf_exempt
@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def logout_view(request):
    request.auth.delete()
    return Response({'message': 'Logged out successfully'})




@csrf_exempt
def reset_password(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = json.loads(request.body)
        validator = ResetPasswordValidator(data)
        
        if not validator.validate():
            return JsonResponse({'errors': validator.errors}, status=400)
        
        user = User.objects.get(email=data['email'])
        email_service = EmailService()
        otp = email_service.generate_otp()
        
       
        PasswordResetOTP.objects.filter(
            user=user, 
            is_used=False
        ).update(is_used=True)
        
        PasswordResetOTP.objects.create(
            user=user,
            otp=otp
        )
        
        if email_service.send_reset_otp(user.email, otp):
            return JsonResponse({'message': 'OTP sent to your email', 'email': data['email']})
        else:
            return JsonResponse({'error': 'Failed to send email'}, status=500)
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
def confirm_reset(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        data = json.loads(request.body)
        validator = ConfirmResetValidator(data)
        
        if not validator.validate():
            return JsonResponse({'errors': validator.errors}, status=400)
        
        user = User.objects.get(email=data['email'])
        
        otp_record = PasswordResetOTP.objects.filter(
            user=user,
            otp=data['otp'],
            is_used=False,
            created_at__gte=timezone.now() - timedelta(minutes=10)
        ).first()
        
        if not otp_record:
            return JsonResponse({'error': 'Invalid or expired OTP'}, status=400)
        
        user.password = make_password(data['new_password'])
        user.save()
        
        otp_record.is_used = True
        otp_record.save()

        # Invalidate every existing login for this account, not just the
        # current browser's session — a password reset should log the user
        # out everywhere, including any device where the old password leaked.
        AuthToken.objects.filter(user=user).delete()

        return JsonResponse({'message': 'Password reset successfully'})
    
    except Exception as e:
        return JsonResponse({'errors...': str(e)}, status=500)
    
    


@csrf_exempt
@api_view(['GET', 'POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([AllowAny])
def check_user(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            username = data.get('username')
            email = data.get('email')

            errors = {}

            if username and User.objects.filter(username=username).exists():
                errors['username'] = 'Username already exists'

            if email and User.objects.filter(email=email).exists():
                errors['email'] = 'Email already exists'

            return Response({
                'exists': len(errors) > 0,
                'errors': errors
            })
        except Exception as e:
            return Response({'error': str(e)}, status=500)
    if request.method == 'GET':
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return Response({'error': 'Authentication required'}, status=401)

        user_data = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'mobile_number': user.mobile_number,
            'role': user.role,
            'country': user.country,
            'state': user.state,
            'city': user.city,
            'latitude': user.latitude,
            'longitude': user.longitude,
        }

        if user.role == User.VENDOR and hasattr(user, 'vendor_profile'):
            profile = user.vendor_profile
            user_data['brand_name'] = profile.brand_name
            user_data['logo'] = request.build_absolute_uri(profile.logo.url) if profile.logo else None
            user_data['phone_number'] = profile.phone_number
            user_data['address'] = profile.address

            try:
                permission = VendorAnalyticsPermission.objects.get(vendor=user)
                can_access_analytics = permission.can_access_analytics
            except VendorAnalyticsPermission.DoesNotExist:
                can_access_analytics = True

            user_data['can_access_analytics'] = can_access_analytics
            user_data['analytics_permission'] = {'can_access_analytics': can_access_analytics}

        return Response({'user': user_data})

    return Response({'error': 'Method not allowed'}, status=405)



@api_view(['POST'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def update_profile(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        
        user = request.user 
        
        allowed_fields = [
            'first_name', 
            'last_name', 
            'email',
            'username',
            'mobile_number',
            'country',
            'state',
            'city',
            'latitude',
            'longitude'
        ]

        if 'username' in data and data['username'] != user.username:
            if User.objects.filter(username=data['username']).exists():
                return JsonResponse({'error': 'Username already used Try another username'}, status=400)
        
        if 'email' in data and data['email'] != user.email:
            if User.objects.filter(email=data['email']).exists():
                return JsonResponse({'error': 'Email already used Try another email'}, status=400)

        if 'mobile_number' in data and data['mobile_number'] != user.mobile_number:
            if User.objects.filter(mobile_number=data['mobile_number']).exists():
                return JsonResponse({'error': 'Mobile number already used Try another mobile number'}, status=400)

        updated_fields = {}
        for key, value in data.items():
            if key in allowed_fields:
                current_value = getattr(user, key)
                if current_value != value:
                    setattr(user, key, value)
                    updated_fields[key] = value

        if updated_fields:
            user.save()
            message = 'Profile updated successfully'
        else:
            message = 'No changes detected or fields were not allowed to be updated.'

        response_data = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'mobile_number': user.mobile_number,
            'country': user.country,
            'state': user.state,
            'city': user.city,
            'latitude': user.latitude,
            'longitude': user.longitude,
        }

        if user.role == User.VENDOR and hasattr(user, 'vendor_profile'):
            try:
                permission = VendorAnalyticsPermission.objects.get(vendor=user)
                can_access_analytics = permission.can_access_analytics
            except VendorAnalyticsPermission.DoesNotExist:
                can_access_analytics = True

            response_data['can_access_analytics'] = can_access_analytics
            response_data['analytics_permission'] = {'can_access_analytics': can_access_analytics}

        return JsonResponse({
            'message': message,
            'user': response_data
        })
    
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON format in request body'}, status=400)
    
    except Exception as e:
        print(f"Error during profile update: {e}")
        return JsonResponse({'error': f'An internal error occurred during the update {e}'}, status=500)



@api_view(['GET'])
@authentication_classes([BearerTokenAuthentication])
@permission_classes([IsAuthenticated])
def profile(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Authentication required'}, status=401)
        
        user = request.user
        response_data = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'mobile_number': user.mobile_number,
            'country': user.country,
            'state': user.state,
            'city': user.city,
            'latitude': user.latitude,
            'longitude': user.longitude,
        }
        
        return JsonResponse({'user': response_data})
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([AllowAny])
def public_config(request):
    from .admin_views import _load_system_settings, _load_popup_settings
    
    sys = _load_system_settings()
    pop = _load_popup_settings()
    
    return Response({
        'platform_name': sys.get('platform_name', 'Cartify'),
        'popup': {
            'enabled': pop.get('enabled', True),
            'delay_days': pop.get('popup_delay_days', 60),
            'message': pop.get('message', ''),
            'cta_text': pop.get('cta_text', 'Sign Up Now'),
        }
    })
