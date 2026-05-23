from django.db import migrations


def repair_enrollment_conversion_status(apps, schema_editor):
    Enrollment = apps.get_model('crm', 'Enrollment')
    Lead = apps.get_model('crm', 'Lead')
    WalkIn = apps.get_model('crm', 'WalkIn')

    for enrollment in Enrollment.objects.exclude(walkin_id__isnull=True).iterator():
        WalkIn.objects.filter(pk=enrollment.walkin_id).update(
            status='converted',
            remarks='Joined',
            follow_up_date=None,
            converted_to_type='enrollment',
            converted_record_id=enrollment.id,
            converted_at=enrollment.created_at,
            converted_by_id=enrollment.enrolled_by_id,
        )

    for enrollment in Enrollment.objects.exclude(lead_id__isnull=True).iterator():
        Lead.objects.filter(pk=enrollment.lead_id).update(
            status='converted',
            remarks='Joined',
            next_follow_up_date=None,
            converted_to_type='enrollment',
            converted_record_id=enrollment.id,
            converted_at=enrollment.created_at,
            converted_by_id=enrollment.enrolled_by_id,
        )


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0061_candidate_soft_delete'),
    ]

    operations = [
        migrations.RunPython(repair_enrollment_conversion_status, migrations.RunPython.noop),
    ]
