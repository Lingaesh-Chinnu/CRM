from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0088_adminreceipt_reference_number'),
    ]

    operations = [
        migrations.AlterField(
            model_name='adminreceipt',
            name='reference_number',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
