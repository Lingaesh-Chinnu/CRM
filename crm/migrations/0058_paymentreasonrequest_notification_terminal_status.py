from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('crm', '0057_add_whatsapp_walkin_source'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='status',
            field=models.CharField(
                choices=[
                    ('unread', 'Unread'),
                    ('read', 'Read'),
                    ('resolved', 'Resolved / Completed'),
                    ('approved', 'Approved'),
                    ('rejected', 'Rejected'),
                ],
                db_index=True,
                default='unread',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='PaymentReasonRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('installment_index', models.PositiveSmallIntegerField(db_index=True)),
                ('installment_label', models.CharField(blank=True, max_length=80)),
                ('installment_due_date', models.DateField(blank=True, null=True)),
                ('question', models.TextField(default='Why is this payment still pending?')),
                ('staff_response', models.TextField(blank=True)),
                ('promised_payment_date', models.DateField(blank=True, null=True)),
                ('status', models.CharField(choices=[('pending_response', 'Pending Response'), ('pending_admin_approval', 'Pending Admin Approval'), ('approved', 'Approved'), ('rejected', 'Rejected')], db_index=True, default='pending_response', max_length=30)),
                ('responded_at', models.DateTimeField(blank=True, null=True)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('rejected_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('admin_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payment_reason_requests_created', to=settings.AUTH_USER_MODEL)),
                ('branch_staff', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payment_reason_requests_assigned', to=settings.AUTH_USER_MODEL)),
                ('payment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reason_requests', to='crm.payment')),
            ],
            options={
                'db_table': 'payment_reason_requests',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='paymentreasonrequest',
            index=models.Index(fields=['payment', 'installment_index', 'status'], name='payment_rea_payment_f59bf2_idx'),
        ),
    ]
