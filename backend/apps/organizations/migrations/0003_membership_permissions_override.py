from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0002_roleaccess"),
    ]

    operations = [
        migrations.AddField(
            model_name="membership",
            name="permissions_override",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
    ]
