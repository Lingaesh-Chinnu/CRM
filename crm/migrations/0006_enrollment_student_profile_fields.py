from django.db import migrations, models


def copy_walkin_fields_to_enrollment(apps, schema_editor):
    Enrollment = apps.get_model('crm', 'Enrollment')

    for enrollment in Enrollment.objects.select_related('walkin').all():
        walkin = enrollment.walkin
        if not walkin:
            continue

        enrollment.location = enrollment.location or walkin.location
        enrollment.pincode = enrollment.pincode or walkin.pincode
        enrollment.source = enrollment.source or walkin.source
        enrollment.preferred_timing = enrollment.preferred_timing or walkin.preferred_timing
        enrollment.demo_class = enrollment.demo_class or walkin.demo_class
        enrollment.interested_global_certification = (
            enrollment.interested_global_certification or walkin.interested_global_certification
        )
        enrollment.save(update_fields=[
            'location',
            'pincode',
            'source',
            'preferred_timing',
            'demo_class',
            'interested_global_certification',
        ])


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0005_paymentinstallment_bill_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='demo_class',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='interested_global_certification',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='location',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='pincode',
            field=models.CharField(blank=True, max_length=10),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='preferred_timing',
            field=models.CharField(blank=True, choices=[('morning', 'Morning'), ('afternoon', 'Afternoon'), ('evening', 'Evening')], max_length=30),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='source',
            field=models.CharField(blank=True, choices=[('walk_in', 'Walk-in'), ('online', 'Online'), ('referral', 'Referral'), ('social_media', 'Social Media'), ('advertisement', 'Advertisement'), ('whatsapp', 'WhatsApp'), ('other', 'Other')], max_length=20),
        ),
        migrations.RunPython(copy_walkin_fields_to_enrollment, migrations.RunPython.noop),
    ]
