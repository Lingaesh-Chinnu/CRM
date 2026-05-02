from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('crm', '0018_conversion_tracking'),
    ]

    operations = [
        migrations.CreateModel(
            name='RulesSigningRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('token', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, unique=True)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('sent', 'Sent'), ('submitted', 'Submitted')], db_index=True, default='pending', max_length=20)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('signature_image', models.ImageField(blank=True, null=True, upload_to='rules_signatures/')),
                ('signed_pdf', models.FileField(blank=True, null=True, upload_to='signed_rules/')),
                ('enrollment', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='rules_signing', to='crm.enrollment')),
                ('sent_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rules_forms_sent', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'rules_signing_requests',
                'ordering': ['-created_at'],
            },
        ),
    ]
