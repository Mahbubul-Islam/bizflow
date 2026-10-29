from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.utils.decorators import method_decorator
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.utils import get_md5_hash_password
from rest_framework.exceptions import AuthenticationFailed
from apps.organizations.models import Membership

from .serializers import ChangePasswordSerializer, RegisterSerializer, UserSerializer


def set_jwt_cookies(response, access, refresh=None):
    response.set_cookie(
        key=settings.JWT_ACCESS_COOKIE,
        value=str(access),
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.JWT_COOKIE_SECURE,
        samesite=settings.JWT_COOKIE_SAMESITE,
        path=settings.JWT_COOKIE_PATH,
    )

    if refresh is not None:
        response.set_cookie(
            key=settings.JWT_REFRESH_COOKIE,
            value=str(refresh),
            max_age=7 * 24 * 60 * 60,
            httponly=True,
            secure=settings.JWT_COOKIE_SECURE,
            samesite=settings.JWT_COOKIE_SAMESITE,
            path=settings.JWT_REFRESH_COOKIE_PATH,
        )


def clear_jwt_cookies(response):
    response.delete_cookie(
        settings.JWT_ACCESS_COOKIE,
        path=settings.JWT_COOKIE_PATH,
        samesite=settings.JWT_COOKIE_SAMESITE,
    )
    response.delete_cookie(
        settings.JWT_REFRESH_COOKIE,
        path=settings.JWT_REFRESH_COOKIE_PATH,
        samesite=settings.JWT_COOKIE_SAMESITE,
    )


@method_decorator(ensure_csrf_cookie, name="get")
class CSRFView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"success": True, "csrfToken": get_token(request)})


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        password = request.data.get("password", "")

        user = authenticate(
            request,
            username=email,
            password=password,
        )

        if user is None:
            return Response(
                {"success": False, "message": "Invalid email or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        refresh = RefreshToken.for_user(user)

        response = Response({
            "success": True,
            "message": "Login successful",
            "data": UserSerializer(user).data,
        })

        set_jwt_cookies(
            response,
            access=refresh.access_token,
            refresh=refresh,
        )

        return response


class RefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.COOKIES.get(
            settings.JWT_REFRESH_COOKIE
        )

        if not token:
            raise AuthenticationFailed("Refresh token missing.")

        try:
            old_refresh = RefreshToken(token)

            user_id = old_refresh["user_id"]

            User = get_user_model()

            user = User.objects.filter(
                id=user_id,
                is_active=True,
            ).first()

            if user is None:
                raise AuthenticationFailed("Invalid user.")

            if api_settings.CHECK_REVOKE_TOKEN and old_refresh.get(
                api_settings.REVOKE_TOKEN_CLAIM
            ) != get_md5_hash_password(user.password):
                raise AuthenticationFailed("Refresh token revoked.")

            old_refresh.blacklist()

            new_refresh = RefreshToken.for_user(user)

        except TokenError:
            raise AuthenticationFailed("Invalid refresh token.")

        response = Response({
            "success": True,
            "message": "Token refreshed",
        })

        set_jwt_cookies(
            response,
            access=new_refresh.access_token,
            refresh=new_refresh,
        )

        return response


class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.COOKIES.get(
            settings.JWT_REFRESH_COOKIE
        )

        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                pass

        response = Response({
            "success": True,
            "message": "Logged out successfully",
        })

        clear_jwt_cookies(response)

        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memberships = list(Membership.objects.filter(
            user=request.user,
            is_active=True,
            organization__is_active=True,
        ).select_related("organization").order_by("organization__name"))
        organizations = [
            {
                "id": str(membership.organization_id),
                "name": membership.organization.name,
                "role": membership.role,
            }
            for membership in memberships
        ]
        selected_id = request.headers.get("X-Organization-ID")
        selected = next(
            (item for item in organizations if item["id"] == selected_id), None
        ) if selected_id else None
        role = (
            selected["role"] if selected
            else organizations[0]["role"] if not selected_id and len(organizations) == 1
            else None
        )
        data = UserSerializer(request.user).data
        data["role"] = role
        data["organizations"] = organizations
        return Response({
            "success": True,
            "data": data,
        })


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])

        response = Response({
            "success": True,
            "message": "Password changed successfully. Please log in again.",
        })
        clear_jwt_cookies(response)
        return response


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.save()

        return Response({
            "success": True,
            "message": "Registration successful",
            "data": UserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)
