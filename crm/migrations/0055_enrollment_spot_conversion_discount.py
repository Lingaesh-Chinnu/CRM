from django.db import migrations, models


def populate_net_payable_fee(apps, schema_editor):
    Enrollment = apps.get_model('crm', 'Enrollment')
    Enrollment.objects.filter(net_payable_fee=0).update(net_payable_fee=models.F('final_fees'))


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0054_discount_valid_to_nullable'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='net_payable_fee',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='spot_conversion_discount_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='spot_conversion_discount_applied',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(populate_net_payable_fee, migrations.RunPython.noop),
    ]
