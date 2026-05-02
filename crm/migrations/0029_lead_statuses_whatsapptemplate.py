from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0028_walkinbranchchangehistory'),
    ]

    operations = [
        migrations.AlterField(
            model_name='lead',
            name='status',
            field=models.CharField(choices=[('new', 'New'), ('contacted', 'Contacted'), ('interested', 'Interested'), ('follow_up', 'Follow Up'), ('walk_in', 'Walk-in Scheduled'), ('enrolled', 'Enrolled'), ('dropped', 'Dropped'), ('converted', 'Converted'), ('lost', 'Lost')], db_index=True, default='new', max_length=20),
        ),
        migrations.CreateModel(
            name='WhatsAppTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=150, unique=True)),
                ('template_type', models.CharField(choices=[('lead_follow_up', 'Lead Follow-up'), ('walkin_follow_up', 'Walk-in Follow-up'), ('payment_reminder', 'Payment Reminder'), ('birthday_wish', 'Birthday Wish'), ('rules_form_link', 'Rules Form Link'), ('offer_message', 'Offer Message')], db_index=True, max_length=30)),
                ('message_body', models.TextField()),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='whatsapp_templates_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'whatsapp_templates',
                'ordering': ['template_type', 'name'],
            },
        ),
    ]
