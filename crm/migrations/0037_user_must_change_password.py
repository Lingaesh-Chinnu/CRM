from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0036_rules_signing_database_proof_files'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='must_change_password',
            field=models.BooleanField(default=False),
        ),
    ]
