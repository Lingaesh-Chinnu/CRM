from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0009_walkin_follow_up_date'),
    ]

    operations = [
        migrations.CreateModel(
            name='BranchTarget',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('month', models.PositiveSmallIntegerField()),
                ('year', models.PositiveSmallIntegerField()),
                ('walkin_target', models.PositiveIntegerField(default=0)),
                ('enroll_target', models.PositiveIntegerField(default=0)),
                ('revenue_target', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='targets', to='crm.branch')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='branch_targets_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'branch_targets',
                'ordering': ['-year', '-month', 'branch__name'],
                'unique_together': {('branch', 'month', 'year')},
            },
        ),
    ]
