import logging
import random
from collections import defaultdict

from django.utils import timezone

from app.campaigns.models import Campaign, CampaignProduct
from app.marketplace.models.cart import CartItem
from app.marketplace.models.product import Favorite, Product
from app.marketplace.models.product_view import ProductView

logger = logging.getLogger(__name__)

# Interaction weights for category affinity
VIEW_WEIGHT = 1
FAVORITE_WEIGHT = 3
CART_WEIGHT = 5
AFFINITY_SAMPLE = 200


def get_sponsored_products(user=None, guest_id=None, limit=4, category_id=None, exclude_ids=()):
    """Products from ACTIVE, non-expired campaigns, ranked by the requester's
    category affinity (views/favorites/cart), rotated across vendors.

    Never raises — feed endpoints must not break if this fails.
    """
    try:
        return _get_sponsored(user=user, guest_id=guest_id, limit=limit,
                              category_id=category_id, exclude_ids=exclude_ids)
    except Exception:
        logger.exception('get_sponsored_products failed')
        return []


def _get_sponsored(user=None, guest_id=None, limit=4, category_id=None, exclude_ids=()):
    now = timezone.now()
    candidate_ids = (
        CampaignProduct.objects.filter(
            campaign__status=Campaign.ACTIVE,
            campaign__ends_at__gt=now,
            product__is_active=True,
        ).values_list('product_id', flat=True).distinct()
    )
    products = Product.objects.filter(id__in=list(candidate_ids)).select_related('vendor')
    if category_id:
        products = products.filter(category_id=category_id)
    if exclude_ids:
        products = products.exclude(id__in=list(exclude_ids))

    candidates = list(products)
    if not candidates:
        return []

    affinity = _category_affinity(user=user, guest_id=guest_id)

    # Score, shuffle for random tie-breaks, then sort by (score, popularity).
    random.shuffle(candidates)
    candidates.sort(
        key=lambda p: (affinity.get(p.category_id, 0), p.total_views or 0),
        reverse=True,
    )

    # Round-robin across vendors so competing vendors rotate fairly.
    by_vendor = defaultdict(list)
    vendor_order = []
    for p in candidates:
        if p.vendor_id not in by_vendor:
            vendor_order.append(p.vendor_id)
        by_vendor[p.vendor_id].append(p)

    picked = []
    while len(picked) < limit and any(by_vendor.values()):
        for vendor_id in vendor_order:
            if by_vendor[vendor_id]:
                picked.append(by_vendor[vendor_id].pop(0))
                if len(picked) >= limit:
                    break
    return picked


def _category_affinity(user=None, guest_id=None):
    """Weighted map {category_id: score} from the requester's recent activity."""
    scores = defaultdict(int)

    if user is not None:
        views = ProductView.objects.filter(user=user)
        favorites = Favorite.objects.filter(user=user)
        cart = CartItem.objects.filter(user=user)
    elif guest_id:
        views = ProductView.objects.filter(user__isnull=True, session_id=guest_id)
        favorites = Favorite.objects.filter(device_id=guest_id)
        cart = CartItem.objects.filter(device_id=guest_id)
    else:
        return scores

    for queryset, weight in ((views, VIEW_WEIGHT), (favorites, FAVORITE_WEIGHT), (cart, CART_WEIGHT)):
        rows = (
            queryset.order_by('-pk')
            .values_list('product__category_id', flat=True)[:AFFINITY_SAMPLE]
        )
        for category_id in rows:
            if category_id is not None:
                scores[category_id] += weight
    return scores
