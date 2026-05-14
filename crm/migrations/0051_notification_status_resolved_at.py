from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0050_alter_lead_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='status',
            field=models.CharField(
                choices=[
                    ('unread', 'Unread'),
                    ('read', 'Read'),
                    ('resolved', 'Resolved / Completed'),
                ],
                db_index=True,
                default='unread',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='notification',
            name='resolved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunSQL(
            "UPDATE notifications SET status = CASE WHEN is_read THEN 'read' ELSE 'unread' END",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
