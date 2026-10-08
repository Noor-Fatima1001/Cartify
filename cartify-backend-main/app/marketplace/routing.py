from django.urls import re_path
from app.marketplace.consumers import ProductViewConsumer

websocket_urlpatterns = [
    re_path(r'ws/products/(?P<product_id>\d+)/$', ProductViewConsumer.as_asgi()),
]
