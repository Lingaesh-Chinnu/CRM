from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('crm', '0044_enrollment_original_final_course'),
    ]

    operations = [
        migrations.AlterField(
            model_name='lead',
            name='qualification',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AlterField(
            model_name='walkin',
            name='qualification',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='lead',
            name='degree',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='walkin',
            name='degree',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='qualification',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='degree',
            field=models.CharField(blank=True, max_length=200),
        ),
    ]
