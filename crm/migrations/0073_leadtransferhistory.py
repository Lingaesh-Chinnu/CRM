from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0072_user_identity_color_candidate_important'),
    ]

    operations = [
        migrations.CreateModel(
            name='LeadTransferHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('note', models.CharField(blank=True, max_length=300)),
                ('from_branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lead_transfers_out', to='crm.branch')),
                ('from_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lead_transfers_sent', to=settings.AUTH_USER_MODEL)),
                ('lead', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transfer_history', to='crm.lead')),
                ('to_branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lead_transfers_in', to='crm.branch')),
                ('to_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lead_transfers_received', to=settings.AUTH_USER_MODEL)),
                ('transferred_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lead_transfers_made', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'lead_transfer_history',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='leadtransferhistory',
            index=models.Index(fields=['lead', '-created_at'], name='lead_transfer_lead_time_idx'),
        ),
        migrations.AddIndex(
            model_name='leadtransferhistory',
            index=models.Index(fields=['from_user', 'created_at'], name='lead_transfer_from_idx'),
        ),
        migrations.AddIndex(
            model_name='leadtransferhistory',
            index=models.Index(fields=['to_user', 'created_at'], name='lead_transfer_to_idx'),
        ),
        migrations.AddIndex(
            model_name='leadtransferhistory',
            index=models.Index(fields=['from_branch', 'created_at'], name='lead_transfer_from_branch_idx'),
        ),
        migrations.AddIndex(
            model_name='leadtransferhistory',
            index=models.Index(fields=['to_branch', 'created_at'], name='lead_transfer_to_branch_idx'),
        ),
    ]
