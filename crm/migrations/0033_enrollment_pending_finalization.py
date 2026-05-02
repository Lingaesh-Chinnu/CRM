from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0032_phonenumberchangehistory'),
    ]

    operations = [
        migrations.AlterField(
            model_name='enrollment',
            name='student_number',
            field=models.CharField(blank=True, editable=False, max_length=20, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name='enrollment',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Draft'),
                    ('pending_rules_form', 'Pending Rules Form'),
                    ('rules_form_sent', 'Rules Form Sent'),
                    ('rules_form_submitted', 'Rules Form Submitted'),
                    ('enrolled', 'Enrolled'),
                    ('active', 'Active'),
                    ('completed', 'Completed'),
                    ('dropped', 'Dropped'),
                    ('on_hold', 'On Hold'),
                ],
                db_index=True,
                default='pending_rules_form',
                max_length=30,
            ),
        ),
    ]
