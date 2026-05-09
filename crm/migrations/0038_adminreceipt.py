from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0037_user_must_change_password'),
    ]

    operations = [
        migrations.CreateModel(
            name='AdminReceipt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('receipt_number', models.CharField(editable=False, max_length=50, unique=True)),
                ('name', models.CharField(max_length=200)),
                ('phone', models.CharField(max_length=20)),
                ('purpose', models.CharField(max_length=200)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('payment_mode', models.CharField(choices=[('cash', 'Cash'), ('upi', 'UPI'), ('bank_transfer', 'Bank Transfer'), ('cheque', 'Cheque'), ('card', 'Card'), ('other', 'Other')], default='cash', max_length=20)),
                ('payment_date', models.DateField(default=django.utils.timezone.now)),
                ('notes', models.TextField(blank=True)),
                ('generated_on', models.DateTimeField(default=django.utils.timezone.now)),
                ('generated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='admin_receipts_generated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'admin_receipts',
                'ordering': ['-payment_date', '-created_at'],
            },
        ),
    ]
