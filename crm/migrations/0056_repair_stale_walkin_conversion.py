from django.db import migrations
from django.db.models import Q


def repair_stale_walkin_conversion(apps, schema_editor):
    WalkIn = apps.get_model('crm', 'WalkIn')
    Enrollment = apps.get_model('crm', 'Enrollment')

    enrolled_walkin_ids = Enrollment.objects.exclude(walkin_id__isnull=True).values('walkin_id')
    stale_walkins = WalkIn.objects.filter(
        Q(status='converted')
        | Q(converted_to_type__isnull=False, converted_to_type__gt='')
        | Q(converted_record_id__isnull=False)
        | Q(converted_at__isnull=False)
    ).exclude(id__in=enrolled_walkin_ids)

    stale_walkins.filter(status='converted').update(status='new')
    stale_walkins.update(
        converted_to_type='',
        converted_record_id=None,
        converted_at=None,
        converted_by=None,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0055_enrollment_spot_conversion_discount'),
    ]

    operations = [
        migrations.RunPython(repair_stale_walkin_conversion, migrations.RunPython.noop),
    ]
