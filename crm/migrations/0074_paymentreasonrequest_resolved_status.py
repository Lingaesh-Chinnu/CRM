from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('crm', '0073_leadtransferhistory'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymentreasonrequest',
            name='resolved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='paymentreasonrequest',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending_response', 'Pending Response'),
                    ('pending_admin_approval', 'Pending Admin Approval'),
                    ('approved', 'Approved'),
                    ('rejected', 'Rejected'),
                    ('resolved', 'Resolved'),
                ],
                db_index=True,
                default='pending_response',
                max_length=30,
            ),
        ),
    ]
