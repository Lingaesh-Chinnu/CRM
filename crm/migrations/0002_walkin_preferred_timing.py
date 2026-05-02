from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='walkin',
            name='preferred_timing',
            field=models.CharField(
                blank=True,
                choices=[
                    ('weekday_morning', 'Weekdays (Morning)'),
                    ('weekday_evening', 'Weekdays (Evening)'),
                    ('weekends', 'Weekends'),
                ],
                max_length=30,
            ),
        ),
    ]
