from .models import AuditLog


def record_audit(*, organization, actor, action, entity_type, entity_id, changes=None):
    return AuditLog.objects.create(
        organization=organization,
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        changes=changes or {},
    )
