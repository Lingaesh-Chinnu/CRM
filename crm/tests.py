from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from unittest import mock
from decimal import Decimal
from datetime import timedelta
import base64
import io

from crm.models import Branch, BranchTarget, CounselorChangeRequest, Course, CourseChangeHistory, CourseChangeRequest, Enrollment, EnrollmentCounselorChangeHistory, FollowUp, Lead, LeadTransferHistory, Notification, Payment, PaymentInstallment, PaymentReasonMessage, PaymentReasonRequest, RulesSigningRequest, WalkIn, WalkInAssignmentChangeRequest, WhatsAppMessage


User = get_user_model()


@override_settings(
    ALLOWED_HOSTS=['testserver', 'localhost', '127.0.0.1'],
    SECURE_SSL_REDIRECT=False,
)
class LeadTransferTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name='Gandhipuram', city='Coimbatore')
        self.other_branch = Branch.objects.create(name='Hopes', city='Coimbatore')
        self.course = Course.objects.create(name='Python Full Stack', actual_fees=42900)
        self.admin = User.objects.create_superuser(
            username='transfer-admin',
            email='transfer-admin@example.com',
            password='pass12345',
        )
        self.owner = User.objects.create_user(
            username='transfer-owner',
            email='transfer-owner@example.com',
            password='pass12345',
            branch=self.branch,
        )
        self.same_branch_user = User.objects.create_user(
            username='transfer-same',
            email='transfer-same@example.com',
            password='pass12345',
            branch=self.branch,
        )
        self.other_branch_user = User.objects.create_user(
            username='transfer-other',
            email='transfer-other@example.com',
            password='pass12345',
            branch=self.other_branch,
        )
        self.no_leads_user = User.objects.create_user(
            username='transfer-no-leads',
            email='transfer-no-leads@example.com',
            password='pass12345',
            branch=self.branch,
        )
        self.lead = Lead.objects.create(
            branch=self.branch,
            course=self.course,
            name='Transfer Lead',
            phone='9000002001',
            source=Lead.Source.MANUAL,
            status=Lead.Status.FOLLOW_UP,
            assigned_to=self.owner,
            created_by=self.owner,
        )
        Lead.objects.create(
            branch=self.other_branch,
            course=self.course,
            name='Existing Lead',
            phone='9000002002',
            source=Lead.Source.MANUAL,
            status=Lead.Status.FOLLOW_UP,
            assigned_to=self.other_branch_user,
            created_by=self.other_branch_user,
        )
        self.client.force_authenticate(self.admin)

    def post_transfer(self, target_user, **extra):
        payload = {'transfer_to': target_user.id if target_user else 999999, **extra}
        return self.client.post(f'/api/leads/{self.lead.id}/transfer/', payload, format='json')

    def test_transfer_to_same_branch_user(self):
        response = self.post_transfer(self.same_branch_user)

        self.assertEqual(response.status_code, 200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.assigned_to_id, self.same_branch_user.id)
        self.assertEqual(self.lead.branch_id, self.branch.id)
        self.assertTrue(LeadTransferHistory.objects.filter(lead=self.lead, to_user=self.same_branch_user).exists())
        self.assertTrue(Notification.objects.filter(user=self.same_branch_user, title='Lead Transferred To You').exists())

    def test_transfer_to_different_branch_user(self):
        response = self.post_transfer(self.other_branch_user)

        self.assertEqual(response.status_code, 200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.assigned_to_id, self.other_branch_user.id)
        self.assertEqual(self.lead.branch_id, self.other_branch.id)
        history = LeadTransferHistory.objects.get(lead=self.lead, to_user=self.other_branch_user)
        self.assertEqual(history.from_branch_id, self.branch.id)
        self.assertEqual(history.to_branch_id, self.other_branch.id)

    def test_transfer_to_user_with_existing_leads(self):
        response = self.post_transfer(self.other_branch_user)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Lead.objects.filter(assigned_to=self.other_branch_user).count(), 2)

    def test_transfer_to_user_with_no_leads(self):
        response = self.post_transfer(self.no_leads_user)

        self.assertEqual(response.status_code, 200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.assigned_to_id, self.no_leads_user.id)

    def test_transfer_rejects_missing_user(self):
        response = self.post_transfer(None)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data['success'])
        self.assertEqual(response.data['message'], 'Lead transfer failed')

    def test_transfer_rejects_branch_mismatch(self):
        response = self.post_transfer(self.same_branch_user, transfer_to_branch=self.other_branch.id)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data['success'])
        self.assertEqual(response.data['message'], 'Selected user does not belong to the selected branch.')

    @mock.patch('views.create_user_notification', side_effect=Exception('notification failed'))
    def test_notification_failure_does_not_break_transfer(self, _mock_notification):
        response = self.post_transfer(self.same_branch_user)

        self.assertEqual(response.status_code, 200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.assigned_to_id, self.same_branch_user.id)
        self.assertTrue(LeadTransferHistory.objects.filter(lead=self.lead, to_user=self.same_branch_user).exists())


@override_settings(
    ALLOWED_HOSTS=['testserver', 'localhost', '127.0.0.1'],
    SECURE_SSL_REDIRECT=False,
)
class NotificationRoleRoutingTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name='Gandhipuram', city='Coimbatore')
        self.course = Course.objects.create(name='Python Full Stack', actual_fees=42900)
        self.admin = User.objects.create_superuser(
            username='notification-admin',
            email='notification-admin@example.com',
            password='pass12345',
        )
        self.staff = User.objects.create_user(
            username='notification-staff',
            email='notification-staff@example.com',
            password='pass12345',
            branch=self.branch,
        )

    def create_due_records(self):
        today = timezone.localdate()
        Lead.objects.create(
            branch=self.branch,
            course=self.course,
            name='Due Lead',
            phone='9000001001',
            source=Lead.Source.MANUAL,
            status=Lead.Status.FOLLOW_UP,
            next_follow_up_date=today,
            assigned_to=self.staff,
        )
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            actual_fees=Decimal('42900'),
            discount_amount=Decimal('0'),
            final_fees=Decimal('42900'),
            net_payable_fee=Decimal('42900'),
            name='Due Payment Student',
            phone='9000001002',
            enrollment_date=today,
            status=Enrollment.Status.ENROLLED,
        )
        Payment.objects.create(
            enrollment=enrollment,
            total_fees=Decimal('42900'),
            paid_amount=Decimal('0'),
            next_payment_date=today,
            status=Payment.Status.UNPAID,
        )

    def test_staff_still_receives_operational_smart_notifications(self):
        self.create_due_records()
        self.client.force_authenticate(self.staff)

        response = self.client.get('/api/notifications/')

        self.assertEqual(response.status_code, 200)
        titles = {item['title'] for item in response.data}
        self.assertIn('Lead follow-up due today', titles)
        self.assertIn('Payment due today', titles)

    def test_admin_does_not_receive_operational_smart_notifications(self):
        self.create_due_records()
        self.client.force_authenticate(self.admin)

        response = self.client.get('/api/notifications/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
        self.assertFalse(Notification.objects.filter(user=self.admin).exists())

    def test_admin_notification_center_hides_existing_operational_noise(self):
        Notification.objects.create(
            user=self.admin,
            title='Lead follow-up due today',
            message='Old reminder',
            type=Notification.NType.WARNING,
        )
        Notification.objects.create(
            user=self.admin,
            title='Course Change Request',
            message='Needs review',
            type=Notification.NType.INFO,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get('/api/notifications/?scope=all')

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['title'] for item in response.data], ['Course Change Request'])


@override_settings(
    ALLOWED_HOSTS=['testserver', 'localhost', '127.0.0.1'],
    SECURE_SSL_REDIRECT=False,
)
class LeadImportValidationTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name='Gandhipuram', city='Coimbatore')
        self.staff = User.objects.create_user(
            username='lead-import-staff',
            email='lead-import-staff@example.com',
            password='pass12345',
            branch=self.branch,
        )
        Lead.objects.create(
            branch=self.branch,
            name='Existing Lead',
            phone='9000000001',
            source=Lead.Source.MANUAL,
        )

    def test_import_accepts_custom_course_and_source_text(self):
        self.client.force_authenticate(self.staff)
        csv_data = (
            'Candidate Name,Phone Number,Course Interested,How They Know IIE,Remarks\n'
            'AI Lead,9876543210,Artificial Intelligence,Workshop,Met at seminar desk\n'
            'Duplicate Lead,9000000001,AI & ML,Seminar,Already in CRM\n'
            'Bad Phone,123,Python,Google,Invalid mobile\n'
            'No Course Lead,9876543212,,College Event,Decide course later\n'
        )
        upload = SimpleUploadedFile('event-leads.csv', csv_data.encode('utf-8'), content_type='text/csv')

        response = self.client.post('/api/leads/import/', {'file': upload}, format='multipart')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['successfully_imported'], 2)
        self.assertEqual(response.data['duplicate_rows'], 1)
        self.assertEqual(response.data['failed_rows'], 1)
        self.assertEqual(len(response.data['errors']), 1)
        self.assertIn('Phone Number is invalid.', response.data['errors'][0]['error'])

        ai_lead = Lead.objects.get(phone='9876543210')
        self.assertIsNone(ai_lead.course)
        self.assertEqual(ai_lead.external_course_interested, 'Artificial Intelligence')
        self.assertEqual(ai_lead.source, Lead.Source.OTHERS)
        self.assertEqual(ai_lead.source_description, 'Workshop')

        no_course_lead = Lead.objects.get(phone='9876543212')
        self.assertEqual(no_course_lead.external_course_interested, '')
        self.assertEqual(no_course_lead.source, Lead.Source.OTHERS)
        self.assertEqual(no_course_lead.source_description, 'College Event')


