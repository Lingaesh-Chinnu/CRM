from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0067_paymentinstallment_document_snapshot'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='custom_payable_fee',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
    ]
