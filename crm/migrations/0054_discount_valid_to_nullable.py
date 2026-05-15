from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0053_lead_manual_source'),
    ]

    operations = [
        migrations.AlterField(
            model_name='discount',
            name='valid_to',
            field=models.DateField(blank=True, null=True),
        ),
    ]
