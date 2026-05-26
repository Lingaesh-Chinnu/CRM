from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0065_coursechangerequest'),
    ]

    operations = [
        migrations.AddField(
            model_name='lead',
            name='source_description',
            field=models.TextField(blank=True),
        ),
    ]
