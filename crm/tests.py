from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase
from unittest import mock

from crm.models import Branch, Course, Enrollment, Lead, WalkIn


User = get_user_model()


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
            status=Lead.Status.NEW,
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
