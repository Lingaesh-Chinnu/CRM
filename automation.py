# ============================================================
# backend/apps/automation/whatsapp.py
# WhatsApp Cloud API Integration (Meta Business Platform)
# ============================================================
import requests
import logging
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)
User = get_user_model()


class WhatsAppClient:
    """
    Wrapper around Meta WhatsApp Business Cloud API v18.
    Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/
    """

    BASE_URL = settings.WHATSAPP_API_URL

    def __init__(self):
        self.headers = {
            'Authorization': f'Bearer {settings.WHATSAPP_API_TOKEN}',
            'Content-Type':  'application/json',
        }

    def send_text_message(self, phone: str, body: str) -> dict:
        """Send a plain text message."""
        payload = {
            'messaging_product': 'whatsapp',
            'to':                self._normalise_phone(phone),
            'type':              'text',
            'text':              {'preview_url': False, 'body': body},
        }
        return self._post(payload)

    def send_template_message(self, phone: str, template: str,
                              language: str = 'en_US', components: list = None) -> dict:
        """
        Send a pre-approved template message.
        components example:
          [{'type':'body','parameters':[{'type':'text','text':'John'}]}]
        """
        payload = {
            'messaging_product': 'whatsapp',
            'to':                self._normalise_phone(phone),
            'type':              'template',
            'template': {
                'name':       template,
                'language':   {'code': language},
                'components': components or [],
            },
        }
        return self._post(payload)

    def _post(self, payload: dict) -> dict:
        try:
            response = requests.post(self.BASE_URL, json=payload, headers=self.headers, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f'WhatsApp API error: {e}')
            return {'error': str(e)}

    @staticmethod
    def _normalise_phone(phone: str) -> str:
        """Ensure phone is in E.164 format with country code."""
        phone = phone.replace(' ', '').replace('-', '').replace('+', '')
        if not phone.startswith('91') and len(phone) == 10:
            phone = '91' + phone   # Default to India (+91)
        return phone


# ── Helpers ────────────────────────────────────────────────────

def _log_message(phone, msg_type, body, result, sent_by=None, related_model='', related_id=None):
    """Persist every dispatched message to the DB for audit."""
    from crm.models import WhatsAppMessage
    wa_msg = WhatsAppMessage.objects.create(
        recipient_phone = phone,
        message_body    = body,
        message_type    = msg_type,
        sent_by         = sent_by,
        related_model   = related_model,
        related_id      = related_id,
    )
    if 'error' in result:
        wa_msg.status        = WhatsAppMessage.MsgStatus.FAILED
        wa_msg.error_message = result['error']
    else:
        wa_msg.status       = WhatsAppMessage.MsgStatus.SENT
        wa_msg.wa_message_id = result.get('messages', [{}])[0].get('id', '')
        wa_msg.sent_at       = timezone.now()
    wa_msg.save()
    return wa_msg


def send_fee_reminder(enrollment):
    """Sends fee reminder to a student with a pending/partial payment."""
    from crm.models import Payment
    client = WhatsAppClient()
    payment = getattr(enrollment, 'payment', None)
    if not payment or payment.status == Payment.Status.PAID:
        return
    body = (
        f'Dear {enrollment.name},\n\n'
        f'This is a reminder that your fee balance for *{enrollment.course.name}* '
        f'is ₹{payment.balance:,.0f}.\n\n'
        f'Please clear your dues at the earliest.\n\n'
        f'Regards,\n{enrollment.branch.name if enrollment.branch else "Institute"}'
    )
    result = client.send_text_message(enrollment.phone, body)
    _log_message(enrollment.phone, 'fee_reminder', body, result,
                 related_model='enrollment', related_id=enrollment.id)


