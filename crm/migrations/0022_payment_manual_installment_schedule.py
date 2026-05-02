from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0021_alter_rulessigningrequest_signature_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='manual_installment_schedule',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
