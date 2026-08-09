from django.db import migrations, models


def backfill_document_signatures(apps, schema_editor):
    RulesRegulationsDocument = apps.get_model('crm', 'RulesRegulationsDocument')

    queryset = RulesRegulationsDocument.objects.select_related('signing_request')
    for document in queryset.iterator():
        signing = document.signing_request
        if not signing:
            continue
        updates = []
        if not document.signature_image and signing.signature_image:
            document.signature_image = signing.signature_image.name
            updates.append('signature_image')
        if document.signature_image_file is None and signing.signature_image_file is not None:
            document.signature_image_file = signing.signature_image_file
            updates.append('signature_image_file')
        if updates:
            document.save(update_fields=updates)


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0101_rules_regulations_document'),
    ]

    operations = [
        migrations.AddField(
            model_name='rulesregulationsdocument',
            name='signature_image',
            field=models.FileField(blank=True, null=True, upload_to='rules_document_signatures/'),
        ),
        migrations.AddField(
            model_name='rulesregulationsdocument',
            name='signature_image_file',
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_document_signatures, migrations.RunPython.noop),
    ]
