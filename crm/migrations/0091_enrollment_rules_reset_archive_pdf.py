from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0090_remove_adminreceipt_reference_number'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollmentrulesresethistory',
            name='previous_signed_pdf',
            field=models.FileField(blank=True, null=True, upload_to='archived_signed_rules/'),
        ),
        migrations.AddField(
            model_name='enrollmentrulesresethistory',
            name='previous_signed_pdf_file',
            field=models.BinaryField(blank=True, null=True),
        ),
    ]
