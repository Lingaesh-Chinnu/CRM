from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('crm', '0062_repair_enrollment_conversion_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='CourseChangeHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('old_fee', models.DecimalField(decimal_places=2, max_digits=10)),
                ('new_fee', models.DecimalField(decimal_places=2, max_digits=10)),
                ('reason', models.TextField(blank=True)),
                ('effective_date', models.DateField()),
                ('changed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='course_changes_made', to=settings.AUTH_USER_MODEL)),
                ('enrollment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='course_change_history', to='crm.enrollment')),
                ('new_course', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='course_changes_to', to='crm.course')),
                ('old_course', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='course_changes_from', to='crm.course')),
            ],
            options={
                'db_table': 'course_change_history',
                'ordering': ['-created_at'],
            },
        ),
    ]
