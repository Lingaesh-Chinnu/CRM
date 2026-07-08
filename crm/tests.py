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

from crm.models import AdminReceipt, Branch, BranchTarget, CandidateStatusHistory, CounselorChangeRequest, Course, CourseChangeHistory, CourseChangeRequest, Enrollment, EnrollmentCounselorChangeHistory, EnrollmentRulesResetHistory, FollowUp, Lead, LeadTransferHistory, Notification, Payment, PaymentInstallment, PaymentReasonMessage, PaymentReasonRequest, RulesSigningRequest, UserMonthlyRating, WalkIn, WalkInAssignmentChangeRequest, WhatsAppMessage


User = get_user_model()


@override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False)
class CommonCandidateFilterAndStatusTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name='Gandhipuram', city='Coimbatore')
        self.other_branch = Branch.objects.create(name='Hopes', city='Coimbatore')
        self.course = Course.objects.create(name='Advanced Python', actual_fees=42900)
        self.admin = User.objects.create_superuser(username='filter-admin', email='filter-admin@example.com', password='pass12345')
        self.counselor = User.objects.create_user(username='pavi', first_name='Pavi', email='pavi@example.com', password='pass12345', branch=self.branch, role=User.Role.STAFF)
        self.other_counselor = User.objects.create_user(username='other', email='other@example.com', password='pass12345', branch=self.other_branch, role=User.Role.STAFF)
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()

        self.lead = Lead.objects.create(
            branch=self.branch, course=self.course, assigned_to=self.counselor, created_by=self.counselor,
            name='Instagram Filter Match', phone='9000011101', source=Lead.Source.INSTAGRAM,
            status=Lead.Status.FOLLOW_UP, counselor_status=Lead.CounselorStatus.FOLLOW_UP,
        )
        Lead.objects.create(
            branch=self.other_branch, course=self.course, assigned_to=self.other_counselor, created_by=self.other_counselor,
            name='Instagram Filter Other', phone='9000011102', source=Lead.Source.INSTAGRAM,
            status=Lead.Status.FOLLOW_UP, counselor_status=Lead.CounselorStatus.FOLLOW_UP,
        )
        self.walkin = WalkIn.objects.create(
            branch=self.branch, course=self.course, assigned_to=self.counselor, counseling_by=self.counselor,
            created_by=self.counselor, name='Instagram Filter Match', phone='9000011201',
            source=WalkIn.Source.INSTAGRAM, status=WalkIn.Status.FOLLOW_UP,
            counselor_status=Lead.CounselorStatus.FOLLOW_UP, visit_date=self.today,
        )
        WalkIn.objects.create(
            branch=self.other_branch, course=self.course, assigned_to=self.other_counselor,
            created_by=self.other_counselor, name='Instagram Filter Other', phone='9000011202',
            source=WalkIn.Source.INSTAGRAM, status=WalkIn.Status.FOLLOW_UP,
            counselor_status=Lead.CounselorStatus.FOLLOW_UP, visit_date=self.today,
        )
        self.enrollment = Enrollment.objects.create(
            branch=self.branch, course=self.course, counselor=self.counselor, created_by=self.counselor,
            name='Instagram Filter Match', phone='9000011301', source=WalkIn.Source.INSTAGRAM,
            status=Enrollment.Status.ACTIVE, actual_fees=42900, discount_amount=0, final_fees=42900,
            enrollment_date=self.today,
        )
        Enrollment.objects.create(
            branch=self.other_branch, course=self.course, counselor=self.other_counselor, created_by=self.other_counselor,
            name='Instagram Filter Other', phone='9000011302', source=WalkIn.Source.INSTAGRAM,
            status=Enrollment.Status.ACTIVE, actual_fees=42900, discount_amount=0, final_fees=42900,
            enrollment_date=self.today,
        )

    def ids(self, response):
        rows = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        return [row['id'] for row in rows]

    def test_all_common_filters_combine_for_each_operational_list(self):
        common = {
            'branch': self.branch.id, 'counselor': self.counselor.id, 'source': 'instagram',
            'date_from': self.today.isoformat(), 'date_to': self.today.isoformat(), 'search': 'Filter Match',
        }
        lead_response = self.client.get('/api/leads/', {**common, 'status': 'follow_up'})
        walkin_response = self.client.get('/api/walkins/', {**common, 'status': 'follow_up'})
        enrollment_response = self.client.get('/api/enrollments/', {**common, 'status': 'active'})

        self.assertEqual(lead_response.status_code, 200)
        self.assertEqual(walkin_response.status_code, 200)
        self.assertEqual(enrollment_response.status_code, 200)
        self.assertEqual(self.ids(lead_response), [self.lead.id])
        self.assertEqual(self.ids(walkin_response), [self.walkin.id])
        self.assertEqual(self.ids(enrollment_response), [self.enrollment.id])

    def test_report_uses_the_same_combined_scope_filters(self):
        response = self.client.get('/api/reports/analytics-dashboard/', {
            'branch': self.branch.id, 'user': self.counselor.id, 'source': 'instagram',
            'status': 'follow_up', 'search': 'Filter Match',
            'date_from': self.today.isoformat(), 'date_to': self.today.isoformat(),
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['metrics']['leads'], 1)
        self.assertEqual(response.data['metrics']['walkins'], 1)
        self.assertEqual(response.data['metrics']['enrollments'], 0)

    def test_full_edit_records_history_and_quick_follow_up_does_not_change_status(self):
        edit_response = self.client.patch(f'/api/leads/{self.lead.id}/', {
            'counselor_status': Lead.CounselorStatus.READY_TO_JOIN,
            'competitor_status': Lead.CompetitorStatus.NOT_ENQUIRED_ELSEWHERE,
            'follow_up_priority': Lead.FollowUpPriority.HIGH,
            'conversion_probability': Lead.ConversionProbability.P90,
            'remarks': 'Ready after counseling.',
        }, format='json')
        self.assertEqual(edit_response.status_code, 200)
        history = CandidateStatusHistory.objects.get(record_type=CandidateStatusHistory.RecordType.LEAD, record_id=self.lead.id)
        self.assertEqual(history.old_status, Lead.CounselorStatus.FOLLOW_UP)
        self.assertEqual(history.new_status, Lead.CounselorStatus.READY_TO_JOIN)
        self.assertEqual(history.remarks, 'Ready after counseling.')

        followup_response = self.client.post(f'/api/leads/{self.lead.id}/follow-ups/', {
            'follow_up_date': self.today.isoformat(),
            'next_follow_up_date': (self.today + timedelta(days=2)).isoformat(),
            'remarks': 'Call again.',
            'close_follow_up': True,
        }, format='json')
        self.assertEqual(followup_response.status_code, 201)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.counselor_status, Lead.CounselorStatus.READY_TO_JOIN)
        self.assertEqual(CandidateStatusHistory.objects.filter(record_type=CandidateStatusHistory.RecordType.LEAD, record_id=self.lead.id).count(), 1)

    def test_lead_follow_up_moves_new_lead_to_follow_up_status(self):
        lead = Lead.objects.create(
            branch=self.branch, course=self.course, assigned_to=self.counselor, created_by=self.counselor,
            name='New Follow Up Lead', phone='9000011191', source=Lead.Source.INSTAGRAM,
            status=Lead.Status.NEW, counselor_status=Lead.CounselorStatus.NEW_LEAD,
        )

        response = self.client.post(f'/api/leads/{lead.id}/follow-ups/', {
            'follow_up_date': self.today.isoformat(),
            'next_follow_up_date': (self.today + timedelta(days=2)).isoformat(),
            'remarks': 'First follow-up done.',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        lead.refresh_from_db()
        self.assertEqual(lead.status, Lead.Status.FOLLOW_UP)
        self.assertEqual(lead.counselor_status, Lead.CounselorStatus.FOLLOW_UP)
        self.assertEqual(lead.next_follow_up_date, self.today + timedelta(days=2))
        self.assertEqual(FollowUp.objects.filter(record_type=FollowUp.RecordType.LEAD, record_id=lead.id).count(), 1)
        history = CandidateStatusHistory.objects.get(
            record_type=CandidateStatusHistory.RecordType.LEAD,
            record_id=lead.id,
        )
        self.assertEqual(history.old_status, Lead.CounselorStatus.NEW_LEAD)
        self.assertEqual(history.new_status, Lead.CounselorStatus.FOLLOW_UP)

    def test_lead_follow_up_close_marks_not_interested(self):
        lead = Lead.objects.create(
            branch=self.branch, course=self.course, assigned_to=self.counselor, created_by=self.counselor,
            name='Close Follow Up Lead', phone='9000011192', source=Lead.Source.INSTAGRAM,
            status=Lead.Status.NEW, counselor_status=Lead.CounselorStatus.NEW_LEAD,
        )

        response = self.client.post(f'/api/leads/{lead.id}/follow-ups/', {
            'follow_up_date': self.today.isoformat(),
            'next_follow_up_date': None,
            'remarks': 'No longer interested.',
            'close_follow_up': True,
        }, format='json')

        self.assertEqual(response.status_code, 201)
        lead.refresh_from_db()
        self.assertEqual(lead.status, Lead.Status.NOT_INTERESTED)
        self.assertEqual(lead.counselor_status, Lead.CounselorStatus.NOT_INTERESTED)
        self.assertIsNone(lead.next_follow_up_date)
        self.assertEqual(FollowUp.objects.filter(record_type=FollowUp.RecordType.LEAD, record_id=lead.id).count(), 1)

    def test_full_edit_rolls_back_when_status_history_write_fails(self):
        self.client.raise_request_exception = False
        with mock.patch('views.create_status_history', side_effect=RuntimeError('history unavailable')):
            response = self.client.patch(f'/api/leads/{self.lead.id}/', {
                'counselor_status': Lead.CounselorStatus.READY_TO_JOIN,
                'remarks': 'This update must roll back.',
            }, format='json')
        self.assertEqual(response.status_code, 500)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.counselor_status, Lead.CounselorStatus.FOLLOW_UP)
        self.assertNotEqual(self.lead.remarks, 'This update must roll back.')


@override_settings(
    ALLOWED_HOSTS=['testserver', 'localhost', '127.0.0.1'],
    SECURE_SSL_REDIRECT=False,
)
class AdminReceiptTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(
            name='Gandhipuram',
            address='100 Feet Road',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641012',
            phone='9000000001',
        )
        self.admin = User.objects.create_superuser(
            username='receipt-admin',
            email='receipt-admin@example.com',
            password='pass12345',
        )
        self.client.force_authenticate(user=self.admin)

    def test_admin_receipt_list_search_filter_view_and_download_work(self):
        response = self.client.post('/api/admin-receipts/', {
            'name': 'Receipt Student',
            'phone': '9000001111',
            'purpose': 'Exam Fee',
            'amount': '36900',
            'payment_mode': 'upi',
            'payment_date': '2026-06-18',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        receipt = AdminReceipt.objects.get()

        list_response = self.client.get('/api/admin-receipts/')
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data), 1)

        search_response = self.client.get('/api/admin-receipts/', {'search': 'Receipt Student'})
        self.assertEqual(search_response.status_code, 200)
        self.assertEqual(len(search_response.data), 1)

        filter_response = self.client.get('/api/admin-receipts/', {'payment_date': '2026-06-18'})
        self.assertEqual(filter_response.status_code, 200)
        self.assertEqual(len(filter_response.data), 1)

        pdf_response = self.client.get(f'/api/admin-receipts/{receipt.id}/view-receipt/')
        self.assertEqual(pdf_response.status_code, 200)
        self.assertTrue(pdf_response.content.startswith(b'%PDF'))

        download_response = self.client.get(f'/api/admin-receipts/{receipt.id}/download-receipt/')
        self.assertEqual(download_response.status_code, 200)
        self.assertTrue(download_response.content.startswith(b'%PDF'))

    def test_admin_receipt_defaults_to_gandhipuram_branch_details(self):
        from views import AdminReceiptViewSet

        payload = AdminReceiptViewSet()._branch_header_payload(None)
        self.assertEqual(payload['branch_name'], 'Gandhipuram')
        self.assertIn('100 Feet Road', payload['branch_address_lines'])
        self.assertEqual(payload['branch_phone'], '9000000001')
        self.assertNotIn('not set', ' '.join(payload['branch_address_lines']).lower())
        self.assertNotIn('not set', payload['branch_phone'].lower())

    def test_admin_receipt_amount_in_words_uses_indian_grouping(self):
        from views import AdminReceiptViewSet

        self.assertEqual(
            AdminReceiptViewSet()._amount_in_words(Decimal('36900')),
            'Thirty Six Thousand Nine Hundred Rupees Only',
        )


@override_settings(
    ALLOWED_HOSTS=['testserver', 'localhost', '127.0.0.1'],
    SECURE_SSL_REDIRECT=False,
)
class FollowUpRemarkConsistencyTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name='Gandhipuram', city='Coimbatore')
        self.course = Course.objects.create(name='Python Full Stack', actual_fees=42900)
        self.staff = User.objects.create_user(
            username='remark-staff',
            email='remark-staff@example.com',
            password='pass12345',
            branch=self.branch,
            role=User.Role.STAFF,
        )
        self.client.force_authenticate(user=self.staff)

    def test_lead_list_and_detail_use_latest_follow_up_remark(self):
        lead = Lead.objects.create(
            branch=self.branch,
            course=self.course,
            assigned_to=self.staff,
            created_by=self.staff,
            name='Remark Lead',
            phone='9000010001',
            remarks='Old denormalized lead remark',
            next_follow_up_date='2026-06-19',
            status=Lead.Status.FOLLOW_UP,
        )
        FollowUp.objects.create(
            record_type=FollowUp.RecordType.LEAD,
            record_id=lead.id,
            follow_up_date='2026-06-17',
            next_follow_up_date='2026-06-18',
            remarks='Older lead follow-up',
            updated_by=self.staff,
        )
        FollowUp.objects.create(
            record_type=FollowUp.RecordType.LEAD,
            record_id=lead.id,
            follow_up_date='2026-06-18',
            next_follow_up_date='2026-06-19',
            remarks='Newest lead follow-up',
            updated_by=self.staff,
        )

        list_response = self.client.get('/api/leads/')
        detail_response = self.client.get(f'/api/leads/{lead.id}/')

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(detail_response.status_code, 200)
        list_row = next(item for item in list_response.data if item['id'] == lead.id)
        self.assertEqual(list_row['remarks'], 'Newest lead follow-up')
        self.assertEqual(list_row['latest_remark'], 'Newest lead follow-up')
        self.assertEqual(detail_response.data['latest_remark'], 'Newest lead follow-up')
        self.assertEqual(detail_response.data['follow_ups'][0]['remarks'], 'Newest lead follow-up')

    def test_walkin_list_and_detail_use_latest_follow_up_remark(self):
        walkin = WalkIn.objects.create(
            branch=self.branch,
            course=self.course,
            assigned_to=self.staff,
            created_by=self.staff,
            name='Remark Walkin',
            phone='9000010002',
            remarks='Old denormalized walk-in remark',
            follow_up_date='2026-06-19',
            status=WalkIn.Status.FOLLOW_UP,
        )
        FollowUp.objects.create(
            record_type=FollowUp.RecordType.WALKIN,
            record_id=walkin.id,
            follow_up_date='2026-06-17',
            next_follow_up_date='2026-06-18',
            remarks='Older walk-in follow-up',
            updated_by=self.staff,
        )
        FollowUp.objects.create(
            record_type=FollowUp.RecordType.WALKIN,
            record_id=walkin.id,
            follow_up_date='2026-06-18',
            next_follow_up_date='2026-06-19',
            remarks='Newest walk-in follow-up',
            updated_by=self.staff,
        )

        list_response = self.client.get('/api/walkins/')
        detail_response = self.client.get(f'/api/walkins/{walkin.id}/')

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(detail_response.status_code, 200)
        list_row = next(item for item in list_response.data if item['id'] == walkin.id)
        self.assertEqual(list_row['remarks'], 'Newest walk-in follow-up')
        self.assertEqual(list_row['latest_remark'], 'Newest walk-in follow-up')
        self.assertEqual(detail_response.data['follow_ups'][0]['remarks'], 'Newest walk-in follow-up')


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
        self.client.force_authenticate(self.admin)

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
        self.client.force_authenticate(self.admin)
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
    def test_current_month_rating_starts_at_100_without_activity(self):
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
        self.assertEqual(rating.breakdown['no_pending_followups']['score'], 20)
        self.assertEqual(rating.breakdown['same_day_enrollment']['score'], 15)
        self.assertEqual(rating.breakdown['same_day_collection']['score'], 15)
        self.assertEqual(rating.breakdown['lead_to_walkin_conversion']['score'], 20)
        self.assertEqual(rating.breakdown['walkin_to_enrollment_conversion']['score'], 20)
        self.assertEqual(rating.breakdown['crm_usage_time']['score'], 10)
        self.assertEqual(rating.breakdown['total_deduction'], 0)

    def test_previous_month_rating_is_not_recalculated_or_overwritten(self):
        branch = Branch.objects.create(name='History Rating Branch', city='Coimbatore')
        staff = User.objects.create_user(
            username='history-rating-staff',
            email='history-rating-staff@example.com',
            password='pass12345',
            branch=branch,
        )
        today = timezone.localdate()
        previous_month = today.month - 1 or 12
        previous_year = today.year if today.month > 1 else today.year - 1
        historical_rating = UserMonthlyRating.objects.create(
            user=staff,
            year=previous_year,
            month=previous_month,
            score=86,
            stars=4,
            breakdown={'archived': True},
        )

        from views import calculate_user_monthly_rating

        rating = calculate_user_monthly_rating(staff, previous_year, previous_month)
        historical_rating.refresh_from_db()

        self.assertEqual(rating.id, historical_rating.id)
        self.assertEqual(historical_rating.score, 86)
        self.assertEqual(historical_rating.stars, 4)
        self.assertEqual(historical_rating.breakdown, {'archived': True})


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

    def test_update_schedule_splits_only_unpaid_rows_without_changing_course_fee(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(f'/api/payments/{self.payment.id}/update-schedule/', {
            'payment_schedule': [
                {'label': 'Enrollment', 'amount': '5000', 'due_date': '2026-05-01'},
                {'label': '1st Installment', 'amount': '18950', 'due_date': '2026-05-15'},
                {'label': '2nd Installment', 'amount': '10000', 'due_date': '2026-06-15'},
                {'label': '3rd Installment', 'amount': '8950', 'due_date': '2026-07-15'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.payment.refresh_from_db()
        self.enrollment.refresh_from_db()
        self.course.refresh_from_db()
        self.assertEqual(self.payment.total_fees, Decimal('42900.00'))
        self.assertEqual(self.payment.paid_amount, Decimal('15000.00'))
        self.assertEqual(self.payment.balance, Decimal('27900.00'))
        self.assertEqual(self.payment.status, Payment.Status.PARTIAL)
        self.assertIsNone(self.enrollment.custom_payable_fee)
        self.assertEqual(self.enrollment.net_payable_fee, Decimal('42900.00'))
        self.assertEqual(self.course.actual_fees, Decimal('42900.00'))
        self.assertEqual(Enrollment.objects.count(), 1)
        self.assertEqual(response.data['total_fees'], '42900.00')
        self.assertEqual(response.data['paid_amount'], '15000.00')
        self.assertEqual(response.data['balance'], '27900.00')
        self.assertEqual(response.data['status'], Payment.Status.PARTIAL)

    def test_update_schedule_rejects_changes_to_paid_installments(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(f'/api/payments/{self.payment.id}/update-schedule/', {
            'payment_schedule': [
                {'label': 'Enrollment', 'amount': '6000', 'due_date': '2026-05-01'},
                {'label': '1st Installment', 'amount': '17950', 'due_date': '2026-05-15'},
                {'label': '2nd Installment', 'amount': '18950', 'due_date': '2026-06-15'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['detail'], 'Enrollment Fee must be Rs 5,000.')

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
        self.disabled_staff = User.objects.create_user(
            username='disabled-staff',
            email='disabled-staff@example.com',
            password='pass12345',
            branch=self.branch,
            role=User.Role.STAFF,
            is_active=False,
        )
        self.branch_admin = User.objects.create_user(
            username='branch-admin',
            email='branch-admin@example.com',
            password='pass12345',
            branch=self.branch,
            role=User.Role.SUPER_ADMIN,
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
            'expected_course_budget': WalkIn.ExpectedCourseBudget.RANGE_15000_25000,
            'planned_joining_time': WalkIn.PlannedJoiningTime.IMMEDIATELY,
            'primary_goal': WalkIn.PrimaryGoal.GET_JOB,
            'other_institutes_considering': 'ABC Institute',
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
        self.assertEqual(walkin.expected_course_budget, WalkIn.ExpectedCourseBudget.RANGE_15000_25000)
        self.assertEqual(walkin.planned_joining_time, WalkIn.PlannedJoiningTime.IMMEDIATELY)
        self.assertEqual(walkin.primary_goal, WalkIn.PrimaryGoal.GET_JOB)
        self.assertEqual(walkin.other_institutes_considering, 'ABC Institute')
        self.assertTrue(walkin.interested_global_certification)

    def test_public_walkin_requires_student_qualification_questions(self):
        required_fields = [
            'expected_course_budget',
            'planned_joining_time',
            'primary_goal',
            'other_institutes_considering',
        ]
        payload = {**self.payload, **{field: '' for field in required_fields}}

        response = self.client.post('/api/public/walkin/', payload, format='json')

        self.assertEqual(response.status_code, 400)
        for field in required_fields:
            self.assertIn(field, response.data)
        self.assertFalse(WalkIn.objects.filter(phone='9876543210').exists())

    def test_walkin_by_and_counseling_by_have_separate_branch_rules(self):
        self.client.force_authenticate(self.admin)
        create_response = self.client.post('/api/public/walkin/', self.payload, format='json')
        self.assertEqual(create_response.status_code, 201)
        walkin = WalkIn.objects.get(phone='9876543210')

        walkin_by_response = self.client.get('/api/walkins/walk-in-by-options/')
        self.assertEqual(walkin_by_response.status_code, 200)
        self.assertEqual(walkin_by_response.data[0]['id'], WalkIn.WalkInBy.DIRECT)
        self.assertEqual(walkin_by_response.data[1]['id'], WalkIn.WalkInBy.FRIENDS_REFERENCE)
        walkin_by_ids = {row['id'] for row in walkin_by_response.data}
        self.assertIn(self.staff.id, walkin_by_ids)
        self.assertIn(self.other_staff.id, walkin_by_ids)
        self.assertNotIn(self.admin.id, walkin_by_ids)
        self.assertNotIn(self.branch_admin.id, walkin_by_ids)
        self.assertNotIn(self.disabled_staff.id, walkin_by_ids)

        counseling_options_response = self.client.get('/api/walkins/staff-options/', {'branch': self.branch.id})
        self.assertEqual(counseling_options_response.status_code, 200)
        counseling_ids = {row['id'] for row in counseling_options_response.data}
        self.assertIn(self.staff.id, counseling_ids)
        self.assertNotIn(self.other_staff.id, counseling_ids)
        self.assertNotIn(self.admin.id, counseling_ids)

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

    def test_direct_walkin_by_is_stored_without_user_credit(self):
        self.client.force_authenticate(self.staff)
        direct_payload = {
            **self.payload,
            'walk_in_by': WalkIn.WalkInBy.DIRECT,
            'assigned_to': None,
        }
        direct_response = self.client.post('/api/walkins/', direct_payload, format='json')
        self.assertEqual(direct_response.status_code, 201)

        direct_walkin = WalkIn.objects.get(pk=direct_response.data['id'])
        self.assertEqual(direct_walkin.walk_in_by, WalkIn.WalkInBy.DIRECT)
        self.assertIsNone(direct_walkin.assigned_to)

        staff_payload = {
            **self.payload,
            'phone': '9876543211',
            'assigned_to': self.staff.id,
            'walk_in_by': '',
        }
        staff_response = self.client.post('/api/walkins/', staff_payload, format='json')
        self.assertEqual(staff_response.status_code, 201)

        self.client.force_authenticate(self.admin)
        report_response = self.client.get('/api/reports/user-performance/', {'month': '2026-05'})
        self.assertEqual(report_response.status_code, 200)
        staff_row = next(row for row in report_response.data if row['user_id'] == self.staff.id)
        self.assertEqual(staff_row['walkins'], 1)

    def test_friends_reference_is_stored_and_reported_separately(self):
        self.client.force_authenticate(self.staff)
        friends_response = self.client.post('/api/walkins/', {
            **self.payload,
            'walk_in_by': WalkIn.WalkInBy.FRIENDS_REFERENCE,
            'assigned_to': None,
        }, format='json')
        self.assertEqual(friends_response.status_code, 201)

        WalkIn.objects.create(
            branch=self.branch,
            course=self.course,
            created_by=self.staff,
            assigned_to=self.staff,
            name='Staff Referral Candidate',
            phone='9876543213',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            source=WalkIn.Source.DIRECT,
            visit_date='2026-05-11',
        )
        friends_walkin = WalkIn.objects.get(pk=friends_response.data['id'])
        self.assertEqual(friends_walkin.walk_in_by, WalkIn.WalkInBy.FRIENDS_REFERENCE)
        self.assertIsNone(friends_walkin.assigned_to)

        self.client.force_authenticate(self.admin)
        analytics_response = self.client.get('/api/reports/analytics-dashboard/', {
            'date_from': '2026-05-01',
            'date_to': '2026-05-31',
        })
        self.assertEqual(analytics_response.status_code, 200)
        self.assertEqual(analytics_response.data['metrics']['direct_walkins'], 0)
        self.assertEqual(analytics_response.data['metrics']['friends_reference_walkins'], 1)
        self.assertEqual(analytics_response.data['metrics']['staff_referrals'], 1)

    def test_assigned_walkin_can_change_to_friends_reference_through_admin_approval(self):
        walkin = WalkIn.objects.create(
            branch=self.branch,
            course=self.course,
            created_by=self.staff,
            assigned_to=self.staff,
            name='Friends Reference Change Candidate',
            phone='9876543214',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            source=WalkIn.Source.FRIENDS_REFERENCE,
            visit_date='2026-05-11',
        )
        self.client.force_authenticate(self.staff)
        request_response = self.client.post(
            f'/api/walkins/{walkin.id}/request-assignment-change/',
            {
                'field_type': WalkInAssignmentChangeRequest.FieldType.WALK_IN_BY,
                'requested_walk_in_by': WalkIn.WalkInBy.FRIENDS_REFERENCE,
                'reason': 'Candidate confirmed a friend recommendation.',
            },
            format='json',
        )
        self.assertEqual(request_response.status_code, 201)
        change_request = WalkInAssignmentChangeRequest.objects.get(walkin=walkin)
        self.assertEqual(change_request.status, WalkInAssignmentChangeRequest.Status.PENDING_ADMIN)

        self.client.force_authenticate(self.admin)
        approve_response = self.client.post(
            f'/api/walkin-assignment-change-requests/{change_request.id}/approve/',
            {'admin_remarks': 'Confirmed friend referral.'},
            format='json',
        )
        self.assertEqual(approve_response.status_code, 200)
        walkin.refresh_from_db()
        self.assertIsNone(walkin.assigned_to)
        self.assertEqual(walkin.walk_in_by, WalkIn.WalkInBy.FRIENDS_REFERENCE)

    def test_assigned_walkin_can_change_to_direct_through_admin_approval(self):
        walkin = WalkIn.objects.create(
            branch=self.branch,
            course=self.course,
            created_by=self.staff,
            assigned_to=self.staff,
            name='Direct Change Candidate',
            phone='9876543212',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            source=WalkIn.Source.DIRECT,
            visit_date='2026-05-11',
        )
        self.client.force_authenticate(self.staff)
        request_response = self.client.post(
            f'/api/walkins/{walkin.id}/request-assignment-change/',
            {
                'field_type': WalkInAssignmentChangeRequest.FieldType.WALK_IN_BY,
                'requested_walk_in_by': WalkIn.WalkInBy.DIRECT,
                'reason': 'Candidate came without a staff referral.',
            },
            format='json',
        )
        self.assertEqual(request_response.status_code, 201)
        change_request = WalkInAssignmentChangeRequest.objects.get(walkin=walkin)
        self.assertEqual(change_request.status, WalkInAssignmentChangeRequest.Status.PENDING_ADMIN)
        self.assertIsNone(change_request.requested_user)
        self.assertEqual(change_request.requested_walk_in_by, WalkIn.WalkInBy.DIRECT)

        self.client.force_authenticate(self.admin)
        approve_response = self.client.post(
            f'/api/walkin-assignment-change-requests/{change_request.id}/approve/',
            {'admin_remarks': 'Confirmed direct walk-in.'},
            format='json',
        )
        self.assertEqual(approve_response.status_code, 200)
        walkin.refresh_from_db()
        self.assertIsNone(walkin.assigned_to)
        self.assertEqual(walkin.walk_in_by, WalkIn.WalkInBy.DIRECT)

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
        self.assertEqual(change_request.status, WalkInAssignmentChangeRequest.Status.PENDING_COUNSELOR)
        self.assertTrue(Notification.objects.filter(title='Counselor Change Request', user=self.other_staff).exists())

        staff_approval = self.client.post(
            f'/api/walkin-assignment-change-requests/{change_request.id}/approve/',
            {},
            format='json',
        )
        self.assertEqual(staff_approval.status_code, 403)

        self.client.force_authenticate(self.other_staff)
        counselor_approval = self.client.post(
            f'/api/walkin-assignment-change-requests/{change_request.id}/approve/',
            {'remarks': 'Accepted.'},
            format='json',
        )
        self.assertEqual(counselor_approval.status_code, 200)
        change_request.refresh_from_db()
        walkin.refresh_from_db()
        self.assertEqual(walkin.assigned_to, self.staff)
        self.assertEqual(change_request.status, WalkInAssignmentChangeRequest.Status.PENDING_ADMIN)
        self.assertEqual(change_request.counselor_reviewed_by, self.other_staff)
        self.assertIsNotNone(change_request.counselor_reviewed_at)
        self.assertTrue(Notification.objects.filter(title='Approved Counselor Change Request Awaiting Final Approval').exists())

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

    def test_walkin_source_description_create_edit_and_source_change_preserve_value(self):
        self.client.force_authenticate(self.staff)
        create_response = self.client.post('/api/walkins/', {
            **self.payload,
            'phone': '9000000198',
            'source': WalkIn.Source.INSTAGRAM,
            'source_description': 'Instagram campaign - July intake',
            'walk_in_by': '',
            'assigned_to': self.staff.id,
        }, format='json')

        self.assertEqual(create_response.status_code, 201, create_response.data)
        walkin = WalkIn.objects.get(phone='9000000198')
        self.assertEqual(walkin.source_description, 'Instagram campaign - July intake')
        self.assertEqual(create_response.data['source_description'], 'Instagram campaign - July intake')

        source_response = self.client.patch(f'/api/walkins/{walkin.id}/', {
            'source': WalkIn.Source.WHATSAPP,
        }, format='json')
        self.assertEqual(source_response.status_code, 200)
        walkin.refresh_from_db()
        self.assertEqual(walkin.source, WalkIn.Source.WHATSAPP)
        self.assertEqual(walkin.source_description, 'Instagram campaign - July intake')

        edit_response = self.client.patch(f'/api/walkins/{walkin.id}/', {
            'source_description': 'WhatsApp follow-up from the same campaign',
        }, format='json')
        self.assertEqual(edit_response.status_code, 200)
        self.assertEqual(edit_response.data['source_description'], 'WhatsApp follow-up from the same campaign')

        existing = WalkIn.objects.create(
            branch=self.branch,
            course=self.course,
            assigned_to=self.staff,
            created_by=self.staff,
            name='Existing Walk-in',
            phone='9000000199',
            source=WalkIn.Source.DIRECT,
        )
        detail_response = self.client.get(f'/api/walkins/{existing.id}/')
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data['source_description'], '')

    def test_lead_conversion_copies_walkin_description_without_changing_lead_description(self):
        self.client.force_authenticate(self.staff)
        lead = Lead.objects.create(
            branch=self.branch,
            course=self.course,
            assigned_to=self.staff,
            created_by=self.staff,
            name='Conversion Source Candidate',
            phone='9000000197',
            source=Lead.Source.INSTAGRAM,
            source_description='Original lead campaign detail',
        )

        response = self.client.post(f'/api/leads/{lead.id}/convert-to-walkin/', {
            'visit_date': timezone.localdate().isoformat(),
            'source_description': 'Counselor-entered walk-in source detail',
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        lead.refresh_from_db()
        walkin = WalkIn.objects.get(lead=lead)
        self.assertEqual(walkin.source_description, 'Counselor-entered walk-in source detail')
        self.assertEqual(lead.source_description, 'Original lead campaign detail')

    def test_public_walkin_repeat_phone_updates_existing_record(self):
        first = self.client.post('/api/public/walkin/', self.payload, format='json')
        payload = {**self.payload, 'name': 'Candidate Updated', 'phone': '9876543210'}

        second = self.client.post('/api/public/walkin/', payload, format='json')

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data['updated'])
        self.assertEqual(WalkIn.objects.count(), 1)
        self.assertEqual(WalkIn.objects.get().name, 'Candidate Updated')

    def test_public_walkin_matching_deleted_phone_creates_visible_record(self):
        deleted_walkin = WalkIn.objects.create(
            branch=self.other_branch,
            course=self.course,
            name='Deleted Candidate',
            phone='9876543210',
            status=WalkIn.Status.NEW,
            is_deleted=True,
        )

        response = self.client.post('/api/public/walkin/', self.payload, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data['updated'])
        self.assertEqual(WalkIn.objects.count(), 2)
        created_walkin = WalkIn.objects.get(pk=response.data['id'])
        self.assertFalse(created_walkin.is_deleted)
        self.assertEqual(created_walkin.branch, self.branch)
        deleted_walkin.refresh_from_db()
        self.assertTrue(deleted_walkin.is_deleted)
        self.assertEqual(deleted_walkin.name, 'Deleted Candidate')
        self.assertTrue(Notification.objects.filter(
            title='New public walk-in submitted',
            related_url=f'/walkins/{created_walkin.id}',
        ).exists())
        self.assertFalse(Notification.objects.filter(
            title='New public walk-in submitted',
            related_url=f'/walkins/{deleted_walkin.id}',
        ).exists())

    def test_public_walkin_save_failure_does_not_create_notifications(self):
        with mock.patch('views.PublicWalkInCreateSerializer.save', side_effect=RuntimeError('save failed')):
            response = self.client.post('/api/public/walkin/', self.payload, format='json')

        self.assertEqual(response.status_code, 500)
        self.assertFalse(WalkIn.objects.exists())
        self.assertFalse(Notification.objects.filter(title='New public walk-in submitted').exists())

    def test_public_walkin_notification_failure_does_not_rollback_saved_record(self):
        with mock.patch('views.notify_branch_users', side_effect=RuntimeError('notification failed')):
            response = self.client.post('/api/public/walkin/', self.payload, format='json')

        self.assertEqual(response.status_code, 201)
        walkin = WalkIn.objects.get(pk=response.data['id'])
        self.assertEqual(walkin.branch, self.branch)
        self.assertFalse(walkin.is_deleted)
        self.assertFalse(Notification.objects.filter(title='New public walk-in submitted').exists())

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

    def test_admin_walkin_date_range_returns_only_records_created_within_range(self):
        within_range = WalkIn.objects.create(
            branch=self.branch,
            course=self.course,
            name='Created In May',
            phone='9000000201',
            visit_date='2026-06-10',
        )
        outside_range = WalkIn.objects.create(
            branch=self.branch,
            course=self.course,
            name='Created In April',
            phone='9000000202',
            visit_date='2026-05-15',
        )
        WalkIn.objects.filter(pk=within_range.pk).update(created_at='2026-05-20T10:00:00Z')
        WalkIn.objects.filter(pk=outside_range.pk).update(created_at='2026-04-20T10:00:00Z')

        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/walkins/', {
            'date_from': '2026-05-01',
            'date_to': '2026-05-31',
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.data], [within_range.id])

    def test_admin_lead_date_range_returns_only_records_created_within_range(self):
        within_range = Lead.objects.create(
            branch=self.branch,
            course=self.course,
            name='Lead Created In May',
            phone='9000000203',
        )
        outside_range = Lead.objects.create(
            branch=self.branch,
            course=self.course,
            name='Lead Created In April',
            phone='9000000204',
        )
        Lead.objects.filter(pk=within_range.pk).update(created_at='2026-05-20T10:00:00Z')
        Lead.objects.filter(pk=outside_range.pk).update(created_at='2026-04-20T10:00:00Z')

        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/leads/', {
            'created_from': '2026-05-01',
            'created_to': '2026-05-31',
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.data], [within_range.id])

    def test_student_date_range_returns_only_enrollments_within_range(self):
        within_range = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Student Enrolled In May',
            phone='9000000205',
            actual_fees=10000,
            discount_amount=0,
            enrollment_date='2026-05-20',
            status=Enrollment.Status.ACTIVE,
        )
        Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Student Enrolled In April',
            phone='9000000206',
            actual_fees=10000,
            discount_amount=0,
            enrollment_date='2026-04-20',
            status=Enrollment.Status.ACTIVE,
        )

        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/enrollments/', {
            'queue': 'enrolled',
            'enrolled_from': '2026-05-01',
            'enrolled_to': '2026-05-31',
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.data], [within_range.id])

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

    def test_yet_to_enroll_queue_moves_candidate_only_after_enroll_student(self):
        pending = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Queue Candidate',
            phone='9000000143',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=15000,
            discount_amount=0,
            status=Enrollment.Status.PENDING_RULES,
            payment_schedule=[
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 10000, 'due_date': '2026-05-12'},
            ],
        )
        active = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Confirmed Student',
            phone='9000000144',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=15000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        RulesSigningRequest.objects.create(
            enrollment=pending,
            status=RulesSigningRequest.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )
        self.client.force_authenticate(self.staff)

        yet_response = self.client.get('/api/enrollments/', {'queue': 'yet_to_enroll'})
        enrolled_response = self.client.get('/api/enrollments/', {'queue': 'enrolled'})

        self.assertEqual(yet_response.status_code, 200)
        self.assertEqual([item['id'] for item in yet_response.data], [pending.id])
        self.assertEqual(yet_response.data[0]['rules_signing_status'], RulesSigningRequest.Status.SUBMITTED)
        self.assertEqual(yet_response.data[0]['payment_schedule_status'], 'saved')
        self.assertEqual([item['id'] for item in enrolled_response.data], [active.id])

        enroll_response = self.client.post(f'/api/enrollments/{pending.id}/enroll-student/')

        self.assertEqual(enroll_response.status_code, 200)
        pending.refresh_from_db()
        self.assertEqual(pending.status, Enrollment.Status.ACTIVE)
        self.assertEqual(self.client.get('/api/enrollments/', {'queue': 'yet_to_enroll'}).data, [])
        enrolled_ids = [item['id'] for item in self.client.get('/api/enrollments/', {'queue': 'enrolled'}).data]
        self.assertCountEqual(enrolled_ids, [pending.id, active.id])

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
            {'label': '1st Installment', 'amount': 10000, 'due_date': '2026-05-12'},
        ])

    def test_default_schedule_at_18900_uses_one_remaining_balance_installment(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Threshold Schedule Student',
            phone='9000000141',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=18900,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/add-to-payment/', format='json')

        self.assertEqual(response.status_code, 201)
        payment = Payment.objects.get(enrollment=enrollment)
        self.assertEqual(payment.manual_installment_schedule, [
            {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
            {'label': '1st Installment', 'amount': 13900, 'due_date': '2026-05-12'},
        ])

    def test_default_schedule_above_18900_keeps_current_split_logic(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Above Threshold Schedule Student',
            phone='9000000142',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=19000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/enrollments/{enrollment.id}/add-to-payment/', format='json')

        self.assertEqual(response.status_code, 201)
        payment = Payment.objects.get(enrollment=enrollment)
        self.assertEqual(payment.manual_installment_schedule, [
            {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
            {'label': '1st Installment', 'amount': 7000, 'due_date': '2026-05-12'},
            {'label': '2nd Installment', 'amount': 7000, 'due_date': '2026-06-12'},
        ])

    def test_add_to_payment_uses_single_payment_for_low_fee_course(self):
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
            {'label': 'Single Payment', 'amount': 5900, 'due_date': '2026-05-11'},
        ])

    def test_saved_low_fee_schedule_is_returned_as_single_payment(self):
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
            {'label': 'Single Payment', 'amount': 6900, 'due_date': '2026-05-11'},
        ])
        self.assertEqual(response.data['installment_summary'][0]['label'], 'Single Payment')

    def test_default_schedule_uses_single_payment_at_low_fee_boundaries(self):
        cases = [
            (2900, [{'label': 'Single Payment', 'amount': 2900, 'due_date': '2026-05-11'}]),
            (6900, [{'label': 'Single Payment', 'amount': 6900, 'due_date': '2026-05-11'}]),
            (
                6901,
                [
                    {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                    {'label': '1st Installment', 'amount': 1901, 'due_date': '2026-05-12'},
                ],
            ),
        ]
        self.client.force_authenticate(self.staff)
        for fee, expected_schedule in cases:
            with self.subTest(fee=fee):
                enrollment = Enrollment.objects.create(
                    branch=self.branch,
                    course=self.course,
                    name=f'Boundary Fee {fee}',
                    phone=f'900000{fee}',
                    preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
                    enrollment_date='2026-05-11',
                    start_date='2026-05-12',
                    actual_fees=fee,
                    discount_amount=0,
                    status=Enrollment.Status.ACTIVE,
                )

                response = self.client.post(f'/api/enrollments/{enrollment.id}/add-to-payment/', format='json')

                self.assertEqual(response.status_code, 201)
                payment = Payment.objects.get(enrollment=enrollment)
                self.assertEqual(payment.manual_installment_schedule, expected_schedule)

    def test_course_fee_7000_uses_fixed_enrollment_and_final_balance(self):
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
            {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
            {'label': '1st Installment', 'amount': 2000, 'due_date': '2026-05-12'},
        ])

    def test_deleted_payment_installment_rebuilds_payment_summary_and_schedule_statuses(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.final_course,
            name='Installment Delete Student',
            phone='9000000135',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-02-01',
            start_date='2026-02-10',
            actual_fees=15000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
            student_number='STU202602-0018',
        )
        payment = Payment.objects.create(
            enrollment=enrollment,
            total_fees=enrollment.net_payable_fee,
            manual_installment_schedule=[
                {'label': 'Enrollment Fee', 'amount': 5000, 'due_date': '2026-02-01'},
                {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-02-10'},
                {'label': '2nd Installment', 'amount': 5000, 'due_date': '2026-03-10'},
            ],
        )
        PaymentInstallment.objects.create(
            payment=payment,
            enrollment=enrollment,
            amount=5000,
            installment_index=1,
            installment_label='Enrollment Fee',
            reference_number='STU202602-0018-P01',
            payment_mode=PaymentInstallment.Mode.CASH,
            payment_date='2026-02-01',
        )
        PaymentInstallment.objects.create(
            payment=payment,
            enrollment=enrollment,
            amount=5000,
            installment_index=2,
            installment_label='1st Installment',
            reference_number='STU202602-0018-P02',
            payment_mode=PaymentInstallment.Mode.CASH,
            payment_date='2026-02-10',
        )
        second_installment = PaymentInstallment.objects.create(
            payment=payment,
            enrollment=enrollment,
            amount=5000,
            installment_index=3,
            installment_label='2nd Installment',
            reference_number='STU202602-0018-P03',
            payment_mode=PaymentInstallment.Mode.CASH,
            payment_date='2026-03-10',
        )

        second_installment.delete()
        payment.refresh_from_db()

        self.assertEqual(payment.paid_amount, Decimal('10000.00'))
        self.assertEqual(payment.balance, Decimal('5000.00'))
        self.assertEqual(payment.status, Payment.Status.PARTIAL)
        self.assertEqual(str(payment.next_payment_date), '2026-03-10')

        self.client.force_authenticate(self.staff)
        response = self.client.get(f'/api/payments/{payment.id}/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(str(response.data['paid_amount'])), Decimal('10000.00'))
        self.assertEqual(Decimal(str(response.data['balance'])), Decimal('5000.00'))
        self.assertEqual(response.data['status'], Payment.Status.PARTIAL)
        statuses = {item['label']: item['status'] for item in response.data['installment_summary']}
        self.assertEqual(statuses['Enrollment Fee'], 'paid')
        self.assertEqual(statuses['1st Installment'], 'paid')
        self.assertEqual(statuses['2nd Installment'], 'pending')

    def test_deleted_middle_payment_does_not_reassign_later_payment_to_earlier_installment(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.final_course,
            name='Middle Installment Delete Student',
            phone='9000000136',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-02-01',
            start_date='2026-02-10',
            actual_fees=15000,
            discount_amount=0,
            status=Enrollment.Status.ACTIVE,
            student_number='STU202602-0030',
        )
        payment = Payment.objects.create(
            enrollment=enrollment,
            total_fees=enrollment.net_payable_fee,
            manual_installment_schedule=[
                {'label': 'Enrollment Fee', 'amount': 5000, 'due_date': '2026-02-01'},
                {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-02-10'},
                {'label': '2nd Installment', 'amount': 5000, 'due_date': '2026-03-10'},
            ],
        )
        for index, label, reference, payment_date in [
            (1, 'Enrollment Fee', 'STU202602-0030-P01', '2026-02-01'),
            (2, '1st Installment', 'STU202602-0030-P02', '2026-02-10'),
            (3, '2nd Installment', 'STU202602-0030-P03', '2026-03-10'),
        ]:
            PaymentInstallment.objects.create(
                payment=payment,
                enrollment=enrollment,
                amount=5000,
                installment_index=index,
                installment_label=label,
                reference_number=reference,
                payment_mode=PaymentInstallment.Mode.CASH,
                payment_date=payment_date,
            )

        PaymentInstallment.objects.get(reference_number='STU202602-0030-P02').delete()
        payment.refresh_from_db()

        self.assertEqual(payment.paid_amount, Decimal('10000.00'))
        self.assertEqual(payment.balance, Decimal('5000.00'))
        self.assertEqual(payment.status, Payment.Status.PARTIAL)
        self.assertEqual(str(payment.next_payment_date), '2026-02-10')

        self.client.force_authenticate(self.staff)
        response = self.client.get(f'/api/payments/{payment.id}/')

        statuses = {item['label']: item['status'] for item in response.data['installment_summary']}
        self.assertEqual(statuses['Enrollment Fee'], 'paid')
        self.assertEqual(statuses['1st Installment'], 'pending')
        self.assertEqual(statuses['2nd Installment'], 'paid')

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

    def test_signed_rules_pdf_view_uses_stored_pdf_without_rebuild(self):
        enrollment = Enrollment.objects.create(
            branch=self.branch,
            course=self.course,
            name='Dynamic Signed PDF Student',
            phone='9000000140',
            preferred_timing=WalkIn.PreferredTiming.WEEKDAY_MORNING,
            enrollment_date='2026-05-11',
            start_date='2026-05-12',
            actual_fees=15900,
            discount_amount=0,
            status=Enrollment.Status.RULES_SUBMITTED,
            payment_schedule=[
                {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                {'label': '1st Installment', 'amount': 5450, 'due_date': '2026-05-12'},
                {'label': '2nd Installment', 'amount': 5450, 'due_date': '2026-06-12'},
            ],
        )
        signing = RulesSigningRequest.objects.create(
            enrollment=enrollment,
            status=RulesSigningRequest.Status.SUBMITTED,
            submitted_at=timezone.now(),
            signature_image_file=b'signature',
            signed_pdf_file=b'%PDF-stored',
        )

        with mock.patch('views.build_signed_rules_pdf', return_value=b'%PDF-latest') as build_pdf:
            response = self.client.get(f'/public/rules-signed-pdf/{signing.token}/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'%PDF-stored')
        build_pdf.assert_not_called()

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
        self.assertTrue(signing.selfie_image)
        self.assertTrue(signing.signature_image)
        self.assertTrue(signing.signed_pdf)
        self.assertFalse(signing.selfie_image_file)
        self.assertFalse(signing.signature_image_file)
        self.assertFalse(signing.signed_pdf_file)
        self.assertIn('/public/rules-signed-pdf/', response.data['signed_pdf_url'])

        with mock.patch('views.build_signed_rules_pdf') as build_pdf:
            pdf_response = self.client.get(f'/public/rules-signed-pdf/{signing.token}/')

        self.assertEqual(pdf_response.status_code, 200)
        self.assertTrue(b''.join(pdf_response.streaming_content).startswith(b'%PDF'))
        build_pdf.assert_not_called()

        self.client.force_authenticate(user=self.staff)
        selfie_response = self.client.get(f'/rules-selfie/{enrollment.id}/')
        self.assertEqual(selfie_response.status_code, 200)
        self.assertTrue(b''.join(selfie_response.streaming_content).startswith(b'\x89PNG'))

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
        self.client.force_authenticate(self.admin)

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
            {'label': '2nd Installment', 'amount': 10000, 'due_date': '2026-05-12'},
        ])
        self.assertEqual(enrollment.payment_schedule, payment.manual_installment_schedule)
        self.assertEqual(sum(item['amount'] for item in payment.manual_installment_schedule[1:]), 10000)
        history = CourseChangeHistory.objects.get(enrollment=enrollment)
        self.assertEqual(history.old_course, self.course)
        self.assertEqual(history.new_course, self.final_course)
        self.assertEqual(history.changed_by, self.admin)
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
        signing = RulesSigningRequest.objects.create(
            enrollment=enrollment,
            status=RulesSigningRequest.Status.SUBMITTED,
            submitted_at=timezone.now(),
            signed_pdf='signed_rules/approval-change-old.pdf',
            signed_pdf_file=b'%PDF-old-rules',
        )
        old_signing_token = signing.token
        enrollment.payment_schedule = payment.manual_installment_schedule
        enrollment.payment_schedule_locked = True
        enrollment.payment_schedule_finalized_at = timezone.now()
        enrollment.save(update_fields=[
            'payment_schedule', 'payment_schedule_locked',
            'payment_schedule_finalized_at', 'updated_at',
        ])
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
        self.assertEqual(enrollment.status, Enrollment.Status.PENDING_RULES)
        self.assertFalse(enrollment.payment_schedule_locked)
        self.assertEqual(payment.total_fees, Decimal('15000.00'))
        self.assertEqual(payment.paid_amount, Decimal('5000.00'))
        self.assertEqual(payment.balance, Decimal('10000.00'))
        self.assertEqual(PaymentInstallment.objects.filter(payment=payment).count(), 1)
        self.assertEqual(payment.manual_installment_schedule, [
            {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-05-11'},
            {'label': '2nd Installment', 'amount': 10000, 'due_date': '2026-05-12'},
        ])
        self.assertEqual(enrollment.payment_schedule, payment.manual_installment_schedule)
        self.assertEqual(sum(item['amount'] for item in payment.manual_installment_schedule[1:]), 10000)
        signing.refresh_from_db()
        self.assertNotEqual(signing.token, old_signing_token)
        self.assertEqual(signing.status, RulesSigningRequest.Status.PENDING)
        self.assertFalse(signing.signed_pdf)
        self.assertIsNone(signing.signed_pdf_file)
        reset_history = EnrollmentRulesResetHistory.objects.get(enrollment=enrollment)
        self.assertEqual(reset_history.previous_rules_status, RulesSigningRequest.Status.SUBMITTED)
        self.assertEqual(reset_history.previous_signing_token, str(old_signing_token))
        self.assertTrue(reset_history.previous_schedule_locked)
        self.assertTrue(reset_history.previous_signed)
        self.assertEqual(reset_history.previous_signed_pdf.name, 'signed_rules/approval-change-old.pdf')
        self.assertEqual(bytes(reset_history.previous_signed_pdf_file), b'%PDF-old-rules')
        self.assertEqual(reset_history.previous_payment_schedule, [
            {'label': '1st Installment', 'amount': 5000, 'due_date': '2026-05-11'},
            {'label': '2nd Installment', 'amount': 5000, 'due_date': '2026-05-12'},
        ])
        self.assertEqual(Enrollment.objects.count(), 1)
        self.assertEqual(Payment.objects.count(), 1)
        self.assertEqual(PaymentInstallment.objects.count(), 1)
        self.assertTrue(Notification.objects.filter(
            user=self.admin,
            title='Course Changed',
            message='Course changed for Approval Course Student. Payment schedule regenerated. Awaiting Rules & Regulations re-sign.',
            related_url=f'/enrollments/{enrollment.id}',
        ).exists())
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

    def test_admin_schedule_override_cannot_change_candidate_payable_fee(self):
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

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['detail'], 'Payment schedule total must match course fee.')
        enrollment.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(enrollment.actual_fees, Decimal('42900.00'))
        self.assertIsNone(enrollment.custom_payable_fee)
        self.assertEqual(enrollment.net_payable_fee, Decimal('42900.00'))
        self.assertEqual(payment.total_fees, Decimal('42900.00'))
        self.assertEqual(payment.balance, Decimal('37900.00'))
        self.assertEqual(payment.status, Payment.Status.PARTIAL)

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
                [
                    {'label': 'Enrollment', 'amount': 5000, 'due_date': '2026-05-11'},
                    {'label': '1st Installment', 'amount': 1500, 'due_date': '2026-05-20'},
                ],
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
