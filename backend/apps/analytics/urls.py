from django.urls import path
from .views import DashboardSummaryView, SalesTrendView, TopProductsView

urlpatterns = [
    path("dashboard/summary/", DashboardSummaryView.as_view()),
    path("dashboard/sales-trend/", SalesTrendView.as_view()),
    path("dashboard/top-products/", TopProductsView.as_view()),
]
