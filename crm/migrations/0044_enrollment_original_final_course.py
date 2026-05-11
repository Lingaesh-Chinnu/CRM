from django.db import migrations, models
import django.db.models.deletion


def backfill_final_course(apps, schema_editor):
    Enrollment = apps.get_model('crm', 'Enrollment')
    for enrollment in Enrollment.objects.exclude(course_id__isnull=True):
        enrollment.final_enrollment_course_id = enrollment.course_id
        enrollment.save(update_fields=['final_enrollment_course'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0043_walkin_qualification_choices'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='final_enrollment_course',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='enrollments_final_course',
                to='crm.course',
            ),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='original_walkin_course',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='enrollments_original_walkin_course',
                to='crm.course',
            ),
        ),
        migrations.RunPython(backfill_final_course, migrations.RunPython.noop),
    ]
