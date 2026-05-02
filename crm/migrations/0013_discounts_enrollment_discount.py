from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('crm', '0012_lead_dob_lead_email_lead_pincode_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Discount',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=150)),
                ('discount_type', models.CharField(choices=[('fixed', 'Fixed Amount'), ('percentage', 'Percentage')], default='fixed', max_length=20)),
                ('value', models.DecimalField(decimal_places=2, max_digits=10)),
                ('apply_to_all_courses', models.BooleanField(default=False)),
                ('valid_from', models.DateField()),
                ('valid_to', models.DateField()),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('courses', models.ManyToManyField(blank=True, related_name='discounts', to='crm.course')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='discounts_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'discounts',
                'ordering': ['-valid_to', 'name'],
            },
        ),
        migrations.AddField(
            model_name='enrollment',
            name='discount',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='enrollments', to='crm.discount'),
        ),
    ]
