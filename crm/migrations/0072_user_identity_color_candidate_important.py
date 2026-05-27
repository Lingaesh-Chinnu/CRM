from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0071_alter_dataimporthistory_import_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='identity_color',
            field=models.CharField(
                blank=True,
                choices=[
                    ('purple', 'Purple'),
                    ('green', 'Green'),
                    ('orange', 'Orange'),
                    ('blue', 'Blue'),
                    ('cyan', 'Cyan'),
                    ('teal', 'Teal'),
                    ('amber', 'Amber'),
                    ('rose', 'Rose'),
                ],
                default='',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='lead',
            name='is_important',
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name='walkin',
            name='is_important',
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='is_important',
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
