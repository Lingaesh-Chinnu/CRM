from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('crm', '0064_lead_walkin_conversion_status_source'),
    ]

    operations = [
        migrations.CreateModel(
            name='CourseChangeRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('requested_batch_date', models.DateField(blank=True, null=True)),
                ('reason', models.TextField()),
                ('requested_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')], db_index=True, default='pending', max_length=20)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('admin_remarks', models.TextField(blank=True)),
                ('old_fee', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('new_fee', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('enrollment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='course_change_request_records', to='crm.enrollment')),
                ('old_course', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='course_change_requests_from', to='crm.course')),
                ('requested_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='course_change_requests_made', to=settings.AUTH_USER_MODEL)),
                ('requested_course', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='course_change_requests_to', to='crm.course')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='course_change_requests_reviewed', to=settings.AUTH_USER_MODEL)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='course_change_requests', to='crm.enrollment')),
            ],
            options={
                'db_table': 'course_change_requests',
                'ordering': ['-requested_at', '-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='coursechangerequest',
            index=models.Index(fields=['status', 'requested_at'], name='course_chan_status_5229b2_idx'),
        ),
        migrations.AddIndex(
            model_name='coursechangerequest',
            index=models.Index(fields=['enrollment', 'status'], name='course_chan_enrollm_368e91_idx'),
        ),
    ]
