from rest_framework import serializers
from apps.customers.models import Customer
from apps.organizations.models import Membership
from apps.sales.models import SalesOrder
from .models import Activity, Deal, FollowUpTask, Lead


class ScopedSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        attrs = super().validate(attrs)
        organization = self.context["request"].organization
        for field in ("lead", "customer", "sales_order"):
            obj = attrs.get(field, getattr(self.instance, field, None) if self.instance else None)
            if obj is not None and obj.organization_id != organization.id:
                raise serializers.ValidationError({field: "Select a record in this organization."})
        assignee = attrs.get("assigned_to", getattr(self.instance, "assigned_to", None) if self.instance else None)
        if assignee is not None and not Membership.objects.filter(organization=organization, user=assignee, is_active=True).exists():
            raise serializers.ValidationError({"assigned_to": "Select an active organization member."})
        return attrs


class LeadSerializer(ScopedSerializer):
    class Meta:
        model = Lead
        fields = ["id", "name", "email", "phone", "source", "notes", "assigned_to", "status", "customer", "created_at", "updated_at"]
        read_only_fields = ["id", "customer", "created_at", "updated_at"]

    def validate_status(self, value):
        if value == Lead.Status.CONVERTED:
            raise serializers.ValidationError("Use the convert action to convert a lead.")
        if self.instance and self.instance.status == Lead.Status.CONVERTED and value != Lead.Status.CONVERTED:
            raise serializers.ValidationError("A converted lead cannot be reopened.")
        return value


class DealSerializer(ScopedSerializer):
    class Meta:
        model = Deal
        fields = ["id", "title", "lead", "customer", "stage", "value", "expected_close_date", "sales_order", "notes", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        lead = attrs.get("lead", getattr(self.instance, "lead", None) if self.instance else None)
        customer = attrs.get("customer", getattr(self.instance, "customer", None) if self.instance else None)
        order = attrs.get("sales_order", getattr(self.instance, "sales_order", None) if self.instance else None)
        stage = attrs.get("stage", getattr(self.instance, "stage", Deal.Stage.NEW) if self.instance else Deal.Stage.NEW)
        if not lead and not customer:
            raise serializers.ValidationError("A deal needs a lead or customer.")
        if lead and customer and lead.customer_id and lead.customer_id != customer.id:
            raise serializers.ValidationError({"customer": "Customer does not match the converted lead."})
        if stage != Deal.Stage.WON and order and "sales_order" not in attrs:
            attrs["sales_order"] = None
            order = None
        if order and (stage != Deal.Stage.WON or not customer or order.customer_id != customer.id):
            raise serializers.ValidationError({"sales_order": "A won deal can link an order for its customer."})
        return attrs


class SubjectSerializer(ScopedSerializer):
    def validate(self, attrs):
        attrs = super().validate(attrs)
        lead = attrs.get("lead", getattr(self.instance, "lead", None) if self.instance else None)
        customer = attrs.get("customer", getattr(self.instance, "customer", None) if self.instance else None)
        if bool(lead) == bool(customer):
            raise serializers.ValidationError("Select exactly one lead or customer.")
        return attrs


class ActivitySerializer(SubjectSerializer):
    subject_name = serializers.SerializerMethodField()

    def get_subject_name(self, obj):
        return obj.lead.name if obj.lead_id else obj.customer.name

    class Meta:
        model = Activity
        fields = ["id", "lead", "customer", "subject_name", "kind", "description", "occurred_at", "created_by", "created_at"]
        read_only_fields = ["id", "subject_name", "created_by", "created_at"]


class FollowUpTaskSerializer(SubjectSerializer):
    class Meta:
        model = FollowUpTask
        fields = ["id", "lead", "customer", "title", "due_at", "assigned_to", "completed_at", "created_at"]
        read_only_fields = ["id", "completed_at", "created_at"]


class ConvertLeadSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all(), required=False)

    def validate_customer(self, value):
        if value.organization_id != self.context["request"].organization.id:
            raise serializers.ValidationError("Select a customer in this organization.")
        return value
