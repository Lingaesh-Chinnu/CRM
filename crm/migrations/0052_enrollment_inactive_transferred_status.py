from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0051_notification_status_resolved_at'),
    ]

    operations = [
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
                    ('inactive', 'Inactive'),
                    ('dropped', 'Dropped'),
                    ('on_hold', 'Hold'),
                    ('transferred', 'Transferred'),
                ],
                db_index=True,
                default='pending_rules_form',
                max_length=30,
            ),
        ),
    ]
