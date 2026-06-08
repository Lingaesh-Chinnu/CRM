from django.db import migrations, models


def ensure_notification_category_column(apps, schema_editor):
    Notification = apps.get_model('crm', 'Notification')
    table_name = Notification._meta.db_table
    column_name = 'category'
    connection = schema_editor.connection

    with connection.cursor() as cursor:
        existing_columns = {
            column.name
            for column in connection.introspection.get_table_description(cursor, table_name)
        }

    if column_name not in existing_columns:
        field = models.CharField(
            max_length=20,
            choices=[
                ('approval', 'Approval'),
                ('system', 'System'),
                ('info', 'Info'),
            ],
            default='info',
            db_index=True,
        )
        field.set_attributes_from_name(column_name)
        schema_editor.add_field(Notification, field)

    Notification.objects.filter(category__isnull=True).update(category='info')

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
    Notification.objects.filter(title__in=approval_titles).update(category='approval')
    for keyword in ['error', 'failed', 'failure', 'crashed']:
        Notification.objects.filter(title__icontains=keyword).update(category='system')


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0082_walkin_counseling_by'),
    ]

    operations = [
        migrations.RunPython(
            ensure_notification_category_column,
            migrations.RunPython.noop,
        ),
    ]
