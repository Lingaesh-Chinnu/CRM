from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0034_alter_enrollment_preferred_timing_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='rulessigningrequest',
            name='selfie_image',
            field=models.FileField(blank=True, null=True, upload_to='rules_selfies/'),
        ),
        migrations.AddField(
            model_name='rulessigningrequest',
            name='submitted_ip',
            field=models.GenericIPAddressField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rulessigningrequest',
            name='submitted_user_agent',
            field=models.TextField(blank=True),
        ),
    ]
