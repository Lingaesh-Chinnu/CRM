from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0078_paymentinstallment_cash_upi_mode'),
    ]

    operations = [
        migrations.AlterField(
            model_name='rulessigningrequest',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('sent', 'Sent'),
                    ('viewed', 'Viewed'),
                    ('submitted', 'Submitted'),
                ],
                db_index=True,
                default='pending',
                max_length=20,
            ),
        ),
    ]
