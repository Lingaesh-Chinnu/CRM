from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('crm', '0068_enrollment_custom_payable_fee'),
    ]

    operations = [
        migrations.CreateModel(
            name='EnrollmentCounselorChangeHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reason', models.TextField(blank=True)),
                ('changed_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('changed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='counselor_changes_made', to=settings.AUTH_USER_MODEL)),
                ('enrollment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='counselor_change_history', to='crm.enrollment')),
                ('new_counselor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='counselor_changes_to', to=settings.AUTH_USER_MODEL)),
                ('old_counselor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='counselor_changes_from', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'enrollment_counselor_change_history',
                'ordering': ['-changed_at', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='enrollmentcounselorchangehistory',
            index=models.Index(fields=['enrollment', 'changed_at'], name='enr_coun_hist_enr_chg_idx'),
        ),
        migrations.AddIndex(
            model_name='enrollmentcounselorchangehistory',
            index=models.Index(fields=['new_counselor', 'changed_at'], name='enr_coun_hist_new_chg_idx'),
        ),
    ]
