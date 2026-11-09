from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from common.permissions import HasOrganizationAccess, IsOrganizationMember
from apps.customers.models import Customer
from .models import Activity, AssignmentNotification, Deal, FollowUpTask, Lead
from .serializers import ActivitySerializer, ConvertLeadSerializer, DealSerializer, FollowUpTaskSerializer, LeadSerializer


class CrmViewSet(viewsets.ModelViewSet):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "crm.view" if self.action in ("list", "retrieve") else "crm.manage"

    def get_queryset(self):
        return self.queryset.filter(organization=self.request.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.organization)


class LeadViewSet(CrmViewSet):
    queryset = Lead.objects.all()
    serializer_class = LeadSerializer

    def perform_create(self, serializer):
        lead = serializer.save(organization=self.request.organization)
        if lead.assigned_to_id:
            AssignmentNotification.objects.create(organization=self.request.organization, lead=lead, recipient=lead.assigned_to)

    def perform_update(self, serializer):
        previous_assignee_id = serializer.instance.assigned_to_id
        lead = serializer.save()
        if lead.assigned_to_id and lead.assigned_to_id != previous_assignee_id:
            AssignmentNotification.objects.create(organization=self.request.organization, lead=lead, recipient=lead.assigned_to)

    @action(detail=True, methods=["post"])
    def convert(self, request, pk=None):
        payload = ConvertLeadSerializer(data=request.data, context={"request": request})
        payload.is_valid(raise_exception=True)
        with transaction.atomic():
            lead = Lead.objects.select_for_update().get(pk=self.get_object().pk)
            if lead.status != Lead.Status.QUALIFIED:
                raise ValidationError({"status": "Only qualified leads can be converted."})
            customer = payload.validated_data.get("customer")
            if customer is None:
                customer = Customer.objects.create(organization=request.organization, name=lead.name, email=lead.email, phone=lead.phone, notes=lead.notes)
            lead.customer = customer
            lead.status = Lead.Status.CONVERTED
            lead.save(update_fields=["customer", "status", "updated_at"])
            Deal.objects.filter(organization=request.organization, lead=lead, customer__isnull=True).update(customer=customer)
        return Response(LeadSerializer(lead, context={"request": request}).data)


class DealViewSet(CrmViewSet):
    queryset = Deal.objects.all()
    serializer_class = DealSerializer


class ActivityViewSet(CrmViewSet):
    queryset = Activity.objects.select_related("lead", "customer").order_by("-occurred_at")
    serializer_class = ActivitySerializer

    def perform_create(self, serializer):
        serializer.save(organization=self.request.organization, created_by=self.request.user)


class FollowUpTaskViewSet(CrmViewSet):
    queryset = FollowUpTask.objects.all()
    serializer_class = FollowUpTaskSerializer

    def perform_create(self, serializer):
        task = serializer.save(organization=self.request.organization)
        AssignmentNotification.objects.create(organization=self.request.organization, task=task, recipient=task.assigned_to)

    def perform_update(self, serializer):
        previous_assignee_id = serializer.instance.assigned_to_id
        task = serializer.save()
        if task.assigned_to_id != previous_assignee_id:
            AssignmentNotification.objects.create(organization=self.request.organization, task=task, recipient=task.assigned_to)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        task = self.get_object()
        if task.completed_at is None:
            task.completed_at = timezone.now()
            task.save(update_fields=["completed_at"])
        return Response(self.get_serializer(task).data)


class CrmSummaryView(APIView):
    permission_classes = [HasOrganizationAccess]

    def get_required_access(self):
        return "crm.view"

    def get(self, request):
        leads = Lead.objects.filter(organization=request.organization)
        deals = Deal.objects.filter(organization=request.organization)
        total = leads.count()
        converted = leads.filter(status=Lead.Status.CONVERTED).count()
        overdue = FollowUpTask.objects.filter(organization=request.organization, completed_at__isnull=True, due_at__lt=timezone.now())
        return Response({"total_leads": total, "converted_leads": converted, "conversion_rate": round(converted * 100 / total, 2) if total else 0, "pipeline_value": str(deals.exclude(stage__in=[Deal.Stage.WON, Deal.Stage.LOST]).aggregate(value=Sum("value"))["value"] or 0), "overdue_follow_ups": overdue.count()})


