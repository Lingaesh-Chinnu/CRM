from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('crm', '0056_repair_stale_walkin_conversion'),
    ]

    operations = [
        migrations.AlterField(
            model_name='enrollment',
            name='source',
            field=models.CharField(
                blank=True,
                choices=[
                    ('google', 'Google'),
                    ('justdial', 'JustDial'),
                    ('direct', 'Direct'),
                    ('instagram', 'Instagram'),
                    ('facebook', 'Facebook'),
                    ('whatsapp', 'WhatsApp'),
                    ('friends_reference', 'Friends Reference'),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='lead',
            name='source',
            field=models.CharField(
                choices=[
                    ('manual', 'Manual'),
                    ('google', 'Google'),
                    ('website', 'Website'),
                    ('instagram', 'Instagram'),
                    ('facebook', 'Facebook'),
                    ('whatsapp', 'WhatsApp'),
                    ('justdial', 'JustDial'),
                    ('team_reference', 'Team Reference'),
                    ('friends_reference', 'Friends Reference'),
                    ('others', 'Others'),
                ],
                default='manual',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='walkin',
            name='source',
            field=models.CharField(
                choices=[
                    ('google', 'Google'),
                    ('justdial', 'JustDial'),
                    ('direct', 'Direct'),
                    ('instagram', 'Instagram'),
                    ('facebook', 'Facebook'),
                    ('whatsapp', 'WhatsApp'),
                    ('friends_reference', 'Friends Reference'),
                ],
                default='google',
                max_length=30,
            ),
        ),
    ]
