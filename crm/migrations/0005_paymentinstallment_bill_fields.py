from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0004_enrollment_batch_timing'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymentinstallment',
            name='bill_generated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='paymentinstallment',
            name='bill_generated_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='generated_bills', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='paymentinstallment',
            name='bill_number',
            field=models.CharField(blank=True, max_length=50),
        ),
    ]
