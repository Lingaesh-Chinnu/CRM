from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0029_lead_statuses_whatsapptemplate'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='followup',
            options={'ordering': ['-created_at', '-id']},
        ),
    ]
