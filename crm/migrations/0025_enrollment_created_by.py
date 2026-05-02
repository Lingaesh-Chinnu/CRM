from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_created_by(apps, schema_editor):
    Enrollment = apps.get_model('crm', 'Enrollment')
    Enrollment.objects.filter(created_by__isnull=True).update(created_by=models.F('enrolled_by'))


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0024_usermonthlyrating'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='enrollments_entered', to=settings.AUTH_USER_MODEL),
        ),
        migrations.RunPython(backfill_created_by, migrations.RunPython.noop),
    ]
