from django.urls import path
from .views import (
    AvailableMembersView,
    OrganizationDetailView,
    OrganizationListCreateView,
    OrganizationMemberDetailView,
    OrganizationMembersView,
    OrganizationRoleAccessDetailView,
    OrganizationRoleAccessListView,
)

urlpatterns = [
    path("", OrganizationListCreateView.as_view()),
    path("<uuid:organization_id>/", OrganizationDetailView.as_view()),
    path("<uuid:organization_id>/members/", OrganizationMembersView.as_view()),
    path("<uuid:organization_id>/members/search/", AvailableMembersView.as_view()),
    path("<uuid:organization_id>/roles/permissions/", OrganizationRoleAccessListView.as_view()),
    path(
        "<uuid:organization_id>/roles/<str:role>/permissions/",
        OrganizationRoleAccessDetailView.as_view(),
    ),
    path(
        "<uuid:organization_id>/members/<uuid:member_id>/",
        OrganizationMemberDetailView.as_view(),
    ),
]
