import json
import logging
from django.utils import timezone
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from app.marketplace.models.product_view import ProductView
from app.marketplace.models.product import Product
from app.marketplace.service.analytics_service import ProductAnalyticsService

logger = logging.getLogger(__name__)


class ProductViewConsumer(AsyncWebsocketConsumer):
    async def connect(self):
    
        self.product_id = self.scope['url_route']['kwargs'].get('product_id')
        self.room_group_name = f'product_{self.product_id}'
        
        if not self.product_id:
            await self.close()
            return
        
        product_exists = await self.check_product_exists(self.product_id)
        if not product_exists:
            await self.close()
            logger.warning(f"Connection attempted for non-existent product {self.product_id}")
            return
        
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
        logger.info(f"Client connected to product {self.product_id}")
    
    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
            logger.info(f"Client disconnected from product {self.product_id}")
    
    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'ping':
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': timezone.now().isoformat()
                }))
        except json.JSONDecodeError:
            logger.error("Invalid JSON received from WebSocket")
    
    async def product_view(self, event):
        await self.send(text_data=json.dumps({
            'type': event['type'],
            'product_id': event['product_id'],
            'total_views': event.get('total_views'),
            'unique_views': event.get('unique_views'),
            'unique_visitors': event.get('unique_visitors'),
            'today_views': event.get('today_views'),
            'today_unique_views': event.get('today_unique_views'),
            'today_unique_visitors': event.get('today_unique_visitors'),
        }))
    
    @database_sync_to_async
    def check_product_exists(self, product_id):
        try:
            Product.objects.get(id=product_id, is_active=True)
            return True
        except Product.DoesNotExist:
            return False
