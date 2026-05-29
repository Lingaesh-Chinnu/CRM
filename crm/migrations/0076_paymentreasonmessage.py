from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('crm', '0075_enrollment_payment_schedule'),
    ]

    operations = [
        migrations.CreateModel(
            name='PaymentReasonMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sender_role', models.CharField(choices=[('admin', 'Admin'), ('user', 'User'), ('system', 'System')], db_index=True, max_length=20)),
                ('message', models.TextField()),
                ('status', models.CharField(blank=True, db_index=True, max_length=30)),
                ('promised_payment_date', models.DateField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reason_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='crm.paymentreasonrequest')),
                ('sender', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payment_reason_messages', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'payment_reason_messages',
                'ordering': ['created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='paymentreasonmessage',
            index=models.Index(fields=['reason_request', 'created_at'], name='payment_rea_reason__e212db_idx'),
        ),
        migrations.AddIndex(
            model_name='paymentreasonmessage',
            index=models.Index(fields=['sender_role', 'created_at'], name='payment_rea_sender__d5f677_idx'),
        ),
    ]
