from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0079_rulessigningrequest_viewed_status'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EnrollmentRulesResetHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reset_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('reason', models.TextField()),
                ('previous_rules_status', models.CharField(blank=True, max_length=20)),
                ('previous_signing_token', models.CharField(blank=True, max_length=80)),
                ('previous_schedule_locked', models.BooleanField(default=False)),
                ('previous_payment_schedule', models.JSONField(blank=True, default=list)),
                ('previous_signed', models.BooleanField(default=False)),
                ('enrollment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rules_reset_history', to='crm.enrollment')),
                ('reset_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rules_process_resets', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'enrollment_rules_reset_history',
                'ordering': ['-reset_at', '-id'],
                'indexes': [
                    models.Index(fields=['enrollment', 'reset_at'], name='enr_rules_reset_enr_at_idx'),
                    models.Index(fields=['reset_by', 'reset_at'], name='enr_rules_reset_by_at_idx'),
                ],
            },
        ),
    ]
