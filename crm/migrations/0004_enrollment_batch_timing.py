from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0003_walkin_interested_global_certification'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='batch_timing',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
