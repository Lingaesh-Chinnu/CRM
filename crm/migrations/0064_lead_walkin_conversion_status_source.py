from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0063_coursechangehistory'),
    ]

    operations = [
        migrations.AlterField(
            model_name='lead',
            name='status',
            field=models.CharField(
                choices=[
                    ('new', 'New'),
                    ('counseling_completed', 'Counseling Completed'),
                    ('demo_attended', 'Demo Attended'),
                    ('interested', 'Interested'),
                    ('will_enroll', 'Will Enroll'),
                    ('will_walk_in', 'Will Walk-in'),
                    ('not_answering', 'Not Answering'),
                    ('call_not_attended', 'Call Not Attended'),
                    ('switched_off', 'Switched Off'),
                    ('wrong_number', 'Wrong Number'),
                    ('not_interested', 'Not Interested'),
                    ('joined_other_institute', 'Joined Other Institute'),
                    ('callback_later', 'Callback Later'),
                    ('future_lead', 'Future Lead'),
                    ('continuously_not_answering_calls', 'Continuously Not Answering Calls'),
                    ('contacted', 'Contacted'),
                    ('follow_up', 'Follow Up'),
                    ('walk_in', 'Walk-in Scheduled'),
                    ('enrolled', 'Enrolled'),
                    ('dropped', 'Dropped'),
                    ('converted', 'Converted'),
                    ('converted_to_walkin', 'Converted to Walk-in'),
                    ('lost', 'Lost'),
                ],
                db_index=True,
                default='new',
                max_length=40,
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
                    ('lead_conversion', 'Lead Conversion'),
                ],
                default='google',
                max_length=30,
            ),
        ),
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
                    ('lead_conversion', 'Lead Conversion'),
                ],
                max_length=20,
            ),
        ),
    ]
