from django.contrib import admin
from .models import User, VendorProfile, VendorAnalyticsPermission


@admin.register(VendorAnalyticsPermission)
class VendorAnalyticsPermissionAdmin(admin.ModelAdmin):
    list_display = ('vendor', 'can_access_analytics', 'updated_at')
    list_filter = ('can_access_analytics', 'updated_at')
    search_fields = ('vendor__username', 'vendor__email')
    readonly_fields = ('created_at', 'updated_at')
    fieldsets = (
        ('Vendor Information', {
            'fields': ('vendor',)
        }),
        ('Permissions', {
            'fields': ('can_access_analytics',)
        }),
        ('Audit Information', {
            'fields': ('created_at', 'updated_at', 'last_modified_by'),
            'classes': ('collapse',)
        }),
    )
    
    def save_model(self, request, obj, form, change):
        if change: 
            obj.last_modified_by = request.user
        super().save_model(request, obj, form, change)
