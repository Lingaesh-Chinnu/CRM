from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Sum

from crm.models import Enrollment, Payment, get_default_installment_schedule, normalize_installment_schedule
from views import rebuild_pending_installment_schedule, schedule_total


class Command(BaseCommand):
    help = 'One-time update for candidate STU202601-0034 fee and payment schedule.'

    student_number = 'STU202601-0034'
    old_fee = Decimal('17900')
    new_fee = Decimal('13900')

    def format_schedule(self, schedule):
        if not schedule:
            return '[]'
        return ', '.join(
            f"{item.get('label')}: {item.get('amount')} due {item.get('due_date')}"
            for item in schedule
        )

    def print_state(self, label, enrollment, payment=None):
        self.stdout.write(f'{label}:')
        self.stdout.write(f'  enrollment_id: {enrollment.id}')
        self.stdout.write(f'  student_number: {enrollment.student_number}')
        self.stdout.write(f'  actual_fees: {enrollment.actual_fees}')
        self.stdout.write(f'  final_fees: {enrollment.final_fees}')
        self.stdout.write(f'  net_payable_fee: {enrollment.net_payable_fee}')
        self.stdout.write(f'  custom_payable_fee: {enrollment.custom_payable_fee}')
        self.stdout.write(f'  payment_schedule_locked: {enrollment.payment_schedule_locked}')
        self.stdout.write(f'  payment_schedule: {self.format_schedule(enrollment.payment_schedule)}')
        if payment:
            self.stdout.write(f'  payment_id: {payment.id}')
            self.stdout.write(f'  payment_total_fees: {payment.total_fees}')
            self.stdout.write(f'  payment_paid_amount: {payment.paid_amount}')
            self.stdout.write(f'  payment_balance: {payment.balance}')
            self.stdout.write(f'  payment_status: {payment.status}')
            self.stdout.write(f'  payment_next_payment_date: {payment.next_payment_date}')
            self.stdout.write(f'  installment_count: {payment.installments.count()}')
            self.stdout.write(
                f'  manual_installment_schedule: '
                f'{self.format_schedule(payment.manual_installment_schedule)}'
            )
        else:
            self.stdout.write('  payment: none')

    def validate_target_values(self, enrollment):
        fields = {
            'actual_fees': Decimal(str(enrollment.actual_fees)),
            'final_fees': Decimal(str(enrollment.final_fees)),
            'net_payable_fee': Decimal(str(enrollment.net_payable_fee)),
        }
        mismatched = [
            f'{field}={value}'
            for field, value in fields.items()
            if value != self.old_fee
        ]
        if mismatched:
            raise CommandError(
                f'{self.student_number} was not at the expected 17900 fee values: '
                f'{", ".join(mismatched)}. No changes were made.'
            )

    def handle(self, *args, **options):
        with transaction.atomic():
            enrollment = Enrollment.objects.get(student_number=self.student_number)
            payment = (
                Payment.objects
                .select_for_update()
                .filter(enrollment=enrollment)
                .first()
            )

            self.print_state('Before', enrollment, payment)
            self.validate_target_values(enrollment)

            installment_count_before = payment.installments.count() if payment else 0
            collected_total = (
                payment.installments.aggregate(total=Sum('amount'))['total']
                if payment
                else Decimal('0')
            ) or Decimal('0')

            enrollment.actual_fees = self.new_fee
            enrollment.final_fees = self.new_fee
            enrollment.net_payable_fee = self.new_fee
            enrollment.custom_payable_fee = self.new_fee
            enrollment.save(update_fields=[
                'actual_fees',
                'final_fees',
                'net_payable_fee',
                'custom_payable_fee',
                'spot_conversion_discount_amount',
                'updated_at',
            ])

            enrollment.refresh_from_db()
            if (
                enrollment.actual_fees != self.new_fee
                or enrollment.final_fees != self.new_fee
                or enrollment.net_payable_fee != self.new_fee
                or enrollment.custom_payable_fee != self.new_fee
            ):
                raise CommandError(
                    'Post-save fee validation failed. Check discount fields before rerunning; '
                    'the transaction has been rolled back.'
                )

            if payment:
                payment.refresh_from_db()
                payment.total_fees = self.new_fee
                payment.paid_amount = collected_total
                payment.manual_installment_schedule = rebuild_pending_installment_schedule(enrollment, payment)
                if schedule_total(payment.manual_installment_schedule) != self.new_fee:
                    raise CommandError(
                        'Regenerated payment schedule total does not match 13900; '
                        'the transaction has been rolled back.'
                    )
                payment.save(update_fields=[
                    'total_fees',
                    'paid_amount',
                    'manual_installment_schedule',
                    'status',
                    'next_payment_date',
                    'updated_at',
                ])
                payment.recalculate_from_installments(save=True)
                payment.refresh_from_db()

                if payment.installments.count() != installment_count_before:
                    raise CommandError(
                        'Installment count changed unexpectedly; the transaction has been rolled back.'
                    )

                enrollment.payment_schedule = payment.manual_installment_schedule
                enrollment.payment_schedule_locked = False
                enrollment.payment_schedule_finalized_at = None
                enrollment.save(update_fields=[
                    'payment_schedule',
                    'payment_schedule_locked',
                    'payment_schedule_finalized_at',
                    'updated_at',
                ])
                enrollment.refresh_from_db()
            else:
                enrollment.payment_schedule = normalize_installment_schedule(
                    get_default_installment_schedule(enrollment)
                )
                enrollment.payment_schedule_locked = False
                enrollment.payment_schedule_finalized_at = None
                enrollment.save(update_fields=[
                    'payment_schedule',
                    'payment_schedule_locked',
                    'payment_schedule_finalized_at',
                    'updated_at',
                ])
                enrollment.refresh_from_db()

            self.print_state('After', enrollment, payment)

        self.stdout.write(self.style.SUCCESS(
            f'Updated only {self.student_number}: fee set to {self.new_fee}, '
            'payment balance recalculated, existing payments preserved, schedule regenerated.'
        ))
