from django.urls import path
from .views import (
    CancelOrderView,
    ConfirmOrderView,
    OrderDetailView,
    OrderInvoiceView,
    OrderListCreateView,
)

urlpatterns = [
    path("orders/", OrderListCreateView.as_view()),
    path("orders/<uuid:order_id>/", OrderDetailView.as_view()),
    path(
        "orders/<uuid:order_id>/confirm/",
        ConfirmOrderView.as_view()
    ),
    path("orders/<uuid:order_id>/cancel/", CancelOrderView.as_view()),
    path("orders/<uuid:order_id>/invoice/", OrderInvoiceView.as_view()),
]