@override_settings(
    ALLOWED_HOSTS=['testserver', 'localhost', '127.0.0.1'],
    SECURE_SSL_REDIRECT=False,
)
class MonthlyRatingResetTests(APITestCase):
    def test_current_month_rating_starts_at_100_before_targets_are_due(self):
        branch = Branch.objects.create(name='Rating Branch', city='Coimbatore')
        staff = User.objects.create_user(
            username='rating-staff',
            email='rating-staff@example.com',
            password='pass12345',
            branch=branch,
        )
        today = timezone.localdate()
        BranchTarget.objects.create(
            branch=branch,
            month=today.month,
            year=today.year,
            lead_target=50,
            walkin_target=25,
            enroll_target=10,
            revenue_target=Decimal('100000'),
        )

        from views import calculate_user_monthly_rating

        rating = calculate_user_monthly_rating(staff, today.year, today.month)

        self.assertEqual(rating.score, 100)
        self.assertEqual(rating.stars, 5)
        self.assertEqual(rating.breakdown['target_achievement']['deduction'], 0)
        self.assertEqual(rating.breakdown['activity']['deduction'], 0)


@override_settings(
    ALLOWED_HOSTS=['testserver', 'localhost', '127.0.0.1'],
    SECURE_SSL_REDIRECT=False,
)
class PaymentScheduleSyncTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name='Gandhipuram', city='Coimbatore')
        self.course = Course.objects.create(name='Python Full Stack', actual_fees=42900)
        self.admin = User.objects.create_superuser(
            username='schedule-admin',
            email='schedule-admin@example.com',
            password='pass12345',
        )
        self.staff = User.objects.create_user(
            username='schedule-staff',
            email='schedule-staff@example.com',
            password='pass12345',
            branch=self.branch,
            role=User.Role.STAFF,
        )
        self.enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            actual_fees=Decimal('42900'),
            discount_amount=Decimal('0'),
            final_fees=Decimal('42900'),
            net_payable_fee=Decimal('42900'),
            name='Schedule Candidate',
            phone='9000000200',
            email='schedule@example.com',
            enrollment_date='2026-05-01',
            start_date='2026-05-15',
            enrolled_by=self.staff,
            created_by=self.staff,
            status=Enrollment.Status.ENROLLED,
        )
        self.payment = Payment.objects.create(
            enrollment=self.enrollment,
            total_fees=Decimal('42900'),
        )
        PaymentInstallment.objects.create(
            payment=self.payment,
            enrollment=self.enrollment,
            amount=Decimal('15000'),
            payment_mode=PaymentInstallment.Mode.CASH,
            reference_number='CASH-001',
            payment_date='2026-05-02',
        )

    def test_update_schedule_recalculates_candidate_fee_without_resetting_paid_amount(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(f'/api/payments/{self.payment.id}/update-schedule/', {
            'payment_schedule': [
                {'label': '1st Installment', 'amount': '5000', 'due_date': '2026-05-01'},
                {'label': '2nd Installment', 'amount': '16950', 'due_date': '2026-05-15'},
                {'label': '3rd Installment', 'amount': '16950', 'due_date': '2026-06-15'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.payment.refresh_from_db()
        self.enrollment.refresh_from_db()
        self.course.refresh_from_db()
        self.assertEqual(self.payment.total_fees, Decimal('38900.00'))
        self.assertEqual(self.payment.paid_amount, Decimal('15000.00'))
        self.assertEqual(self.payment.balance, Decimal('23900.00'))
        self.assertEqual(self.payment.status, Payment.Status.PARTIAL)
        self.assertEqual(self.enrollment.custom_payable_fee, Decimal('38900.00'))
        self.assertEqual(self.enrollment.net_payable_fee, Decimal('38900.00'))
        self.assertEqual(self.course.actual_fees, Decimal('42900.00'))
        self.assertEqual(Enrollment.objects.count(), 1)
        self.assertEqual(response.data['total_fees'], '38900.00')
        self.assertEqual(response.data['paid_amount'], '15000.00')
        self.assertEqual(response.data['balance'], '23900.00')
        self.assertEqual(response.data['status'], Payment.Status.PARTIAL)

    def test_update_schedule_rejects_negative_installment_amounts(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(f'/api/payments/{self.payment.id}/update-schedule/', {
            'payment_schedule': [
                {'label': '1st Installment', 'amount': '-1', 'due_date': '2026-05-01'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.total_fees, Decimal('42900.00'))

    def test_payment_reason_conversation_tracks_admin_and_staff_messages(self):
        self.client.force_authenticate(self.admin)

        create_response = self.client.post('/api/payment-reason-requests/', {
            'payment': self.payment.id,
            'installment_index': 2,
            'message': 'Why is payment pending?',
        }, format='json')

        self.assertEqual(create_response.status_code, 201)
        reason_request = PaymentReasonRequest.objects.get()
        self.assertEqual(reason_request.branch_staff, self.staff)
        self.assertEqual(PaymentReasonMessage.objects.count(), 1)
        self.assertEqual(create_response.data['messages'][0]['message'], 'Why is payment pending?')

        self.client.force_authenticate(self.staff)
        promised_date = (timezone.localdate() + timedelta(days=7)).isoformat()
        reply_response = self.client.post(f'/api/payment-reason-requests/{reason_request.id}/messages/', {
            'message': 'Student requested salary delay.',
            'promised_payment_date': promised_date,
        }, format='json')

        self.assertEqual(reply_response.status_code, 200)
        reason_request.refresh_from_db()
        self.assertEqual(reason_request.status, PaymentReasonRequest.Status.PENDING_ADMIN_APPROVAL)
        self.assertEqual(reason_request.staff_response, 'Student requested salary delay.')
        self.assertEqual(str(reason_request.promised_payment_date), promised_date)
        self.assertEqual(len(reply_response.data['messages']), 2)

        self.client.force_authenticate(self.admin)
        followup_response = self.client.post(f'/api/payment-reason-requests/{reason_request.id}/messages/', {
            'message': 'Okay, approved till promised date.',
        }, format='json')

        self.assertEqual(followup_response.status_code, 200)
        self.assertEqual(len(followup_response.data['messages']), 3)
        self.assertEqual(followup_response.data['messages'][-1]['sender_role'], 'admin')


@override_settings(
    ALLOWED_HOSTS=['testserver', 'localhost', '127.0.0.1'],
    SECURE_SSL_REDIRECT=False,
)
class PublicWalkInFormTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name='Gandhipuram', city='Coimbatore')
        self.other_branch = Branch.objects.create(name='Hopes', city='Coimbatore')
        self.course = Course.objects.create(name='Python Full Stack', actual_fees=10000)
        self.final_course = Course.objects.create(name='Software Testing', actual_fees=15000)
        self.staff = User.objects.create_user(
            username='staff',
            email='staff@example.com',
            password='pass12345',
            branch=self.branch,
            role=User.Role.STAFF,
        )
        self.other_staff = User.objects.create_user(
            username='other-staff',
            email='other-staff@example.com',
            password='pass12345',
            branch=self.other_branch,
            role=User.Role.STAFF,
        )
        self.admin = User.objects.create_superuser(
            username='admin',
            email='admin@example.com',
            password='pass12345',
        )
        self.payload = {
            'branch': self.branch.id,
            'name': 'Candidate One',
            'dob': '2000-01-01',
            'phone': '+91 98765 43210',
            'email': 'candidate@example.com',
            'location': 'Coimbatore',
            'pincode': '641001',
            'course': self.course.id,
            'qualification': WalkIn.Qualification.COLLEGE_STUDENT,
            'year_of_passing': 2026,
            'college_company': 'IIE College',
            'preferred_timing': WalkIn.PreferredTiming.WEEKDAY_MORNING,
            'demo_class': True,
            'interested_global_certification': True,
            'source': WalkIn.Source.DIRECT,
            'visit_date': '2026-05-11',
        }

    def test_public_walkin_submit_creates_branch_record_without_login(self):
        response = self.client.post('/api/public/walkin/', self.payload, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['detail'], 'Thanks for filling out the form.')
        walkin = WalkIn.objects.get(phone='9876543210')
        self.assertEqual(walkin.branch, self.branch)
        self.assertEqual(walkin.course, self.course)
        self.assertEqual(walkin.qualification, WalkIn.Qualification.COLLEGE_STUDENT)
        self.assertEqual(walkin.year_of_passing, 2026)
        self.assertEqual(walkin.college_company, 'IIE College')
        self.assertTrue(walkin.interested_global_certification)

    def test_walkin_by_and_counseling_by_have_separate_branch_rules(self):
        self.client.force_authenticate(self.admin)
        create_response = self.client.post('/api/public/walkin/', self.payload, format='json')
        self.assertEqual(create_response.status_code, 201)
        walkin = WalkIn.objects.get(phone='9876543210')

        walkin_by_response = self.client.get('/api/walkins/walk-in-by-options/')
        self.assertEqual(walkin_by_response.status_code, 200)
        walkin_by_ids = {row['id'] for row in walkin_by_response.data}
        self.assertIn(self.staff.id, walkin_by_ids)
        self.assertIn(self.other_staff.id, walkin_by_ids)

        counseling_options_response = self.client.get('/api/walkins/staff-options/', {'branch': self.branch.id})
        self.assertEqual(counseling_options_response.status_code, 200)
        counseling_ids = {row['id'] for row in counseling_options_response.data}
        self.assertIn(self.staff.id, counseling_ids)
        self.assertNotIn(self.other_staff.id, counseling_ids)

        walkin_by_update = self.client.patch(
            f'/api/walkins/{walkin.id}/',
            {'assigned_to': self.other_staff.id},
            format='json',
        )
        self.assertEqual(walkin_by_update.status_code, 200)
        walkin.refresh_from_db()
        self.assertEqual(walkin.assigned_to, self.other_staff)

        invalid_counseling_update = self.client.patch(
            f'/api/walkins/{walkin.id}/',
            {'counseling_by': self.other_staff.id},
            format='json',
        )
        self.assertEqual(invalid_counseling_update.status_code, 400)

        counseling_update = self.client.patch(
            f'/api/walkins/{walkin.id}/',
            {'counseling_by': self.staff.id},
            format='json',
        )
        self.assertEqual(counseling_update.status_code, 200)
        walkin.refresh_from_db()
        self.assertEqual(walkin.counseling_by, self.staff)

    def test_walkin_assignment_fields_lock_and_change_by_admin_request(self):
        self.client.force_authenticate(self.admin)
        create_response = self.client.post('/api/public/walkin/', self.payload, format='json')
        self.assertEqual(create_response.status_code, 201)
        walkin = WalkIn.objects.get(phone='9876543210')

        self.client.force_authenticate(self.staff)
        initial_response = self.client.patch(
            f'/api/walkins/{walkin.id}/',
            {'assigned_to': self.staff.id, 'counseling_by': self.staff.id},
            format='json',
        )
        self.assertEqual(initial_response.status_code, 200)
        walkin.refresh_from_db()
        self.assertEqual(walkin.assigned_to, self.staff)
        self.assertEqual(walkin.counseling_by, self.staff)

        direct_change = self.client.patch(
            f'/api/walkins/{walkin.id}/',
            {'assigned_to': self.other_staff.id},
            format='json',
        )
        self.assertEqual(direct_change.status_code, 403)

        request_response = self.client.post(
            f'/api/walkins/{walkin.id}/request-assignment-change/',
            {
                'field_type': WalkInAssignmentChangeRequest.FieldType.WALK_IN_BY,
                'requested_user': self.other_staff.id,
                'reason': 'Original referrer was captured incorrectly.',
            },
            format='json',
        )
        self.assertEqual(request_response.status_code, 201)
        change_request = WalkInAssignmentChangeRequest.objects.get(walkin=walkin)
        self.assertEqual(change_request.previous_user, self.staff)
        self.assertEqual(change_request.requested_user, self.other_staff)
        self.assertEqual(change_request.requested_by, self.staff)
        self.assertEqual(change_request.status, WalkInAssignmentChangeRequest.Status.PENDING)
        self.assertTrue(Notification.objects.filter(title='Walk-in Assignment Change Request').exists())

        staff_approval = self.client.post(
            f'/api/walkin-assignment-change-requests/{change_request.id}/approve/',
            {},
            format='json',
        )
        self.assertEqual(staff_approval.status_code, 403)

        self.client.force_authenticate(self.admin)
        admin_approval = self.client.post(
            f'/api/walkin-assignment-change-requests/{change_request.id}/approve/',
            {'admin_remarks': 'Approved after review.'},
            format='json',
        )
        self.assertEqual(admin_approval.status_code, 200)
        walkin.refresh_from_db()
        change_request.refresh_from_db()
        self.assertEqual(walkin.assigned_to, self.other_staff)
        self.assertEqual(change_request.status, WalkInAssignmentChangeRequest.Status.APPROVED)
        self.assertEqual(change_request.reviewed_by, self.admin)
        self.assertIsNotNone(change_request.reviewed_at)

    def test_public_lead_form_uses_default_courses_without_course_records(self):
        Course.objects.all().delete()

        options_response = self.client.get('/api/public/lead-form/')

        self.assertEqual(options_response.status_code, 200)
        self.assertEqual(
            [item['name'] for item in options_response.data['courses']],
            [
                'Artificial Intelligence',
                'Data Analytics',
                'Full Stack Python',
                'Full Stack Java',
                'MERN Stack',
                'Cyber Security',
                'Digital Marketing',
            ],
        )

        response = self.client.post('/api/public/lead-form/', {
            'full_name': 'Public AI Lead',
            'mobile_number': '9876543211',
            'course_interested': 'Artificial Intelligence',
            'branch': self.branch.id,
            'preferred_timing': Lead.PreferredTiming.MORNING,
        }, format='json')

        self.assertEqual(response.status_code, 201)
        lead = Lead.objects.get(phone='9876543211')
        self.assertIsNone(lead.course)
        self.assertEqual(lead.external_course_interested, 'Artificial Intelligence')

    def test_manual_walkin_create_clears_conversion_fields(self):
        self.client.force_authenticate(self.staff)
        payload = {
            **self.payload,
            'phone': '9000000111',
            'remarks': 'Candidate joined demo discussion',
            'status': WalkIn.Status.CONVERTED,
            'converted_to_type': 'enrollment',
            'converted_record_id': 99999,
            'converted_at': '2026-05-11T10:00:00Z',
        }

        response = self.client.post('/api/walkins/', payload, format='json')

        self.assertEqual(response.status_code, 201)
        walkin = WalkIn.objects.get(phone='9000000111')
        self.assertEqual(walkin.status, WalkIn.Status.NEW)
        self.assertEqual(walkin.converted_to_type, '')
        self.assertIsNone(walkin.converted_record_id)
        self.assertIsNone(walkin.converted_at)
        self.assertFalse(response.data['is_converted_to_enrollment'])

    def test_manual_walkin_create_and_update_accepts_whatsapp_source(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post('/api/walkins/', {
            **self.payload,
            'phone': '9000000116',
            'source': 'whatsapp',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        walkin = WalkIn.objects.get(phone='9000000116')
        self.assertEqual(walkin.source, WalkIn.Source.WHATSAPP)
        self.assertEqual(response.data['source_display'], 'WhatsApp')

        patch_response = self.client.patch(f'/api/walkins/{walkin.id}/', {
            'source': 'whatsapp',
        }, format='json')

        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.data['source'], WalkIn.Source.WHATSAPP)
        self.assertEqual(patch_response.data['source_display'], 'WhatsApp')

    def test_public_walkin_repeat_phone_updates_existing_record(self):
        first = self.client.post('/api/public/walkin/', self.payload, format='json')
        payload = {**self.payload, 'name': 'Candidate Updated', 'phone': '9876543210'}

        second = self.client.post('/api/public/walkin/', payload, format='json')

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data['updated'])
        self.assertEqual(WalkIn.objects.count(), 1)
        self.assertEqual(WalkIn.objects.get().name, 'Candidate Updated')

    def test_branch_staff_and_admin_can_view_public_walkin(self):
        self.client.post('/api/public/walkin/', self.payload, format='json')

        self.client.force_authenticate(self.staff)
        staff_response = self.client.get('/api/walkins/')
        self.assertEqual(staff_response.status_code, 200)
        self.assertEqual(len(staff_response.data), 1)
        self.assertEqual(staff_response.data[0]['branch_name'], self.branch.name)

        self.client.force_authenticate(self.admin)
        admin_response = self.client.get('/api/walkins/')
        self.assertEqual(admin_response.status_code, 200)
        self.assertEqual(len(admin_response.data), 1)

    def test_walkin_to_enrollment_can_change_course_without_overwriting_walkin_course(self):
        walkin = WalkIn.objects.create(
            branch=self.branch,
            course=self.course,
            name='Course Change Candidate',
            dob='2000-01-01',
            phone='9000000001',
            email='course-change@example.com',
            location='Coimbatore',
            pincode='641001',
            qualification=WalkIn.Qualification.GRADUATE,
            year_of_passing=2025,
            college_company='IIE College',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            source=WalkIn.Source.DIRECT,
            visit_date='2026-05-11',
            follow_up_date='2026-05-20',
            remarks='Not Interested',
            status=WalkIn.Status.NOT_INTERESTED,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/walkins/{walkin.id}/convert-to-enrollment/', {
            'branch': self.branch.id,
            'name': walkin.name,
            'phone': walkin.phone,
            'course': self.final_course.id,
            'preferred_timing': walkin.preferred_timing,
            'enrollment_date': '2026-05-11',
            'start_date': '2026-05-12',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        walkin.refresh_from_db()
        enrollment = Enrollment.objects.get(walkin=walkin)
        self.assertEqual(walkin.course, self.course)
        self.assertEqual(enrollment.course, self.final_course)
        self.assertEqual(enrollment.original_walkin_course, self.course)
        self.assertEqual(enrollment.final_enrollment_course, self.final_course)
        self.assertEqual(enrollment.actual_fees, self.final_course.actual_fees)
        self.assertEqual(walkin.status, WalkIn.Status.CONVERTED)
        self.assertEqual(walkin.remarks, 'Not Interested')
        self.assertIsNone(walkin.follow_up_date)
        conversion_follow_up = FollowUp.objects.get(
            record_type=FollowUp.RecordType.WALKIN,
            record_id=walkin.id,
            remarks='Joined - No follow-up required',
        )
        self.assertIsNone(conversion_follow_up.next_follow_up_date)

    def test_stale_converted_walkin_without_enrollment_is_not_treated_as_converted(self):
        walkin = WalkIn.objects.create(
            branch=self.branch,
            course=self.course,
            name='Stale Converted Candidate',
            dob='2000-01-01',
            phone='9000000112',
            email='stale@example.com',
            location='Coimbatore',
            pincode='641001',
            qualification=WalkIn.Qualification.GRADUATE,
            year_of_passing=2025,
            college_company='IIE College',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            source=WalkIn.Source.DIRECT,
            visit_date='2026-05-11',
            status=WalkIn.Status.CONVERTED,
            converted_to_type='enrollment',
            converted_record_id=99999,
        )
        self.client.force_authenticate(self.staff)

        detail_response = self.client.get(f'/api/walkins/{walkin.id}/')

        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data['status'], WalkIn.Status.NEW)
        self.assertEqual(detail_response.data['converted_to_type'], '')
        self.assertIsNone(detail_response.data['converted_record_id'])
        self.assertFalse(detail_response.data['is_converted_to_enrollment'])

        convert_response = self.client.post(f'/api/walkins/{walkin.id}/convert-to-enrollment/', {
            'branch': self.branch.id,
            'name': walkin.name,
            'phone': walkin.phone,
            'course': self.course.id,
            'preferred_timing': walkin.preferred_timing,
            'enrollment_date': '2026-05-11',
            'start_date': '2026-05-12',
        }, format='json')

        self.assertEqual(convert_response.status_code, 201)
        walkin.refresh_from_db()
        self.assertEqual(walkin.status, WalkIn.Status.CONVERTED)
        self.assertEqual(walkin.converted_to_type, 'enrollment')
        self.assertEqual(walkin.converted_record_id, Enrollment.objects.get(walkin=walkin).id)

    def test_lead_to_enrollment_can_change_course_and_preserve_original_course(self):
        lead = Lead.objects.create(
            branch=self.branch,
            course=self.course,
            name='Lead Course Change',
            phone='9000000002',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_EVENING,
            source=Lead.Source.WEBSITE,
            status=Lead.Status.NOT_INTERESTED,
            next_follow_up_date='2026-05-20',
            remarks='Callback later',
            created_by=self.staff,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/leads/{lead.id}/convert-to-enrollment/', {
            'branch': self.branch.id,
            'name': lead.name,
            'phone': lead.phone,
            'course': self.final_course.id,
            'preferred_timing': lead.preferred_timing,
            'enrollment_date': '2026-05-11',
            'start_date': '2026-05-12',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        lead.refresh_from_db()
        enrollment = Enrollment.objects.get(lead=lead)
        self.assertEqual(lead.course, self.course)
        self.assertEqual(enrollment.course, self.final_course)
        self.assertEqual(enrollment.original_walkin_course, self.course)
        self.assertEqual(enrollment.final_enrollment_course, self.final_course)
        self.assertEqual(lead.status, Lead.Status.CONVERTED)
        self.assertEqual(lead.remarks, 'Joined')
        self.assertIsNone(lead.next_follow_up_date)

    def test_lead_to_walkin_creates_linked_walkin_with_copied_details(self):
        lead = Lead.objects.create(
            branch=self.branch,
            course=self.course,
            assigned_to=self.staff,
            name='Walkin Conversion Lead',
            phone='9000000030',
            email='walkin-lead@example.com',
            dob='2000-01-01',
            location='Coimbatore',
            pincode='641001',
            qualification=Lead.Qualification.GRADUATE,
            degree='BSc',
            preferred_timing=Lead.PreferredTiming.WEEKDAY_MORNING,
            source=Lead.Source.WHATSAPP,
            walkin_date='2026-05-15',
            next_follow_up_date='2026-05-20',
            remarks='Will visit branch',
            created_by=self.staff,
        )
        FollowUp.objects.create(
            record_type=FollowUp.RecordType.LEAD,
            record_id=lead.id,
            follow_up_date='2026-05-10',
            next_follow_up_date='2026-05-20',
            remarks='Bring documents',
            updated_by=self.staff,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/leads/{lead.id}/convert-to-walkin/', format='json')

        self.assertEqual(response.status_code, 201)
        lead.refresh_from_db()
        walkin = WalkIn.objects.get(lead=lead)
        self.assertEqual(lead.status, Lead.Status.CONVERTED_TO_WALKIN)
        self.assertEqual(lead.converted_to_type, 'walkin')
        self.assertEqual(lead.converted_record_id, walkin.id)
        self.assertIsNone(lead.next_follow_up_date)
        self.assertEqual(walkin.name, lead.name)
        self.assertEqual(walkin.phone, lead.phone)
        self.assertEqual(walkin.email, lead.email)
        self.assertEqual(walkin.dob.isoformat(), '2000-01-01')
        self.assertEqual(walkin.course, self.course)
        self.assertEqual(walkin.branch, self.branch)
        self.assertEqual(walkin.assigned_to, self.staff)
        self.assertEqual(walkin.source, WalkIn.Source.WHATSAPP)
        self.assertEqual(walkin.remarks, 'Will visit branch')
        self.assertEqual(walkin.follow_up_date.isoformat(), '2026-05-20')
        self.assertTrue(FollowUp.objects.filter(
            record_type=FollowUp.RecordType.WALKIN,
            record_id=walkin.id,
            remarks='Bring documents',
            next_follow_up_date='2026-05-20',
        ).exists())

        detail_response = self.client.get(f'/api/walkins/{walkin.id}/')
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data['id'], walkin.id)

    def test_direct_converted_to_walkin_status_update_creates_walkin(self):
        lead = Lead.objects.create(
            branch=self.branch,
            course=self.course,
            assigned_to=self.staff,
            name='Status Patch Lead',
            phone='9000000031',
            source=Lead.Source.GOOGLE,
            walkin_date='2026-05-16',
            next_follow_up_date='2026-05-21',
            remarks='Direct status update',
            created_by=self.staff,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.patch(f'/api/leads/{lead.id}/', {
            'status': Lead.Status.CONVERTED_TO_WALKIN,
        }, format='json')

        self.assertEqual(response.status_code, 200)
        lead.refresh_from_db()
        walkin = WalkIn.objects.get(lead=lead)
        self.assertEqual(lead.status, Lead.Status.CONVERTED_TO_WALKIN)
        self.assertEqual(lead.converted_to_type, 'walkin')
        self.assertEqual(lead.converted_record_id, walkin.id)
        self.assertIsNone(lead.next_follow_up_date)
        self.assertEqual(walkin.phone, lead.phone)
        self.assertEqual(walkin.visit_date.isoformat(), '2026-05-16')

    def test_lead_to_walkin_reuses_existing_phone_walkin_without_duplicate(self):
        lead = Lead.objects.create(
            branch=self.branch,
            course=self.course,
            assigned_to=self.staff,
            name='Existing Phone Lead',
            phone='+91 9000000032',
            source=Lead.Source.INSTAGRAM,
            walkin_date='2026-05-17',
            created_by=self.staff,
        )
        existing_walkin = WalkIn.objects.create(
            branch=self.branch,
            course=self.course,
            name='Existing Walkin',
            phone='9000000032',
            source=WalkIn.Source.DIRECT,
            visit_date='2026-05-12',
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/leads/{lead.id}/convert-to-walkin/', format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(WalkIn.objects.count(), 1)
        lead.refresh_from_db()
        existing_walkin.refresh_from_db()
        self.assertEqual(existing_walkin.lead, lead)
        self.assertEqual(lead.converted_to_type, 'walkin')
        self.assertEqual(lead.converted_record_id, existing_walkin.id)

    def test_add_to_payment_creates_pending_payment_with_default_schedule(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.final_course,
            name='Payment Missing Student',
            phone='9000000120',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=15000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/add-to-payment/', format='json')

        self.assertEqual(response.status_code, 201)
        payment = Payment.objects.get(enrollment=enrollment)
        self.assertEqual(payment.total_fees, enrollment.net_payable_fee)
        self.assertEqual(payment.status, Payment.Status.UNPAID)
        self.assertEqual(payment.paid_amount, 0)
        self.assertEqual(payment.manual_installment_schedule, [
            {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
            {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-05-12'},
            {'label': '2nd Installment', 'amount': 5000, 'due_date': '2026-06-12'},
        ])

    def test_add_to_payment_uses_full_payment_for_course_fee_below_7000(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='MS Office Student',
            phone='9000000126',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=5900,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/add-to-payment/', format='json')

        self.assertEqual(response.status_code, 201)
        payment = Payment.objects.get(enrollment=enrollment)
        self.assertEqual(payment.manual_installment_schedule, [
            {'label': 'Full Payment', 'amount': 5900, 'due_date': '2026-05-11'},
        ])

    def test_stale_split_schedule_is_ignored_for_course_fee_below_7000(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Summer Course Student',
            phone='9000000128',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=6900,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
            payment_schedule=[
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 1900, 'due_date': '2026-05-12'},
            ],
        )
        payment = Payment.objects.create(
            enrollment=enrollment,
            total_fees=enrollment.net_payable_fee,
            manual_installment_schedule=[
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 1900, 'due_date': '2026-05-12'},
            ],
        )
        self.client.force_authenticate(self.staff)

        response = self.client.get(f'/api/payments/{payment.id}/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['payment_schedule'], [
            {'label': 'Full Payment', 'amount': 6900, 'due_date': '2026-05-11'},
        ])
        self.assertEqual(response.data['installment_summary'][0]['label'], 'Full Payment')

    def test_course_fee_7000_uses_full_payment_only(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Exact Threshold Student',
            phone='9000000133',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=7000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
            payment_schedule=[
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 2000, 'due_date': '2026-05-12'},
            ],
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/add-to-payment/', format='json')

        self.assertEqual(response.status_code, 201)
        payment = Payment.objects.get(enrollment=enrollment)
        self.assertEqual(payment.manual_installment_schedule, [
            {'label': 'Full Payment', 'amount': 7000, 'due_date': '2026-05-11'},
        ])

    def test_payment_schedule_allows_added_installment_before_rules_send(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Dynamic Installment Student',
            phone='9000000134',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=25000,
            discount_amount=0,
            status=Enrollment.Status.PENDING_RULES,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/payment-schedule/', {
            'payment_schedule': [
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 6667, 'due_date': '2026-05-12'},
                {'label': '2nd Installment', 'amount': 6667, 'due_date': '2026-06-12'},
                {'label': '3rd Installment', 'amount': 6666, 'due_date': '2026-07-12'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['payment_schedule_locked'], False)
        schedule = [
            {key: item[key] for key in ['label', 'amount', 'due_date']}
            for item in response.data['installment_schedule']
        ]
        self.assertEqual(schedule, [
            {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
            {'label': '1st Installment', 'amount': 6667, 'due_date': '2026-05-12'},
            {'label': '2nd Installment', 'amount': 6667, 'due_date': '2026-06-12'},
            {'label': '3rd Installment', 'amount': 6666, 'due_date': '2026-07-12'},
        ])

    def test_payment_schedule_rejects_zero_and_mismatched_amounts(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Invalid Schedule Student',
            phone='9000000135',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=25000,
            discount_amount=0,
            status=Enrollment.Status.PENDING_RULES,
        )
        self.client.force_authenticate(self.staff)

        zero_response = self.client.post(f'/api/enrollments/{enrollment.id}/payment-schedule/', {
            'payment_schedule': [
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 0, 'due_date': '2026-05-12'},
                {'label': '2nd Installment', 'amount': 20000, 'due_date': '2026-06-12'},
            ],
        }, format='json')
        mismatch_response = self.client.post(f'/api/enrollments/{enrollment.id}/payment-schedule/', {
            'payment_schedule': [
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 10000, 'due_date': '2026-05-12'},
                {'label': '2nd Installment', 'amount': 10001, 'due_date': '2026-06-12'},
            ],
        }, format='json')

        self.assertEqual(zero_response.status_code, 400)
        self.assertEqual(zero_response.data['detail'], 'Installment amount must be greater than zero.')
        self.assertEqual(mismatch_response.status_code, 400)
        self.assertEqual(mismatch_response.data['detail'], 'Installment total cannot exceed course fee.')

    @override_settings(WATI_API_URL='', WATI_ACCESS_TOKEN='')
    def test_send_rules_form_uses_whatsapp_web_without_wati_configuration(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Rules WhatsApp Web Student',
            phone='9876543210',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            batch_timing='Weekdays 10 AM - 12 PM',
            actual_fees=25000,
            discount_amount=0,
            status=Enrollment.Status.PENDING_RULES,
            payment_schedule=[
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 10000, 'due_date': '2026-05-12'},
                {'label': '2nd Installment', 'amount': 10000, 'due_date': '2026-06-12'},
            ],
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/send-rules-form/', format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data['detail'],
            'Rules & Regulations link generated successfully.',
        )
        self.assertIn('https://wa.me/919876543210?', response.data['whatsapp_url'])
        self.assertIn('Dear Rules WhatsApp Web Student', response.data['whatsapp_message'])
        self.assertIn('/rules-sign/', response.data['signing_link'])
        self.assertIn(response.data['signing_link'], response.data['whatsapp_message'])
        self.assertIn('/rules-sign/', response.data['whatsapp_url'])
        self.assertNotIn('about:blank', str(response.data))
        self.assertNotIn('WATI is not configured', str(response.data))
        enrollment.refresh_from_db()
        self.assertTrue(enrollment.payment_schedule_locked)
        self.assertEqual(enrollment.rules_signing.status, RulesSigningRequest.Status.SENT)
        log = WhatsAppMessage.objects.get(related_model='enrollment', related_id=enrollment.id)
        self.assertEqual(log.provider, 'whatsapp_web')
        self.assertEqual(log.status, WhatsAppMessage.MsgStatus.SENT)

    def test_public_rules_form_uses_saved_enrollment_payment_schedule(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Rules Custom Schedule Student',
            phone='9000000134',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=26000,
            discount_amount=0,
            status=Enrollment.Status.RULES_SENT,
            payment_schedule=[
                {'label': 'Enrollment', 'amount': 4000, 'due_date': '2026-05-11'},
                {'label': 'Lab Fee', 'amount': 6000, 'due_date': '2026-05-18'},
                {'label': 'Project Fee', 'amount': 7000, 'due_date': '2026-06-18'},
                {'label': 'Final Fee', 'amount': 9000, 'due_date': '2026-07-18'},
            ],
        )
        signing = RulesSigningRequest.objects.create(
            enrollment=enrollment,
            status=RulesSigningRequest.Status.SENT,
            sent_at=timezone.now(),
        )

        response = self.client.get(f'/api/public/rules-sign/{signing.token}/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [(item['label'], item['amount'], item['due_date']) for item in response.data['installments']],
            [
                ('Enrollment', 4000, '2026-05-11'),
                ('Lab Fee', 6000, '2026-05-18'),
                ('Project Fee', 7000, '2026-06-18'),
                ('Final Fee', 9000, '2026-07-18'),
            ],
        )

    def test_public_rules_form_prefers_linked_payment_schedule_after_rebuild(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Rules Rebuilt Schedule Student',
            phone='9000000135',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=26000,
            discount_amount=0,
            status=Enrollment.Status.RULES_SENT,
            payment_schedule=[
                {'label': 'Old Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': 'Old 1st Installment', 'amount': 10500, 'due_date': '2026-05-12'},
                {'label': 'Old 2nd Installment', 'amount': 10500, 'due_date': '2026-06-12'},
            ],
        )
        Payment.objects.create(
            enrollment=enrollment,
            total_fees=26000,
            manual_installment_schedule=[
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 7000, 'due_date': '2026-05-20'},
                {'label': '2nd Installment', 'amount': 7000, 'due_date': '2026-06-20'},
                {'label': '3rd Installment', 'amount': 7000, 'due_date': '2026-07-20'},
            ],
        )
        signing = RulesSigningRequest.objects.create(
            enrollment=enrollment,
            status=RulesSigningRequest.Status.SENT,
            sent_at=timezone.now(),
        )

        response = self.client.get(f'/api/public/rules-sign/{signing.token}/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [(item['label'], item['amount'], item['due_date']) for item in response.data['installments']],
            [
                ('Enrollment', 5000, '2026-05-11'),
                ('1st Installment', 7000, '2026-05-20'),
                ('2nd Installment', 7000, '2026-06-20'),
                ('3rd Installment', 7000, '2026-07-20'),
            ],
        )

    def test_public_rules_signing_processes_photo_signature_and_pdf(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Rules Signing Candidate',
            phone='9000000130',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=15000,
            discount_amount=0,
            status=Enrollment.Status.RULES_SENT,
        )
        signing = RulesSigningRequest.objects.create(
            enrollment=enrollment,
            status=RulesSigningRequest.Status.SENT,
            sent_at=timezone.now(),
        )
        from PIL import Image

        image_buffer = io.BytesIO()
        Image.new('RGBA', (20, 20), (17, 24, 39, 255)).save(image_buffer, format='PNG')
        image_data = 'data:image/png;base64,' + base64.b64encode(image_buffer.getvalue()).decode('ascii')

        response = self.client.post(
            f'/api/public/rules-sign/{signing.token}/',
            {'selfie': image_data, 'signature': image_data},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['detail'], 'Rules & Regulation form submitted successfully.')
        signing.refresh_from_db()
        enrollment.refresh_from_db()
        self.assertEqual(signing.status, RulesSigningRequest.Status.SUBMITTED)
        self.assertEqual(enrollment.status, Enrollment.Status.RULES_SUBMITTED)
        self.assertTrue(signing.selfie_image_file)
        self.assertTrue(signing.signature_image_file)
        self.assertTrue(bytes(signing.signed_pdf_file).startswith(b'%PDF'))

    def test_public_rules_signing_hides_dependency_errors(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Rules Dependency Candidate',
            phone='9000000131',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=15000,
            discount_amount=0,
            status=Enrollment.Status.RULES_SENT,
        )
        signing = RulesSigningRequest.objects.create(
            enrollment=enrollment,
            status=RulesSigningRequest.Status.SENT,
            sent_at=timezone.now(),
        )

        with mock.patch('views.validate_data_image', side_effect=RuntimeError('Pillow is required to process form images.')):
            with self.assertLogs('views', level='ERROR') as logs:
                response = self.client.post(
                    f'/api/public/rules-sign/{signing.token}/',
                    {'selfie': 'data:image/png;base64,AA==', 'signature': 'data:image/png;base64,AA=='},
                    format='json',
                )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['detail'], 'Unable to process form at the moment. Please contact support.')
        self.assertNotIn('Pillow', response.data['detail'])
        self.assertTrue(any('Rules signing image validation failed' in entry for entry in logs.output))

    def test_change_course_preserves_paid_amount_and_rebuilds_pending_schedule(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Transfer Course Student',
            phone='9000000127',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        payment = Payment.objects.create(
            enrollment=enrollment,
            total_fees=enrollment.net_payable_fee,
            manual_installment_schedule=[
                {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '2nd Installment', 'amount': 5000, 'due_date': '2026-05-12'},
            ],
        )
        PaymentInstallment.objects.create(
            payment=payment,
            enrollment=enrollment,
            amount=5000,
            installment_index=1,
            installment_label='1st Installment',
            payment_date='2026-05-11',
            receipt_number='RCPT-COURSE-CHANGE',
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/change-course/', {
            'course': self.final_course.id,
            'reason': 'Student requested upgrade',
            'effective_date': '2026-05-20',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        enrollment.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(enrollment.course, self.final_course)
        self.assertEqual(enrollment.actual_fees, self.final_course.actual_fees)
        self.assertEqual(enrollment.final_fees, Decimal('15000.00'))
        self.assertEqual(payment.total_fees, Decimal('15000.00'))
        self.assertEqual(payment.paid_amount, Decimal('5000.00'))
        self.assertEqual(payment.balance, Decimal('10000.00'))
        self.assertEqual(PaymentInstallment.objects.filter(payment=payment).count(), 1)
        self.assertEqual(PaymentInstallment.objects.get(payment=payment).receipt_number, 'RCPT-COURSE-CHANGE')
        self.assertEqual(payment.manual_installment_schedule, [
            {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-05-11'},
            {'label': '2nd Installment', 'amount': 5000, 'due_date': '2026-05-12'},
            {'label': '3rd Installment', 'amount': 5000, 'due_date': '2026-06-12'},
        ])
        history = CourseChangeHistory.objects.get(enrollment=enrollment)
        self.assertEqual(history.old_course, self.course)
        self.assertEqual(history.new_course, self.final_course)
        self.assertEqual(history.changed_by, self.staff)
        self.assertEqual(history.reason, 'Student requested upgrade')
        self.assertEqual(str(history.effective_date), '2026-05-20')

    def test_admin_can_approve_course_change_request_and_rebuild_payment_schedule(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Approval Course Student',
            phone='9000000140',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
            enrolled_by=self.staff,
            created_by=self.staff,
        )
        payment = Payment.objects.create(
            enrollment=enrollment,
            total_fees=enrollment.net_payable_fee,
            manual_installment_schedule=[
                {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '2nd Installment', 'amount': 5000, 'due_date': '2026-05-12'},
            ],
        )
        PaymentInstallment.objects.create(
            payment=payment,
            enrollment=enrollment,
            amount=5000,
            installment_index=1,
            installment_label='1st Installment',
            payment_date='2026-05-11',
            receipt_number='RCPT-APPROVAL-CHANGE',
        )
        change_request = CourseChangeRequest.objects.create(
            student=enrollment,
            enrollment=enrollment,
            old_course=self.course,
            requested_course=self.final_course,
            requested_batch_date='2026-05-20',
            reason='Upgrade course',
            requested_by=self.staff,
            old_fee=enrollment.net_payable_fee,
            new_fee=self.final_course.actual_fees,
        )
        self.client.force_authenticate(self.admin)

        with self.assertLogs('views', level='INFO') as logs:
            response = self.client.post(f'/api/course-change-requests/{change_request.id}/approve/', {
                'admin_remarks': 'Approved by admin',
            }, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        enrollment.refresh_from_db()
        payment.refresh_from_db()
        change_request.refresh_from_db()
        self.assertEqual(change_request.status, CourseChangeRequest.Status.APPROVED)
        self.assertEqual(enrollment.course, self.final_course)
        self.assertEqual(payment.total_fees, Decimal('15000.00'))
        self.assertEqual(payment.paid_amount, Decimal('5000.00'))
        self.assertEqual(PaymentInstallment.objects.filter(payment=payment).count(), 1)
        self.assertEqual(payment.manual_installment_schedule, [
            {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-05-11'},
            {'label': '2nd Installment', 'amount': 5000, 'due_date': '2026-05-12'},
            {'label': '3rd Installment', 'amount': 5000, 'due_date': '2026-06-12'},
        ])
        self.assertTrue(any('Course change approval completed' in entry for entry in logs.output))
        self.assertTrue(any("'request_id': " in entry for entry in logs.output))
        self.assertTrue(any("'final_total': '15000'" in entry for entry in logs.output))

    def test_course_change_approval_auto_corrects_rebuilt_schedule_total(self):
        course_25000 = Course.objects.create(name='Course 25000', actual_fees=25000)
        course_29900 = Course.objects.create(name='Course 29900', actual_fees=29900)
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=course_25000,
            name='Schedule Correction Student',
            phone='9000000142',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=25000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
            enrolled_by=self.staff,
            created_by=self.staff,
            payment_schedule=[
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 11950, 'due_date': '2026-05-12'},
                {'label': '2nd Installment', 'amount': 11950, 'due_date': '2026-06-12'},
            ],
        )
        payment = Payment.objects.create(
            enrollment=enrollment,
            total_fees=enrollment.net_payable_fee,
            manual_installment_schedule=[
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 11950, 'due_date': '2026-05-12'},
                {'label': '2nd Installment', 'amount': 11950, 'due_date': '2026-06-12'},
            ],
        )
        PaymentInstallment.objects.create(
            payment=payment,
            enrollment=enrollment,
            amount=5000,
            installment_index=1,
            installment_label='Enrollment',
            payment_date='2026-05-11',
            receipt_number='RCPT-SCHEDULE-CORRECTION',
        )
        change_request = CourseChangeRequest.objects.create(
            student=enrollment,
            enrollment=enrollment,
            old_course=course_25000,
            requested_course=course_29900,
            requested_batch_date='2026-05-20',
            reason='Move to upgraded course',
            requested_by=self.staff,
            old_fee=enrollment.net_payable_fee,
            new_fee=course_29900.actual_fees,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(f'/api/course-change-requests/{change_request.id}/approve/', format='json')

        self.assertEqual(response.status_code, 200, response.data)
        enrollment.refresh_from_db()
        payment.refresh_from_db()
        change_request.refresh_from_db()
        self.assertEqual(change_request.status, CourseChangeRequest.Status.APPROVED)
        self.assertEqual(enrollment.course, course_29900)
        self.assertEqual(payment.total_fees, Decimal('29900.00'))
        self.assertEqual(payment.paid_amount, Decimal('5000.00'))
        self.assertEqual(payment.balance, Decimal('24900.00'))
        self.assertEqual(PaymentInstallment.objects.filter(payment=payment).count(), 1)
        self.assertEqual(payment.manual_installment_schedule, [
            {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
            {'label': '1st Installment', 'amount': 12450, 'due_date': '2026-05-12'},
            {'label': '2nd Installment', 'amount': 12450, 'due_date': '2026-06-12'},
        ])
        self.assertEqual(sum(Decimal(str(item['amount'])) for item in payment.manual_installment_schedule), Decimal('29900'))

    def test_course_change_approval_returns_backend_error_message(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Approval Error Student',
            phone='9000000141',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
            enrolled_by=self.staff,
            created_by=self.staff,
        )
        change_request = CourseChangeRequest.objects.create(
            student=enrollment,
            enrollment=enrollment,
            old_course=self.course,
            requested_course=self.final_course,
            reason='Upgrade course',
            requested_by=self.staff,
            old_fee=enrollment.net_payable_fee,
            new_fee=self.final_course.actual_fees,
        )
        self.client.force_authenticate(self.admin)

        with mock.patch('views.apply_enrollment_course_change', side_effect=RuntimeError('fee schedule exploded')):
            with self.assertLogs('views', level='ERROR') as logs:
                response = self.client.post(f'/api/course-change-requests/{change_request.id}/approve/', format='json')

        self.assertEqual(response.status_code, 500)
        self.assertFalse(response.data['success'])
        self.assertEqual(response.data['detail'], 'fee schedule exploded')
        self.assertEqual(response.data['message'], 'fee schedule exploded')
        self.assertTrue(any('Course approval failed' in entry for entry in logs.output))

    def test_admin_schedule_override_updates_candidate_payable_fee_and_payment_totals(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.final_course,
            name='Custom Schedule Student',
            phone='9000000129',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=42900,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        payment = Payment.objects.create(
            enrollment=enrollment,
            total_fees=enrollment.net_payable_fee,
            paid_amount=5000,
            manual_installment_schedule=[
                {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '2nd Installment', 'amount': 18950, 'due_date': '2026-05-12'},
                {'label': '3rd Installment', 'amount': 18950, 'due_date': '2026-06-12'},
            ],
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(f'/api/payments/{payment.id}/update-schedule/', {
            'payment_schedule': [
                {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '2nd Installment', 'amount': 16950, 'due_date': '2026-05-12'},
                {'label': '3rd Installment', 'amount': 16950, 'due_date': '2026-06-12'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 200)
        enrollment.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(enrollment.actual_fees, Decimal('42900.00'))
        self.assertEqual(enrollment.custom_payable_fee, Decimal('38900.00'))
        self.assertEqual(enrollment.net_payable_fee, Decimal('38900.00'))
        self.assertEqual(payment.total_fees, Decimal('38900.00'))
        self.assertEqual(payment.balance, Decimal('33900.00'))
        self.assertEqual(payment.status, Payment.Status.PARTIAL)
        self.assertEqual(Decimal(str(response.data['total_fees'])), Decimal('38900.00'))
        self.assertEqual(Decimal(str(response.data['balance'])), Decimal('33900.00'))

    def test_generated_bills_use_current_payment_and_cumulative_paid_amounts(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Bill Calculation Student',
            phone='9000000132',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=15900,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        payment = Payment.objects.create(
            enrollment=enrollment,
            total_fees=enrollment.net_payable_fee,
            manual_installment_schedule=[
                {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '2nd Installment', 'amount': 3000, 'due_date': '2026-05-20'},
                {'label': 'Final Installment', 'amount': 7900, 'due_date': '2026-06-12'},
            ],
        )
        self.client.force_authenticate(self.admin)

        expected = [
            (Decimal('5000.00'), Decimal('5000.00'), Decimal('10900.00'), '1st Installment'),
            (Decimal('3000.00'), Decimal('8000.00'), Decimal('7900.00'), '2nd Installment'),
            (Decimal('7900.00'), Decimal('15900.00'), Decimal('0.00'), 'Final Installment'),
        ]
        installments = []
        for index, (amount, paid_amount, pending_amount, label) in enumerate(expected, start=1):
            installment = PaymentInstallment.objects.create(
                payment=payment,
                enrollment=enrollment,
                amount=amount,
                installment_index=index,
                installment_label=label,
                payment_date='2026-05-11',
                payment_mode=PaymentInstallment.Mode.CASH,
            )

            response = self.client.post(f'/api/installments/{installment.id}/generate-bill/')

            self.assertEqual(response.status_code, 200)
            installment.refresh_from_db()
            snapshot = installment.document_snapshot
            self.assertEqual(Decimal(snapshot['payment_amount']), amount)
            self.assertEqual(Decimal(snapshot['paid_amount']), paid_amount)
            self.assertEqual(Decimal(snapshot['pending_amount']), pending_amount)
            self.assertEqual(Decimal(snapshot['pending_amount']), Decimal(snapshot['total_fees']) - Decimal(snapshot['paid_amount']))
            self.assertEqual(len(snapshot['payment_schedule']), 3)
            self.assertNotIn('Next Payment Schedule', installment.document_html)
            installments.append(installment)

        from views import PaymentInstallmentViewSet

        pdf_bytes = PaymentInstallmentViewSet()._build_document_pdf(installments[1])
        self.assertTrue(pdf_bytes.startswith(b'%PDF'))

    def test_generated_bill_schedule_matches_saved_payment_schedule_variants(self):
        self.client.force_authenticate(self.admin)

        variants = [
            (
                'Single Payment Bill Student',
                '9000000136',
                6500,
                [{'label': 'Full Payment', 'amount': 6500, 'due_date': '2026-05-11'}],
            ),
            (
                'Three Installment Bill Student',
                '9000000137',
                25000,
                [
                    {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                    {'label': '1st Installment', 'amount': 10000, 'due_date': '2026-05-20'},
                    {'label': '2nd Installment', 'amount': 10000, 'due_date': '2026-06-20'},
                ],
            ),
            (
                'Four Installment Bill Student',
                '9000000138',
                32000,
                [
                    {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                    {'label': '1st Installment', 'amount': 9000, 'due_date': '2026-05-25'},
                    {'label': '2nd Installment', 'amount': 9000, 'due_date': '2026-06-25'},
                    {'label': 'Final Installment', 'amount': 9000, 'due_date': '2026-07-25'},
                ],
            ),
        ]

        for name, phone, fee, schedule in variants:
            enrollment = Enrollment.objects.create(
                branch=self.branch,
                course=self.course,
                name=name,
                phone=phone,
                preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
                enrollment_date='2026-05-11',
                start_date='2026-05-12',
                actual_fees=fee,
                discount_amount=0,
                status=Enrollment.Status.ACTIVE,
                payment_schedule=schedule,
            )
            payment = Payment.objects.create(
                enrollment=enrollment,
                total_fees=fee,
                manual_installment_schedule=schedule,
            )
            first_item = schedule[0]
            installment = PaymentInstallment.objects.create(
                payment=payment,
                enrollment=enrollment,
                amount=Decimal(str(first_item['amount'])),
                installment_index=1,
                installment_label=first_item['label'],
                payment_date=first_item['due_date'],
                payment_mode=PaymentInstallment.Mode.CASH,
            )

            response = self.client.post(f'/api/installments/{installment.id}/generate-bill/')

            self.assertEqual(response.status_code, 200)
            installment.refresh_from_db()
            self.assertEqual(
                [(item['label'], Decimal(item['amount']), item['due_date']) for item in installment.document_snapshot['payment_schedule']],
                [(item['label'], Decimal(str(item['amount'])), item['due_date']) for item in schedule],
            )
            self.assertIn('TOTAL PAYMENT PAID', installment.document_html)
            self.assertNotIn('PAYMENT AMOUNT</div>', installment.document_html)

    def test_counselor_change_requires_counselor_and_admin_approval(self):
        new_counselor = User.objects.create_user(
            username='new-counselor',
            email='new-counselor@example.com',
            password='pass12345',
            branch=self.branch,
            role=User.Role.STAFF,
        )
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Counselor Reassign Student',
            phone='9000000130',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
            enrolled_by=self.staff,
            created_by=self.staff,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/request-counselor-change/', {
            'counselor': new_counselor.id,
            'reason': 'Balancing counselor workload',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.enrolled_by, self.staff)
        change_request = CounselorChangeRequest.objects.get(enrollment=enrollment)
        self.assertEqual(change_request.status, CounselorChangeRequest.Status.PENDING_COUNSELOR)

        admin_early = self.client.post(f'/api/counselor-change-requests/{change_request.id}/approve/', format='json')
        self.assertEqual(admin_early.status_code, 400)

        self.client.force_authenticate(self.staff)
        counselor_response = self.client.post(f'/api/counselor-change-requests/{change_request.id}/counselor-approve/', {
            'remarks': 'Approved',
        }, format='json')
        self.assertEqual(counselor_response.status_code, 200)
        change_request.refresh_from_db()
        self.assertEqual(change_request.status, CounselorChangeRequest.Status.PENDING_ADMIN)

        self.client.force_authenticate(self.admin)
        admin_response = self.client.post(f'/api/counselor-change-requests/{change_request.id}/approve/', {
            'admin_remarks': 'Approved by admin',
        }, format='json')
        self.assertEqual(admin_response.status_code, 200)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.enrolled_by, new_counselor)
        self.assertEqual(enrollment.created_by, new_counselor)
        history = EnrollmentCounselorChangeHistory.objects.get(enrollment=enrollment)
        self.assertEqual(history.old_counselor, self.staff)
        self.assertEqual(history.new_counselor, new_counselor)

    def test_counselor_reject_blocks_admin_approval(self):
        new_counselor = User.objects.create_user(
            username='blocked-counselor',
            email='blocked-counselor@example.com',
            password='pass12345',
            branch=self.branch,
            role=User.Role.STAFF,
        )
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Blocked Counselor Student',
            phone='9000000131',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
            enrolled_by=self.staff,
            created_by=self.staff,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/request-counselor-change/', {
            'counselor': new_counselor.id,
            'reason': 'Transfer request',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        change_request = CounselorChangeRequest.objects.get(enrollment=enrollment)

        self.client.force_authenticate(self.staff)
        reject_response = self.client.post(f'/api/counselor-change-requests/{change_request.id}/counselor-reject/', {
            'remarks': 'Do not transfer',
        }, format='json')
        self.assertEqual(reject_response.status_code, 200)
        change_request.refresh_from_db()
        self.assertEqual(change_request.status, CounselorChangeRequest.Status.REJECTED)

        self.client.force_authenticate(self.admin)
        admin_response = self.client.post(f'/api/counselor-change-requests/{change_request.id}/approve/', format='json')
        self.assertEqual(admin_response.status_code, 400)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.created_by, self.staff)
        self.assertFalse(EnrollmentCounselorChangeHistory.objects.filter(enrollment=enrollment).exists())

    def test_change_course_respects_branch_permissions(self):
        enrollment = Enrollment.objects.create(
            branch=self.other_branch,
            course=self.course,
            name='Other Branch Course Student',
            phone='9000000128',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/change-course/', {
            'course': self.final_course.id,
        }, format='json')

        self.assertEqual(response.status_code, 404)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.course, self.course)
        self.assertFalse(CourseChangeHistory.objects.filter(enrollment=enrollment).exists())

    def test_dashboard_counts_and_values_only_active_enrolled_students(self):
        today = timezone.localdate()
        month_param = today.strftime('%Y-%m')
        previous_month_time = timezone.now() - timezone.timedelta(days=40)

        def create_enrollment(name, phone, status_value, fee, created_at=None):
            enrollment = Enrollment.objects.create(
                branch=self.other_branch,
                course=self.course,
                name=name,
                phone=phone,
                preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
                enrollment_date=today,
                actual_fees=fee,
                discount_amount=0,
                status=status_value,
            )
            if created_at:
                Enrollment.objects.filter(pk=enrollment.pk).update(created_at=created_at)
                enrollment.refresh_from_db()
            return enrollment

        active = create_enrollment('Active Student 1', '9000000201', Enrollment.Status.ACTIVE, 29900)
        active_old_created = create_enrollment('Active Student 2', '9000000202', Enrollment.Status.ACTIVE, 19900, previous_month_time)
        active_three = create_enrollment('Active Student 3', '9000000203', Enrollment.Status.ACTIVE, 33900)
        active_four_old_created = create_enrollment('Active Student 4', '9000000204', Enrollment.Status.ACTIVE, 5900, previous_month_time)
        enrolled = create_enrollment('Enrolled Student 1', '9000000205', Enrollment.Status.ENROLLED, 29900)
        enrolled_two = create_enrollment('Enrolled Student 2', '9000000206', Enrollment.Status.ENROLLED, 36900)
        enrolled_three = create_enrollment('Enrolled Student 3', '9000000207', Enrollment.Status.ENROLLED, 23900)
        enrolled_four = create_enrollment('Enrolled Student 4', '9000000208', Enrollment.Status.ENROLLED, 23900)
        enrolled_five = create_enrollment('Enrolled Student 5', '9000000209', Enrollment.Status.ENROLLED, 29900)
        completed = create_enrollment('Completed Student', '9000000214', Enrollment.Status.COMPLETED, 14000)
        rules_sent = create_enrollment('Rules Sent Candidate', '9000000210', Enrollment.Status.RULES_SENT, 5900)
        rules_submitted = create_enrollment('Rules Submitted Candidate', '9000000211', Enrollment.Status.RULES_SUBMITTED, 18000)
        signed_rules_submitted = create_enrollment('Signed Submitted Student', '9000000212', Enrollment.Status.RULES_SUBMITTED, 20000)
        unsigned_rules_submitted = create_enrollment('Unsigned Submitted Candidate', '9000000213', Enrollment.Status.RULES_SUBMITTED, 22000)
        RulesSigningRequest.objects.create(
            enrollment=signed_rules_submitted,
            status=RulesSigningRequest.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )
        RulesSigningRequest.objects.create(
            enrollment=unsigned_rules_submitted,
            status=RulesSigningRequest.Status.SENT,
            sent_at=timezone.now(),
        )
        Payment.objects.create(enrollment=active, total_fees=active.net_payable_fee, paid_amount=1000)
        Payment.objects.create(enrollment=active_old_created, total_fees=active_old_created.net_payable_fee, paid_amount=19900)
        Payment.objects.create(enrollment=active_three, total_fees=active_three.net_payable_fee, paid_amount=33900)
        Payment.objects.create(enrollment=active_four_old_created, total_fees=active_four_old_created.net_payable_fee, paid_amount=5900)
        Payment.objects.create(enrollment=enrolled, total_fees=enrolled.net_payable_fee, paid_amount=2000)
        Payment.objects.create(enrollment=enrolled_two, total_fees=enrolled_two.net_payable_fee, paid_amount=36900)
        Payment.objects.create(enrollment=enrolled_three, total_fees=enrolled_three.net_payable_fee, paid_amount=23900)
        Payment.objects.create(enrollment=enrolled_four, total_fees=enrolled_four.net_payable_fee, paid_amount=23900)
        Payment.objects.create(enrollment=enrolled_five, total_fees=enrolled_five.net_payable_fee, paid_amount=29900)
        Payment.objects.create(enrollment=completed, total_fees=completed.net_payable_fee, paid_amount=14000)
        Payment.objects.create(enrollment=rules_sent, total_fees=rules_sent.net_payable_fee, paid_amount=5900)
        Payment.objects.create(enrollment=rules_submitted, total_fees=rules_submitted.net_payable_fee, paid_amount=18000)
        Payment.objects.create(enrollment=signed_rules_submitted, total_fees=signed_rules_submitted.net_payable_fee, paid_amount=20000)
        Payment.objects.create(enrollment=unsigned_rules_submitted, total_fees=unsigned_rules_submitted.net_payable_fee, paid_amount=22000)

        self.client.force_authenticate(self.admin)

        summary = self.client.get('/api/dashboard/summary/', {'branch': self.other_branch.id})
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data['total_enrollments'], 9)
        self.assertEqual(summary.data['enroll_this_month'], 9)
        self.assertEqual(Decimal(str(summary.data['total_revenue'])), Decimal('234100.00'))
        self.assertEqual(Decimal(str(summary.data['total_value'])), Decimal('234100.00'))
        self.assertEqual(Decimal(str(summary.data['value_this_month'])), Decimal('234100.00'))

        branch_comparison = self.client.get('/api/dashboard/branch-comparison/', {'month': month_param})
        self.assertEqual(branch_comparison.status_code, 200)
        branch_row = next(row for row in branch_comparison.data if row['branch_id'] == self.other_branch.id)
        self.assertEqual(branch_row['enrollments'], 9)
        self.assertEqual(Decimal(str(branch_row['value'])), Decimal('234100.00'))

        trends = self.client.get('/api/dashboard/trends/', {'days': 1})
        self.assertEqual(trends.status_code, 200)
        self.assertEqual(trends.data[0]['enrollments'], 9)

    def test_add_to_payment_requires_course_start_date(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Missing Start Date Student',
            phone='9000000121',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/add-to-payment/', format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['detail'], 'Course start date is required to create payment schedule.')
        self.assertFalse(Payment.objects.filter(enrollment=enrollment).exists())

    def test_add_to_payment_rejects_duplicate_payment(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Duplicate Payment Student',
            phone='9000000122',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        enrollment.refresh_from_db()
        Payment.objects.create(enrollment=enrollment, total_fees=enrollment.net_payable_fee)
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/add-to-payment/', format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Payment.objects.filter(enrollment=enrollment).count(), 1)

    def test_add_to_payment_respects_branch_permissions(self):
        enrollment = Enrollment.objects.create(
            branch=self.other_branch,
            course=self.course,
            name='Other Branch Student',
            phone='9000000123',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )

        self.client.force_authenticate(self.staff)
        staff_response = self.client.post(f'/api/enrollments/{enrollment.id}/add-to-payment/', format='json')
        self.assertEqual(staff_response.status_code, 404)
        self.assertFalse(Payment.objects.filter(enrollment=enrollment).exists())

        self.client.force_authenticate(self.admin)
        admin_response = self.client.post(f'/api/enrollments/{enrollment.id}/add-to-payment/', format='json')
        self.assertEqual(admin_response.status_code, 201)
        self.assertTrue(Payment.objects.filter(enrollment=enrollment).exists())

    def test_admin_can_delete_payment_without_generated_documents(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Delete Payment Student',
            phone='9000000124',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        enrollment.refresh_from_db()
        payment = Payment.objects.create(enrollment=enrollment, total_fees=enrollment.net_payable_fee)
        PaymentInstallment.objects.create(
            payment=payment,
            enrollment=enrollment,
            amount=1000,
            installment_index=1,
            installment_label='1st Installment',
            payment_date='2026-05-11',
            reference_number='CASH-1',
        )
        self.client.force_authenticate(self.admin)

        response = self.client.delete(f'/api/payments/{payment.id}/', {'reason': 'Created by mistake'}, format='json')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Payment.objects.filter(id=payment.id).exists())
        self.assertFalse(PaymentInstallment.objects.filter(payment_id=payment.id).exists())
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.status, Enrollment.Status.ACTIVE)

    def test_payment_delete_requires_admin_and_reason(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Delete Permission Student',
            phone='9000000125',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        enrollment.refresh_from_db()
        payment = Payment.objects.create(enrollment=enrollment, total_fees=enrollment.net_payable_fee)

        self.client.force_authenticate(self.staff)
        staff_response = self.client.delete(f'/api/payments/{payment.id}/', {'reason': 'Staff attempt'}, format='json')
        self.assertEqual(staff_response.status_code, 403)

        self.client.force_authenticate(self.admin)
        missing_reason_response = self.client.delete(f'/api/payments/{payment.id}/', {'reason': ''}, format='json')
        self.assertEqual(missing_reason_response.status_code, 400)
        self.assertEqual(missing_reason_response.data['detail'], 'Reason for deletion is required.')
        self.assertTrue(Payment.objects.filter(id=payment.id).exists())

    def test_payment_delete_blocks_generated_documents(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Generated Document Student',
            phone='9000000126',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=10000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        enrollment.refresh_from_db()
        payment = Payment.objects.create(enrollment=enrollment, total_fees=enrollment.net_payable_fee)
        PaymentInstallment.objects.create(
            payment=payment,
            enrollment=enrollment,
            amount=1000,
            installment_index=1,
            installment_label='1st Installment',
            payment_date='2026-05-11',
            reference_number='CASH-2',
            receipt_number='RCPT-GDP-2026-0001',
        )
        self.client.force_authenticate(self.admin)

        response = self.client.delete(f'/api/payments/{payment.id}/', {'reason': 'Cleanup'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['detail'], 'This payment has generated documents and cannot be deleted. Use Void/Cancel instead.')
        self.assertTrue(Payment.objects.filter(id=payment.id).exists())

    def test_staff_can_create_lead_with_empty_optional_fields_and_defaults(self):
        self.client.force_authenticate(self.staff)

        response = self.client.post('/api/leads/', {
            'name': 'New Lead',
            'phone': '9000000003',
            'course': self.course.id,
            'branch': None,
            'follow_up_by': '',
            'lead_status': '',
            'status': '',
            'source': '',
            'qualification': '',
            'degree': '',
            'next_follow_up_date': '',
            'remarks': '',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        lead = Lead.objects.get(phone='9000000003')
        self.assertEqual(lead.branch, self.branch)
        self.assertEqual(lead.assigned_to, self.staff)
        self.assertEqual(lead.status, Lead.Status.NEW)
        self.assertEqual(lead.source, Lead.Source.MANUAL)
        self.assertEqual(lead.qualification, '')
        self.assertEqual(lead.degree, '')
        self.assertIsNone(lead.next_follow_up_date)

    def test_staff_create_lead_saves_selected_follow_up_user(self):
        selected_user = User.objects.create_user(
            username='selected-staff',
            email='selected@example.com',
            password='pass12345',
            branch=self.branch,
            role=User.Role.STAFF,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post('/api/leads/', {
            'name': 'Assigned Lead',
            'phone': '9000000004',
            'course': self.course.id,
            'follow_up_by': selected_user.id,
            'source': 'manual',
            'next_follow_up_date': '2026-05-14',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        lead = Lead.objects.get(phone='9000000004')
        self.assertEqual(lead.branch, self.branch)
        self.assertEqual(lead.assigned_to, selected_user)
        self.assertEqual(str(lead.next_follow_up_date), '2026-05-14')

    def test_staff_create_lead_accepts_whatsapp_source(self):
        self.client.force_authenticate(self.staff)

        response = self.client.post('/api/leads/', {
            'name': 'WhatsApp Lead',
            'phone': '9000000016',
            'course': self.course.id,
            'source': 'whatsapp',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        lead = Lead.objects.get(phone='9000000016')
        self.assertEqual(lead.source, Lead.Source.WHATSAPP)
        self.assertEqual(response.data['source_display'], 'WhatsApp')

    def test_staff_create_lead_returns_validation_json_for_other_branch_follow_up_user(self):
        selected_user = User.objects.create_user(
            username='other-staff',
            email='other@example.com',
            password='pass12345',
            branch=self.other_branch,
            role=User.Role.STAFF,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post('/api/leads/', {
            'name': 'Invalid Assigned Lead',
            'phone': '9000000005',
            'course': self.course.id,
            'follow_up_by': selected_user.id,
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('follow_up_by', response.data)

    def test_staff_create_lead_accepts_display_values_and_day_month_year_date(self):
        selected_user = User.objects.create_user(
            username='ranganayaki',
            email='ranganayaki@example.com',
            password='pass12345',
            first_name='Ranganayaki',
            branch=self.branch,
            role=User.Role.STAFF,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post('/api/leads/', {
            'name': 'Hostel Lead',
            'phone': '9000000006',
            'course': self.course.name,
            'follow_up_by': 'Ranganayaki',
            'source': 'Google',
            'qualification': 'Graduate',
            'degree': 'BBA',
            'next_follow_up_date': '15-05-2026',
            'remarks': 'Will find hostel and join',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        lead = Lead.objects.get(phone='9000000006')
        self.assertEqual(lead.branch, self.branch)
        self.assertEqual(lead.course, self.course)
        self.assertEqual(lead.assigned_to, selected_user)
        self.assertEqual(lead.source, Lead.Source.GOOGLE)
        self.assertEqual(lead.qualification, Lead.Qualification.GRADUATE)
        self.assertEqual(lead.degree, 'BBA')
        self.assertEqual(str(lead.next_follow_up_date), '2026-05-15')
        self.assertEqual(lead.remarks, 'Will find hostel and join')

    def test_lead_number_generation_uses_highest_existing_suffix_not_count(self):
        Lead.objects.create(
            lead_number='LD-202605-0001',
            branch=self.branch,
            course=self.course,
            name='First Lead',
            phone='9000000007',
        )
        Lead.objects.create(
            lead_number='LD-202605-0003',
            branch=self.branch,
            course=self.course,
            name='Third Lead',
            phone='9000000008',
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post('/api/leads/', {
            'name': 'Next Lead',
            'phone': '9000000009',
            'course': self.course.id,
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Lead.objects.get(phone='9000000009').lead_number, 'LD-202605-0004')

    def test_lead_save_retries_duplicate_generated_lead_number(self):
        Lead.objects.create(
            lead_number='LD-202605-0014',
            branch=self.branch,
            course=self.course,
            name='Existing Lead',
            phone='9000000014',
        )

        with mock.patch(
            'crm.models.generate_lead_number',
            side_effect=['LD-202605-0014', 'LD-202605-0015'],
        ):
            lead = Lead.objects.create(
                branch=self.branch,
                course=self.course,
                name='Retried Lead',
                phone='9000000015',
            )

        self.assertEqual(lead.lead_number, 'LD-202605-0015')
