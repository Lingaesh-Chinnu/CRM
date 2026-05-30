from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef, Q

from crm.models import Enrollment, Lead, WalkIn


class Command(BaseCommand):
    help = 'Reconcile stored lead statuses from related walk-in and enrollment records.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report how many leads would be updated without changing data.',
        )

    def handle(self, *args, **options):
        queryset = Lead.objects.annotate(
            has_walkin_record=Exists(
                WalkIn.objects.filter(lead_id=OuterRef('pk'), is_deleted=False)
            ),
            has_enrollment_record=Exists(
                Enrollment.objects.filter(
                    Q(lead_id=OuterRef('pk')) | Q(walkin__lead_id=OuterRef('pk')),
                    is_deleted=False,
                )
            ),
        )
        enrolled_ids = list(
            queryset
            .filter(has_enrollment_record=True)
            .exclude(status=Lead.Status.ENROLLED)
            .values_list('id', flat=True)
        )
        walkin_ids = list(
            queryset
            .filter(has_enrollment_record=False, has_walkin_record=True)
            .exclude(status=Lead.Status.CONVERTED_TO_WALKIN)
            .values_list('id', flat=True)
        )
        if options['dry_run']:
            enrolled_count = len(enrolled_ids)
            walkin_count = len(walkin_ids)
        else:
            enrolled_count = Lead.objects.filter(id__in=enrolled_ids).update(
                status=Lead.Status.ENROLLED,
                next_follow_up_date=None,
                converted_to_type='enrollment',
            )
            walkin_count = Lead.objects.filter(id__in=walkin_ids).update(
                status=Lead.Status.CONVERTED_TO_WALKIN,
                next_follow_up_date=None,
                converted_to_type='walkin',
            )
        self.stdout.write(self.style.SUCCESS(
            f'{"Would reconcile" if options["dry_run"] else "Reconciled"} '
            f'{enrolled_count} enrolled leads and {walkin_count} walk-in leads.'
        ))