def send_birthday_wish(enrollment_or_walkin):
    """Sends birthday greeting."""
    client = WhatsAppClient()
    name   = enrollment_or_walkin.name
    phone  = enrollment_or_walkin.phone
    body   = (
        f'🎂 Happy Birthday, {name}!\n\n'
        f'Wishing you a wonderful day filled with joy and success.\n\n'
        f'Warm regards,\nThe Team'
    )
    result = client.send_text_message(phone, body)
    _log_message(phone, 'birthday', body, result)


def send_first_class_reminder(enrollment):
    """Sends reminder a day before the first class."""
    client = WhatsAppClient()
    body   = (
        f'Dear {enrollment.name},\n\n'
        f'Your first class for *{enrollment.course.name}* starts tomorrow '
        f'({enrollment.start_date}).\n\n'
        f'Please be on time. We look forward to seeing you!\n\n'
        f'Regards,\n{enrollment.branch.name if enrollment.branch else "Institute"}'
    )
    result = client.send_text_message(enrollment.phone, body)
    _log_message(enrollment.phone, 'first_class', body, result,
                 related_model='enrollment', related_id=enrollment.id)


def send_walkin_reminder(walkin):
    """Sends reminder day before a scheduled walk-in."""
    client = WhatsAppClient()
    body   = (
        f'Dear {walkin.name},\n\n'
        f'This is a reminder for your visit scheduled at '
        f'*{walkin.branch.name if walkin.branch else "our branch"}* tomorrow.\n\n'
        f'We look forward to seeing you!\n\n'
        f'Regards,\nAdmissions Team'
    )
    result = client.send_text_message(walkin.phone, body)
    _log_message(walkin.phone, 'walkin_reminder', body, result,
                 related_model='walkin', related_id=walkin.id)


def send_followup_reminder(lead):
    """Sends follow-up message for a lead."""
    client = WhatsAppClient()
    body   = (
        f'Hi {lead.name} 👋,\n\n'
        f'We noticed you enquired about *{lead.course.name if lead.course else "our courses"}*.\n\n'
        f'Would you like to schedule a free demo class? Reply to this message or call us.\n\n'
        f'Regards,\nAdmissions Team'
    )
    result = client.send_text_message(lead.phone, body)
    _log_message(lead.phone, 'follow_up', body, result,
                 related_model='lead', related_id=lead.id)


# ============================================================
# backend/apps/automation/tasks.py
# Celery tasks — triggered by Celery Beat (scheduled) or on-demand
# ============================================================
from celery import shared_task
from django.utils import timezone
from datetime import date, timedelta
import logging

logger = logging.getLogger(__name__)


@shared_task(name='automation.send_fee_reminders', bind=True, max_retries=3)
def send_fee_reminders_task(self):
    """
    Runs daily at 10:00 AM IST.
    Sends fee reminders to all students with partial or unpaid payments.
    """
    from crm.models import Enrollment, Payment

    logger.info('Running fee reminder task...')
    enrollments = Enrollment.objects.filter(
        status=Enrollment.Status.ACTIVE,
        payment__status__in=[Payment.Status.PARTIAL, Payment.Status.UNPAID],
    ).select_related('course','branch','payment')

    count = 0
    for enrollment in enrollments:
        try:
            send_fee_reminder(enrollment)
            count += 1
        except Exception as exc:
            logger.error(f'Fee reminder failed for {enrollment.student_number}: {exc}')

    logger.info(f'Fee reminders sent: {count}')
    return count


@shared_task(name='automation.send_birthday_wishes', bind=True)
def send_birthday_wishes_task(self):
    """
    Runs daily at 8:00 AM IST.
    Wishes birthdays to enrolled students and walk-in visitors.
    """
    from crm.models import Enrollment, WalkIn

    today = date.today()
    logger.info(f'Running birthday task for {today}...')

    # Active students
    students = Enrollment.objects.filter(
        status=Enrollment.Status.ACTIVE,
        dob__month=today.month,
        dob__day=today.day,
    )
    for student in students:
        try:
            send_birthday_wish(student)
        except Exception as exc:
            logger.error(f'Birthday wish failed for {student.student_number}: {exc}')

    # Walk-in visitors (converted or follow-up)
    visitors = WalkIn.objects.filter(
        dob__month=today.month,
        dob__day=today.day,
        status__in=[WalkIn.Status.NEW, WalkIn.Status.FOLLOW_UP],
    )
    for visitor in visitors:
        try:
            send_birthday_wish(visitor)
        except Exception as exc:
            logger.error(f'Birthday wish failed for {visitor.candidate_number}: {exc}')


