from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
import base64

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "password", "password_confirm",
            "first_name", "last_name", "phone", "username"
        ]
        read_only_fields = ["id", "username"]

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({
                "password_confirm": "Passwords do not match."
            })
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        return User.objects.create_user(
            password=password, **validated_data
        )


class UserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "phone", "username", "avatar_url"]

    def get_avatar_url(self, obj):
        data = getattr(obj, "avatar_data", None)
        content_type = getattr(obj, "avatar_content_type", "")
        if not data or not content_type:
            return None
        encoded = base64.b64encode(data).decode("ascii")
        return f"data:{content_type};base64,{encoded}"


class ProfileSerializer(UserSerializer):
    avatar = serializers.FileField(write_only=True, required=False)
    remove_avatar = serializers.BooleanField(write_only=True, required=False)

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ["avatar", "remove_avatar"]
        read_only_fields = ["id", "username", "avatar_url"]

    def validate_avatar(self, file):
        if file.size > 1024 * 1024:
            raise serializers.ValidationError("Choose an image smaller than 1 MB.")
        data = file.read()
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            content_type = "image/png"
        elif data.startswith(b"\xff\xd8\xff"):
            content_type = "image/jpeg"
        elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
            content_type = "image/webp"
        else:
            raise serializers.ValidationError("Choose a PNG, JPG, or WebP image.")
        return data, content_type

    def update(self, instance, validated_data):
        avatar = validated_data.pop("avatar", None)
        remove_avatar = validated_data.pop("remove_avatar", False)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if avatar is not None:
            instance.avatar_data, instance.avatar_content_type = avatar
        elif remove_avatar:
            instance.avatar_data = None
            instance.avatar_content_type = ""
        instance.save()
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = self.context["request"].user

        if not user.check_password(attrs["old_password"]):
            raise serializers.ValidationError({"old_password": "Incorrect password."})
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError({
                "new_password_confirm": "Passwords do not match."
            })
        if attrs["new_password"] == attrs["old_password"]:
            raise serializers.ValidationError({
                "new_password": "New password must differ from the old password."
            })

        try:
            validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.messages}) from exc

        return attrs
