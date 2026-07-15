from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0098_performance_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='admin_notes',
            field=models.TextField(blank=True),
        ),
    ]
