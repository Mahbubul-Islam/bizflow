import uuid
from django.conf import settings
from django.db import models
from django.db.models import Q


class Lead(models.Model):
    class Status(models.TextChoices):
        NEW = "NEW", "New"
        CONTACTED = "CONTACTED", "Contacted"
        QUALIFIED = "QUALIFIED", "Qualified"
        UNQUALIFIED = "UNQUALIFIED", "Unqualified"
        CONVERTED = "CONVERTED", "Converted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    source = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    customer = models.OneToOneField("customers.Customer", null=True, blank=True, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Deal(models.Model):
    class Stage(models.TextChoices):
        NEW = "NEW", "New"
        CONTACTED = "CONTACTED", "Contacted"
        PROPOSAL = "PROPOSAL", "Proposal"
        WON = "WON", "Won"
        LOST = "LOST", "Lost"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.PROTECT, related_name="deals")
    customer = models.ForeignKey("customers.Customer", null=True, blank=True, on_delete=models.PROTECT, related_name="deals")
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.NEW)
    value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    expected_close_date = models.DateField(null=True, blank=True)
    sales_order = models.OneToOneField("sales.SalesOrder", null=True, blank=True, on_delete=models.PROTECT, related_name="deal")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(value__gte=0), name="crm_deal_value_nonnegative")]


class Activity(models.Model):
    class Kind(models.TextChoices):
        CALL = "CALL", "Call"
        MEETING = "MEETING", "Meeting"
        EMAIL = "EMAIL", "Email"
        NOTE = "NOTE", "Note"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE)
    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.CASCADE, related_name="activities")
    customer = models.ForeignKey("customers.Customer", null=True, blank=True, on_delete=models.CASCADE, related_name="activities")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    description = models.TextField()
    occurred_at = models.DateTimeField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=(Q(lead__isnull=False, customer__isnull=True) | Q(lead__isnull=True, customer__isnull=False)), name="crm_activity_one_subject")]


class FollowUpTask(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE)
    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.CASCADE, related_name="tasks")
    customer = models.ForeignKey("customers.Customer", null=True, blank=True, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=200)
    due_at = models.DateTimeField()
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=(Q(lead__isnull=False, customer__isnull=True) | Q(lead__isnull=True, customer__isnull=False)), name="crm_task_one_subject")]


class AssignmentNotification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE)
    task = models.ForeignKey(FollowUpTask, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.CheckConstraint(condition=(Q(task__isnull=False, lead__isnull=True) | Q(task__isnull=True, lead__isnull=False)), name="crm_notification_one_subject")]
