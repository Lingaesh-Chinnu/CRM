from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0099_enrollment_admin_notes'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='buddy_offer_applied',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='buddy_offer_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name='payment',
            name='payment_branch',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payments', to='crm.branch'),
        ),
        migrations.AddField(
            model_name='paymentinstallment',
            name='collection_branch',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payment_installments', to='crm.branch'),
        ),
    ]
