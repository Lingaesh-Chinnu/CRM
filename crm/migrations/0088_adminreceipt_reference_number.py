from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0087_walkin_friends_reference'),
    ]

    operations = [
        migrations.AddField(
            model_name='adminreceipt',
            name='reference_number',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
