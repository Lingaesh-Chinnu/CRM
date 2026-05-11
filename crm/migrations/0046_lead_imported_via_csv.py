from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('crm', '0045_degree_and_text_qualification'),
    ]

    operations = [
        migrations.AddField(
            model_name='lead',
            name='imported_via_csv',
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
