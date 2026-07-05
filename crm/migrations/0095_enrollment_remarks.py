from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0094_expand_candidate_source_choices'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='remarks',
            field=models.TextField(blank=True),
        ),
    ]
