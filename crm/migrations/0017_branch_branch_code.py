from django.db import migrations, models


DEFAULT_BRANCH_CODES = {
    'gandhipuram': '01',
    'hopes': '02',
    'kuniyamuthur': '03',
}


def populate_branch_codes(apps, schema_editor):
    Branch = apps.get_model('crm', 'Branch')
    used_codes = set()

    for branch in Branch.objects.all().order_by('id'):
        key = (branch.name or '').strip().lower()
        code = DEFAULT_BRANCH_CODES.get(key)
        if code:
            branch.branch_code = code
            branch.save(update_fields=['branch_code'])
            used_codes.add(code)

    next_code = 1
    for branch in Branch.objects.filter(branch_code__isnull=True).order_by('id'):
        while f'{next_code:02d}' in used_codes:
            next_code += 1
        branch.branch_code = f'{next_code:02d}'
        branch.save(update_fields=['branch_code'])
        used_codes.add(branch.branch_code)


def clear_branch_codes(apps, schema_editor):
    Branch = apps.get_model('crm', 'Branch')
    Branch.objects.update(branch_code=None)


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0016_branchtransferrequest_walkin_transferred'),
    ]

    operations = [
        migrations.AddField(
            model_name='branch',
            name='branch_code',
            field=models.CharField(blank=True, max_length=2, null=True, unique=True),
        ),
        migrations.RunPython(populate_branch_codes, clear_branch_codes),
    ]
