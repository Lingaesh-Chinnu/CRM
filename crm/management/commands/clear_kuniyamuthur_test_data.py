from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from crm.models import (
    Branch,
    BranchTarget,
    BranchTransferRequest,
    Enrollment,
    FollowUp,
    Lead,
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
    help = 'Deletes transactional test data for the Kuniyamuthur branch only.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Skip confirmation prompt.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show records that would be deleted without deleting anything.',
        )

    def handle(self, *args, **options):
        branch = self._get_branch()
        querysets = self._build_querysets(branch)

        self.stdout.write(self.style.WARNING(f'Target branch: {branch.name} (id={branch.id})'))
        self.stdout.write('This will delete Kuniyamuthur transactional/test data only.')
        self.stdout.write('')
        self.stdout.write('Records matched:')
        for label, queryset in querysets:
            self.stdout.write(f'  - {label}: {queryset.count()}')

        self.stdout.write('')
        self.stdout.write(
            'Kept: users, branches, courses, discounts, WhatsApp templates, '
            'and all Gandhipuram/Hopes records.'
        )

        if options['dry_run']:
            self.stdout.write(self.style.SUCCESS('Dry run complete. No data was deleted.'))
            return

        if not options['yes']:
            confirmation = input('Type CLEAR KUNIYAMUTHUR to confirm: ')
            if confirmation != 'CLEAR KUNIYAMUTHUR':
                raise CommandError('Cancelled. No data was deleted.')

        with transaction.atomic():
            deleted_counts = []
            for label, queryset in querysets:
                deleted_count, _ = queryset.delete()
                deleted_counts.append((label, deleted_count))

        self.stdout.write(self.style.SUCCESS('Kuniyamuthur test data cleared.'))
        for label, deleted_count in deleted_counts:
            self.stdout.write(f'  - {label}: {deleted_count} deleted')
        self.stdout.write('')
        self.stdout.write(
            'Kuniyamuthur enrollments/students were removed. New Kuniyamuthur '
            'student IDs will start again from 0001 for the current year if no '
            'other Kuniyamuthur enrollments remain.'
        )

    def _get_branch(self):
        branch = Branch.objects.filter(name__iexact=BRANCH_NAME).first()
        if not branch:
            raise CommandError(f'Branch not found: {BRANCH_NAME}')
        return branch

    def _build_querysets(self, branch):
        lead_ids = list(Lead.objects.filter(branch=branch).values_list('id', flat=True))
        walkin_ids = list(WalkIn.objects.filter(branch=branch).values_list('id', flat=True))
        enrollment_ids = list(Enrollment.objects.filter(branch=branch).values_list('id', flat=True))

        return [
            (
                'payment installments',
                PaymentInstallment.objects.filter(enrollment_id__in=enrollment_ids),
            ),
            (
                'payments',
                Payment.objects.filter(enrollment_id__in=enrollment_ids),
            ),
            (
                'rules and regulations signed records',
                RulesSigningRequest.objects.filter(enrollment_id__in=enrollment_ids),
            ),
            (
                'branch transfer requests for Kuniyamuthur walk-ins/enrollments',
                BranchTransferRequest.objects.filter(walkin_id__in=walkin_ids)
                | BranchTransferRequest.objects.filter(enrollment_id__in=enrollment_ids),
            ),
            (
                'follow-up / remarks history',
                FollowUp.objects.filter(record_type=FollowUp.RecordType.LEAD, record_id__in=lead_ids)
                | FollowUp.objects.filter(record_type=FollowUp.RecordType.WALKIN, record_id__in=walkin_ids),
            ),
            (
                'phone number change history',
                PhoneNumberChangeHistory.objects.filter(record_type='lead', record_id__in=lead_ids)
                | PhoneNumberChangeHistory.objects.filter(record_type='walkin', record_id__in=walkin_ids)
                | PhoneNumberChangeHistory.objects.filter(record_type='enrollment', record_id__in=enrollment_ids),
            ),
            (
                'walk-in branch change history',
                WalkInBranchChangeHistory.objects.filter(walkin_id__in=walkin_ids),
            ),
            (
                'enrollments / students',
                Enrollment.objects.filter(id__in=enrollment_ids),
            ),
            (
                'walk-ins',
                WalkIn.objects.filter(id__in=walkin_ids),
            ),
            (
                'leads',
                Lead.objects.filter(id__in=lead_ids),
            ),
            (
                'branch targets',
                BranchTarget.objects.filter(branch=branch),
            ),
            (
                'user targets for Kuniyamuthur users',
                UserTarget.objects.filter(user__branch=branch),
            ),
        ]
