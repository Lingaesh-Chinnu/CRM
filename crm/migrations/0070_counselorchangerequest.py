from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('crm', '0069_enrollmentcounselorchangehistory'),
    ]

    operations = [
        migrations.CreateModel(
            name='CounselorChangeRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('record_type', models.CharField(choices=[('lead', 'Lead'), ('enrollment', 'Enrollment')], db_index=True, max_length=20)),
                ('candidate_name', models.CharField(max_length=200)),
                ('candidate_phone', models.CharField(blank=True, max_length=20)),
                ('requested_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('reason', models.TextField()),
                ('status', models.CharField(choices=[('pending_counselor_approval', 'Pending Counselor Approval'), ('pending_admin_approval', 'Pending Admin Approval'), ('approved', 'Approved'), ('rejected', 'Rejected')], db_index=True, default='pending_counselor_approval', max_length=40)),
                ('counselor_decision_at', models.DateTimeField(blank=True, null=True)),
                ('counselor_remarks', models.TextField(blank=True)),
                ('admin_decision_at', models.DateTimeField(blank=True, null=True)),
                ('admin_remarks', models.TextField(blank=True)),
                ('force_transfer', models.BooleanField(default=False)),
                ('admin_decision_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='counselor_transfer_admin_decisions', to=settings.AUTH_USER_MODEL)),
                ('branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='counselor_change_requests', to='crm.branch')),
                ('counselor_decision_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='counselor_transfer_decisions', to=settings.AUTH_USER_MODEL)),
                ('current_counselor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='counselor_transfer_requests_from', to=settings.AUTH_USER_MODEL)),
                ('enrollment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='counselor_change_requests', to='crm.enrollment')),
                ('lead', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='counselor_change_requests', to='crm.lead')),
                ('requested_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='counselor_transfer_requests_made', to=settings.AUTH_USER_MODEL)),
                ('requested_counselor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='counselor_transfer_requests_to', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'counselor_change_requests',
                'ordering': ['-requested_at', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='counselorchangerequest',
            index=models.Index(fields=['status', 'requested_at'], name='coun_req_status_req_idx'),
        ),
        migrations.AddIndex(
            model_name='counselorchangerequest',
            index=models.Index(fields=['current_counselor', 'status'], name='coun_req_current_status_idx'),
        ),
        migrations.AddIndex(
            model_name='counselorchangerequest',
            index=models.Index(fields=['requested_counselor', 'status'], name='coun_req_new_status_idx'),
        ),
    ]