@shared_task(name='automation.send_first_class_reminders', bind=True)
def send_first_class_reminders_task(self):
    """
    Runs daily at 9:00 AM IST.
    Reminds students whose first class is tomorrow.
    """
    from crm.models import Enrollment

    tomorrow = date.today() + timedelta(days=1)
    enrollments = Enrollment.objects.filter(
        status=Enrollment.Status.ACTIVE,
        start_date=tomorrow,
    ).select_related('course','branch')

    for enrollment in enrollments:
        try:
            send_first_class_reminder(enrollment)
        except Exception as exc:
            logger.error(f'First class reminder failed for {enrollment.student_number}: {exc}')


@shared_task(name='automation.send_walkin_reminders', bind=True)
def send_walkin_reminders_task(self):
    """
    Runs daily at 7:00 PM IST.
    Reminds leads about their scheduled walk-in visit tomorrow.
    """
    from crm.models import Lead

    tomorrow = date.today() + timedelta(days=1)
    leads = Lead.objects.filter(
        walkin_date=tomorrow,
        status__in=[Lead.Status.NEW, Lead.Status.FOLLOW_UP, Lead.Status.WALK_IN],
    ).select_related('branch','course')

    for lead in leads:
        try:
            send_walkin_reminder_for_lead(lead)
        except Exception as exc:
            logger.error(f'Walk-in reminder failed for {lead.lead_number}: {exc}')


def send_walkin_reminder_for_lead(lead):
    client = WhatsAppClient()
    body   = (
        f'Dear {lead.name},\n\n'
        f'Reminder: Your visit to *{lead.branch.name if lead.branch else "our branch"}* '
        f'is scheduled for tomorrow.\n\n'
        f'Looking forward to meeting you!\n\n'
        f'Regards,\nAdmissions Team'
    )
    result = client.send_text_message(lead.phone, body)
    _log_message(lead.phone, 'walkin_reminder', body, result,
                 related_model='lead', related_id=lead.id)


@shared_task(name='automation.send_followup_reminders', bind=True)
def send_followup_reminders_task(self):
    """
    Runs every Monday at 9:00 AM IST.
    Sends follow-up messages to leads that are still in 'new' or 'follow_up' status
    and have not been updated in 3+ days.
    """
    from crm.models import Lead

    stale_threshold = timezone.now() - timedelta(days=3)
    leads = Lead.objects.filter(
        status__in=[Lead.Status.NEW, Lead.Status.FOLLOW_UP],
        updated_at__lte=stale_threshold,
    ).select_related('course')

    for lead in leads:
        try:
            send_followup_reminder(lead)
        except Exception as exc:
            logger.error(f'Follow-up reminder failed for {lead.lead_number}: {exc}')


# ============================================================
# backend/core/celery.py
# Celery application configuration
# ============================================================
from celery import Celery
from celery.schedules import crontab

