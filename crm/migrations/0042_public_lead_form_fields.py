from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0041_external_lead_capture_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='lead',
            name='qualification',
            field=models.CharField(blank=True, choices=[('school_student', 'School Student'), ('college_student', 'College Student'), ('graduate', 'Graduate'), ('housewife', 'Housewife'), ('working_professional', 'Working Professional')], max_length=30),
        ),
        migrations.AddField(
            model_name='lead',
            name='willing_to_join',
            field=models.CharField(blank=True, choices=[('within_month', 'Within a month'), ('month_later', 'A month later'), ('just_enquiry', 'Just enquiry')], max_length=20),
        ),
    ]
