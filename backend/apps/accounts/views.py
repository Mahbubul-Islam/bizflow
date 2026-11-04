from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
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
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from apps.organizations.models import Membership
from apps.organizations.access import permissions_for
from allauth.socialaccount.adapter import get_adapter
from allauth.socialaccount.models import SocialAccount
from allauth.socialaccount.providers.oauth2.client import OAuth2Error
import requests

from .serializers import ChangePasswordSerializer, RegisterSerializer, UserSerializer, ProfileSerializer


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


class GoogleLoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        credential = request.data.get("credential")
        if not isinstance(credential, str) or not credential:
            return Response({"detail": "Google credential is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not settings.GOOGLE_CLIENT_ID:
            return Response({"detail": "Google sign-in is not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            provider = get_adapter().get_provider(request._request, "google")
            social_login = provider.verify_token(request._request, {"id_token": credential})
        except (ValidationError, OAuth2Error, requests.RequestException, ValueError):
            return Response({"detail": "Invalid Google credential."}, status=status.HTTP_401_UNAUTHORIZED)

        email = (social_login.user.email or "").strip().lower()
        subject = social_login.account.uid
        if not subject or not email or not any(
            address.verified and address.email.lower() == email
            for address in social_login.email_addresses
        ):
            return Response({"detail": "A verified Google email is required."}, status=status.HTTP_401_UNAUTHORIZED)

        User = get_user_model()
        try:
            with transaction.atomic():
                social_account = SocialAccount.objects.select_related("user").filter(provider="google", uid=subject).first()
                if social_account is None:
                    if User.objects.filter(email=email).exists():
                        return Response(
                            {"detail": "This email already has a password account. Log in with your password."},
                            status=status.HTTP_409_CONFLICT,
                        )
                    user = User.objects.create_user(
                        email=email,
                        password=None,
                        first_name=(social_login.user.first_name or "")[:150],
                        last_name=(social_login.user.last_name or "")[:150],
                    )
                    SocialAccount.objects.create(
                        user=user, provider="google", uid=subject,
                        extra_data=social_login.account.extra_data,
                    )
                else:
                    user = social_account.user
        except IntegrityError:
            return Response({"detail": "This Google account could not be linked."}, status=status.HTTP_409_CONFLICT)

        if not user.is_active:
            return Response({"detail": "This account is inactive."}, status=status.HTTP_403_FORBIDDEN)

        refresh = RefreshToken.for_user(user)
        response = Response({"success": True, "data": UserSerializer(user).data})
        set_jwt_cookies(response, access=refresh.access_token, refresh=refresh)
        return response


class RefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.COOKIES.get(
            settings.JWT_REFRESH_COOKIE
        )

        if not token:
            return Response({"detail": "Refresh token missing."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            old_refresh = RefreshToken(token)

            user_id = old_refresh["user_id"]

            User = get_user_model()

            user = User.objects.filter(
                id=user_id,
                is_active=True,
            ).first()

            if user is None:
                return Response({"detail": "Invalid user."}, status=status.HTTP_401_UNAUTHORIZED)

            if api_settings.CHECK_REVOKE_TOKEN and old_refresh.get(
                api_settings.REVOKE_TOKEN_CLAIM
            ) != get_md5_hash_password(user.password):
                return Response({"detail": "Refresh token revoked."}, status=status.HTTP_401_UNAUTHORIZED)

            old_refresh.blacklist()

            new_refresh = RefreshToken.for_user(user)

        except TokenError:
            return Response({"detail": "Invalid refresh token."}, status=status.HTTP_401_UNAUTHORIZED)

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
                "permissions": permissions_for(membership),
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


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def patch(self, request):
        serializer = ProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"success": True, "data": UserSerializer(request.user).data})


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
