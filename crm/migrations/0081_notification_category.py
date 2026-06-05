from django.db import migrations, models


def categorize_existing_notifications(apps, schema_editor):
    Notification = apps.get_model('crm', 'Notification')
    approval_titles = {
        'Counselor Change Request',
        'Counselor Change Approval Needed',
        'Course Change Request',
        'Installment Added by User',
        'Installment Edited by User',
        'Installment Deleted by User',
        'Payment Awaiting Approval',
        'Payment Reason Response Submitted',
        'Lead Transfer Approval Required',
        'Enrollment Approval Request',
    }
    system_keywords = ['error', 'failed', 'failure', 'crashed']
    Notification.objects.filter(title__in=approval_titles).update(category='approval')
    for keyword in system_keywords:
        Notification.objects.filter(title__icontains=keyword).update(category='system')


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0080_enrollment_rules_reset_history'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='category',
            field=models.CharField(
                choices=[
                    ('approval', 'Approval'),
                    ('system', 'System'),
                    ('info', 'Info'),
                ],
                db_index=True,
                default='info',
                max_length=20,
            ),
        ),
        migrations.RunPython(categorize_existing_notifications, migrations.RunPython.noop),
    ]
