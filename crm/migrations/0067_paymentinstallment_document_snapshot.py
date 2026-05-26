from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0066_lead_source_description'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymentinstallment',
            name='bill_total',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name='paymentinstallment',
            name='document_snapshot',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='paymentinstallment',
            name='document_html',
            field=models.TextField(blank=True),
        ),
    ]
