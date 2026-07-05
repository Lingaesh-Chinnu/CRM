from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0096_filter_status_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='walkin',
            name='source_description',
            field=models.TextField(blank=True),
        ),
    ]
