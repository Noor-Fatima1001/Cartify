"""
ASGI config for cartify project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from app.marketplace.routing import websocket_urlpatterns

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Get the Django ASGI application
django_asgi_app = get_asgi_application()

# Configure ASGI application with both HTTP and WebSocket support
application = ProtocolTypeRouter({
    # HTTP support (default Django)
    'http': django_asgi_app,
    
    # WebSocket support with authentication
    'websocket': AuthMiddlewareStack(
        URLRouter(
            websocket_urlpatterns
        )
    ),
})

