from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0035_rules_signing_selfie_audit_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='rulessigningrequest',
            name='selfie_image_file',
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rulessigningrequest',
            name='signature_image_file',
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rulessigningrequest',
            name='signed_pdf_file',
            field=models.BinaryField(blank=True, null=True),
        ),
    ]
