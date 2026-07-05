from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0093_candidate_status_history'),
    ]

    operations = [
        migrations.AlterField(
            model_name='lead',
            name='source',
            field=models.CharField(choices=[('manual', 'Manual'), ('google', 'Google'), ('website', 'Website'), ('instagram', 'Instagram'), ('facebook', 'Facebook'), ('whatsapp', 'WhatsApp'), ('direct_walkin', 'Direct Walk-in'), ('student_reference', 'Student Reference'), ('staff_reference', 'Staff Reference'), ('justdial', 'JustDial'), ('team_reference', 'Team Reference'), ('friends_reference', 'Friends Reference'), ('others', 'Others')], default='manual', max_length=20),
        ),
        migrations.AlterField(
            model_name='walkin',
            name='source',
            field=models.CharField(choices=[('google', 'Google'), ('justdial', 'JustDial'), ('direct', 'Direct Walk-in'), ('instagram', 'Instagram'), ('facebook', 'Facebook'), ('whatsapp', 'WhatsApp'), ('website', 'Website'), ('student_reference', 'Student Reference'), ('friends_reference', 'Friends Reference'), ('staff_reference', 'Staff Reference'), ('lead_conversion', 'Lead Conversion'), ('others', 'Other')], default='google', max_length=30),
        ),
        migrations.AlterField(
            model_name='enrollment',
            name='source',
            field=models.CharField(blank=True, choices=[('google', 'Google'), ('justdial', 'JustDial'), ('direct', 'Direct Walk-in'), ('instagram', 'Instagram'), ('facebook', 'Facebook'), ('whatsapp', 'WhatsApp'), ('website', 'Website'), ('student_reference', 'Student Reference'), ('friends_reference', 'Friends Reference'), ('staff_reference', 'Staff Reference'), ('lead_conversion', 'Lead Conversion'), ('others', 'Other')], max_length=20),
        ),
    ]
