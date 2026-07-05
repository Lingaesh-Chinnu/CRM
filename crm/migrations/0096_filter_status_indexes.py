from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0095_enrollment_remarks'),
    ]

    operations = [
        migrations.AlterField(
            model_name='lead',
            name='counselor_status',
            field=models.CharField(blank=True, choices=[('new_lead', 'New Lead'), ('contacted', 'Contacted'), ('no_answer', 'No Answer'), ('continuous_no_answer', 'Continuous No Answer'), ('will_walk_in', 'Will Walk-in'), ('walk_in_completed', 'Walk-in Completed'), ('demo_attended', 'Demo Attended'), ('follow_up', 'Follow-up'), ('ready_to_join', 'Ready to Join'), ('joined', 'Joined'), ('na', 'NA'), ('cna', 'CNA'), ('not_interested', 'Not Interested'), ('lost_to_competitor', 'Lost to Competitor')], db_index=True, max_length=30),
        ),
        migrations.AlterField(
            model_name='walkin',
            name='counselor_status',
            field=models.CharField(blank=True, choices=[('new_lead', 'New Lead'), ('contacted', 'Contacted'), ('no_answer', 'No Answer'), ('continuous_no_answer', 'Continuous No Answer'), ('will_walk_in', 'Will Walk-in'), ('walk_in_completed', 'Walk-in Completed'), ('demo_attended', 'Demo Attended'), ('follow_up', 'Follow-up'), ('ready_to_join', 'Ready to Join'), ('joined', 'Joined'), ('na', 'NA'), ('cna', 'CNA'), ('not_interested', 'Not Interested'), ('lost_to_competitor', 'Lost to Competitor')], db_index=True, max_length=30),
        ),
        migrations.AlterField(
            model_name='enrollment',
            name='counselor_status',
            field=models.CharField(blank=True, choices=[('new_lead', 'New Lead'), ('contacted', 'Contacted'), ('no_answer', 'No Answer'), ('continuous_no_answer', 'Continuous No Answer'), ('will_walk_in', 'Will Walk-in'), ('walk_in_completed', 'Walk-in Completed'), ('demo_attended', 'Demo Attended'), ('follow_up', 'Follow-up'), ('ready_to_join', 'Ready to Join'), ('joined', 'Joined'), ('na', 'NA'), ('cna', 'CNA'), ('not_interested', 'Not Interested'), ('lost_to_competitor', 'Lost to Competitor')], db_index=True, max_length=30),
        ),
        migrations.AlterField(
            model_name='lead',
            name='source',
            field=models.CharField(choices=[('manual', 'Manual'), ('google', 'Google'), ('website', 'Website'), ('instagram', 'Instagram'), ('facebook', 'Facebook'), ('whatsapp', 'WhatsApp'), ('direct_walkin', 'Direct Walk-in'), ('student_reference', 'Student Reference'), ('staff_reference', 'Staff Reference'), ('justdial', 'JustDial'), ('team_reference', 'Team Reference'), ('friends_reference', 'Friends Reference'), ('others', 'Others')], db_index=True, default='manual', max_length=20),
        ),
        migrations.AlterField(
            model_name='walkin',
            name='source',
            field=models.CharField(choices=[('google', 'Google'), ('justdial', 'JustDial'), ('direct', 'Direct Walk-in'), ('instagram', 'Instagram'), ('facebook', 'Facebook'), ('whatsapp', 'WhatsApp'), ('website', 'Website'), ('student_reference', 'Student Reference'), ('friends_reference', 'Friends Reference'), ('staff_reference', 'Staff Reference'), ('lead_conversion', 'Lead Conversion'), ('others', 'Other')], db_index=True, default='google', max_length=30),
        ),
        migrations.AlterField(
            model_name='enrollment',
            name='source',
            field=models.CharField(blank=True, choices=[('google', 'Google'), ('justdial', 'JustDial'), ('direct', 'Direct Walk-in'), ('instagram', 'Instagram'), ('facebook', 'Facebook'), ('whatsapp', 'WhatsApp'), ('website', 'Website'), ('student_reference', 'Student Reference'), ('friends_reference', 'Friends Reference'), ('staff_reference', 'Staff Reference'), ('lead_conversion', 'Lead Conversion'), ('others', 'Other')], db_index=True, max_length=20),
        ),
        migrations.AddIndex(
            model_name='lead',
            index=models.Index(fields=['branch', 'assigned_to', 'source', 'created_at'], name='lead_common_filter_idx'),
        ),
        migrations.AddIndex(
            model_name='walkin',
            index=models.Index(fields=['branch', 'assigned_to', 'source', 'visit_date'], name='walkin_common_filter_idx'),
        ),
        migrations.AddIndex(
            model_name='enrollment',
            index=models.Index(fields=['branch', 'counselor', 'source', 'enrollment_date'], name='enroll_common_filter_idx'),
        ),
    ]
