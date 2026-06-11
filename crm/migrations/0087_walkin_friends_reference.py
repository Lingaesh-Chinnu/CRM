from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0086_walkin_direct_assignment"),
    ]

    operations = [
        migrations.AlterField(
            model_name="walkin",
            name="walk_in_by",
            field=models.CharField(
                blank=True,
                choices=[
                    ("Direct", "Direct"),
                    ("Friends Reference", "Friends Reference"),
                    ("lincy_scania", "Mrs. Lincy Scania"),
                    ("ranganayagi", "Mrs. Ranganayagi"),
                    ("pavithra", "Ms. Pavithra"),
                    ("mahalakshmi", "Ms. Mahalakshmi"),
                    ("saratha", "Mrs. Saratha"),
                ],
                max_length=30,
            ),
        ),
    ]
