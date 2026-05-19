from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('crm', '0058_paymentreasonrequest_notification_terminal_status'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='TeamNotice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=200)),
                ('message', models.TextField()),
                ('audience_type', models.CharField(choices=[('all_branches', 'All Branches'), ('specific_branch', 'Specific Branch')], db_index=True, default='all_branches', max_length=30)),
                ('status', models.CharField(choices=[('active', 'Active'), ('closed', 'Closed'), ('archived', 'Archived')], db_index=True, default='active', max_length=20)),
                ('closed_at', models.DateTimeField(blank=True, null=True)),
                ('archived_at', models.DateTimeField(blank=True, null=True)),
                ('branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='team_notices', to='crm.branch')),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='team_notices_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'team_notices',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='TeamNoticeReply',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reply_message', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='team_notice_replies', to='crm.branch')),
                ('notice', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='replies', to='crm.teamnotice')),
                ('replied_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='team_notice_replies', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'team_notice_replies',
                'ordering': ['created_at'],
            },
        ),
    ]
