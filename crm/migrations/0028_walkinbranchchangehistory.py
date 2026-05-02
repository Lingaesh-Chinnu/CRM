from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0027_leadimporthistory'),
    ]

    operations = [
        migrations.CreateModel(
            name='WalkInBranchChangeHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('changed_at', models.DateTimeField(auto_now_add=True)),
                ('reason', models.TextField(blank=True)),
                ('changed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='walkin_branch_changes', to=settings.AUTH_USER_MODEL)),
                ('new_branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='walkin_branch_changes_to', to='crm.branch')),
                ('old_branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='walkin_branch_changes_from', to='crm.branch')),
                ('walkin', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='branch_change_history', to='crm.walkin')),
            ],
            options={
                'db_table': 'walkin_branch_change_history',
                'ordering': ['-changed_at'],
            },
        ),
    ]
