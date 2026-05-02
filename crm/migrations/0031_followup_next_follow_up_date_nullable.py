from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0030_followup_latest_first_ordering'),
    ]

    operations = [
        migrations.AlterField(
            model_name='followup',
            name='next_follow_up_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
