from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0097_walkin_source_description'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='lead',
            index=models.Index(fields=['phone'], name='lead_phone_idx'),
        ),
        migrations.AddIndex(
            model_name='lead',
            index=models.Index(fields=['branch', 'status', 'created_at'], name='lead_branch_status_created_idx'),
        ),
        migrations.AddIndex(
            model_name='lead',
            index=models.Index(fields=['branch', 'source', 'created_at'], name='lead_branch_source_created_idx'),
        ),
        migrations.AddIndex(
            model_name='lead',
            index=models.Index(fields=['next_follow_up_date'], name='lead_next_follow_idx'),
        ),
        migrations.AddIndex(
            model_name='lead',
            index=models.Index(fields=['walkin_date'], name='lead_walkin_date_idx'),
        ),
        migrations.AddIndex(
            model_name='walkin',
            index=models.Index(fields=['phone'], name='walkin_phone_idx'),
        ),
        migrations.AddIndex(
            model_name='walkin',
            index=models.Index(fields=['branch', 'status', 'visit_date'], name='walkin_branch_status_visit_idx'),
        ),
        migrations.AddIndex(
            model_name='walkin',
            index=models.Index(fields=['branch', 'source', 'visit_date'], name='walkin_branch_source_visit_idx'),
        ),
        migrations.AddIndex(
            model_name='walkin',
            index=models.Index(fields=['follow_up_date'], name='walkin_follow_up_idx'),
        ),
        migrations.AddIndex(
            model_name='enrollment',
            index=models.Index(fields=['phone'], name='enrollment_phone_idx'),
        ),
        migrations.AddIndex(
            model_name='enrollment',
            index=models.Index(fields=['branch', 'status', 'enrollment_date'], name='enroll_branch_status_date_idx'),
        ),
        migrations.AddIndex(
            model_name='enrollment',
            index=models.Index(fields=['counselor', 'enrollment_date'], name='enroll_counselor_date_idx'),
        ),
        migrations.AddIndex(
            model_name='enrollment',
            index=models.Index(fields=['source', 'enrollment_date'], name='enroll_source_date_idx'),
        ),
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(fields=['status', 'next_payment_date'], name='payment_status_next_idx'),
        ),
        migrations.AddIndex(
            model_name='paymentinstallment',
            index=models.Index(fields=['payment_date'], name='pay_inst_payment_date_idx'),
        ),
        migrations.AddIndex(
            model_name='paymentinstallment',
            index=models.Index(fields=['enrollment', 'payment_date'], name='pay_inst_enroll_date_idx'),
        ),
        migrations.AddIndex(
            model_name='adminreceipt',
            index=models.Index(fields=['phone'], name='adminreceipt_phone_idx'),
        ),
        migrations.AddIndex(
            model_name='adminreceipt',
            index=models.Index(fields=['payment_date'], name='adminreceipt_payment_date_idx'),
        ),
    ]
