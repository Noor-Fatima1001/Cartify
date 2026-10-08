from rest_framework import serializers
from app.marketplace.models.product_view import ProductView


class ProductViewSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductView
        fields = [
            'id',
            'product',
            'user',
            'session_id',
            'ip_address',
            'user_agent',
            'viewed_at'
        ]
        read_only_fields = ['id', 'viewed_at']
    
    def get_user(self, obj):
        if obj.user:
            return obj.user.username
        return None


class ProductInfoSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class ProductVisitorBreakdownSerializer(serializers.Serializer):
    visitor_type = serializers.CharField()
    user_id = serializers.IntegerField(required=False, allow_null=True)
    username = serializers.CharField(required=False, allow_null=True)
    session_id = serializers.CharField(required=False, allow_null=True)
    total_visits = serializers.IntegerField()
    first_visit = serializers.DateTimeField()
    last_visit = serializers.DateTimeField()
    is_liked = serializers.BooleanField(required=False)


class ProductAnalyticsSerializer(serializers.Serializer):
    product = ProductInfoSerializer()
    total_views = serializers.IntegerField(required=False)
    unique_visitors = serializers.IntegerField()
    visitor_breakdown = ProductVisitorBreakdownSerializer(many=True, required=False)
    today_views = serializers.IntegerField(required=False)
    today_unique_visitors = serializers.IntegerField(required=False)


class ProductViewHistorySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    user = serializers.CharField(allow_null=True)
    session_id = serializers.CharField(allow_null=True)
    ip_address = serializers.CharField(allow_null=True)
    user_agent = serializers.CharField(allow_blank=True)
    viewed_at = serializers.DateTimeField()
