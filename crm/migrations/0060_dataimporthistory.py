from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('crm', '0059_teamnotice_teamnoticereply'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='DataImportHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('file_name', models.CharField(max_length=255)),
                ('import_type', models.CharField(choices=[('leads', 'Leads'), ('enrollments', 'Enrollments'), ('payments', 'Payments')], db_index=True, max_length=30)),
                ('rows_imported', models.PositiveIntegerField(default=0)),
                ('rows_skipped', models.PositiveIntegerField(default=0)),
                ('rows_failed', models.PositiveIntegerField(default=0)),
                ('status', models.CharField(choices=[('previewed', 'Previewed'), ('success', 'Success'), ('partial', 'Partial'), ('failed', 'Failed')], db_index=True, default='previewed', max_length=20)),
                ('error_log', models.JSONField(blank=True, default=list)),
                ('imported_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='data_imports', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'data_import_history',
                'ordering': ['-created_at'],
            },
        ),
    ]
