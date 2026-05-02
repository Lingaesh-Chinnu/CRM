from django.core.management.base import BaseCommand, CommandError
from django.core.management.color import no_style
from django.db import connection, transaction

from crm.models import (
    BranchTarget,
    BranchTransferRequest,
    Enrollment,
    FollowUp,
    Lead,
    Payment,
    PaymentInstallment,
    RulesSigningRequest,
    User,
    UserTarget,
    WalkIn,
)


CONFIRMATION_TEXT = 'Are you sure? This will permanently delete all test CRM data.'


class Command(BaseCommand):
    help = (
        'Safely deletes CRM demo/test transactional data only. Keeps users, '
        'branches, course catalogue, discounts, permissions, roles, and settings.'
    )

    reset_models = [
        PaymentInstallment,
        Payment,
        RulesSigningRequest,
        BranchTransferRequest,
        Enrollment,
        FollowUp,
        WalkIn,
        Lead,
        UserTarget,
        BranchTarget,
    ]

    delete_order = [
        ('payment installment/collection records', PaymentInstallment),
        ('payment records', Payment),
        ('rules and regulation signing records', RulesSigningRequest),
        ('branch transfer requests', BranchTransferRequest),
        ('enrollments/students', Enrollment),
        ('follow-up/remarks history', FollowUp),
        ('walk-ins', WalkIn),
        ('leads', Lead),
        ('user targets', UserTarget),
        ('branch targets', BranchTarget),
    ]

    def add_arguments(self, parser):
        parser.add_argument(
            '--admin-username',
            help='Username of the active super admin authorizing this reset.',
        )
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Skip the interactive prompt after super-admin verification.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without deleting anything.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        skip_prompt = options['yes']

        admin_user = self._get_authorizing_super_admin(options.get('admin_username'))

        self.stdout.write(self.style.WARNING('This command deletes CRM demo/test transactional data only.'))
        self.stdout.write(f'Authorized by super admin: {admin_user.username}')
        self.stdout.write('')
        self.stdout.write('It will delete:')
        for label, model in self.delete_order:
            self.stdout.write(f'  - {label}: {model.objects.count()}')

        self.stdout.write('')
        self.stdout.write(
            'It will keep users, branches, course catalogue, discounts, '
            'permissions, roles, and static settings.'
        )

        if dry_run:
            self.stdout.write(self.style.SUCCESS('Dry run complete. No data was deleted.'))
            return

        if not skip_prompt:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING(CONFIRMATION_TEXT))
            confirmation = input('Type RESET to confirm: ')
            if confirmation != 'RESET':
                raise CommandError('Reset cancelled. No data was deleted.')

        with transaction.atomic():
            deleted_counts = []
            for label, model in self.delete_order:
                deleted_count, _ = model.objects.all().delete()
                deleted_counts.append((label, deleted_count))

            self._reset_sequences()

        self.stdout.write(self.style.SUCCESS('Demo/test CRM data reset complete.'))
        for label, deleted_count in deleted_counts:
            self.stdout.write(f'  - {label}: {deleted_count} deleted')
        self.stdout.write('')
        self.stdout.write('New leads, walk-ins, enrollments, student IDs, and payments will start fresh.')
        self.stdout.write('Lead numbers will start again from 0001 for the current month.')
        self.stdout.write('Student numbers will restart from 0001 for the current year and branch.')

    def _get_authorizing_super_admin(self, username):
        if not username:
            username = input('Super admin username: ').strip()

        if not username:
            raise CommandError('A super admin username is required to authorize this reset.')

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist as exc:
            raise CommandError('Reset denied. Super admin user was not found.') from exc

        if not user.is_active:
            raise CommandError('Reset denied. The authorizing user is inactive.')

        if user.role != User.Role.SUPER_ADMIN:
            raise CommandError('Reset denied. Only a Super Admin can run this reset.')

        return user

    def _reset_sequences(self):
        sequence_sql = connection.ops.sequence_reset_sql(no_style(), self.reset_models)
        if not sequence_sql:
            return

        with connection.cursor() as cursor:
            for sql in sequence_sql:
                cursor.execute(sql)
