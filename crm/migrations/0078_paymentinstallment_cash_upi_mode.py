from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0077_alter_lead_preferred_timing_choices'),
    ]

    operations = [
        migrations.AlterField(
            model_name='paymentinstallment',
            name='payment_mode',
            field=models.CharField(
                choices=[
                    ('cash', 'Cash'),
                    ('upi', 'UPI'),
                    ('cash_upi', 'Cash + UPI'),
                    ('bank_transfer', 'Bank Transfer'),
                    ('cheque', 'Cheque'),
                    ('card', 'Card'),
                    ('other', 'Other'),
                ],
                default='cash',
                max_length=20,
            ),
        ),
    ]
