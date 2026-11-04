from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, ProductViewSet
from django.urls import path
from .views import BulkProductImportView, ProductCatalogView, StockAdjustmentView, StockMovementListView

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")

urlpatterns = [
    path("products/import/", BulkProductImportView.as_view()),
    path("products/catalog/", ProductCatalogView.as_view()),
] + router.urls

urlpatterns += [
    path("inventory/adjustments/", StockAdjustmentView.as_view()),
    path("inventory/movements/", StockMovementListView.as_view()),
]
