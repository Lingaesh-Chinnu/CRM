from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0083_repair_notification_category_schema'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='WalkInAssignmentChangeRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('field_type', models.CharField(choices=[('assigned_to', 'Walk-in By'), ('counseling_by', 'Counseling By')], db_index=True, max_length=30)),
                ('candidate_name', models.CharField(max_length=200)),
                ('candidate_phone', models.CharField(blank=True, max_length=20)),
                ('reason', models.TextField()),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')], db_index=True, default='pending', max_length=20)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('admin_remarks', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='walkin_assignment_change_requests', to='crm.branch')),
                ('previous_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='walkin_assignment_previous_requests', to=settings.AUTH_USER_MODEL)),
                ('requested_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='walkin_assignment_change_requests', to=settings.AUTH_USER_MODEL)),
                ('requested_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='walkin_assignment_requested_requests', to=settings.AUTH_USER_MODEL)),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='walkin_assignment_reviewed_requests', to=settings.AUTH_USER_MODEL)),
                ('walkin', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignment_change_requests', to='crm.walkin')),
            ],
            options={
                'db_table': 'walkin_assignment_change_requests',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='walkinassignmentchangerequest',
            index=models.Index(fields=['walkin', 'field_type', 'status'], name='walkin_assi_walkin__eec255_idx'),
        ),
    ]
