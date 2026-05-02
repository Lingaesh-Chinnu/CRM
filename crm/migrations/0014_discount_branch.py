from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0013_discounts_enrollment_discount'),
    ]

    operations = [
        migrations.AddField(
            model_name='discount',
            name='branch',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='discounts', to='crm.branch'),
        ),
    ]
