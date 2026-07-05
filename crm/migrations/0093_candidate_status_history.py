from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def backfill_current_statuses(apps, schema_editor):
    history_model = apps.get_model('crm', 'CandidateStatusHistory')
    rows = []
    for model_name, record_type in [('Lead', 'lead'), ('WalkIn', 'walkin'), ('Enrollment', 'enrollment')]:
        model = apps.get_model('crm', model_name)
        for record in model.objects.all().only('id', 'status', 'counselor_status').iterator(chunk_size=1000):
            current_status = record.status if record_type == 'enrollment' else (record.counselor_status or record.status)
            if current_status:
                rows.append(history_model(record_type=record_type, record_id=record.id, old_status='', new_status=current_status, remarks='Initial status snapshot.'))
            if len(rows) >= 1000:
                history_model.objects.bulk_create(rows)
                rows = []
    if rows:
        history_model.objects.bulk_create(rows)


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0092_ownership_qualification_reporting_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CandidateStatusHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('record_type', models.CharField(choices=[('lead', 'Lead'), ('walkin', 'Walk-in'), ('enrollment', 'Enrollment')], db_index=True, max_length=20)),
                ('record_id', models.PositiveIntegerField(db_index=True)),
                ('old_status', models.CharField(blank=True, max_length=40)),
                ('new_status', models.CharField(max_length=40)),
                ('remarks', models.TextField(blank=True)),
                ('changed_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('changed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='candidate_status_changes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'candidate_status_history',
                'ordering': ['changed_at', 'id'],
                'indexes': [models.Index(fields=['record_type', 'record_id', 'changed_at'], name='cand_status_record_time_idx')],
            },
        ),
        migrations.RunPython(backfill_current_statuses, migrations.RunPython.noop),
    ]
