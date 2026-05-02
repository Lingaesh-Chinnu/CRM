from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0008_walkin_source_and_walkin_by'),
    ]

    operations = [
        migrations.AddField(
            model_name='walkin',
            name='follow_up_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
