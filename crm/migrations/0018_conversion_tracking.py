from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_conversion_tracking(apps, schema_editor):
    Lead = apps.get_model('crm', 'Lead')
    WalkIn = apps.get_model('crm', 'WalkIn')
    Enrollment = apps.get_model('crm', 'Enrollment')

    for lead in Lead.objects.all().order_by('id'):
        walkin = WalkIn.objects.filter(lead_id=lead.id).order_by('created_at', 'id').first()
        enrollment = Enrollment.objects.filter(lead_id=lead.id).order_by('created_at', 'id').first()
        if enrollment:
            lead.converted_to_type = 'enrollment'
            lead.converted_record_id = enrollment.id
            lead.converted_at = enrollment.created_at
            lead.converted_by_id = enrollment.enrolled_by_id
            lead.status = 'converted'
            lead.save(update_fields=[
                'converted_to_type', 'converted_record_id', 'converted_at',
                'converted_by', 'status',
            ])
        elif walkin:
            lead.converted_to_type = 'walkin'
            lead.converted_record_id = walkin.id
            lead.converted_at = walkin.created_at
            lead.converted_by_id = walkin.created_by_id
            lead.status = 'walk_in'
            lead.save(update_fields=[
                'converted_to_type', 'converted_record_id', 'converted_at',
                'converted_by', 'status',
            ])

    for walkin in WalkIn.objects.all().order_by('id'):
        enrollment = Enrollment.objects.filter(walkin_id=walkin.id).order_by('created_at', 'id').first()
        if enrollment:
            walkin.converted_to_type = 'enrollment'
            walkin.converted_record_id = enrollment.id
            walkin.converted_at = enrollment.created_at
            walkin.converted_by_id = enrollment.enrolled_by_id
            walkin.status = 'converted'
            walkin.save(update_fields=[
                'converted_to_type', 'converted_record_id', 'converted_at',
                'converted_by', 'status',
            ])


def clear_conversion_tracking(apps, schema_editor):
    Lead = apps.get_model('crm', 'Lead')
    WalkIn = apps.get_model('crm', 'WalkIn')
    Lead.objects.update(converted_to_type='', converted_record_id=None, converted_at=None, converted_by=None)
    WalkIn.objects.update(converted_to_type='', converted_record_id=None, converted_at=None, converted_by=None)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('crm', '0017_branch_branch_code'),
    ]

    operations = [
        migrations.AddField(
            model_name='lead',
            name='converted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='lead',
            name='converted_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='converted_leads', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='lead',
            name='converted_record_id',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='lead',
            name='converted_to_type',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='walkin',
            name='converted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='walkin',
            name='converted_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='converted_walkins', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='walkin',
            name='converted_record_id',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='walkin',
            name='converted_to_type',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.RunPython(backfill_conversion_tracking, clear_conversion_tracking),
    ]