class MyFollowUpsView(APIView):
    permission_classes = [IsOrganizationMember]

    def get(self, request):
        tasks = FollowUpTask.objects.filter(organization=request.organization, assigned_to=request.user, completed_at__isnull=True).select_related("lead", "customer").order_by("due_at")
        leads = Lead.objects.filter(organization=request.organization, assigned_to=request.user).exclude(status__in=[Lead.Status.CONVERTED, Lead.Status.UNQUALIFIED]).order_by("created_at")
        notifications = AssignmentNotification.objects.filter(organization=request.organization, recipient=request.user, read_at__isnull=True).select_related("task", "lead")
        notifications = [item for item in notifications if (item.task_id and item.task.assigned_to_id == request.user.id and item.task.completed_at is None) or (item.lead_id and item.lead.assigned_to_id == request.user.id and item.lead.status not in [Lead.Status.CONVERTED, Lead.Status.UNQUALIFIED])]
        return Response({
            "tasks": [
                {
                    **FollowUpTaskSerializer(task, context={"request": request}).data,
                    "contact": {
                        "name": task.customer.name if task.customer_id else task.lead.name,
                        "email": task.customer.email if task.customer_id else task.lead.email,
                        "phone": task.customer.phone if task.customer_id else task.lead.phone,
                        "address": task.customer.address if task.customer_id else "",
                    },
                }
                for task in tasks
            ],
            "leads": LeadSerializer(leads, many=True, context={"request": request}).data,
            "notifications": [{"id": str(item.id), "task_id": str(item.task_id) if item.task_id else None, "lead_id": str(item.lead_id) if item.lead_id else None, "title": item.task.title if item.task_id else item.lead.name, "created_at": item.created_at} for item in notifications],
        })


class MyFollowUpCompleteView(APIView):
    permission_classes = [IsOrganizationMember]

    def post(self, request, pk):
        task = FollowUpTask.objects.filter(pk=pk, organization=request.organization, assigned_to=request.user).first()
        if task is None:
            from django.http import Http404
            raise Http404
        if task.completed_at is None:
            task.completed_at = timezone.now()
            task.save(update_fields=["completed_at"])
        AssignmentNotification.objects.filter(task=task, recipient=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response(FollowUpTaskSerializer(task, context={"request": request}).data)


class NotificationReadView(APIView):
    permission_classes = [IsOrganizationMember]

    def post(self, request, pk):
        updated = AssignmentNotification.objects.filter(pk=pk, organization=request.organization, recipient=request.user).update(read_at=timezone.now())
        if not updated:
            from django.http import Http404
            raise Http404
        return Response({"read": True})


class MyLeadStatusView(APIView):
    permission_classes = [IsOrganizationMember]

    def patch(self, request, pk):
        from django.http import Http404
        lead = Lead.objects.filter(pk=pk, organization=request.organization, assigned_to=request.user).first()
        if lead is None:
            raise Http404
        next_status = request.data.get("status")
        if next_status not in [Lead.Status.NEW, Lead.Status.CONTACTED, Lead.Status.QUALIFIED, Lead.Status.UNQUALIFIED] or lead.status == Lead.Status.CONVERTED:
            raise ValidationError({"status": "Choose a valid status for an open lead."})
        lead.status = next_status
        lead.save(update_fields=["status", "updated_at"])
        if next_status == Lead.Status.UNQUALIFIED:
            AssignmentNotification.objects.filter(lead=lead, recipient=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response(LeadSerializer(lead, context={"request": request}).data)
