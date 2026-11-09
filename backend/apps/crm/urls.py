from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import ActivityViewSet, CrmSummaryView, DealViewSet, FollowUpTaskViewSet, LeadViewSet, MyFollowUpsView, MyFollowUpCompleteView, MyLeadStatusView, NotificationReadView

router = DefaultRouter()
router.register("leads", LeadViewSet, basename="crm-lead")
router.register("deals", DealViewSet, basename="crm-deal")
router.register("activities", ActivityViewSet, basename="crm-activity")
router.register("follow-ups", FollowUpTaskViewSet, basename="crm-follow-up")
urlpatterns = [
    path("crm/summary/", CrmSummaryView.as_view()),
    path("crm/my-follow-ups/", MyFollowUpsView.as_view()),
    path("crm/my-follow-ups/<uuid:pk>/complete/", MyFollowUpCompleteView.as_view()),
    path("crm/my-leads/<uuid:pk>/status/", MyLeadStatusView.as_view()),
    path("crm/notifications/<uuid:pk>/read/", NotificationReadView.as_view()),
] + router.urls
