from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError
from common.permissions import HasOrganizationAccess
from .invoice import render_invoice_pdf
from .models import SalesOrder
from .serializers import DraftOrderInputSerializer, SalesOrderSerializer
from .services import cancel_order, confirm_order, create_draft_order, update_draft_order


def _order_queryset(request):
    return SalesOrder.objects.filter(
        organization=request.organization
    ).select_related("organization", "customer").prefetch_related("items__product")


class OrderListCreateView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "sales.view" if self.request.method == "GET" else "sales.manage"

    def get(self, request):
        orders = _order_queryset(request).order_by("-created_at", "-id")
        return Response({
            "success": True,
            "data": SalesOrderSerializer(orders, many=True).data,
        })

    def post(self, request):
        serializer = DraftOrderInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = create_draft_order(
            organization=request.organization,
            user=request.user,
            data=serializer.validated_data,
        )
        order = _order_queryset(request).get(id=order.id)
        return Response({
            "success": True,
            "message": "Draft order created",
            "data": SalesOrderSerializer(order).data,
        }, status=status.HTTP_201_CREATED)


class OrderDetailView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "sales.view" if self.request.method == "GET" else "sales.manage"

    def get(self, request, order_id):
        order = get_object_or_404(_order_queryset(request), id=order_id)
        return Response({"success": True, "data": SalesOrderSerializer(order).data})

    def patch(self, request, order_id):
        serializer = DraftOrderInputSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        order = update_draft_order(
            order_id=order_id,
            organization=request.organization,
            user=request.user,
            data=serializer.validated_data,
        )
        order = _order_queryset(request).get(id=order.id)
        return Response({
            "success": True,
            "message": "Draft order updated",
            "data": SalesOrderSerializer(order).data,
        })


class ConfirmOrderView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "sales.confirm"

    def post(self, request, order_id):
        order = confirm_order(
            order_id=order_id,
            organization=request.organization,
            user=request.user
        )

        return Response({
            "success": True,
            "data": {
                "id": str(order.id),
                "order_number": order.order_number,
                "status": order.status,
                "total_amount": str(order.total_amount)
            }
        })


class CancelOrderView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "sales.cancel"

    def post(self, request, order_id):
        order = cancel_order(
            order_id=order_id,
            organization=request.organization,
            user=request.user,
        )
        order = _order_queryset(request).get(id=order.id)
        return Response({
            "success": True,
            "message": "Order cancelled",
            "data": SalesOrderSerializer(order).data,
        })


class OrderInvoiceView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "sales.invoice"

    def get(self, request, order_id):
        order = get_object_or_404(_order_queryset(request), id=order_id)
        if order.status != SalesOrder.Status.CONFIRMED:
            raise ValidationError("Only confirmed orders have invoices.")
        response = HttpResponse(render_invoice_pdf(order), content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="invoice-{order.order_number}.pdf"'
        )
        return response
