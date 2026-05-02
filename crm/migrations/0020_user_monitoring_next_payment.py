from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
from calendar import monthrange


def add_month(value):
    if not value:
        return None
    month = value.month + 1
    year = value.year + (month - 1) // 12
    month = ((month - 1) % 12) + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def populate_next_payment_dates(apps, schema_editor):
    Payment = apps.get_model('crm', 'Payment')
    for payment in Payment.objects.select_related('enrollment'):
        if payment.status == 'paid':
            payment.next_payment_date = None
        else:
            enrollment = payment.enrollment
            total = payment.total_fees or 0
            paid = payment.paid_amount or 0
            start_date = enrollment.start_date or enrollment.enrollment_date
            if total <= 5000:
                payment.next_payment_date = enrollment.enrollment_date
            elif paid < 5000:
                payment.next_payment_date = enrollment.enrollment_date
            else:
                remaining = total - 5000
                second = remaining // 2
                payment.next_payment_date = start_date if paid < 5000 + second else add_month(start_date)
        payment.save(update_fields=['next_payment_date'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0019_rulessigningrequest'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='next_payment_date',
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
        migrations.CreateModel(
            name='UserSessionLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('login_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('logout_at', models.DateTimeField(blank=True, null=True)),
                ('last_seen_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True)),
                ('is_active_session', models.BooleanField(db_index=True, default=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='session_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'user_session_logs',
                'ordering': ['-login_at'],
            },
        ),
        migrations.RunPython(populate_next_payment_dates, migrations.RunPython.noop),
    ]
