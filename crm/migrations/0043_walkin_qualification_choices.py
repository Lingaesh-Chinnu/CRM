from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0042_public_lead_form_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='walkin',
            name='qualification',
            field=models.CharField(
                blank=True,
                choices=[
                    ('school_student', 'School Student'),
                    ('college_student', 'College Student'),
                    ('graduate', 'Graduate'),
                    ('working_professional', 'Working Professional'),
                    ('housewife', 'Housewife'),
                ],
                max_length=30,
            ),
        ),
    ]
