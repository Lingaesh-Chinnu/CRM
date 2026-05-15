from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('crm', '0052_enrollment_inactive_transferred_status'),
    ]

    operations = [
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
    ]
