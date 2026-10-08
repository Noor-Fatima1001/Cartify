from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth import get_user_model
from ..models.auth_token import AuthToken

User = get_user_model()


class BearerTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION')
        token = None

        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        elif 'token' in request.GET:
            token = request.GET.get('token')

        if not token:
            return None

        try:
            auth_token = AuthToken.objects.select_related('user').get(token=token)
        except AuthToken.DoesNotExist:
            return None

        if auth_token.is_expired():
            auth_token.delete()
            raise AuthenticationFailed('Token expired')

        user = auth_token.user
        if not user.is_active or getattr(user, 'status', None) != User.STATUS_ACTIVE:
            raise AuthenticationFailed('User account is inactive or blocked')

        return (user, auth_token)
