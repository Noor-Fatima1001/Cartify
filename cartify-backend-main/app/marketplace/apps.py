from django.apps import AppConfig

class MarketplaceConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'app.marketplace'
    label = 'marketplace'
    
    def ready(self):
        """Register signals when app is ready"""
        import app.marketplace.signals
