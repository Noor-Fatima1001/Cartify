from django.urls import path

from .views import admin_views, vendor_views

urlpatterns = [
    # Vendor
    path('', vendor_views.campaigns, name='campaigns'),
    path('<int:campaign_id>/', vendor_views.campaign_detail, name='campaign_detail'),
    path('<int:campaign_id>/start/', vendor_views.start_campaign, name='campaign_start'),
    path('<int:campaign_id>/pause/', vendor_views.pause_campaign, name='campaign_pause'),
    path('<int:campaign_id>/resume/', vendor_views.resume_campaign, name='campaign_resume'),
    path('<int:campaign_id>/stop/', vendor_views.stop_campaign, name='campaign_stop'),
    path('<int:campaign_id>/budget/', vendor_views.change_budget, name='campaign_budget'),
    path('<int:campaign_id>/audit-logs/', vendor_views.audit_logs, name='campaign_audit_logs'),
    path('<int:campaign_id>/analytics/', vendor_views.campaign_analytics, name='campaign_analytics'),

    # Admin
    path('admin/campaigns/', admin_views.admin_campaigns, name='admin_campaigns'),
    path('admin/campaigns/<int:campaign_id>/', admin_views.admin_campaign_detail, name='admin_campaign_detail'),
    path('admin/campaigns/<int:campaign_id>/pause/', admin_views.admin_pause_campaign, name='admin_campaign_pause'),
    path('admin/campaigns/<int:campaign_id>/stop/', admin_views.admin_stop_campaign, name='admin_campaign_stop'),
    path('admin/campaigns/<int:campaign_id>/audit-logs/', admin_views.admin_campaign_audit_logs, name='admin_campaign_audit_logs'),
    path('admin/campaigns/<int:campaign_id>/analytics/', admin_views.admin_campaign_analytics, name='admin_campaign_analytics'),
    path('admin/pricing/', admin_views.admin_pricing, name='admin_campaign_pricing'),
]
