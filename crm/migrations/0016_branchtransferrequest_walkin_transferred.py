from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('crm', '0015_discount_branches'),
    ]

    operations = [
        migrations.AlterField(
            model_name='walkin',
            name='status',
            field=models.CharField(choices=[('new', 'New'), ('follow_up', 'Follow Up'), ('converted', 'Converted'), ('not_interested', 'Not Interested'), ('transferred', 'Transferred')], db_index=True, default='new', max_length=20),
        ),
        migrations.CreateModel(
            name='BranchTransferRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('candidate_name', models.CharField(max_length=200)),
                ('phone', models.CharField(max_length=20)),
                ('reason', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')], db_index=True, default='pending', max_length=20)),
                ('enrollment_payload', models.JSONField(blank=True, default=dict)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('review_remarks', models.TextField(blank=True)),
                ('course', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='transfer_requests', to='crm.course')),
                ('current_branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='outgoing_transfer_requests', to='crm.branch')),
                ('enrollment', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='transfer_request', to='crm.enrollment')),
                ('requested_branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='incoming_transfer_requests', to='crm.branch')),
                ('requested_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='branch_transfer_requests', to=settings.AUTH_USER_MODEL)),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_branch_transfer_requests', to=settings.AUTH_USER_MODEL)),
                ('walkin', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transfer_requests', to='crm.walkin')),
            ],
            options={
                'db_table': 'branch_transfer_requests',
                'ordering': ['-created_at'],
            },
        ),
    ]
