from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0040_repair_superuser_roles'),
    ]

    operations = [
        migrations.AddField(
            model_name='lead',
            name='external_course_interested',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='lead',
            name='external_message',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='lead',
            name='is_duplicate',
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AlterField(
            model_name='lead',
            name='source',
            field=models.CharField(choices=[('google', 'Google'), ('website', 'Website'), ('instagram', 'Instagram'), ('facebook', 'Facebook'), ('whatsapp', 'WhatsApp'), ('justdial', 'JustDial'), ('team_reference', 'Team Reference'), ('friends_reference', 'Friends Reference'), ('others', 'Others')], default='google', max_length=20),
        ),
    ]
