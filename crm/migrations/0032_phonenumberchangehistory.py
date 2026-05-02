from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('crm', '0031_followup_next_follow_up_date_nullable'),
    ]

    operations = [
        migrations.CreateModel(
            name='PhoneNumberChangeHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('record_type', models.CharField(db_index=True, max_length=20)),
                ('record_id', models.PositiveIntegerField(db_index=True)),
                ('old_phone_number', models.CharField(max_length=20)),
                ('new_phone_number', models.CharField(max_length=20)),
                ('changed_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('changed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='phone_number_changes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'phone_number_change_history',
                'ordering': ['-changed_at'],
            },
        ),
    ]
