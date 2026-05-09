from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from crm.models import (
    Branch,
    BranchTarget,
    BranchTransferRequest,
    Enrollment,
    FollowUp,
    Lead,
    Notification,
    Payment,
    PaymentInstallment,
    PhoneNumberChangeHistory,
    RulesSigningRequest,
    UserTarget,
    WalkIn,
    WalkInBranchChangeHistory,
)


BRANCH_NAME = 'Kuniyamuthur'


class Command(BaseCommand):
    help = 'Safely deletes Kuniyamuthur branch transactional data only.'

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true', help='Skip confirmation prompt.')
        parser.add_argument('--dry-run', action='store_true', help='Show records that would be deleted without deleting anything.')

    def handle(self, *args, **options):
        branch = self._get_branch()
        lead_ids, walkin_ids, enrollment_ids, payment_ids = self._collect_related_ids(branch)
        querysets = self._build_querysets(branch, lead_ids, walkin_ids, enrollment_ids, payment_ids)

        self.stdout.write(self.style.WARNING(f'Target branch: {branch.name} (id={branch.id})'))
        self.stdout.write('This command deletes Kuniyamuthur transactional data only.')
        self.stdout.write('')
        self.stdout.write('Records that will be deleted:')
        for label, queryset in querysets:
            self.stdout.write(f'  - {label}: {queryset.count()}')

        self.stdout.write('')
        self.stdout.write(
            'Kept: admin users, staff users, branches, courses, discounts, '
            'WhatsApp templates, settings, and all Gandhipuram/Hopes data.'
        )

        if options['dry_run']:
            self.stdout.write(self.style.SUCCESS('Dry run complete. No data was deleted.'))
            return

        if not options['yes']:
            confirmation = input('Type CLEAR KUNIYAMUTHUR DATA to confirm: ')
            if confirmation != 'CLEAR KUNIYAMUTHUR DATA':
                raise CommandError('Cancelled. No data was deleted.')

        with transaction.atomic():
            deleted_counts = []
            for label, queryset in querysets:
                deleted_count, _ = queryset.delete()
                deleted_counts.append((label, deleted_count))

        self.stdout.write(self.style.SUCCESS('Kuniyamuthur transactional data cleared successfully.'))
        for label, deleted_count in deleted_counts:
            self.stdout.write(f'  - {label}: {deleted_count} deleted')
        self.stdout.write('')
        self.stdout.write(
            'New Kuniyamuthur student IDs will start again from 0001 for the current '
            'year if no Kuniyamuthur enrollments/students remain.'
        )

    def _get_branch(self):
        branch = Branch.objects.filter(name__iexact=BRANCH_NAME).first()
        if not branch:
            raise CommandError(f'Branch not found: {BRANCH_NAME}')
        return branch

    def _collect_related_ids(self, branch):
        lead_ids = set(Lead.objects.filter(branch=branch).values_list('id', flat=True))
        walkin_ids = set(WalkIn.objects.filter(branch=branch).values_list('id', flat=True))
        enrollment_ids = set(Enrollment.objects.filter(branch=branch).values_list('id', flat=True))

        changed = True
        while changed:
            changed = False

            linked_walkins = set(WalkIn.objects.filter(lead_id__in=lead_ids).values_list('id', flat=True))
            linked_enrollments = set(Enrollment.objects.filter(lead_id__in=lead_ids).values_list('id', flat=True))
            linked_leads_from_walkins = set(WalkIn.objects.filter(id__in=walkin_ids).exclude(lead_id__isnull=True).values_list('lead_id', flat=True))
            linked_enrollments_from_walkins = set(Enrollment.objects.filter(walkin_id__in=walkin_ids).values_list('id', flat=True))
            linked_walkins_from_enrollments = set(Enrollment.objects.filter(id__in=enrollment_ids).exclude(walkin_id__isnull=True).values_list('walkin_id', flat=True))
            linked_leads_from_enrollments = set(Enrollment.objects.filter(id__in=enrollment_ids).exclude(lead_id__isnull=True).values_list('lead_id', flat=True))

            for target_set, additions in (
                (walkin_ids, linked_walkins | linked_walkins_from_enrollments),
                (enrollment_ids, linked_enrollments | linked_enrollments_from_walkins),
                (lead_ids, linked_leads_from_walkins | linked_leads_from_enrollments),
            ):
                before = len(target_set)
                target_set.update(item for item in additions if item)
                if len(target_set) != before:
                    changed = True

        payment_ids = set(Payment.objects.filter(enrollment_id__in=enrollment_ids).values_list('id', flat=True))
        return lead_ids, walkin_ids, enrollment_ids, payment_ids

    def _notification_queryset(self, lead_ids, walkin_ids, enrollment_ids, payment_ids):
        related_urls = {f'/leads/{record_id}' for record_id in lead_ids}
        related_urls.update(f'/walkins/{record_id}' for record_id in walkin_ids)
        related_urls.update(f'/students/{record_id}' for record_id in enrollment_ids)
        related_urls.update(f'/enrollments/{record_id}' for record_id in enrollment_ids)
        related_urls.update(f'/payments/{record_id}' for record_id in payment_ids)
        if not related_urls:
            return Notification.objects.none()
        return Notification.objects.filter(related_url__in=related_urls)

    def _build_querysets(self, branch, lead_ids, walkin_ids, enrollment_ids, payment_ids):
        return [
            ('notifications related to Kuniyamuthur records', self._notification_queryset(lead_ids, walkin_ids, enrollment_ids, payment_ids)),
            ('payment installments / receipt entries', PaymentInstallment.objects.filter(enrollment_id__in=enrollment_ids)),
            ('payments', Payment.objects.filter(id__in=payment_ids)),
            ('rules & regulations signing records', RulesSigningRequest.objects.filter(enrollment_id__in=enrollment_ids)),
            (
                'branch transfer requests linked to Kuniyamuthur records',
                BranchTransferRequest.objects.filter(
                    Q(walkin_id__in=walkin_ids) |
                    Q(enrollment_id__in=enrollment_ids)
                ),
            ),
            (
                'follow-up / remarks history',
                FollowUp.objects.filter(
                    Q(record_type=FollowUp.RecordType.LEAD, record_id__in=lead_ids) |
                    Q(record_type=FollowUp.RecordType.WALKIN, record_id__in=walkin_ids)
                ),
            ),
            (
                'phone number change history',
                PhoneNumberChangeHistory.objects.filter(
                    Q(record_type='lead', record_id__in=lead_ids) |
                    Q(record_type='walkin', record_id__in=walkin_ids) |
                    Q(record_type='enrollment', record_id__in=enrollment_ids) |
                    Q(record_type='student', record_id__in=enrollment_ids)
                ),
            ),
            ('walk-in branch change history', WalkInBranchChangeHistory.objects.filter(walkin_id__in=walkin_ids)),
            ('enrollments / pending enrollments / students', Enrollment.objects.filter(id__in=enrollment_ids)),
            ('walk-ins', WalkIn.objects.filter(id__in=walkin_ids)),
            ('leads', Lead.objects.filter(id__in=lead_ids)),
            ('branch targets', BranchTarget.objects.filter(branch=branch)),
            ('user targets for Kuniyamuthur users', UserTarget.objects.filter(user__branch=branch)),
        ]
