from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0025_enrollment_created_by'),
    ]

    operations = [
        migrations.AddField(
            model_name='branchtarget',
            name='lead_target',
            field=models.PositiveIntegerField(default=0),
        ),
    ]
