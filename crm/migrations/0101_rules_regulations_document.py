from django.db import migrations, models
import django.db.models.deletion


def backfill_rules_documents(apps, schema_editor):
    RulesSigningRequest = apps.get_model('crm', 'RulesSigningRequest')
    RulesRegulationsDocument = apps.get_model('crm', 'RulesRegulationsDocument')

    queryset = RulesSigningRequest.objects.filter(status='submitted').select_related(
        'enrollment__course',
        'enrollment__branch',
    )
    for signing in queryset.iterator():
        enrollment = signing.enrollment
        if RulesRegulationsDocument.objects.filter(
            signing_request_id=signing.id,
            submitted_at=signing.submitted_at or signing.updated_at or signing.created_at,
        ).exists():
            continue
        RulesRegulationsDocument.objects.create(
            signing_request_id=signing.id,
            enrollment_id=enrollment.id if enrollment else None,
            branch_id=enrollment.branch_id if enrollment else None,
            candidate_name=getattr(enrollment, 'name', '') or '',
            student_number=getattr(enrollment, 'student_number', '') or '',
            phone=getattr(enrollment, 'phone', '') or '',
            course_name=getattr(getattr(enrollment, 'course', None), 'name', '') or '',
            branch_name=getattr(getattr(enrollment, 'branch', None), 'name', '') or '',
            enrollment_date=getattr(enrollment, 'enrollment_date', None),
            submitted_at=signing.submitted_at or signing.updated_at or signing.created_at,
            selfie_image=signing.selfie_image.name if signing.selfie_image else None,
            signed_pdf=signing.signed_pdf.name if signing.signed_pdf else None,
            selfie_image_file=signing.selfie_image_file,
            signed_pdf_file=signing.signed_pdf_file,
            source_token=signing.token,
        )


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0100_buddy_offer_payment_branch'),
    ]

    operations = [
        migrations.CreateModel(
            name='RulesRegulationsDocument',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('candidate_name', models.CharField(max_length=200)),
                ('student_number', models.CharField(blank=True, db_index=True, max_length=20)),
                ('phone', models.CharField(blank=True, db_index=True, max_length=20)),
                ('course_name', models.CharField(blank=True, max_length=200)),
                ('branch_name', models.CharField(blank=True, max_length=200)),
                ('enrollment_date', models.DateField(blank=True, null=True)),
                ('submitted_at', models.DateTimeField(db_index=True)),
                ('selfie_image', models.FileField(blank=True, null=True, upload_to='rules_document_selfies/')),
                ('signed_pdf', models.FileField(blank=True, null=True, upload_to='rules_document_pdfs/')),
                ('selfie_image_file', models.BinaryField(blank=True, null=True)),
                ('signed_pdf_file', models.BinaryField(blank=True, null=True)),
                ('source_token', models.UUIDField(blank=True, db_index=True, null=True)),
                ('branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rules_regulations_documents', to='crm.branch')),
                ('enrollment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rules_regulations_documents', to='crm.enrollment')),
                ('signing_request', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='document_history', to='crm.rulessigningrequest')),
            ],
            options={
                'db_table': 'rules_regulations_documents',
                'ordering': ['-submitted_at', '-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='rulesregulationsdocument',
            index=models.Index(fields=['branch', 'submitted_at'], name='rules_doc_branch_sub_idx'),
        ),
        migrations.AddIndex(
            model_name='rulesregulationsdocument',
            index=models.Index(fields=['candidate_name'], name='rules_doc_name_idx'),
        ),
        migrations.RunPython(backfill_rules_documents, migrations.RunPython.noop),
    ]
