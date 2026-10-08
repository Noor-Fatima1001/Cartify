from django.urls import reverse
from rest_framework import serializers
from app.marketplace.models.product import Product, Favorite, SubCategory
from app.auth.models.vendor import VendorProfile
from app.scrape.models.scrapeModel import Categories
from app.marketplace.models.category_settings import VendorCategorySetting
from django.conf import settings
from django.core.files.storage import default_storage
from django.utils.text import get_valid_filename
from uuid import uuid4
from app.auth.models.user import User
from PIL import Image, UnidentifiedImageError
import json

MAX_PRODUCT_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB, matches billing screenshot limit
MAX_PRODUCT_IMAGES = 8
PRODUCT_IMAGE_ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}

class ProductSerializer(serializers.ModelSerializer):
    vendor_name = serializers.ReadOnlyField(source='vendor.vendor_profile.brand_name')
    vendor_city = serializers.ReadOnlyField(source='vendor.city')
    categories = serializers.SerializerMethodField()
    category_name = serializers.ReadOnlyField(source='category.name')
    subcategory_name = serializers.ReadOnlyField(source='subcategory.name')
    images = serializers.ListField(child=serializers.CharField(), read_only=True)
    new_images = serializers.ListField(child=serializers.ImageField(), write_only=True, required=False)
    total_views = serializers.IntegerField(read_only=True)
    unique_visitors = serializers.IntegerField(read_only=True)
    favorite_count = serializers.SerializerMethodField(read_only=True)
    purchase_short_link = serializers.SerializerMethodField(read_only=True)
    purchase_click_count = serializers.SerializerMethodField(read_only=True)
    cart_count = serializers.SerializerMethodField(read_only=True)
    is_premium_active = serializers.BooleanField(read_only=True)
    is_favorited = serializers.SerializerMethodField(read_only=True)
    in_cart = serializers.SerializerMethodField(read_only=True)
    can_add_to_cart = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'vendor', 'vendor_name', 'vendor_city', 'categories', 'category_name', 'subcategory_name',
            'name', 'price', 'discount', 'original_price', 'product_type',
            'description', 'image', 'images', 'new_images', 'created_at', 'is_active',
            'total_views', 'unique_visitors', 'favorite_count',
            'category', 'subcategory',
            'purchase_link',
            'purchase_short_link',
            'purchase_click_count',
            'cart_count',
            'is_premium',
            'is_premium_active',
            'is_favorited',
            'in_cart',
            'can_add_to_cart',
        ]
        read_only_fields = ['vendor', 'created_at', 'total_views', 'unique_visitors', 'favorite_count', 'is_premium_active', 'purchase_short_link']

    def get_purchase_click_count(self, obj):
        try:
            from app.marketplace.models.purchase_click import PurchaseLinkClick
            # Distinct clickers, not raw click events — matches the grouping
            # used by the "detailed clicks" analytics popup (grouped by
            # user_id/session_id) so the list badge and the popup total agree.
            return PurchaseLinkClick.objects.filter(product=obj).values('user_id', 'session_id').distinct().count()
        except Exception:
            return 0

    def get_cart_count(self, obj):
        try:
            from app.marketplace.models.cart import CartItem
            return CartItem.objects.filter(product=obj).count()
        except Exception:
            return 0

    def _resolve_viewer(self):
        """Returns (user, device_id) for the current request, mirroring the guest
        resolution logic used by toggle_favorite/add_to_cart."""
        request = self.context.get('request') if hasattr(self, 'context') else None
        if not request:
            return None, None
        user = request.user if request.user.is_authenticated else None
        is_guest_user = user and getattr(user, 'role', None) == User.ANONYMOUS
        device_id = None
        if is_guest_user:
            device_id = getattr(user, 'device_id', None)
            user = None
        if not device_id:
            device_id = request.GET.get('device_id') or request.headers.get('X-Device-Id') or request.session.get('guest_device_id')
        return user, device_id

    def get_is_favorited(self, obj):
        user, device_id = self._resolve_viewer()
        if not user and not device_id:
            return False
        if user:
            return obj.favorited_by.filter(user=user).exists()
        guest_user = User.objects.filter(device_id=device_id, role=User.ANONYMOUS).first()
        if guest_user:
            return obj.favorited_by.filter(user=guest_user).exists()
        return obj.favorited_by.filter(device_id=device_id, user__isnull=True).exists()

    def get_in_cart(self, obj):
        try:
            from app.marketplace.models.cart import CartItem
        except Exception:
            return False
        user, device_id = self._resolve_viewer()
        if not user and not device_id:
            return False
        if user:
            return CartItem.objects.filter(user=user, product=obj).exists()
        guest_user = User.objects.filter(device_id=device_id, role=User.ANONYMOUS).first()
        if guest_user:
            return CartItem.objects.filter(user=guest_user, product=obj).exists()
        return CartItem.objects.filter(device_id=device_id, user__isnull=True, product=obj).exists()

    def get_categories(self, obj):
        category = obj.category
        subcategories = []
        if obj.subcategory:
            subcategories.append({
                'id': obj.subcategory.id,
                'name': obj.subcategory.name
            })
        return [{
            'id': category.id,
            'name': category.name,
            'subcategories': subcategories
        }]

    def get_can_add_to_cart(self, obj):
        try:
            from app.billing.service.subscription_service import vendor_allows_cart
        except Exception:
            return False
        try:
            return bool(vendor_allows_cart(obj.vendor))
        except Exception:
            return False

    def get_purchase_short_link(self, obj):
        if not obj.purchase_short_code:
            return None

        request = self.context.get('request') if hasattr(self, 'context') else None
        try:
            url = reverse('purchase_link_redirect', args=[obj.purchase_short_code])
        except Exception:
            url = f'/api/marketplace/products/short/{obj.purchase_short_code}/'

        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def validate(self, data):
        # Allow the instance values to be used during partial updates.
        request = self.context.get('request') if hasattr(self, 'context') else None

        self._validate_new_images(request)

        try:
            raw = request.data if request is not None else {}
        except Exception:
            raw = {}

        if 'categories' in raw and 'category' not in data:
            raw_cats = raw.get('categories')
            cat_obj = None
            try:
                # cases: list of ids, list of dicts, single id, single dict
                if isinstance(raw_cats, list) and raw_cats:
                    first = raw_cats[0]
                    if isinstance(first, dict) and 'id' in first:
                        cid = first.get('id')
                    else:
                        cid = first
                elif isinstance(raw_cats, dict) and 'id' in raw_cats:
                    cid = raw_cats.get('id')
                else:
                    cid = raw_cats
                if cid is not None and cid != '':
                    try:
                        cid_int = int(cid)
                    except Exception:
                        cid_int = None
                    if cid_int:
                        cat_obj = Categories.objects.filter(id=cid_int).first()
            except Exception:
                cat_obj = None

            if cat_obj:
                data['category'] = cat_obj

        category = data.get('category', getattr(self.instance, 'category', None))
        subcategory = data.get('subcategory', getattr(self.instance, 'subcategory', None))
        price = data.get('price', getattr(self.instance, 'price', None))
        original_price = data.get('original_price', getattr(self.instance, 'original_price', None))

        if original_price and price is not None:
            if price > original_price:
                raise serializers.ValidationError("Price cannot be greater than original price.")
            # Auto-calculate discount percentage
            if original_price > 0:
                data['discount'] = int(round(((original_price - price) / original_price) * 100))
            else:
                data['discount'] = 0

        if not category and not subcategory:
            raise serializers.ValidationError({
                'category': 'Category or subcategory is required',
                'subcategory': 'Category or subcategory is required'
            })

        if subcategory:
            if category and subcategory.category_id != category.id:
                raise serializers.ValidationError({'subcategory': 'Subcategory must belong to the chosen category.'})
            category = subcategory.category

        if category and category.subcategories.exists() and not subcategory:
            raise serializers.ValidationError("Please select a subcategory for this category.")

        data['category'] = category
        # Vendor-specific category assignment validation
        try:
            user = request.user if request else None
        except Exception:
            user = None

        from app.auth.models.user import User as AuthUser
        if user and getattr(user, 'role', None) == AuthUser.VENDOR:
            vendor = user
            assigned_ids = list(VendorCategorySetting.objects.filter(vendor=vendor, is_disabled=False).values_list('category_id', flat=True))
            custom_ids = list(Categories.objects.filter(User_name=vendor).values_list('id', flat=True))
            allowed_ids = set(assigned_ids) | set(custom_ids)

            if not allowed_ids:
                raise serializers.ValidationError("No category has been assigned to your account. Please contact the administrator.")

            if category and category.id not in allowed_ids:
                raise serializers.ValidationError({'category': 'The selected category is not assigned to your account.'})

        # Product name must be unique per vendor (case-insensitive) — two
        # different vendors may still sell something with the same generic
        # name, so this is scoped per-vendor rather than a global constraint.
        name = data.get('name', getattr(self.instance, 'name', None))
        if name:
            if self.instance:
                name_check_vendor = self.instance.vendor
            elif user and getattr(user, 'role', None) == AuthUser.VENDOR:
                name_check_vendor = user
            else:
                vendor_id = raw.get('vendor_id')
                name_check_vendor = AuthUser.objects.filter(id=vendor_id).first() if vendor_id else None

            if name_check_vendor:
                dupe_qs = Product.objects.filter(vendor=name_check_vendor, name__iexact=name.strip())
                if self.instance:
                    dupe_qs = dupe_qs.exclude(pk=self.instance.pk)
                if dupe_qs.exists():
                    raise serializers.ValidationError({'name': 'You already have a product with this name.'})

        return data

    def _build_absolute_url(self, path, request=None):
        if not path:
            return None
        if path.startswith('http://') or path.startswith('https://'):
            return path

        normalized_path = path
        if not normalized_path.startswith('/'):
            normalized_path = f"{settings.MEDIA_URL.rstrip('/')}/{normalized_path}"

        if request is not None:
            return request.build_absolute_uri(normalized_path)
        return normalized_path

    def _delete_image_files(self, image_paths):
        for image_path in image_paths or []:
            try:
                if default_storage.exists(image_path):
                    default_storage.delete(image_path)
            except Exception:
                pass

    def _validate_new_images(self, request):
        """Runs before any DB write (called from validate()) so a bad upload
        never leaves a product half-saved. The images/new_images fields on
        this serializer don't carry real files (see class docstring context:
        `images` is read-only, `new_images` is never actually populated by the
        frontend), so this is the only place that ever inspects the raw
        uploaded bytes — nothing here can be skipped by relying on DRF's
        automatic ImageField validation."""
        if request is None:
            return

        new_images = (
            request.FILES.getlist('images') or
            request.FILES.getlist('images[]') or
            request.FILES.getlist('new_images') or []
        )
        if not new_images:
            return

        for image in new_images:
            ext = image.name.rsplit('.', 1)[-1].lower() if '.' in image.name else ''
            if ext not in PRODUCT_IMAGE_ALLOWED_EXTENSIONS:
                raise serializers.ValidationError({
                    'images': f"'{image.name}': unsupported file type. Allowed: "
                              f"{', '.join(sorted(PRODUCT_IMAGE_ALLOWED_EXTENSIONS))}."
                })
            if image.size > MAX_PRODUCT_IMAGE_SIZE_BYTES:
                raise serializers.ValidationError({
                    'images': f"'{image.name}' is larger than "
                              f"{MAX_PRODUCT_IMAGE_SIZE_BYTES // (1024 * 1024)}MB."
                })
            try:
                image.seek(0)
                with Image.open(image) as img:
                    img.verify()
            except (UnidentifiedImageError, OSError, ValueError):
                raise serializers.ValidationError({'images': f"'{image.name}' is not a valid image file."})
            finally:
                image.seek(0)

        existing_count = len((self.instance.images if self.instance else None) or [])
        raw_deleted = request.data.get('deleted_images') or request.data.get('remove_images')
        deleted_count = 0
        if raw_deleted:
            try:
                deleted = json.loads(raw_deleted)
            except Exception:
                deleted = [s.strip() for s in raw_deleted.split(',') if s.strip()] if isinstance(raw_deleted, str) else raw_deleted
            deleted_count = len(deleted) if isinstance(deleted, list) else 0

        total_after = max(0, existing_count - deleted_count) + len(new_images)
        if total_after > MAX_PRODUCT_IMAGES:
            raise serializers.ValidationError({
                'images': f"A product can have at most {MAX_PRODUCT_IMAGES} images "
                          f"(this would result in {total_after})."
            })

    def _normalize_path(self, path):
        if not path:
            return None
        if path.startswith('http://') or path.startswith('https://'):
            parts = path.split('/media/')
            if len(parts) > 1:
                return parts[1].lstrip('/')
            from urllib.parse import urlparse
            parsed = urlparse(path)
            rel_path = parsed.path
            if rel_path.startswith(settings.MEDIA_URL):
                return rel_path[len(settings.MEDIA_URL):].lstrip('/')
            return rel_path.lstrip('/')
        
        if path.startswith(settings.MEDIA_URL):
            return path[len(settings.MEDIA_URL):].lstrip('/')
        return path.lstrip('/')

    def _process_images_payload(self, product, request):
        if request is None:
            return

        has_new_images = ('images' in request.FILES or 
                          'images[]' in request.FILES or 
                          'new_images' in request.FILES)
        has_order = ('image_order' in request.data)
        has_deletions = ('deleted_images' in request.data or 'remove_images' in request.data)

        if request.method in ['PUT', 'PATCH'] and not (has_new_images or has_order or has_deletions):
            return

    
        new_images = request.FILES.getlist('images') or request.FILES.getlist('images[]') or request.FILES.getlist('new_images') or []

    
        image_order = []
        deleted_images = []
        
        raw_order = request.data.get('image_order')
        raw_deleted = request.data.get('deleted_images') or request.data.get('remove_images')

        if raw_order:
            try:
                image_order = json.loads(raw_order)
            except Exception:
                if isinstance(raw_order, str):
                    image_order = [s.strip() for s in raw_order.split(',') if s.strip()]
                elif isinstance(raw_order, list):
                    image_order = raw_order

        if raw_deleted:
            try:
                deleted_images = json.loads(raw_deleted)
            except Exception:
                if isinstance(raw_deleted, str):
                    deleted_images = [s.strip() for s in raw_deleted.split(',') if s.strip()]
                elif isinstance(raw_deleted, list):
                    deleted_images = raw_deleted

        existing_images = list(product.images or [])
        normalized_deleted = [self._normalize_path(p) for p in deleted_images if p]
        
        remaining_existing = []
        to_delete_files = []
        for img in existing_images:
            normalized_img = self._normalize_path(img)
            if normalized_img in normalized_deleted:
                to_delete_files.append(img)
            else:
                remaining_existing.append(img)
                
        self._delete_image_files(to_delete_files)


        saved_new_images = {} 
        for image in new_images:
            if not image:
                continue
            filename = get_valid_filename(image.name)
            unique_path = f"product_images/{uuid4().hex}_{filename}"
            saved_path = default_storage.save(unique_path, image)
            saved_new_images[image.name] = saved_path

        final_images = []
        placed_new_images = set()

        if image_order:
            for item in image_order:
                normalized_item = self._normalize_path(item)
    
                matched_existing = None
                for ext_img in remaining_existing:
                    if self._normalize_path(ext_img) == normalized_item:
                        matched_existing = ext_img
                        break
                
                if matched_existing:
                    final_images.append(matched_existing)
                    remaining_existing.remove(matched_existing)
                elif item in saved_new_images:
                    final_images.append(saved_new_images[item])
                    placed_new_images.add(item)
                else:
                
                    matched_new = None
                    for orig_name, saved_path in saved_new_images.items():
                        if orig_name == item or get_valid_filename(orig_name) == item or orig_name.endswith(item):
                            matched_new = saved_path
                            placed_new_images.add(orig_name)
                            break
                    if matched_new:
                        final_images.append(matched_new)

       
        final_images.extend(remaining_existing)

       
        for orig_name, saved_path in saved_new_images.items():
            if orig_name not in placed_new_images:
                final_images.append(saved_path)

    
        product.images = final_images
        product.image = final_images[0] if final_images else None
        product.save(update_fields=['images', 'image'])

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')

        if instance.image:
            try:
                data['image'] = self._build_absolute_url(instance.image.url, request)
            except Exception:
                data['image'] = None
        else:
            data['image'] = None

        data['images'] = [self._build_absolute_url(image_path, request) for image_path in (instance.images or [])]
        try:
            user = request.user if request else None
            is_admin = False
            if user and getattr(user, 'is_authenticated', False):
                is_admin = user.role == User.ADMIN or user.is_staff or user.is_superuser
        except Exception:
            is_admin = False

        include_total_views = self.context.get('include_total_views', False)
        if not is_admin and not include_total_views and 'total_views' in data:
            data.pop('total_views', None)

        # Provide a compat field name used by frontend in various places
        data['favorites_count'] = data.get('favorite_count', 0)

        return data

    def get_favorite_count(self, obj):
        annotated_count = getattr(obj, 'favorite_count', None)
        if annotated_count is not None:
            return annotated_count
        related = getattr(obj, 'favorited_by', None)
        if related is None:
            return 0
        if hasattr(related, 'count'):
            try:
                return related.count()
            except TypeError:
                return len(related)
        return len(related)

    def create(self, validated_data):
        validated_data.pop('new_images', [])
        # Convert primary keys to model instances if necessary (robustness for multipart/form-data)
        if 'category' in validated_data and validated_data.get('category') and not hasattr(validated_data.get('category'), 'id'):
            try:
                validated_data['category'] = Categories.objects.filter(id=int(validated_data['category'])).first()
            except Exception:
                pass

        if 'subcategory' in validated_data and validated_data.get('subcategory'):
            # subcategory may be pk or instance
            sub = validated_data.get('subcategory')
            if not hasattr(sub, 'id'):
                try:
                    sub = SubCategory.objects.filter(id=int(sub)).first()
                except Exception:
                    sub = None
            if sub:
                validated_data['subcategory'] = sub
                validated_data['category'] = sub.category
        product = super().create(validated_data)
        request = self.context.get('request')
        self._process_images_payload(product, request)
        return product

    def update(self, instance, validated_data):
        validated_data.pop('new_images', [])
        # Convert PKs to instances in updates as well
        if 'category' in validated_data and validated_data.get('category') and not hasattr(validated_data.get('category'), 'id'):
            try:
                validated_data['category'] = Categories.objects.filter(id=int(validated_data['category'])).first()
            except Exception:
                pass

        if 'subcategory' in validated_data and validated_data.get('subcategory'):
            sub = validated_data.get('subcategory')
            if not hasattr(sub, 'id'):
                try:
                    sub = SubCategory.objects.filter(id=int(sub)).first()
                except Exception:
                    sub = None
            if sub:
                validated_data['subcategory'] = sub
                validated_data['category'] = sub.category
        product = super().update(instance, validated_data)
        request = self.context.get('request')
        self._process_images_payload(product, request)
        return product

class FavoriteSerializer(serializers.ModelSerializer):
    product_details = ProductSerializer(source='product', read_only=True)
    
    class Meta:
        model = Favorite
        fields = ['id', 'user', 'device_id', 'product', 'product_details', 'created_at']
        read_only_fields = ['user', 'created_at']

class SubCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SubCategory
        fields = ['id', 'name']

class CategorySerializer(serializers.ModelSerializer):
    subcategories = SubCategorySerializer(many=True, read_only=True)
    image = serializers.SerializerMethodField()
    
    class Meta:
        model = Categories
        fields = ['id', 'name', 'is_active', 'subcategories', 'image']

    def get_image(self, obj):
        request = self.context.get('request') if hasattr(self, 'context') else None
        if not obj or not getattr(obj, 'image', None):
            return None
        try:
            if request:
                return request.build_absolute_uri(obj.image.url)
        except Exception:
            pass
        try:
            return obj.image.url
        except Exception:
            return None
