from django.urls import path

from .views import admin_views, vendor_views

urlpatterns = [
    # Vendor
    path('wallet/', vendor_views.get_wallet, name='billing_wallet'),
    path('ledger/', vendor_views.ledger_list, name='billing_ledger'),
    path('payment-methods/', vendor_views.payment_methods_list, name='billing_payment_methods'),
    path('topups/', vendor_views.topups, name='billing_topups'),
    path('topups/<int:topup_id>/', vendor_views.topup_update, name='billing_topup_update'),
    path('plans/', vendor_views.plans_list, name='billing_plans'),
    path('subscription/', vendor_views.get_subscription, name='billing_subscription'),
    path('subscription/purchase/', vendor_views.purchase_subscription, name='billing_subscription_purchase'),
    path('subscription/cancel/', vendor_views.cancel_subscription, name='billing_subscription_cancel'),
    path('subscription/resume/', vendor_views.resume_subscription, name='billing_subscription_resume'),
    path('subscription/history/', vendor_views.subscription_history, name='billing_subscription_history'),
    path('notifications/', vendor_views.notifications_list, name='billing_notifications'),
    path('notifications/mark-read/', vendor_views.notifications_mark_read, name='billing_notifications_mark_read'),

    # Admin
    path('admin/payment-methods/', admin_views.admin_payment_methods, name='billing_admin_payment_methods'),
    path('admin/payment-methods/<int:method_id>/', admin_views.admin_payment_method_detail, name='billing_admin_payment_method_detail'),
    path('admin/topups/', admin_views.admin_topups, name='billing_admin_topups'),
    path('admin/topups/<int:topup_id>/', admin_views.admin_topup_detail, name='billing_admin_topup_detail'),
    path('admin/topups/<int:topup_id>/approve/', admin_views.admin_topup_approve, name='billing_admin_topup_approve'),
    path('admin/topups/<int:topup_id>/reject/', admin_views.admin_topup_reject, name='billing_admin_topup_reject'),
    path('admin/topups/<int:topup_id>/request-info/', admin_views.admin_topup_request_info, name='billing_admin_topup_request_info'),
    path('admin/plans/', admin_views.admin_plans, name='billing_admin_plans'),
    path('admin/plans/<int:plan_id>/', admin_views.admin_plan_detail, name='billing_admin_plan_detail'),
    path('admin/subscriptions/', admin_views.admin_subscriptions, name='billing_admin_subscriptions'),
    path('admin/subscriptions/vendor/<int:vendor_id>/history/', admin_views.admin_vendor_subscription_history, name='billing_admin_vendor_subscription_history'),
    path('admin/subscriptions/vendor/<int:vendor_id>/cancel/', admin_views.admin_cancel_subscription, name='billing_admin_subscription_cancel'),
    path('admin/subscriptions/vendor/<int:vendor_id>/resume/', admin_views.admin_resume_subscription, name='billing_admin_subscription_resume'),
    path('admin/subscriptions/vendor/<int:vendor_id>/renew/', admin_views.admin_renew_subscription, name='billing_admin_subscription_renew'),
    path('admin/reports/', admin_views.admin_reports, name='billing_admin_reports'),
    path('admin/wallets/', admin_views.admin_wallets, name='billing_admin_wallets'),
    path('admin/wallets/<int:vendor_id>/adjust/', admin_views.admin_wallet_adjust, name='billing_admin_wallet_adjust'),
]
