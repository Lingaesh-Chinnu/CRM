import re
from django.db import migrations, models


def populate_next_follow_up_date(apps, schema_editor):
    Lead = apps.get_model('crm', 'Lead')

    for lead in Lead.objects.all():
        match = re.search(r'Next Follow-up Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})', lead.remarks or '', re.IGNORECASE)
        if not match:
            continue

        lead.next_follow_up_date = match.group(1)
        lead.remarks = re.sub(
            r'Next Follow-up Date:\s*[0-9]{4}-[0-9]{2}-[0-9]{2}\s*',
            '',
            lead.remarks or '',
            flags=re.IGNORECASE,
        ).strip()
        lead.save(update_fields=['next_follow_up_date', 'remarks'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0006_enrollment_student_profile_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='lead',
            name='next_follow_up_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.RunPython(populate_next_follow_up_date, migrations.RunPython.noop),
    ]
