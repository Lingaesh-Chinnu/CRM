from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0020_user_monitoring_next_payment'),
    ]

    operations = [
        migrations.AlterField(
            model_name='rulessigningrequest',
            name='signature_image',
            field=models.FileField(blank=True, null=True, upload_to='rules_signatures/'),
        ),
    ]
