from rest_framework import serializers
from .models import Membership, Organization
from .access import PERMISSION_LABELS, permissions_for
from apps.accounts.serializers import UserSerializer


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "id", "name", "slug", "email", "phone",
            "address", "currency", "created_at"
        ]
        read_only_fields = ["id", "created_at"]


class MembershipSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    avatar_url = serializers.SerializerMethodField()
    effective_permissions = serializers.SerializerMethodField()

    def get_effective_permissions(self, obj):
        return permissions_for(obj)

    def get_avatar_url(self, obj):
        return UserSerializer().get_avatar_url(obj.user)

    class Meta:
        model = Membership
        fields = ["id", "user", "email", "first_name", "last_name", "avatar_url", "role", "joined_at", "permissions_override", "effective_permissions"]
        read_only_fields = fields


class AddMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=Membership.Role.choices, default=Membership.Role.STAFF
    )


class ChangeMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Membership.Role.choices)


class RoleAccessSerializer(serializers.Serializer):
    permissions = serializers.ListField(
        child=serializers.ChoiceField(choices=list(PERMISSION_LABELS)),
        allow_empty=True,
    )

    def validate_permissions(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Permissions must be unique.")
        return value


class MemberAccessSerializer(serializers.Serializer):
    permissions = serializers.ListField(
        child=serializers.ChoiceField(choices=list(PERMISSION_LABELS)),
        allow_empty=True,
        allow_null=True,
    )

    def validate_permissions(self, value):
        if value is not None and len(value) != len(set(value)):
            raise serializers.ValidationError("Permissions must be unique.")
        return value
