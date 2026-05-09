from django.db import migrations


def repair_superuser_roles(apps, schema_editor):
    User = apps.get_model('crm', 'User')
    User.objects.filter(is_superuser=True).update(
        role='super_admin',
        is_staff=True,
        is_active=True,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0039_wati_whatsapp_fields'),
    ]

    operations = [
        migrations.RunPython(repair_superuser_roles, migrations.RunPython.noop),
    ]
