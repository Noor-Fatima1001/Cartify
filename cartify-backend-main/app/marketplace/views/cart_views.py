import logging

from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from app.auth.models.user import User
from app.billing.service.subscription_service import vendor_allows_cart
from app.marketplace.models.cart import CartItem
from app.marketplace.models.product import Product
from app.marketplace.serializers.product_serializer import ProductSerializer

logger = logging.getLogger(__name__)


def _resolve_cart_identity(request, device_id=None):
    """Mirror the favorites guest handling: returns (user, guest_user, device_id).

    - Registered customer/vendor: identified by user.
    - Guest (ANONYMOUS role or unauthenticated with device_id): identified by
      the guest User row when one exists for the device, else by device_id.
    """
    user = request.user if request.user.is_authenticated else None
    is_guest_user = user and getattr(user, 'role', None) == User.ANONYMOUS

    if is_guest_user and not device_id:
        device_id = user.device_id

    if user and not is_guest_user:
        return user, None, None

    if not device_id:
        return None, None, None

    guest_user = User.objects.filter(device_id=device_id, role=User.ANONYMOUS).first()
    if not guest_user and str(device_id).isdigit():
        guest_user = User.objects.filter(id=int(device_id), role=User.ANONYMOUS).first()
    return None, guest_user, device_id


@api_view(['POST'])
@permission_classes([AllowAny])
def add_to_cart(request):
    product_id = request.data.get('product_id')
    device_id = request.data.get('device_id')

    if not product_id:
        return Response({'error': 'Product ID is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        product = Product.objects.get(id=product_id, is_active=True)
    except Product.DoesNotExist:
        return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

    if not vendor_allows_cart(product.vendor):
        return Response(
            {'error': 'Add to cart is not available for this product'},
            status=status.HTTP_403_FORBIDDEN
        )

    user, guest_user, device_id = _resolve_cart_identity(request, device_id)
    if not user and not guest_user and not device_id:
        return Response({'error': 'Authentication or Device ID required'}, status=status.HTTP_401_UNAUTHORIZED)

    if user:
        item, created = CartItem.objects.get_or_create(user=user, product=product)
    elif guest_user:
        item, created = CartItem.objects.get_or_create(user=guest_user, product=product)
        # De-duplicate any device-only rows for the same product
        CartItem.objects.filter(device_id=device_id, user__isnull=True, product=product).exclude(id=item.id).delete()
        if item.device_id:
            item.device_id = None
            item.save(update_fields=['device_id'])
    else:
        item, created = CartItem.objects.get_or_create(device_id=device_id, user=None, product=product)

    if device_id:
        request.session['guest_device_id'] = device_id
        User.objects.filter(device_id=device_id, role=User.ANONYMOUS).update(last_login=timezone.now())

    if created:
        try:
            from app.campaigns.service.charging_service import charge_interaction
            charge_interaction(product, 'CART_ADD',
                               user=user or guest_user,
                               guest_id=None if (user or guest_user) else device_id)
        except ImportError:
            pass
        except Exception:
            logger.exception('Cart-add charge hook failed for product %s', product.id)

    return Response({
        'message': 'Added to cart' if created else 'Already in cart',
        'in_cart': True,
    }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_cart(request):
    device_id = request.query_params.get('device_id') or request.headers.get('X-Device-Id') \
        or request.session.get('guest_device_id')
    user, guest_user, device_id = _resolve_cart_identity(request, device_id)

    if user:
        items = CartItem.objects.filter(user=user)
    elif guest_user:
        items = CartItem.objects.filter(Q(user=guest_user) | Q(device_id=device_id, user__isnull=True))
    elif device_id:
        items = CartItem.objects.filter(device_id=device_id, user__isnull=True)
    else:
        return Response({'error': 'Authentication or Device ID required'}, status=status.HTTP_401_UNAUTHORIZED)

    items = items.select_related('product', 'product__vendor').order_by('-created_at')
    results = []
    for item in items:
        if not item.product.is_active:
            continue
        product_data = ProductSerializer(item.product, context={'request': request}).data
        results.append({
            'cart_item_id': item.id,
            'added_at': item.created_at.isoformat(),
            'product': product_data,
        })
    return Response({'results': results, 'total_items': len(results)})


@api_view(['POST'])
@permission_classes([AllowAny])
def remove_from_cart(request):
    product_id = request.data.get('product_id')
    device_id = request.data.get('device_id')

    if not product_id:
        return Response({'error': 'Product ID is required'}, status=status.HTTP_400_BAD_REQUEST)

    user, guest_user, device_id = _resolve_cart_identity(request, device_id)

    if user:
        deleted, _ = CartItem.objects.filter(user=user, product_id=product_id).delete()
    elif guest_user:
        deleted, _ = CartItem.objects.filter(
            Q(user=guest_user) | Q(device_id=device_id, user__isnull=True),
            product_id=product_id
        ).delete()
    elif device_id:
        deleted, _ = CartItem.objects.filter(device_id=device_id, user__isnull=True, product_id=product_id).delete()
    else:
        return Response({'error': 'Authentication or Device ID required'}, status=status.HTTP_401_UNAUTHORIZED)

    if deleted:
        return Response({'message': 'Removed from cart'})
    return Response({'message': 'Product was not in cart'})
