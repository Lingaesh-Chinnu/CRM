from django.db import migrations, models


def normalize_walkin_source(apps, schema_editor):
    WalkIn = apps.get_model('crm', 'WalkIn')

    source_map = {
        'walk_in': 'direct',
        'online': 'google',
        'referral': 'friends_reference',
        'social_media': 'instagram',
        'advertisement': 'facebook',
        'whatsapp': 'justdial',
        'other': 'direct',
    }

    for walkin in WalkIn.objects.all():
        next_source = source_map.get(walkin.source, walkin.source)
        if next_source != walkin.source:
            walkin.source = next_source
            walkin.save(update_fields=['source'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0007_lead_next_follow_up_date'),
    ]

    operations = [
        migrations.AlterField(
            model_name='walkin',
            name='source',
            field=models.CharField(choices=[('google', 'Google'), ('justdial', 'JustDial'), ('direct', 'Direct'), ('instagram', 'Instagram'), ('facebook', 'Facebook'), ('friends_reference', 'Friends Reference')], default='google', max_length=30),
        ),
        migrations.AddField(
            model_name='walkin',
            name='walk_in_by',
            field=models.CharField(blank=True, choices=[('lincy_scania', 'Mrs. Lincy Scania'), ('ranganayagi', 'Mrs. Ranganayagi'), ('pavithra', 'Ms. Pavithra'), ('mahalakshmi', 'Ms. Mahalakshmi'), ('saratha', 'Mrs. Saratha')], max_length=30),
        ),
        migrations.RunPython(normalize_walkin_source, migrations.RunPython.noop),
    ]
