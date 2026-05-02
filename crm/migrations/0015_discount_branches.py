from django.db import migrations, models
import django.db.models.deletion


def copy_legacy_branch_to_branches(apps, schema_editor):
    Discount = apps.get_model('crm', 'Discount')
    for discount in Discount.objects.exclude(branch_id=None):
        discount.apply_to_all_branches = False
        discount.save(update_fields=['apply_to_all_branches'])
        discount.branches.add(discount.branch_id)


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0014_discount_branch'),
    ]

    operations = [
        migrations.AlterField(
            model_name='discount',
            name='branch',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='legacy_discounts', to='crm.branch'),
        ),
        migrations.AddField(
            model_name='discount',
            name='apply_to_all_branches',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='discount',
            name='branches',
            field=models.ManyToManyField(blank=True, related_name='discounts', to='crm.branch'),
        ),
        migrations.RunPython(copy_legacy_branch_to_branches, migrations.RunPython.noop),
    ]