app = Celery('crm_erp')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# ── Celery Beat Periodic Schedule ─────────────────────────────
app.conf.beat_schedule = {
    # Fee reminders — every day at 10:00 AM IST
    'fee-reminders-daily': {
        'task':     'automation.send_fee_reminders',
        'schedule': crontab(hour=10, minute=0),
    },
    # Birthday wishes — every day at 8:00 AM IST
    'birthday-wishes-daily': {
        'task':     'automation.send_birthday_wishes',
        'schedule': crontab(hour=8, minute=0),
    },
    # First class reminders — every day at 9:00 AM IST
    'first-class-reminders-daily': {
        'task':     'automation.send_first_class_reminders',
        'schedule': crontab(hour=9, minute=0),
    },
    # Walk-in reminders — every day at 7:00 PM IST
    'walkin-reminders-daily': {
        'task':     'automation.send_walkin_reminders',
        'schedule': crontab(hour=19, minute=0),
    },
    # Follow-up reminders — every Monday at 9:00 AM IST
    'followup-reminders-weekly': {
        'task':     'automation.send_followup_reminders',
        'schedule': crontab(hour=9, minute=0, day_of_week='monday'),
    },
}


# ============================================================
# backend/apps/automation/views.py
# WhatsApp webhook + manual send + public walk-in form
# ============================================================
class WhatsAppWebhookView(APIView):
    """
    GET  /api/whatsapp/webhook/ — Webhook verification by Meta
    POST /api/whatsapp/webhook/ — Incoming message handling
    """
    permission_classes = [AllowAny]

    def get(self, request):
        """Meta webhook verification challenge."""
        mode       = request.query_params.get('hub.mode')
        token      = request.query_params.get('hub.verify_token')
        challenge  = request.query_params.get('hub.challenge')
        if mode == 'subscribe' and token == settings.WHATSAPP_VERIFY_TOKEN:
            return Response(int(challenge), status=200)
        return Response({'error': 'Forbidden'}, status=403)

    def post(self, request):
        """Handle incoming WhatsApp messages (status updates, replies)."""
        from crm.models import WhatsAppMessage
        data  = request.data
        entry = data.get('entry', [{}])[0]
        changes = entry.get('changes', [{}])[0].get('value', {})

        # Handle delivery status updates
        statuses = changes.get('statuses', [])
        for s in statuses:
            wa_id  = s.get('id')
            status = s.get('status')  # sent / delivered / read / failed
            if wa_id and status:
                WhatsAppMessage.objects.filter(wa_message_id=wa_id).update(status=status)

        return Response({'status': 'ok'})


class WhatsAppSendView(APIView):
    """POST /api/whatsapp/send/ — Manual message dispatch by staff."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        phone   = request.data.get('phone')
        body    = request.data.get('message')
        rel_mod = request.data.get('related_model', '')
        rel_id  = request.data.get('related_id')

        if not phone or not body:
            return Response({'error': 'phone and message are required.'}, status=400)

        client = WhatsAppClient()
        result = client.send_text_message(phone, body)
        log    = _log_message(phone, 'manual', body, result, sent_by=request.user,
                              related_model=rel_mod, related_id=rel_id)

        from serializers import WhatsAppMessageSerializer
        return Response(WhatsAppMessageSerializer(log).data, status=201)


class NotificationViewSet(viewsets.ModelViewSet):
    """Manage in-app notifications for the current user."""
    permission_classes = [IsAuthenticated]
    from serializers import NotificationSerializer
    serializer_class   = NotificationSerializer

    def get_queryset(self):
        from crm.models import Notification
        return Notification.objects.filter(user=self.request.user)

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        self.get_queryset().update(is_read=True)
        return Response({'detail': 'All notifications marked as read.'})


class PublicWalkInFormView(APIView):
    """
    POST /api/public/walkin/
    Public endpoint — no authentication required.
    Used for the shareable walk-in form link.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from serializers import WalkInDetailSerializer
        serializer = WalkInDetailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        walkin = serializer.save()
        # Send confirmation WhatsApp message
        client = WhatsAppClient()
        body   = (
            f'Dear {walkin.name},\n\n'
            f'Thank you for registering your interest! '
            f'Our team will contact you shortly to confirm your visit.\n\n'
            f'Regards,\nAdmissions Team'
        )
        client.send_text_message(walkin.phone, body)
        return Response({
            'candidate_number': walkin.candidate_number,
            'message':          'Registration successful! We will contact you soon.',
        }, status=201)
