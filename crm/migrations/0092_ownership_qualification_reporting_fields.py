from django.db import migrations, models
import django.db.models.deletion


def backfill_ownership(apps, schema_editor):
    Lead = apps.get_model('crm', 'Lead')
    WalkIn = apps.get_model('crm', 'WalkIn')
    Enrollment = apps.get_model('crm', 'Enrollment')

    Lead.objects.filter(assigned_to__isnull=True, created_by__isnull=False).update(assigned_to_id=models.F('created_by_id'))
    for walkin in WalkIn.objects.filter(assigned_to__isnull=True).select_related('lead').iterator():
        owner_id = walkin.lead.assigned_to_id if walkin.lead_id and walkin.lead else None
        owner_id = owner_id or walkin.created_by_id
        if owner_id:
            WalkIn.objects.filter(pk=walkin.pk, assigned_to__isnull=True).update(assigned_to_id=owner_id)

    for enrollment in Enrollment.objects.filter(counselor__isnull=True).select_related(
        'lead', 'walkin', 'walkin__lead'
    ).iterator():
        counselor_id = None
        if enrollment.walkin_id:
            counselor_id = enrollment.walkin.assigned_to_id or enrollment.walkin.counseling_by_id
            if not counselor_id and enrollment.walkin.lead_id:
                counselor_id = enrollment.walkin.lead.assigned_to_id
        if not counselor_id and enrollment.lead_id:
            counselor_id = enrollment.lead.assigned_to_id
        counselor_id = counselor_id or enrollment.created_by_id or enrollment.enrolled_by_id
        if counselor_id:
            Enrollment.objects.filter(pk=enrollment.pk, counselor__isnull=True).update(counselor_id=counselor_id)


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0091_enrollment_rules_reset_archive_pdf'),
    ]

    operations = [
        migrations.AddField(
            model_name='lead',
            name='expected_course_budget',
            field=models.CharField(blank=True, choices=[('15000_25000', 'Rs 15,000-Rs 25,000'), ('26000_36000', 'Rs 26,000-Rs 36,000'), ('37000_47000', 'Rs 37,000-Rs 47,000'), ('not_decided', 'Not Decided')], max_length=20),
        ),
        migrations.AddField(
            model_name='lead',
            name='planned_joining_time',
            field=models.CharField(blank=True, choices=[('immediately', 'Immediately'), ('within_1_week', 'Within 1 Week'), ('within_1_month', 'Within 1 Month'), ('not_decided', 'Not Decided')], max_length=20),
        ),
        migrations.AddField(
            model_name='lead',
            name='primary_goal',
            field=models.CharField(blank=True, choices=[('get_job', 'Get a Job'), ('career_switch', 'Career Switch'), ('salary_hike', 'Salary Hike'), ('internship_skill', 'Internship / Skill Enhancement')], max_length=30),
        ),
        migrations.AddField(
            model_name='lead',
            name='other_institutes_considering',
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name='lead',
            name='counselor_status',
            field=models.CharField(blank=True, choices=[('new_lead', 'New Lead'), ('contacted', 'Contacted'), ('will_walk_in', 'Will Walk-in'), ('walk_in_completed', 'Walk-in Completed'), ('demo_attended', 'Demo Attended'), ('follow_up', 'Follow-up'), ('ready_to_join', 'Ready to Join'), ('joined', 'Joined'), ('na', 'NA'), ('cna', 'CNA'), ('not_interested', 'Not Interested'), ('lost_to_competitor', 'Lost to Competitor')], max_length=30),
        ),
        migrations.AddField(
            model_name='lead',
            name='competitor_status',
            field=models.CharField(blank=True, choices=[('not_enquired_elsewhere', 'Not Enquired Elsewhere'), ('enquired_1', 'Enquired at 1 Institute'), ('enquired_2_3', 'Enquired at 2-3 Institutes'), ('enquired_more_3', 'Enquired at More Than 3 Institutes'), ('fake_enquiry', 'Fake Enquiry')], max_length=40),
        ),
        migrations.AddField(
            model_name='lead',
            name='follow_up_priority',
            field=models.CharField(blank=True, choices=[('high', 'High'), ('medium', 'Medium'), ('low', 'Low')], max_length=10),
        ),
        migrations.AddField(
            model_name='lead',
            name='conversion_probability',
            field=models.CharField(blank=True, choices=[('90', '90%'), ('75', '75%'), ('50', '50%'), ('25', '25%'), ('10', '10%')], max_length=3),
        ),
        migrations.AddField(
            model_name='walkin',
            name='expected_course_budget',
            field=models.CharField(blank=True, choices=[('15000_25000', 'Rs 15,000-Rs 25,000'), ('26000_36000', 'Rs 26,000-Rs 36,000'), ('37000_47000', 'Rs 37,000-Rs 47,000'), ('not_decided', 'Not Decided')], max_length=20),
        ),
        migrations.AddField(
            model_name='walkin',
            name='planned_joining_time',
            field=models.CharField(blank=True, choices=[('immediately', 'Immediately'), ('within_1_week', 'Within 1 Week'), ('within_1_month', 'Within 1 Month'), ('not_decided', 'Not Decided')], max_length=20),
        ),
        migrations.AddField(
            model_name='walkin',
            name='primary_goal',
            field=models.CharField(blank=True, choices=[('get_job', 'Get a Job'), ('career_switch', 'Career Switch'), ('salary_hike', 'Salary Hike'), ('internship_skill', 'Internship / Skill Enhancement')], max_length=30),
        ),
        migrations.AddField(
            model_name='walkin',
            name='other_institutes_considering',
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name='walkin',
            name='counselor_status',
            field=models.CharField(blank=True, choices=[('new_lead', 'New Lead'), ('contacted', 'Contacted'), ('will_walk_in', 'Will Walk-in'), ('walk_in_completed', 'Walk-in Completed'), ('demo_attended', 'Demo Attended'), ('follow_up', 'Follow-up'), ('ready_to_join', 'Ready to Join'), ('joined', 'Joined'), ('na', 'NA'), ('cna', 'CNA'), ('not_interested', 'Not Interested'), ('lost_to_competitor', 'Lost to Competitor')], max_length=30),
        ),
        migrations.AddField(
            model_name='walkin',
            name='competitor_status',
            field=models.CharField(blank=True, choices=[('not_enquired_elsewhere', 'Not Enquired Elsewhere'), ('enquired_1', 'Enquired at 1 Institute'), ('enquired_2_3', 'Enquired at 2-3 Institutes'), ('enquired_more_3', 'Enquired at More Than 3 Institutes'), ('fake_enquiry', 'Fake Enquiry')], max_length=40),
        ),
        migrations.AddField(
            model_name='walkin',
            name='follow_up_priority',
            field=models.CharField(blank=True, choices=[('high', 'High'), ('medium', 'Medium'), ('low', 'Low')], max_length=10),
        ),
        migrations.AddField(
            model_name='walkin',
            name='conversion_probability',
            field=models.CharField(blank=True, choices=[('90', '90%'), ('75', '75%'), ('50', '50%'), ('25', '25%'), ('10', '10%')], max_length=3),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='counselor',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='counseled_enrollments', to='crm.user'),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='expected_course_budget',
            field=models.CharField(blank=True, choices=[('15000_25000', 'Rs 15,000-Rs 25,000'), ('26000_36000', 'Rs 26,000-Rs 36,000'), ('37000_47000', 'Rs 37,000-Rs 47,000'), ('not_decided', 'Not Decided')], max_length=20),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='planned_joining_time',
            field=models.CharField(blank=True, choices=[('immediately', 'Immediately'), ('within_1_week', 'Within 1 Week'), ('within_1_month', 'Within 1 Month'), ('not_decided', 'Not Decided')], max_length=20),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='primary_goal',
            field=models.CharField(blank=True, choices=[('get_job', 'Get a Job'), ('career_switch', 'Career Switch'), ('salary_hike', 'Salary Hike'), ('internship_skill', 'Internship / Skill Enhancement')], max_length=30),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='other_institutes_considering',
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='counselor_status',
            field=models.CharField(blank=True, choices=[('new_lead', 'New Lead'), ('contacted', 'Contacted'), ('will_walk_in', 'Will Walk-in'), ('walk_in_completed', 'Walk-in Completed'), ('demo_attended', 'Demo Attended'), ('follow_up', 'Follow-up'), ('ready_to_join', 'Ready to Join'), ('joined', 'Joined'), ('na', 'NA'), ('cna', 'CNA'), ('not_interested', 'Not Interested'), ('lost_to_competitor', 'Lost to Competitor')], max_length=30),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='competitor_status',
            field=models.CharField(blank=True, choices=[('not_enquired_elsewhere', 'Not Enquired Elsewhere'), ('enquired_1', 'Enquired at 1 Institute'), ('enquired_2_3', 'Enquired at 2-3 Institutes'), ('enquired_more_3', 'Enquired at More Than 3 Institutes'), ('fake_enquiry', 'Fake Enquiry')], max_length=40),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='follow_up_priority',
            field=models.CharField(blank=True, choices=[('high', 'High'), ('medium', 'Medium'), ('low', 'Low')], max_length=10),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='conversion_probability',
            field=models.CharField(blank=True, choices=[('90', '90%'), ('75', '75%'), ('50', '50%'), ('25', '25%'), ('10', '10%')], max_length=3),
        ),
        migrations.RunPython(backfill_ownership, migrations.RunPython.noop),
    ]
