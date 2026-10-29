from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, ProductViewSet
from django.urls import path
from .views import StockAdjustmentView, StockMovementListView

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")

urlpatterns = router.urls

urlpatterns += [
    path("inventory/adjustments/", StockAdjustmentView.as_view()),
    path("inventory/movements/", StockMovementListView.as_view()),
]
