from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0038_adminreceipt'),
    ]

    operations = [
        migrations.AddField(
            model_name='whatsappmessage',
            name='candidate_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='whatsappmessage',
            name='provider',
            field=models.CharField(blank=True, default='wati', max_length=30),
        ),
        migrations.AddField(
            model_name='whatsappmessage',
            name='provider_response',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name='whatsappmessage',
            name='message_type',
            field=models.CharField(choices=[('fee_reminder', 'Fee Reminder'), ('payment_reminder', 'Payment Reminder'), ('birthday', 'Birthday Wish'), ('first_class', 'First Class Reminder'), ('walkin_reminder', 'Walk-in Reminder'), ('follow_up', 'Follow-up Reminder'), ('rules_form_link', 'Rules Form Link'), ('offer_message', 'Offer Message'), ('manual', 'Manual')], max_length=30),
        ),
        migrations.AddField(
            model_name='whatsapptemplate',
            name='wati_language_code',
            field=models.CharField(blank=True, default='en', max_length=20),
        ),
        migrations.AddField(
            model_name='whatsapptemplate',
            name='wati_template_name',
            field=models.CharField(blank=True, max_length=150),
        ),
    ]
