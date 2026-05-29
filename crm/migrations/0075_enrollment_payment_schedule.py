from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('crm', '0074_paymentreasonrequest_resolved_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='payment_schedule',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='payment_schedule_finalized_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='payment_schedule_locked',
            field=models.BooleanField(default=False),
        ),
    ]
