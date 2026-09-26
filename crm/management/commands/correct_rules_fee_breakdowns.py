from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F

from crm.models import (
    Enrollment,
    Payment,
    PaymentInstallment,
    RulesSigningRequest,
    get_default_installment_schedule,
    normalize_installment_schedule,
)


class Command(BaseCommand):
    """Correct only unsigned Rules-workflow enrollments missing Course Fee snapshots."""

    help = (
        'Dry-run by default. Corrects unsigned Rules-workflow enrollments whose '
        'Course Master discount was not saved to the enrollment.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Commit the correction. Without this flag the command only logs the proposed rows.',
        )

    def queryset(self):
        # The old defect left all of these fields at the original fee. Keep
        # finalized/paid/custom-price records out of this automatic repair:
        # their original commercial terms need a candidate-specific review.
        return (
            Enrollment.objects
            .filter(
                status__in=[
                    Enrollment.Status.DRAFT,
                    Enrollment.Status.PENDING_RULES,
                    Enrollment.Status.RULES_SENT,
                    Enrollment.Status.RULES_SUBMITTED,
                ],
                course__discount_amount__gt=0,
                course_discount_amount=0,
                discount_amount=0,
                final_fees=F('actual_fees'),
                custom_payable_fee__isnull=True,
            )
            .select_related('course')
            .order_by('id')
        )

    @staticmethod
    def fees(enrollment):
        course_actual = Decimal(str(enrollment.course.actual_fees or 0))
        course_discount = min(
            Decimal(str(enrollment.course.discount_amount or 0)),
            course_actual,
        )
        final_fees = max(course_actual - course_discount, Decimal('0'))
        spot = Decimal(str(enrollment.spot_conversion_discount_amount or 0))
        buddy = Decimal(str(enrollment.buddy_offer_amount or 0))
        net_payable = max(final_fees - spot - buddy, Decimal('0'))
        return course_actual, course_discount, final_fees, net_payable

    def log_row(self, enrollment, corrected):
        old = (
            f'actual={enrollment.actual_fees}, course_discount={enrollment.course_discount_amount}, '
            f'final={enrollment.final_fees}, net={enrollment.net_payable_fee}'
        )
        new = (
            f'actual={corrected[0]}, course_discount={corrected[1]}, '
            f'final={corrected[2]}, net={corrected[3]}'
        )
        self.stdout.write(
            f'Enrollment {enrollment.id} | {enrollment.course.name} | Old [{old}] | Corrected [{new}]'
        )

    def handle(self, *args, **options):
        candidates = list(self.queryset())
        for enrollment in candidates:
            self.log_row(enrollment, self.fees(enrollment))

        if not options['apply']:
            self.stdout.write(self.style.WARNING(
                f'Dry run: {len(candidates)} eligible unsigned Rules enrollment(s). Re-run with --apply to commit.'
            ))
            return

        corrected_count = 0
        skipped_count = 0
        with transaction.atomic():
            for candidate in candidates:
                enrollment = (
                    Enrollment.objects.select_for_update().select_related('course').get(pk=candidate.pk)
                )
                # Re-evaluate after the row lock; the command is idempotent and
                # must never touch records that became paid/signed meanwhile.
                if (
                    enrollment.course_discount_amount != 0
                    or enrollment.discount_amount != 0
                    or enrollment.final_fees != enrollment.actual_fees
                    or enrollment.custom_payable_fee is not None
                    or Payment.objects.filter(enrollment=enrollment).exists()
                    or PaymentInstallment.objects.filter(enrollment=enrollment).exists()
                    or RulesSigningRequest.objects.filter(
                        enrollment=enrollment,
                        status=RulesSigningRequest.Status.SUBMITTED,
                    ).exists()
                ):
                    skipped_count += 1
                    self.stdout.write(self.style.WARNING(
                        f'Skipped enrollment {enrollment.id}: its safety conditions changed.'
                    ))
                    continue

                actual, course_discount, expected_final, expected_net = self.fees(enrollment)
                enrollment.actual_fees = actual
                enrollment.course_discount_amount = course_discount
                enrollment.save(update_fields=[
                    'actual_fees', 'course_discount_amount', 'final_fees',
                    'spot_conversion_discount_amount', 'buddy_offer_amount',
                    'net_payable_fee', 'updated_at',
                ])
                enrollment.refresh_from_db()
                if enrollment.final_fees != expected_final or enrollment.net_payable_fee != expected_net:
                    raise RuntimeError(f'Enrollment {enrollment.id} failed post-save fee validation.')

                enrollment.payment_schedule = normalize_installment_schedule(
                    get_default_installment_schedule(enrollment)
                )
                enrollment.save(update_fields=['payment_schedule', 'updated_at'])
                corrected_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'Corrected {corrected_count} enrollment(s); skipped {skipped_count}; no payments or installments were changed.'
        ))
