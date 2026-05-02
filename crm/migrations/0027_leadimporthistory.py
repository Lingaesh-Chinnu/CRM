from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0026_branchtarget_lead_target'),
    ]

    operations = [
        migrations.CreateModel(
            name='LeadImportHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('file_name', models.CharField(max_length=255)),
                ('total_rows', models.PositiveIntegerField(default=0)),
                ('success_count', models.PositiveIntegerField(default=0)),
                ('failed_count', models.PositiveIntegerField(default=0)),
                ('duplicate_count', models.PositiveIntegerField(default=0)),
                ('status', models.CharField(choices=[('success', 'Success'), ('partial', 'Partial'), ('failed', 'Failed')], db_index=True, default='failed', max_length=20)),
                ('error_log', models.JSONField(blank=True, default=list)),
                ('branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lead_imports', to='crm.branch')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lead_imports', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'lead_import_history',
                'ordering': ['-created_at'],
            },
        ),
    ]
