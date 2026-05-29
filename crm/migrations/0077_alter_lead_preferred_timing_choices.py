from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0076_paymentreasonmessage'),
    ]

    operations = [
        migrations.AlterField(
            model_name='lead',
            name='preferred_timing',
            field=models.CharField(
                blank=True,
                choices=[
                    ('morning', 'Morning'),
                    ('afternoon', 'Afternoon'),
                    ('evening', 'Evening'),
                    ('weekend', 'Weekend'),
                    ('weekday_morning', 'Weekdays (Morning)'),
                    ('weekday_evening', 'Weekdays (Evening)'),
                    ('weekends', 'Weekends'),
                ],
                max_length=30,
            ),
        ),
    ]
