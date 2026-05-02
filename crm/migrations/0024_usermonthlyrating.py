from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0023_historicalanalyticsentry'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserMonthlyRating',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('year', models.PositiveSmallIntegerField(db_index=True)),
                ('month', models.PositiveSmallIntegerField(db_index=True)),
                ('score', models.PositiveSmallIntegerField(default=100)),
                ('stars', models.PositiveSmallIntegerField(default=5)),
                ('breakdown', models.JSONField(blank=True, default=dict)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='monthly_ratings', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'user_monthly_ratings',
                'ordering': ['-year', '-month', 'user__username'],
                'unique_together': {('user', 'year', 'month')},
            },
        ),
    ]
