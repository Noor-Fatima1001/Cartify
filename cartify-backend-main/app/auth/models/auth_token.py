import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class AuthToken(models.Model):
    token = models.CharField(max_length=64, unique=True, db_index=True, default=uuid.uuid4)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='auth_tokens')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)

    def is_expired(self):
        return self.expires_at < timezone.now()

    def __str__(self):
        return f'{self.user_id}:{self.token[:8]}...'
