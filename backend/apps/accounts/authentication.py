from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework.authentication import CSRFCheck


def enforce_csrf(request):
    check = CSRFCheck(lambda request: None)

    check.process_request(request)

    reason = check.process_view(
        request,
        lambda request: None,
        (),
        {}
    )

    if reason:
        raise PermissionDenied(f"CSRF failed: {reason}")


class CookieJWTAuthentication(JWTAuthentication):

    def authenticate(self, request):
        raw_token = request.COOKIES.get("bizflow_access")

        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        user = self.get_user(validated_token)

        if request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
            enforce_csrf(request)

        return user, validated_token