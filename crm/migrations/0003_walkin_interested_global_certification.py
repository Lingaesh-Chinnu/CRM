from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0002_walkin_preferred_timing'),
    ]

    operations = [
        migrations.AddField(
            model_name='walkin',
            name='interested_global_certification',
            field=models.BooleanField(default=False),
        ),
    ]
