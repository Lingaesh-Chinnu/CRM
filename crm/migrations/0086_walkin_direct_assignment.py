from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0085_walkinassignmentchangerequest_counselor_remarks_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="walkin",
            name="walk_in_by",
            field=models.CharField(
                blank=True,
                choices=[
                    ("Direct", "Direct"),
                    ("lincy_scania", "Mrs. Lincy Scania"),
                    ("ranganayagi", "Mrs. Ranganayagi"),
                    ("pavithra", "Ms. Pavithra"),
                    ("mahalakshmi", "Ms. Mahalakshmi"),
                    ("saratha", "Mrs. Saratha"),
                ],
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name="walkinassignmentchangerequest",
            name="previous_walk_in_by",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name="walkinassignmentchangerequest",
            name="requested_walk_in_by",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AlterField(
            model_name="walkinassignmentchangerequest",
            name="requested_user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="walkin_assignment_requested_requests",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
