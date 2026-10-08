from django.db.models import Count, Min, Max, Q
from django.utils import timezone
from datetime import timedelta
from app.auth.models.user import User
from app.marketplace.models.product import Product
from app.marketplace.models.product_view import ProductView
from app.marketplace.models.product import Favorite
from app.marketplace.models.purchase_click import PurchaseLinkClick
from app.marketplace.models.cart import CartItem


class ProductAnalyticsService:
    @staticmethod
    def _compute_unique_visitors(product):
        all_views = ProductView.objects.filter(product=product)
        unique_registered_users = all_views.filter(user__isnull=False).exclude(user__role=User.ANONYMOUS).values('user').distinct().count()
        unique_anonymous_guests = all_views.filter(user__role=User.ANONYMOUS).values('user__device_id').distinct().count()
        unique_guest_sessions = all_views.filter(
            user__isnull=True,
            session_id__isnull=False
        ).values('session_id').distinct().count()
        return unique_registered_users + unique_anonymous_guests + unique_guest_sessions

    @staticmethod
    def _build_breakdown(product):
        views = ProductView.objects.filter(product=product).select_related('user')
        breakdown = []

        customer_groups = views.filter(user__isnull=False).values(
            'user', 'user__username'
        ).annotate(
            total_visits=Count('id'),
            first_visit=Min('viewed_at'),
            last_visit=Max('viewed_at')
        )
        user_ids = [group['user'] for group in customer_groups if group.get('user')]
        users = User.objects.filter(id__in=user_ids).in_bulk()

        for group in customer_groups:
            user_obj = users.get(group['user'])
            if user_obj and getattr(user_obj, 'role', None) == User.ANONYMOUS:
                device_id = getattr(user_obj, 'device_id', None)
                is_liked = False
                if device_id:
                    try:
                        is_liked = Favorite.objects.filter(device_id=device_id, product=product).exists()
                    except Exception:
                        is_liked = False
                breakdown.append({
                    'visitor_type': 'guest',
                    'session_id': device_id,
                    'total_visits': group['total_visits'],
                    'first_visit': group['first_visit'].isoformat() if group['first_visit'] else None,
                    'last_visit': group['last_visit'].isoformat() if group['last_visit'] else None,
                    'is_liked': bool(is_liked),
                })
            else:
                is_liked = False
                try:
                    is_liked = Favorite.objects.filter(user_id=group['user'], product=product).exists()
                except Exception:
                    is_liked = False

                breakdown.append({
                    'visitor_type': 'customer',
                    'user_id': group['user'],
                    'username': group['user__username'],
                    'total_visits': group['total_visits'],
                    'first_visit': group['first_visit'].isoformat() if group['first_visit'] else None,
                    'last_visit': group['last_visit'].isoformat() if group['last_visit'] else None,
                    'is_liked': bool(is_liked),
                })

        guest_groups = views.filter(user__isnull=True, session_id__isnull=False).values(
            'session_id'
        ).annotate(
            total_visits=Count('id'),
            first_visit=Min('viewed_at'),
            last_visit=Max('viewed_at')
        )
        for group in guest_groups:
            is_liked = False
            try:
                is_liked = Favorite.objects.filter(device_id=group['session_id'], product=product).exists()
            except Exception:
                is_liked = False

            breakdown.append({
                'visitor_type': 'guest',
                'session_id': group['session_id'],
                'total_visits': group['total_visits'],
                'first_visit': group['first_visit'].isoformat() if group['first_visit'] else None,
                'last_visit': group['last_visit'].isoformat() if group['last_visit'] else None,
                'is_liked': bool(is_liked),
            })

        return breakdown

    @staticmethod
    def get_product_analytics(product_id, include_breakdown=False):
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return None

        today = timezone.now().date()
        today_start = timezone.make_aware(
            timezone.datetime.combine(today, timezone.datetime.min.time())
        )
        today_end = timezone.make_aware(
            timezone.datetime.combine(today, timezone.datetime.max.time())
        )

        all_views = ProductView.objects.filter(product=product)
        today_views = all_views.filter(viewed_at__range=[today_start, today_end])

        total_views = product.total_views if product.total_views is not None else all_views.count()
        if total_views == 0 and all_views.exists():
            total_views = all_views.count()

        unique_visitors = product.unique_visitors if product.unique_visitors is not None else ProductAnalyticsService._compute_unique_visitors(product)
        if unique_visitors == 0 and all_views.exists():
            unique_visitors = ProductAnalyticsService._compute_unique_visitors(product)

        today_total = today_views.count()
        today_unique_registered = today_views.filter(user__isnull=False).exclude(user__role=User.ANONYMOUS).values('user').distinct().count()
        today_unique_anonymous = today_views.filter(user__role=User.ANONYMOUS).values('user__device_id').distinct().count()
        today_unique_guest_sessions = today_views.filter(
            user__isnull=True,
            session_id__isnull=False
        ).values('session_id').distinct().count()
        today_unique = today_unique_registered + today_unique_anonymous + today_unique_guest_sessions

        data = {
            'product': {
                'id': product.id,
                'name': product.name,
            },
            'total_views': total_views,
            'unique_visitors': unique_visitors,
            'today_views': today_total,
            'today_unique_visitors': today_unique,
        }

        if include_breakdown:
            data['visitor_breakdown'] = ProductAnalyticsService._build_breakdown(product)

        return data

    @staticmethod
    def get_product_view_history(product_id, page=1, page_size=100):
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return None

        views = ProductView.objects.filter(
            product=product
        ).select_related('user').order_by('-viewed_at')

        total_count = views.count()
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size

        paginated_views = views[start_idx:end_idx]

        view_list = []
        for view in paginated_views:
            is_liked = False
            view_user = None
            session_id = view.session_id
            try:
                if view.user and getattr(view.user, 'role', None) != User.ANONYMOUS:
                    is_liked = Favorite.objects.filter(user=view.user, product=product).exists()
                    view_user = view.user.username
                else:
                    session_id = view.session_id or getattr(view.user, 'device_id', None)
                    if session_id:
                        is_liked = Favorite.objects.filter(device_id=session_id, product=product).exists()
            except Exception:
                is_liked = False

            view_list.append({
                'id': view.id,
                'user': view_user,
                'mobile_number': view.user.mobile_number if view.user else None,
                'session_id': session_id,
                'ip_address': view.ip_address,
                'user_agent': view.user_agent,
                'viewed_at': view.viewed_at.isoformat(),
                'is_liked': bool(is_liked),
            })

        return {
            'product_id': product.id,
            'product_name': product.name,
            'mobile_number': product.mobile_number if product.mobile_number else None,
            'total_views': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': (total_count + page_size - 1) // page_size,
            'views': view_list
        }

    @staticmethod
    def _resolve_guest_users_by_device_or_id(identifiers):
        """Fetch anonymous users by device_id or numeric user id fallback."""
        if not identifiers:
            return {}

        # Normalize valid identifiers and preserve the original string keys.
        device_ids = [identifier for identifier in identifiers if identifier]
        guest_users = {}

        if device_ids:
            guest_by_device = User.objects.filter(device_id__in=device_ids, role=User.ANONYMOUS)
            for guest in guest_by_device:
                guest_users[guest.device_id] = guest

            numeric_ids = [int(identifier) for identifier in device_ids if identifier.isdigit() and identifier not in guest_users]
            if numeric_ids:
                guest_by_id = User.objects.filter(id__in=numeric_ids, role=User.ANONYMOUS)
                for guest in guest_by_id:
                    guest_users[str(guest.id)] = guest

        return guest_users

    @staticmethod
    def _cap_visitors_per_product(rows, limit, first_key, last_key):
        """Keep only the first `limit` distinct visitors per product, ordered by
        first interaction (subscription entitlement cap). Returns rows re-sorted
        by most recent interaction, matching the uncapped ordering."""
        from collections import defaultdict
        counts = defaultdict(int)
        kept = []
        for row in sorted(rows, key=lambda r: r[first_key]):
            if counts[row['product_id']] < limit:
                counts[row['product_id']] += 1
                kept.append(row)
        kept.sort(key=lambda r: r[last_key], reverse=True)
        return kept

    @staticmethod
    def get_top_products(limit=10, days=30):
        start_date = timezone.now() - timedelta(days=days)

        top_products = Product.objects.filter(
            views__viewed_at__gte=start_date,
            is_active=True
        ).annotate(
            total_views=Count('views', distinct=True),
            unique_users=Count(
                'views__user',
                distinct=True,
                filter=Q(views__user__isnull=False)
            ),
            unique_guests=Count(
                'views__session_id',
                distinct=True,
                filter=Q(views__user__isnull=True, views__session_id__isnull=False)
            )
        ).order_by('-total_views')[:limit]

        result = []
        for product in top_products:
            try:
                vendor_name = product.vendor.vendor_profile.brand_name
            except:
                vendor_name = product.vendor.username

            result.append({
                'product_id': product.id,
                'product_name': product.name,
                'vendor_name': vendor_name,
                'total_views': product.total_views,
                'unique_views': product.unique_users + product.unique_guests,
            })

        return result

    @staticmethod
    def get_detailed_views_analytics(request=None, vendor=None, start_date=None, end_date=None, product_id=None, search=None, page=1, page_size=10, visitor_limit=None):

        queryset = ProductView.objects.all().select_related('product', 'product__vendor', 'user')

        if vendor:
            queryset = queryset.filter(product__vendor=vendor)

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        if start_date:
            queryset = queryset.filter(viewed_at__gte=start_date)
        if end_date:
            queryset = queryset.filter(viewed_at__lte=end_date)

        if search:
            queryset = queryset.filter(
                Q(product__name__icontains=search) |
                Q(user__username__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__mobile_number__icontains=search) |
                Q(session_id__icontains=search)
            )

        grouped_queryset = queryset.values(
            'product_id', 
            'product__name',
            'product__image',
            'product__category__name',
            'user_id',
            'user__username',
            'user__first_name',
            'user__last_name',
            'user__role',
            'user__mobile_number',
            'session_id'
        ).annotate(
            total_views=Count('id'),
            first_visit=Min('viewed_at'),
            last_visit=Max('viewed_at')
        ).order_by('-last_visit')

        if visitor_limit is not None:
            full_list = list(grouped_queryset)
            true_total = len(full_list)
            grouped_list = ProductAnalyticsService._cap_visitors_per_product(
                full_list, visitor_limit, 'first_visit', 'last_visit')
            visible_total = len(grouped_list)
        else:
            grouped_list = None
            visible_total = grouped_queryset.count()
            true_total = visible_total
        locked_count = max(0, true_total - visible_total)

        # Pagination walks only the visible (possibly capped) rows — there's
        # nothing to page into beyond that. total_items reported below is the
        # true distinct-visitor count so it matches the product list's badge;
        # locked_count + the capped row count together explain the gap.
        total_pages = max(1, (visible_total + page_size - 1) // page_size)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size
        items = grouped_list[start:end] if grouped_list is not None else list(grouped_queryset[start:end])

        guest_session_ids = [item['session_id'] for item in items if not item['user_id'] and item['session_id']]
        guest_users = ProductAnalyticsService._resolve_guest_users_by_device_or_id(guest_session_ids)

        results = []
        for item in items:
            u_type = 'guest'
            visitor_name = 'Guest User'
            mobile_number = None
            device = item['session_id']

            if item['user_id']:
                role = item['user__role']
                if role == User.VENDOR:
                    u_type = 'vendor'
                elif role == User.ADMIN:
                    u_type = 'admin'
                else:
                    u_type = 'customer'
                visitor_name = f"{item['user__first_name']} {item['user__last_name']}".strip() or item['user__username']
                mobile_number = item['user__mobile_number']
                device = None
            else:
                guest_user = guest_users.get(item['session_id'])
                if guest_user:
                    visitor_name = f"{guest_user.first_name} {guest_user.last_name}".strip() or guest_user.username or 'Guest User'
                    mobile_number = guest_user.mobile_number
                else:
                    visitor_name = f"Guest ({item['session_id'][:8]})" if item['session_id'] else "Guest User"
                u_type = 'guest'

            image_path = item['product__image']
            product_image_url = None
            if image_path:
                if request:
                    product_image_url = request.build_absolute_uri(f"/media/{image_path}")
                else:
                    from django.conf import settings
                    product_image_url = f"{settings.MEDIA_URL}{image_path}"

            results.append({
                'product_id': item['product_id'],
                'product_name': item['product__name'],
                'product_category': item.get('product__category__name'),
                'product_image': product_image_url,
                'visitor_name': visitor_name,
                'mobile_number': mobile_number,
                'device': device,
                'visit_count': item['total_views'],
                'first_visit': item['first_visit'].isoformat() if item['first_visit'] else None,
                'last_visit': item['last_visit'].isoformat() if item['last_visit'] else None,
            })

        total_views_count = queryset.count()
        visible_views_sum = sum(item['visit_count'] for item in results)

        return {
            'results': results,
            'total_items': true_total,
            'total_views': total_views_count,
            'hidden_views': max(0, total_views_count - visible_views_sum),
            'total_pages': total_pages,
            'current_page': page,
            'limit': page_size,
            'locked_count': locked_count,
        }

    @staticmethod
    def get_view_events_analytics(request=None, vendor=None, start_date=None, end_date=None, product_id=None, search=None, page=1, page_size=10, visitor_limit=None):
        """Ungrouped view log — one row per individual view event with its own
        timestamp, unlike get_detailed_views_analytics which groups all of a
        visitor's views into a single row. Backs the "Total Views" badge so it
        actually shows individual visits rather than reusing the per-visitor
        breakdown under a different title."""
        queryset = ProductView.objects.all().select_related('product', 'product__category', 'user')

        if vendor:
            queryset = queryset.filter(product__vendor=vendor)
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        if start_date:
            queryset = queryset.filter(viewed_at__gte=start_date)
        if end_date:
            queryset = queryset.filter(viewed_at__lte=end_date)
        if search:
            queryset = queryset.filter(
                Q(product__name__icontains=search) |
                Q(user__username__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__mobile_number__icontains=search) |
                Q(session_id__icontains=search)
            )

        total_views_count = queryset.count()

        visible_qs = queryset
        if visitor_limit is not None:
            # Plan cap is a flat row limit, not a distinct-visitor limit — the
            # oldest `visitor_limit` individual view events stay visible
            # (grandfathered, same spirit as the visitor-grouped listings),
            # everything after that is locked. This keeps the count on screen
            # always exactly matching the plan limit, regardless of how many
            # events a handful of visitors happen to generate.
            unlocked_ids = list(queryset.order_by('viewed_at').values_list('id', flat=True)[:visitor_limit])
            visible_qs = queryset.filter(id__in=unlocked_ids)

        visible_total = visible_qs.count()
        locked_count = max(0, total_views_count - visible_total)

        total_pages = max(1, (visible_total + page_size - 1) // page_size)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size
        items = list(visible_qs.order_by('-viewed_at')[start:end])

        guest_session_ids = [it.session_id for it in items if not it.user_id and it.session_id]
        guest_users = ProductAnalyticsService._resolve_guest_users_by_device_or_id(guest_session_ids)

        results = []
        for it in items:
            visitor_name = 'Guest User'
            mobile_number = None
            device = it.session_id

            if it.user_id:
                visitor_name = f"{it.user.first_name} {it.user.last_name}".strip() or it.user.username
                mobile_number = it.user.mobile_number
                device = None
            else:
                guest_user = guest_users.get(it.session_id)
                if guest_user:
                    visitor_name = f"{guest_user.first_name} {guest_user.last_name}".strip() or guest_user.username or 'Guest User'
                    mobile_number = guest_user.mobile_number
                else:
                    visitor_name = f"Guest ({it.session_id[:8]})" if it.session_id else "Guest User"

            image_path = it.product.image
            product_image_url = None
            if image_path:
                if request:
                    product_image_url = request.build_absolute_uri(f"/media/{image_path}")
                else:
                    from django.conf import settings
                    product_image_url = f"{settings.MEDIA_URL}{image_path}"

            results.append({
                'product_id': it.product_id,
                'product_name': it.product.name,
                'product_category': it.product.category.name if it.product.category_id else None,
                'product_image': product_image_url,
                'visitor_name': visitor_name,
                'mobile_number': mobile_number,
                'device': device,
                'viewed_at': it.viewed_at.isoformat(),
            })

        return {
            'results': results,
            'total_items': visible_total,
            'total_views': total_views_count,
            'locked_count': locked_count,
            'total_pages': total_pages,
            'current_page': page,
            'limit': page_size,
        }

    @staticmethod
    def get_detailed_favorites_analytics(request=None, vendor=None, start_date=None, end_date=None, product_id=None, user_id=None, guest_id=None, guest_device_id=None, search=None, page=1, page_size=10, visitor_limit=None):
        
        # Base queryset
        queryset = Favorite.objects.select_related('product', 'product__vendor', 'user')

        if vendor:
            queryset = queryset.filter(product__vendor=vendor)

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        if user_id:
            queryset = queryset.filter(user_id=user_id)
        elif guest_id and guest_device_id:
            queryset = queryset.filter(Q(user_id=guest_id) | Q(device_id=guest_device_id))
        elif guest_id:
            queryset = queryset.filter(user_id=guest_id)
        elif guest_device_id:
            queryset = queryset.filter(device_id=guest_device_id)

        if start_date:
            queryset = queryset.filter(created_at__gte=start_date)
        if end_date:
            queryset = queryset.filter(created_at__lte=end_date)

        # Group by product_id and user_id, aggregate to get first and last favorite dates
        grouped_queryset = queryset.values(
            'product_id', 'product__name', 'product__image', 'product__category__name', 'user_id', 'device_id', 
            'user__username', 'user__first_name', 'user__last_name', 'user__mobile_number'
        ).annotate(
            total_favorites=Count('id'),
            first_add=Min('created_at'),
            last_add=Max('created_at')
        ).order_by('-last_add')

        if search:
            # Apply search filters after grouping for product name and user info
            grouped_queryset = grouped_queryset.filter(
                Q(product__name__icontains=search) |
                Q(user__username__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__mobile_number__icontains=search) |
                Q(device_id__icontains=search)
            )

        # Convert to list for counting and pagination
        grouped_list = list(grouped_queryset)
        true_total = len(grouped_list)
        if visitor_limit is not None:
            grouped_list = ProductAnalyticsService._cap_visitors_per_product(
                grouped_list, visitor_limit, 'first_add', 'last_add')
        visible_total = len(grouped_list)
        locked_count = max(0, true_total - visible_total)
        total_pages = max(1, (visible_total + page_size - 1) // page_size)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size
        items = grouped_list[start:end]

        # Get guest user info for device_ids that don't have user_id
        guest_device_ids = [item['device_id'] for item in items if not item['user_id'] and item['device_id']]
        guest_users = ProductAnalyticsService._resolve_guest_users_by_device_or_id(guest_device_ids)

        results = []
        for item in items:
            visitor_name = 'Guest User'
            mobile_number = item.get('user__mobile_number')

            if item['user_id']:
                first_name = item.get('user__first_name') or ''
                last_name = item.get('user__last_name') or ''
                username = item.get('user__username') or ''
                visitor_name = f"{first_name} {last_name}".strip() or username
                mobile_number = mobile_number
            else:
                guest_user = guest_users.get(item['device_id'])
                if guest_user:
                    visitor_name = f"{guest_user.first_name} {guest_user.last_name}".strip() or guest_user.username or 'Guest User'
                    mobile_number = guest_user.mobile_number
                else:
                    visitor_name = f"Guest ({item['device_id'][:8]})" if item['device_id'] else "Guest User"

            product_image_url = None
            if item.get('product__image'):
                if request:
                    product_image_url = request.build_absolute_uri(f"/media/{item['product__image']}")
                else:
                    from django.conf import settings
                    product_image_url = f"{settings.MEDIA_URL}{item['product__image']}"

            results.append({
                'product_id': item['product_id'],
                'product_name': item['product__name'],
                'product_category': item.get('product__category__name'),
                'product_image': product_image_url,
                'visitor_name': visitor_name,
                'guest_id': item['user_id'] or item['device_id'],
                'mobile_number': mobile_number,
                'first_add': item['first_add'].isoformat() if item['first_add'] else None,
                'last_add': item['last_add'].isoformat() if item['last_add'] else None,
                'total_favorites': item['total_favorites']
            })

        return {
            'results': results,
            'total_items': true_total,
            'total_pages': total_pages,
            'current_page': page,
            'limit': page_size,
            'locked_count': locked_count,
        }

    @staticmethod
    def get_detailed_cart_analytics(request=None, vendor=None, start_date=None, end_date=None, product_id=None, user_id=None, guest_id=None, guest_device_id=None, search=None, page=1, page_size=10, visitor_limit=None):
        # Mirrors get_detailed_favorites_analytics for cart items.
        queryset = CartItem.objects.select_related('product', 'product__vendor', 'user')

        if vendor:
            queryset = queryset.filter(product__vendor=vendor)

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        if user_id:
            queryset = queryset.filter(user_id=user_id)
        elif guest_id and guest_device_id:
            queryset = queryset.filter(Q(user_id=guest_id) | Q(device_id=guest_device_id))
        elif guest_id:
            queryset = queryset.filter(user_id=guest_id)
        elif guest_device_id:
            queryset = queryset.filter(device_id=guest_device_id)

        if start_date:
            queryset = queryset.filter(created_at__gte=start_date)
        if end_date:
            queryset = queryset.filter(created_at__lte=end_date)

        grouped_queryset = queryset.values(
            'product_id', 'product__name', 'product__image', 'product__category__name', 'user_id', 'device_id',
            'user__username', 'user__first_name', 'user__last_name', 'user__mobile_number'
        ).annotate(
            total_cart_adds=Count('id'),
            first_add=Min('created_at'),
            last_add=Max('created_at')
        ).order_by('-last_add')

        if search:
            grouped_queryset = grouped_queryset.filter(
                Q(product__name__icontains=search) |
                Q(user__username__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__mobile_number__icontains=search) |
                Q(device_id__icontains=search)
            )

        grouped_list = list(grouped_queryset)
        true_total = len(grouped_list)
        if visitor_limit is not None:
            grouped_list = ProductAnalyticsService._cap_visitors_per_product(
                grouped_list, visitor_limit, 'first_add', 'last_add')
        visible_total = len(grouped_list)
        locked_count = max(0, true_total - visible_total)
        total_pages = max(1, (visible_total + page_size - 1) // page_size)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size
        items = grouped_list[start:end]

        guest_device_ids = [item['device_id'] for item in items if not item['user_id'] and item['device_id']]
        guest_users = ProductAnalyticsService._resolve_guest_users_by_device_or_id(guest_device_ids)

        results = []
        for item in items:
            visitor_name = 'Guest User'
            mobile_number = item.get('user__mobile_number')

            if item['user_id']:
                first_name = item.get('user__first_name') or ''
                last_name = item.get('user__last_name') or ''
                username = item.get('user__username') or ''
                visitor_name = f"{first_name} {last_name}".strip() or username
            else:
                guest_user = guest_users.get(item['device_id'])
                if guest_user:
                    visitor_name = f"{guest_user.first_name} {guest_user.last_name}".strip() or guest_user.username or 'Guest User'
                    mobile_number = guest_user.mobile_number
                else:
                    visitor_name = f"Guest ({item['device_id'][:8]})" if item['device_id'] else "Guest User"

            product_image_url = None
            if item.get('product__image'):
                if request:
                    product_image_url = request.build_absolute_uri(f"/media/{item['product__image']}")
                else:
                    from django.conf import settings
                    product_image_url = f"{settings.MEDIA_URL}{item['product__image']}"

            results.append({
                'product_id': item['product_id'],
                'product_name': item['product__name'],
                'product_category': item.get('product__category__name'),
                'product_image': product_image_url,
                'visitor_name': visitor_name,
                'guest_id': item['user_id'] or item['device_id'],
                'mobile_number': mobile_number,
                'first_add': item['first_add'].isoformat() if item['first_add'] else None,
                'last_add': item['last_add'].isoformat() if item['last_add'] else None,
                'total_cart_adds': item['total_cart_adds']
            })

        return {
            'results': results,
            'total_items': true_total,
            'total_pages': total_pages,
            'current_page': page,
            'limit': page_size,
            'locked_count': locked_count,
        }

    @staticmethod
    def get_detailed_clicks_analytics(request=None, vendor=None, start_date=None, end_date=None, product_id=None, search=None, page=1, page_size=10, visitor_limit=None):
        queryset = PurchaseLinkClick.objects.select_related('product', 'product__vendor', 'user')

        if vendor:
            queryset = queryset.filter(product__vendor=vendor)

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        if start_date:
            queryset = queryset.filter(clicked_at__gte=start_date)
        if end_date:
            queryset = queryset.filter(clicked_at__lte=end_date)

        if search:
            queryset = queryset.filter(
                Q(product__name__icontains=search) |
                Q(user__username__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__mobile_number__icontains=search) |
                Q(session_id__icontains=search)
            )

        grouped_queryset = queryset.values(
            'product_id', 'product__name', 'product__image', 'product__category__name', 'user_id', 'session_id', 'user__username',
            'user__first_name', 'user__last_name', 'user__mobile_number'
        ).annotate(
            total_clicks=Count('id'),
            first_click=Min('clicked_at'),
            last_click=Max('clicked_at')
        ).order_by('-last_click')

        # Convert to list for pagination
        grouped_list = list(grouped_queryset)
        true_total = len(grouped_list)
        if visitor_limit is not None:
            grouped_list = ProductAnalyticsService._cap_visitors_per_product(
                grouped_list, visitor_limit, 'first_click', 'last_click')
        visible_total = len(grouped_list)
        locked_count = max(0, true_total - visible_total)
        total_pages = max(1, (visible_total + page_size - 1) // page_size)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size
        items = grouped_list[start:end]

        guest_session_ids = [item['session_id'] for item in items if not item['user_id'] and item['session_id']]
        guest_users = ProductAnalyticsService._resolve_guest_users_by_device_or_id(guest_session_ids)

        results = []
        for item in items:
            visitor_name = 'Guest User'
            mobile_number = item.get('user__mobile_number')

            if item['user_id']:
                first_name = item.get('user__first_name') or ''
                last_name = item.get('user__last_name') or ''
                username = item.get('user__username') or ''
                visitor_name = f"{first_name} {last_name}".strip() or username
                mobile_number = mobile_number
            else:
                guest_user = guest_users.get(item['session_id'])
                if guest_user:
                    visitor_name = f"{guest_user.first_name} {guest_user.last_name}".strip() or guest_user.username or 'Guest User'
                    mobile_number = guest_user.mobile_number
                else:
                    visitor_name = f"Guest ({item['session_id'][:8]})" if item['session_id'] else 'Guest User'

            product_image_url = None
            if item.get('product__image'):
                if request:
                    product_image_url = request.build_absolute_uri(f"/media/{item['product__image']}")
                else:
                    from django.conf import settings
                    product_image_url = f"{settings.MEDIA_URL}{item['product__image']}"

            results.append({
                'product_id': item['product_id'],
                'product_name': item['product__name'],
                'product_category': item.get('product__category__name'),
                'product_image': product_image_url,
                'visitor_name': visitor_name,
                'mobile_number': mobile_number,
                'first_click': item['first_click'].isoformat() if item['first_click'] else None,
                'last_click': item['last_click'].isoformat() if item['last_click'] else None,
                'total_clicks': item['total_clicks']
            })

        return {
            'results': results,
            'total_items': true_total,
            'total_pages': total_pages,
            'current_page': page,
            'limit': page_size,
            'locked_count': locked_count,
        }

    @staticmethod
    def get_click_events_analytics(request=None, vendor=None, start_date=None, end_date=None, product_id=None, search=None, page=1, page_size=10, visitor_limit=None):
        """Ungrouped purchase-link-click log — one row per individual click
        event with its own timestamp, mirroring get_view_events_analytics.
        Backs the merged Product Analytics page so each click shows as its
        own row instead of being summed into a per-visitor 'Total Clicks'."""
        queryset = PurchaseLinkClick.objects.select_related('product', 'product__category', 'user')

        if vendor:
            queryset = queryset.filter(product__vendor=vendor)
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        if start_date:
            queryset = queryset.filter(clicked_at__gte=start_date)
        if end_date:
            queryset = queryset.filter(clicked_at__lte=end_date)
        if search:
            queryset = queryset.filter(
                Q(product__name__icontains=search) |
                Q(user__username__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__mobile_number__icontains=search) |
                Q(session_id__icontains=search)
            )

        total_clicks_count = queryset.count()

        visible_qs = queryset
        if visitor_limit is not None:
            unlocked_ids = list(queryset.order_by('clicked_at').values_list('id', flat=True)[:visitor_limit])
            visible_qs = queryset.filter(id__in=unlocked_ids)

        visible_total = visible_qs.count()
        locked_count = max(0, total_clicks_count - visible_total)

        total_pages = max(1, (visible_total + page_size - 1) // page_size)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size
        items = list(visible_qs.order_by('-clicked_at')[start:end])

        guest_session_ids = [it.session_id for it in items if not it.user_id and it.session_id]
        guest_users = ProductAnalyticsService._resolve_guest_users_by_device_or_id(guest_session_ids)

        results = []
        for it in items:
            visitor_name = 'Guest User'
            mobile_number = None

            if it.user_id:
                visitor_name = f"{it.user.first_name} {it.user.last_name}".strip() or it.user.username
                mobile_number = it.user.mobile_number
            else:
                guest_user = guest_users.get(it.session_id)
                if guest_user:
                    visitor_name = f"{guest_user.first_name} {guest_user.last_name}".strip() or guest_user.username or 'Guest User'
                    mobile_number = guest_user.mobile_number
                else:
                    visitor_name = f"Guest ({it.session_id[:8]})" if it.session_id else "Guest User"

            image_path = it.product.image
            product_image_url = None
            if image_path:
                if request:
                    product_image_url = request.build_absolute_uri(f"/media/{image_path}")
                else:
                    from django.conf import settings
                    product_image_url = f"{settings.MEDIA_URL}{image_path}"

            results.append({
                'product_id': it.product_id,
                'product_name': it.product.name,
                'product_category': it.product.category.name if it.product.category_id else None,
                'product_image': product_image_url,
                'visitor_name': visitor_name,
                'mobile_number': mobile_number,
                'device': it.device_type,
                'clicked_at': it.clicked_at.isoformat(),
            })

        return {
            'results': results,
            'total_items': visible_total,
            'total_clicks': total_clicks_count,
            'locked_count': locked_count,
            'total_pages': total_pages,
            'current_page': page,
            'limit': page_size,
        }

    @staticmethod
    def _cap_interactions_per_product(rows, limit):
        """Keep only the first `limit` interactions **of any type combined**
        per product, ordered oldest-first (grandfathered — matches
        `_cap_visitors_per_product`'s convention), then re-sort the kept rows
        most-recent-first for display. Unlike `_cap_visitors_per_product`,
        this caps the merged view+favorite+click+cart total per product, not
        each type independently."""
        from collections import defaultdict
        counts = defaultdict(int)
        kept = []
        for row in sorted(rows, key=lambda r: r['timestamp'] or ''):
            if counts[row['product_id']] < limit:
                counts[row['product_id']] += 1
                kept.append(row)
        kept.sort(key=lambda r: r['timestamp'] or '', reverse=True)
        return kept

    #: query-param/`type` field values accepted by `get_merged_analytics`'s
    #: `interaction_type` filter, and used as the `type` value on every
    #: merged row — kept in one place so the view layer can validate against it.
    INTERACTION_TYPES = ('view', 'favorite', 'purchase_link_click', 'cart')

    @staticmethod
    def get_merged_analytics(request=None, vendor=None, start_date=None, end_date=None, product_id=None, search=None, page=1, page_size=10,
                              views_limit=None, favorites_limit=None, clicks_limit=None, cart_limit=None, interaction_type=None):
        """Every interaction as its own row — no grouping/counting by visitor
        — capped as ONE combined limit per product across all four types, not
        per type. E.g. a plan limit of 2 means the oldest 2 interactions of
        ANY kind (view, favorite, click, cart add) stay visible per product,
        not 2 of each kind (which would let a capped-at-2 vendor see up to 8
        rows for a single product). Each type is fetched fully uncapped here
        and the combined limit is applied once, after merging, so the cap is
        enforced against the true combined total.

        `interaction_type` (one of `INTERACTION_TYPES`), if given, restricts
        the result to just that one type — the other three types aren't
        fetched at all rather than being fetched and discarded.

        Views and clicks are logged once per event already, so they're
        pulled from the ungrouped *_events_analytics queries; favorites/cart
        are naturally one row per user+product (unique_together on the
        model), so the existing grouped queries already return exactly one
        row per interaction for those two types."""

        wants = lambda t: interaction_type is None or interaction_type == t

        # Individual view events (one row per pageview, not per visitor)
        visitors_data = ProductAnalyticsService.get_view_events_analytics(
            request=request,
            vendor=vendor,
            start_date=start_date,
            end_date=end_date,
            product_id=product_id,
            search=search,
            page=1,  # Get all for merging
            page_size=10000,  # Large page size to get all records
            visitor_limit=None,  # cap applied once, after merging
        ) if wants('view') else None

        # Get favorites analytics
        favorites_data = ProductAnalyticsService.get_detailed_favorites_analytics(
            request=request,
            vendor=vendor,
            start_date=start_date,
            end_date=end_date,
            product_id=product_id,
            search=search,
            page=1,  # Get all for merging
            page_size=10000,  # Large page size to get all records
            visitor_limit=None,
        ) if wants('favorite') else None

        # Merge results
        merged_results = []

        # Add individual view-event records
        if visitors_data and visitors_data.get('results'):
            for item in visitors_data['results']:
                merged_item = item.copy()
                merged_item['type'] = 'view'
                merged_item['timestamp'] = merged_item.get('viewed_at')
                merged_results.append(merged_item)

        # Add favorite records
        if favorites_data and favorites_data.get('results'):
            for item in favorites_data['results']:
                merged_item = item.copy()
                merged_item['type'] = 'favorite'
                merged_item['timestamp'] = merged_item.get('last_add')
                merged_results.append(merged_item)

        # Add individual click-event records
        clicks_data = ProductAnalyticsService.get_click_events_analytics(
            request=request,
            vendor=vendor,
            start_date=start_date,
            end_date=end_date,
            product_id=product_id,
            search=search,
            page=1,
            page_size=10000,
            visitor_limit=None,
        ) if wants('purchase_link_click') else None

        if clicks_data and clicks_data.get('results'):
            for item in clicks_data['results']:
                merged_item = item.copy()
                merged_item['type'] = 'purchase_link_click'
                merged_item['timestamp'] = merged_item.get('clicked_at')
                merged_results.append(merged_item)

        # Add cart-add records
        cart_data = ProductAnalyticsService.get_detailed_cart_analytics(
            request=request,
            vendor=vendor,
            start_date=start_date,
            end_date=end_date,
            product_id=product_id,
            search=search,
            page=1,
            page_size=10000,
            visitor_limit=None,
        ) if wants('cart') else None

        if cart_data and cart_data.get('results'):
            for item in cart_data['results']:
                merged_item = item.copy()
                merged_item['type'] = 'cart'
                merged_item['timestamp'] = merged_item.get('last_add')
                merged_results.append(merged_item)

        true_total = len(merged_results)

        # A single combined per-product cap, not one per type — take the
        # most restrictive of the four entitlement limits (matches the
        # conservative "min" already used for the display hint below).
        applied_limits = [l for l in (views_limit, favorites_limit, clicks_limit, cart_limit) if l is not None]
        visitor_limit = min(applied_limits) if applied_limits else None

        if visitor_limit is not None:
            merged_results = ProductAnalyticsService._cap_interactions_per_product(merged_results, visitor_limit)
        else:
            merged_results.sort(key=lambda x: x['timestamp'] or '1970-01-01T00:00:00', reverse=True)

        visible_total = len(merged_results)
        locked_count = max(0, true_total - visible_total)

        # Apply pagination
        total_items = visible_total
        total_pages = max(1, (total_items + page_size - 1) // page_size)

        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size
        paginated_results = merged_results[start:end]

        return {
            'results': paginated_results,
            'total_items': total_items,
            'total_pages': total_pages,
            'current_page': page,
            'limit': page_size,
            'locked_count': locked_count,
            'limited': locked_count > 0,
            'visitor_limit': visitor_limit,
        }

