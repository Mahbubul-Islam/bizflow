from django.urls import path

from .views import (
    CSRFView,
    RegisterView,
    LoginView,
    GoogleLoginView,
    RefreshView,
    LogoutView,
    MeView,
    ProfileView,
    ChangePasswordView,
)

urlpatterns = [
    path("csrf/", CSRFView.as_view(), name="csrf"),
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("google/", GoogleLoginView.as_view(), name="google-login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("password/change/", ChangePasswordView.as_view(), name="password-change"),
]
