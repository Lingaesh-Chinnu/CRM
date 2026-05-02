from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0022_payment_manual_installment_schedule'),
    ]

    operations = [
        migrations.CreateModel(
            name='HistoricalAnalyticsEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('year', models.PositiveSmallIntegerField(choices=[(2023, '2023'), (2024, '2024'), (2025, '2025')], db_index=True)),
                ('month', models.PositiveSmallIntegerField(db_index=True)),
                ('leads_count', models.PositiveIntegerField()),
                ('walkins_count', models.PositiveIntegerField()),
                ('enrollments_count', models.PositiveIntegerField()),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='historical_analytics', to='crm.branch')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='historical_analytics_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'historical_analytics_entries',
                'ordering': ['-year', '-month', 'branch__name'],
                'unique_together': {('year', 'month', 'branch')},
            },
        ),
    ]
