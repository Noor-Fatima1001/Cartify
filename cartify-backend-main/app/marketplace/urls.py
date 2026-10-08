from django.urls import path
from .views import product_views, category_views, admin_views, vendor_views, analytics_views, cart_views

urlpatterns = [
    # Products (public feed + vendor upload)
    path('feed/', product_views.product_feed, name='product_feed'),
    path('products/trending/', product_views.trending_products, name='trending_products'),
    path('upload/', product_views.upload_product, name='upload_product'),
    path('favorite/', product_views.toggle_favorite, name='toggle_favorite'),
    path('favorites/', product_views.list_favorites, name='list_favorites'),

    # Cart
    path('cart/', cart_views.get_cart, name='get_cart'),
    path('cart/add/', cart_views.add_to_cart, name='add_to_cart'),
    path('cart/remove/', cart_views.remove_from_cart, name='remove_from_cart'),


    # Product Detail & Analytics
    path('products/<int:product_id>/', product_views.get_product_detail, name='product_detail'),
    path('products/short/<str:short_code>/', product_views.purchase_link_redirect, name='purchase_link_redirect'),
    path('products/<int:product_id>/related/', product_views.related_products, name='related_products'),
    path('products/<int:product_id>/analytics/', analytics_views.get_product_analytics, name='product_analytics'),
    path('products/<int:product_id>/view-history/', analytics_views.get_product_view_history, name='product_view_history'),
    path('vendor/analytics/views/', analytics_views.vendor_detailed_views, name='vendor_detailed_views'),
    path('vendor/analytics/favorites/', analytics_views.vendor_detailed_favorites, name='vendor_detailed_favorites'),
    path('vendor/analytics/merged/', analytics_views.vendor_merged_analytics, name='vendor_merged_analytics'),
    path('vendor/analytics/clicks/', analytics_views.vendor_detailed_clicks, name='vendor_detailed_clicks'),
    path('vendor/analytics/cart/', analytics_views.vendor_detailed_cart, name='vendor_detailed_cart'),
    path('admin/analytics/views/', analytics_views.admin_detailed_views, name='admin_detailed_views'),
    path('admin/analytics/favorites/', analytics_views.admin_detailed_favorites, name='admin_detailed_favorites'),
    path('admin/analytics/clicks/', analytics_views.admin_detailed_clicks, name='admin_detailed_clicks'),
    path('admin/analytics/merged/', analytics_views.admin_merged_analytics, name='admin_merged_analytics'),
    path('admin/analytics/cart/', analytics_views.admin_detailed_cart, name='admin_detailed_cart'),

    # Categories (public)
    path('categories/', category_views.list_categories, name='list_categories'),
    path('categories/visibility/', category_views.manage_category_visibility, name='manage_category_visibility'),
    path('categories/create/', category_views.create_custom_category, name='create_custom_category'),
    path('public/vendors-and-categories/', category_views.public_vendors_and_categories, name='public_vendors_and_categories'),

    # Vendor Self-Service
    path('vendor/update-profile/', vendor_views.update_vendor_profile, name='update_vendor_profile'),
    path('vendor/products/', vendor_views.vendor_products, name='vendor_products'),
    path('vendor/products/<int:product_id>/', vendor_views.vendor_product_detail, name='vendor_product_detail'),
    path('vendor/products/<int:product_id>/edit/', vendor_views.edit_vendor_product, name='edit_vendor_product'),
    path('vendor/products/<int:product_id>/delete/', vendor_views.delete_vendor_product, name='delete_vendor_product'),
    path('vendor/products/<int:product_id>/activate-premium/', vendor_views.activate_premium, name='vendor_activate_premium'),
    path('vendor/categories/assigned/', vendor_views.vendor_assigned_categories, name='vendor_assigned_categories'),

    # Admin – Vendors
    path('admin/vendors/', admin_views.list_vendors, name='admin_list_vendors'),
    path('admin/vendors/<int:vendor_id>/', admin_views.get_vendor_detail, name='admin_vendor_detail'),
    path('admin/vendors/<int:vendor_id>/edit/', admin_views.admin_edit_vendor, name='admin_edit_vendor'),
    path('admin/vendors/<int:vendor_id>/assign-categories/', admin_views.admin_assign_categories, name='admin_assign_categories'),
    path('admin/vendors/<int:vendor_id>/delete/', admin_views.admin_delete_vendor, name='admin_delete_vendor'),
    path('admin/vendors/<int:vendor_id>/toggle/', admin_views.toggle_vendor_active, name='admin_toggle_vendor'),
    path('admin/create-vendor/', admin_views.admin_create_vendor, name='admin_create_vendor'),
    path('admin/approve-vendor/', admin_views.approve_vendor, name='admin_approve_vendor'),

    # Admin – Products
    path('admin/products/', admin_views.admin_list_products, name='admin_list_products'),
    path('admin/products/<int:product_id>/', admin_views.admin_delete_product, name='admin_delete_product'),
    path('admin/products/<int:product_id>/edit/', admin_views.admin_edit_product, name='admin_edit_product'),
    path('admin/products/<int:product_id>/toggle/', admin_views.admin_toggle_product, name='admin_toggle_product'),
    path('admin/products/<int:product_id>/manage-premium/', admin_views.manage_premium, name='admin_manage_premium'),
    path('admin/post-on-behalf/', admin_views.admin_post_product, name='admin_post_on_behalf'),

    # Admin – Categories
    path('admin/categories/', admin_views.admin_list_categories, name='admin_list_categories'),
    path('admin/categories/create/', admin_views.admin_create_category, name='admin_create_category'),
    path('admin/categories/<int:category_id>/edit/', admin_views.admin_edit_category, name='admin_edit_category'),
    path('admin/categories/<int:category_id>/delete/', admin_views.admin_delete_category, name='admin_delete_category'),
    path('admin/categories/<int:category_id>/toggle/', admin_views.admin_toggle_category, name='admin_toggle_category'),
    path('admin/categories/<int:category_id>/subcategories/', admin_views.admin_create_subcategory, name='admin_create_subcategory'),
    path('admin/subcategories/<int:subcategory_id>/edit/', admin_views.admin_edit_subcategory, name='admin_edit_subcategory'),
    path('admin/subcategories/<int:subcategory_id>/delete/', admin_views.admin_delete_subcategory, name='admin_delete_subcategory'),

    # Admin – Favorites & Analytics
    path('admin/favorites/', admin_views.admin_favorites, name='admin_favorites'),
    path('admin/customers/', admin_views.admin_list_customers, name='admin_list_customers'),
    path('admin/customers/<int:customer_id>/toggle/', admin_views.admin_toggle_customer, name='admin_toggle_customer'),
    path('admin/guests/', admin_views.admin_list_guests, name='admin_list_guests'),
    path('admin/analytics/', admin_views.admin_analytics, name='admin_analytics'),
    path('admin/export/<str:report_type>/', admin_views.admin_export_csv, name='admin_export_csv'),

    # Public – Vendor profile page
    path('vendors/top/', admin_views.top_vendors, name='top_vendors'),
    path('vendor/<int:vendor_id>/', admin_views.vendor_public_profile, name='vendor_public_profile'),
]
