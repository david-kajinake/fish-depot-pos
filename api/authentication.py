from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class ActiveUserJWTAuthentication(JWTAuthentication):
    """Reject tokens belonging to an operator disabled after they logged in."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if user.is_disabled:
            raise AuthenticationFailed('This user account has been disabled.', code='user_disabled')
        return user
