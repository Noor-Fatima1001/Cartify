import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.cache import cache
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from app.marketplace.models.product_view import ProductView
from app.marketplace.service.analytics_service import ProductAnalyticsService

logger = logging.getLogger(__name__)


@receiver(post_save, sender=ProductView)
def broadcast_product_view(sender, instance, created, **kwargs):
    if not created:
        return
    
    try:
        channel_layer = get_channel_layer()
    
        analytics = ProductAnalyticsService.get_product_analytics(instance.product_id)
        
        if not analytics:
            logger.error(f"Could not get analytics for product {instance.product_id}")
            return
        
        message = {
            'type': 'product_view', 
            'product_id': analytics['product']['id'],
            'total_views': analytics['total_views'],
            'unique_views': analytics.get('unique_visitors', analytics.get('unique_views')),
            'unique_visitors': analytics['unique_visitors'],
            'today_views': analytics.get('today_views', 0),
            'today_unique_views': analytics.get('today_unique_visitors', 0),
            'today_unique_visitors': analytics.get('today_unique_visitors', analytics.get('today_unique_views', 0)),
        }
    
        group_name = f'product_{instance.product_id}'
        
        async_to_sync(channel_layer.group_send)(
            group_name,
            message
        )
        
        logger.debug(f"Broadcasted view update for product {instance.product_id}")
        
    except Exception as e:
        logger.error(f"Error broadcasting product view: {str(e)}", exc_info=True)
