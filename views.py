# ============================================================
# backend/apps/accounts/permissions.py
# Custom permission classes for RBAC
# ============================================================
from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsSuperAdmin(BasePermission):
    """Allow access only to super admins."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_super_admin


class IsStaffOrAdmin(BasePermission):
    """Allow any authenticated staff or admin."""
    def has_permission(self, request, view):
        return request.user.is_authenticated


class IsSuperAdminOrReadOnly(BasePermission):
    """Read-only for staff; write access only for super admin."""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_super_admin


# ============================================================
# backend/apps/accounts/views.py
# ============================================================
from rest_framework import viewsets, status, generics, mixins
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.conf import settings
from django.core.mail import send_mail
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.http import HttpResponse
from django.shortcuts import render
from django.db import IntegrityError, connection, transaction
from django.db.utils import OperationalError, ProgrammingError
from django.db.models import Sum, Count, Q, F, Exists, OuterRef
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.html import escape
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
import base64
import io
import logging
import re
import zipfile
from whatsapp_service import send_candidate_message
from calendar import month_abbr, monthrange
from xml.etree import ElementTree

from crm.models import (
    Branch, UserTarget, UserMonthlyRating, BranchTarget, HistoricalAnalyticsEntry, Discount, BranchTransferRequest,
    RulesSigningRequest, UserSessionLog, WhatsAppMessage, WhatsAppTemplate, Notification, Lead, WalkIn, Payment,
    PhoneNumberChangeHistory,
    PaymentInstallment, AdminReceipt, FollowUp, Enrollment, get_default_installment_schedule, enrollment_payable_fee,
)
from serializers import (
    BranchSerializer, UserSerializer, UserTargetSerializer,
    BranchTargetSerializer, HistoricalAnalyticsEntrySerializer,
    CustomTokenObtainPairSerializer, UserPerformanceReportSerializer,
    UserMonitoringSerializer, UserMonthlyRatingSerializer,
    WhatsAppTemplateSerializer, NotificationSerializer, AdminReceiptSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)
_TABLE_COLUMN_CACHE = {}


def missing_model_columns(model, field_names):
    cache_key = model._meta.db_table
    try:
        columns = _TABLE_COLUMN_CACHE.get(cache_key)
        if columns is None:
            with connection.cursor() as cursor:
                columns = {
                    column.name
                    for column in connection.introspection.get_table_description(cursor, model._meta.db_table)
                }
            _TABLE_COLUMN_CACHE[cache_key] = columns
        return [
            field_name
            for field_name in field_names
            if model._meta.get_field(field_name).column not in columns
        ]
    except Exception:
        logger.exception('Could not inspect columns for %s.', model._meta.db_table)
        return list(field_names)


def valid_walkin_enrollment(walkin):
    try:
        enrollment = getattr(walkin, 'enrollment', None)
    except Enrollment.DoesNotExist:
        enrollment = None
    if enrollment:
        return enrollment
    if walkin.converted_to_type == 'enrollment' and walkin.converted_record_id:
        return Enrollment.objects.filter(pk=walkin.converted_record_id, walkin=walkin).first()
    return None


def clear_stale_walkin_conversion(walkin):
    if not (
        walkin.converted_to_type
        or walkin.converted_record_id
        or walkin.converted_at
        or walkin.status == WalkIn.Status.CONVERTED
    ):
        return False
    if valid_walkin_enrollment(walkin):
        return False
    walkin.converted_to_type = ''
    walkin.converted_record_id = None
    walkin.converted_at = None
    walkin.converted_by = None
    if walkin.status == WalkIn.Status.CONVERTED:
        walkin.status = WalkIn.Status.NEW
    walkin.save(update_fields=[
        'status', 'converted_to_type', 'converted_record_id',
        'converted_at', 'converted_by', 'updated_at',
    ])
    return True


def app_url(path):
    """Build a URL path inside the configured application mount."""
    base_path = getattr(settings, 'APP_BASE_PATH', '') or ''
    return f'{base_path}/{path.strip("/")}'


def build_login_url(request):
    return request.build_absolute_uri(app_url('login'))


def send_login_credentials_email(user, plain_password, login_url):
    body = (
        f'Hi {user.full_name},\n\n'
        'Your Indra Institute CRM account has been created.\n\n'
        f'Login URL: {login_url}\n'
        f'Username: {user.username}\n'
        f'Password: {plain_password}\n\n'
        'Please keep these credentials safe and do not share them with anyone.\n\n'
        '-Team IIE'
    )
    send_mail(
        subject='Indra Institute CRM - Login Credentials',
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


WHATSAPP_PLACEHOLDERS = [
    'student_name',
    'candidate_name',
    'course_name',
    'branch_name',
    'phone_number',
    'total_fee',
    'paid_amount',
    'pending_amount',
    'installment_number',
    'installment_amount',
    'due_date',
    'next_payment_date',
    'follow_up_date',
    'rules_link',
    'institute_name',
]


WHATSAPP_MESSAGE_TYPE_MAP = {
    WhatsAppTemplate.TemplateType.LEAD_FOLLOW_UP: WhatsAppMessage.MsgType.FOLLOW_UP,
    WhatsAppTemplate.TemplateType.WALKIN_FOLLOW_UP: WhatsAppMessage.MsgType.WALKIN_REMIND,
    WhatsAppTemplate.TemplateType.PAYMENT_REMINDER: WhatsAppMessage.MsgType.PAYMENT_REMINDER,
    WhatsAppTemplate.TemplateType.BIRTHDAY_WISH: WhatsAppMessage.MsgType.BIRTHDAY,
    WhatsAppTemplate.TemplateType.RULES_FORM_LINK: WhatsAppMessage.MsgType.RULES_FORM_LINK,
    WhatsAppTemplate.TemplateType.OFFER_MESSAGE: WhatsAppMessage.MsgType.OFFER_MESSAGE,
}


def whatsapp_currency(value):
    if value in (None, ''):
        return ''
    return f'₹{float(value):,.0f}'


def whatsapp_date(value):
    if not value:
        return ''
    if isinstance(value, str):
        value = parse_date(value)
    if not value:
        return ''
    return value.strftime('%d %b %Y')


def render_whatsapp_template(body, values):
    message = body or ''
    normalized = {key: str(values.get(key) or '') for key in WHATSAPP_PLACEHOLDERS}
    for key, value in normalized.items():
        message = re.sub(r'{{\s*' + re.escape(key) + r'\s*}}', value, message)
    return re.sub(r'{{\s*[\w]+\s*}}', '', message).strip()


def active_whatsapp_template(template_type):
    return WhatsAppTemplate.objects.filter(
        template_type=template_type,
        is_active=True,
    ).order_by('name').first()


def whatsapp_send_payload(log):
    return {
        'whatsapp_sent': log.status == WhatsAppMessage.MsgStatus.SENT,
        'whatsapp_status': log.status,
        'whatsapp_error': log.error_message,
        'whatsapp_log_id': log.id,
    }


def candidate_values(record, extra=None):
    course = getattr(record, 'course', None)
    branch = getattr(record, 'branch', None)
    values = {
        'student_name': getattr(record, 'name', ''),
        'candidate_name': getattr(record, 'name', ''),
        'course_name': course.name if course else '',
        'branch_name': branch.name if branch else '',
        'phone_number': getattr(record, 'phone', ''),
        'follow_up_date': whatsapp_date(getattr(record, 'next_follow_up_date', None) or getattr(record, 'follow_up_date', None)),
        'institute_name': 'IIE',
    }
    values.update(extra or {})
    return values


def send_candidate_template(record, template_type, message_type, request, related_model):
    template = active_whatsapp_template(template_type)
    if not template:
        return None, Response({'detail': 'No active WhatsApp template configured for this message type.'}, status=400)
    values = candidate_values(record)
    log = send_candidate_message(
        candidate_name=getattr(record, 'name', ''),
        phone=getattr(record, 'phone', ''),
        message_type=message_type,
        message_body=template.message_body,
        template=template,
        values=values,
        sent_by=request.user,
        related_model=related_model,
        related_id=record.id,
        dedupe=False,
    )
    return log, Response({
        'detail': 'WhatsApp message processed.',
        'phone': getattr(record, 'phone', ''),
        'whatsapp_message': render_whatsapp_template(template.message_body, values),
        **whatsapp_send_payload(log),
    })


def rules_sign_view(request, token):
    """Serve the Rules signing SPA route with share-preview metadata."""
    title = 'IIE Rules & Regulations'
    description = 'Review and sign the IIE Rules & Regulations form.'
    html = render(request, 'index.html').content.decode('utf-8')

    html = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', html, count=1, flags=re.IGNORECASE | re.DOTALL)
    meta = (
        f'<meta name="description" content="{description}" />\n'
        f'    <meta property="og:title" content="{title}" />\n'
        f'    <meta property="og:description" content="{description}" />\n'
        '    <meta property="og:type" content="website" />'
    )
    if 'property="og:title"' not in html:
        html = html.replace('<meta name="viewport" content="width=device-width, initial-scale=1.0" />', '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    ' + meta)
    return HttpResponse(html)


def get_client_ip(request):
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def touch_user_session(request):
    if not request.user.is_authenticated:
        return
    if request.user.is_super_admin:
        return
    session_log_id = request.data.get('session_log_id') if hasattr(request, 'data') else None
    if session_log_id:
        updated = UserSessionLog.objects.filter(
            id=session_log_id,
            user=request.user,
            is_active_session=True,
        ).update(last_seen_at=timezone.now())
        if updated:
            return
    latest = UserSessionLog.objects.filter(
        user=request.user,
        is_active_session=True,
    ).order_by('-login_at').first()
    if latest:
        latest.last_seen_at = timezone.now()
        latest.save(update_fields=['last_seen_at', 'updated_at'])


def apply_enrollment_discount(data, course, branch_id=None):
    discount_id = data.get('discount') or data.get('discount_id')
    if not discount_id:
        data['discount'] = None
        data['discount_amount'] = data.get('discount_amount') or 0
        return None

    try:
        discount = Discount.objects.prefetch_related('courses').get(pk=discount_id)
    except Discount.DoesNotExist:
        raise ValueError('Selected discount is not available.')

    if not discount.is_available_for_course(course.id, branch_id):
        raise ValueError('Selected discount is expired or not available for this course.')

    course_fee = Decimal(str(data.get('actual_fees') or course.actual_fees or 0))
    discount_amount = discount.calculate_amount(course_fee)
    data['discount'] = discount.id
    data['discount_amount'] = discount_amount
    data['discount_reason'] = discount.name
    return discount


def truthy_value(value):
    return value in (True, 'true', 'True', '1', 1, 'yes', 'on')


def normalized_date(value):
    if not value:
        return None
    if hasattr(value, 'date') and not hasattr(value, 'month'):
        return value
    if hasattr(value, 'isoformat') and hasattr(value, 'month'):
        return value
    if isinstance(value, str):
        parsed = parse_date(value)
        if parsed:
            return parsed
        for date_format in ('%d-%m-%Y', '%d/%m/%Y'):
            try:
                return timezone.datetime.strptime(value, date_format).date()
            except ValueError:
                continue
    return value


def apply_spot_conversion_discount(data, visit_date):
    is_applied = truthy_value(data.get('spot_conversion_discount_applied'))
    data['spot_conversion_discount_applied'] = is_applied
    if not is_applied:
        data['spot_conversion_discount_amount'] = 0
        return
    visit = normalized_date(visit_date)
    enrollment = normalized_date(data.get('enrollment_date'))
    if not visit or not enrollment or visit != enrollment:
        raise ValueError('Spot conversion discount is available only when visit date and enrollment date are the same.')
    data['spot_conversion_discount_amount'] = 2000


def make_json_safe_payload(data):
    payload = {}
    for key, value in data.items():
        if isinstance(value, Decimal):
            payload[key] = str(value)
        elif isinstance(value, (list, tuple)):
            payload[key] = value[0] if len(value) == 1 else list(value)
        elif hasattr(value, 'isoformat'):
            payload[key] = value.isoformat()
        else:
            payload[key] = value
    return payload


def normalize_phone_number(value):
    return re.sub(r'\D', '', str(value or ''))


def duplicate_phone_exists(new_phone, record_type, record_id):
    model_map = {
        'lead': Lead,
        'walkin': WalkIn,
        'enrollment': Enrollment,
    }
    for current_type, model in model_map.items():
        queryset = model.objects.exclude(phone__isnull=True).exclude(phone='')
        if current_type == record_type:
            queryset = queryset.exclude(pk=record_id)
        for phone in queryset.values_list('phone', flat=True):
            if normalize_phone_number(phone) == new_phone:
                return True
    return False


def matching_candidate_phone_records(phone):
    normalized = normalize_phone_number(phone)
    if not normalized:
        return []
    records = []
    for lead in Lead.objects.select_related('branch', 'course'):
        if normalize_phone_number(lead.phone) == normalized:
            records.append({
                'type': 'Lead',
                'id': lead.id,
                'name': lead.name,
                'branch_name': lead.branch.name if lead.branch else 'Unassigned',
                'course_name': lead.course.name if lead.course else '',
                'url': f'/leads/{lead.id}',
            })
    for walkin in WalkIn.objects.select_related('branch', 'course'):
        if normalize_phone_number(walkin.phone) == normalized:
            records.append({
                'type': 'Walk-in',
                'id': walkin.id,
                'name': walkin.name,
                'branch_name': walkin.branch.name if walkin.branch else '',
                'course_name': walkin.course.name if walkin.course else '',
                'url': f'/walkins/{walkin.id}',
            })
    for enrollment in Enrollment.objects.select_related('branch', 'course'):
        if normalize_phone_number(enrollment.phone) == normalized:
            records.append({
                'type': 'Student',
                'id': enrollment.id,
                'name': enrollment.name,
                'branch_name': enrollment.branch.name if enrollment.branch else '',
                'course_name': enrollment.course.name if enrollment.course else '',
                'url': f'/students/{enrollment.id}',
            })
    return records


class PhoneNumberUpdateView(APIView):
    """POST /api/phone-numbers/<record_type>/<record_id>/ - audited phone-only update."""
    permission_classes = [IsStaffOrAdmin]

    model_map = {
        'lead': Lead,
        'walkin': WalkIn,
        'enrollment': Enrollment,
        'student': Enrollment,
    }

    def get_record(self, record_type, record_id, user):
        model = self.model_map.get(record_type)
        if not model:
            return None
        queryset = model.objects.all()
        if not user.is_super_admin:
            queryset = queryset.filter(branch=user.branch)
        return queryset.filter(pk=record_id).first()

    def post(self, request, record_type, record_id):
        record = self.get_record(record_type, record_id, request.user)
        if not record:
            return Response({'detail': 'Record not found.'}, status=status.HTTP_404_NOT_FOUND)

        old_phone = normalize_phone_number(record.phone)
        new_phone = normalize_phone_number(request.data.get('phone'))
        if not new_phone:
            return Response({'phone': 'Phone number is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(new_phone) != 10:
            return Response({'phone': 'Phone number should be 10 digits.'}, status=status.HTTP_400_BAD_REQUEST)
        canonical_type = 'enrollment' if record_type == 'student' else record_type
        if new_phone == old_phone:
            return Response({'phone': record.phone, 'detail': 'Phone number unchanged.'})
        if duplicate_phone_exists(new_phone, canonical_type, int(record_id)):
            return Response(
                {'phone': 'This phone number already exists in another record.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            PhoneNumberChangeHistory.objects.create(
                record_type=canonical_type,
                record_id=record.id,
                old_phone_number=record.phone,
                new_phone_number=new_phone,
                changed_by=request.user,
            )
            record.phone = new_phone
            record.save(update_fields=['phone', 'updated_at'])

        return Response({
            'phone': record.phone,
            'detail': 'Phone number updated successfully.',
        })


def create_user_notification(user, title, message, notification_type=Notification.NType.INFO, related_url=''):
    if not user or not getattr(user, 'is_active', False):
        return None
    return Notification.objects.create(
        user=user,
        title=title,
        message=message,
        type=notification_type,
        status=Notification.Status.UNREAD,
        is_read=False,
        related_url=related_url,
    )


def notify_branch_users(branch, title, message, notification_type=Notification.NType.INFO, related_url=''):
    for user in User.objects.filter(branch=branch, is_active=True).exclude(role=User.Role.SUPER_ADMIN):
        create_user_notification(user, title, message, notification_type, related_url)


def create_notification_once(user, title, message, notification_type=Notification.NType.INFO, related_url=''):
    if not user:
        return None
    notification = Notification.objects.filter(
        user=user,
        title=title,
        message=message,
        related_url=related_url,
    ).exclude(status=Notification.Status.RESOLVED).first()
    if notification:
        return notification
    notification = Notification.objects.create(
        user=user,
        title=title,
        message=message,
        type=notification_type,
        status=Notification.Status.UNREAD,
        is_read=False,
        related_url=related_url,
    )
    return notification


def resolve_notifications(queryset):
    return queryset.exclude(status=Notification.Status.RESOLVED).update(
        status=Notification.Status.RESOLVED,
        is_read=True,
        resolved_at=timezone.now(),
    )


def mark_public_walkin_notifications_read(walkin_id):
    Notification.objects.filter(
        title='New public walk-in submitted',
        related_url=f'/walkins/{walkin_id}',
        status=Notification.Status.UNREAD,
    ).update(status=Notification.Status.READ, is_read=True)


def resolve_public_walkin_notifications(walkin_id):
    resolve_notifications(Notification.objects.filter(
        title='New public walk-in submitted',
        related_url=f'/walkins/{walkin_id}',
    ))


def resolve_rules_signed_notifications(enrollment_id):
    resolve_notifications(Notification.objects.filter(
        title='Rules & Regulations Signed',
        related_url=f'/enrollments/{enrollment_id}',
    ))


def notify_rules_signed(enrollment, submitted_at=None):
    title = 'Rules & Regulations Signed'
    submitted_value = submitted_at or timezone.now()
    course_name = enrollment.course.name if enrollment.course else ''
    branch_name = enrollment.branch.name if enrollment.branch else ''
    detail_lines = [
        f'{enrollment.name} has submitted the signed Rules & Regulations form.',
    ]
    if course_name:
        detail_lines.append(f'Course: {course_name}')
    if branch_name:
        detail_lines.append(f'Branch: {branch_name}')
    detail_lines.append(f'Submitted on: {submitted_value.strftime("%d %b %Y, %I:%M %p")}')
    message = '\n'.join(detail_lines)
    related_url = f'/enrollments/{enrollment.id}'
    recipients = list(User.objects.filter(role=User.Role.SUPER_ADMIN, is_active=True))
    if enrollment.branch_id:
        recipients.extend(
            User.objects.filter(branch=enrollment.branch, is_active=True).exclude(role=User.Role.SUPER_ADMIN)
        )
    seen = set()
    for user in recipients:
        if user.id in seen:
            continue
        seen.add(user.id)
        create_notification_once(user, title, message, Notification.NType.SUCCESS, related_url)


LEAD_CLOSED_FOLLOW_UP_STATUSES = [
    Lead.Status.COUNSELING_COMPLETED,
    Lead.Status.DEMO_ATTENDED,
    Lead.Status.WILL_WALK_IN,
    Lead.Status.WALK_IN,
    Lead.Status.ENROLLED,
    Lead.Status.CONVERTED,
    Lead.Status.NOT_INTERESTED,
    Lead.Status.JOINED_OTHER_INSTITUTE,
    Lead.Status.DROPPED,
    Lead.Status.LOST,
]

WALKIN_CLOSED_FOLLOW_UP_STATUSES = [
    WalkIn.Status.CONVERTED,
    WalkIn.Status.NOT_INTERESTED,
    WalkIn.Status.TRANSFERRED,
]


def pending_follow_up_queryset(queryset, record_type, due_lookup, closed_statuses):
    completed_current_due = FollowUp.objects.filter(
        record_type=record_type,
        record_id=OuterRef('pk'),
        follow_up_date=OuterRef(due_lookup),
    )
    return queryset.exclude(
        status__in=closed_statuses,
    ).annotate(
        has_completed_current_due=Exists(completed_current_due),
    ).exclude(
        has_completed_current_due=True,
    )


def active_lead_follow_up_queryset(queryset, due_lookup, due_date):
    return pending_follow_up_queryset(
        queryset,
        FollowUp.RecordType.LEAD,
        due_lookup,
        LEAD_CLOSED_FOLLOW_UP_STATUSES,
    ).filter(**{due_lookup: due_date})


def active_walkin_follow_up_queryset(queryset, due_lookup, due_date):
    return pending_follow_up_queryset(
        queryset,
        FollowUp.RecordType.WALKIN,
        due_lookup,
        WALKIN_CLOSED_FOLLOW_UP_STATUSES,
    ).filter(**{due_lookup: due_date})


def missed_lead_follow_up_queryset(queryset, due_lookup, today):
    return pending_follow_up_queryset(
        queryset,
        FollowUp.RecordType.LEAD,
        due_lookup,
        LEAD_CLOSED_FOLLOW_UP_STATUSES,
    ).filter(**{f'{due_lookup}__lt': today})


def missed_walkin_follow_up_queryset(queryset, due_lookup, today):
    return pending_follow_up_queryset(
        queryset,
        FollowUp.RecordType.WALKIN,
        due_lookup,
        WALKIN_CLOSED_FOLLOW_UP_STATUSES,
    ).filter(**{f'{due_lookup}__lt': today})


def prune_stale_follow_up_notifications(user, lead_due_ids, lead_missed_ids, walkin_due_ids, walkin_missed_ids):
    notification_rules = [
        ('Lead follow-up due today', {f'/leads/{record_id}' for record_id in lead_due_ids}),
        ('Missed lead follow-up', {f'/leads/{record_id}' for record_id in lead_missed_ids}),
        ('Walk-in follow-up due today', {f'/walkins/{record_id}' for record_id in walkin_due_ids}),
        ('Missed walk-in follow-up', {f'/walkins/{record_id}' for record_id in walkin_missed_ids}),
    ]
    for title, active_urls in notification_rules:
        stale_notifications = Notification.objects.filter(user=user, title=title)
        if active_urls:
            stale_notifications = stale_notifications.exclude(related_url__in=active_urls)
        resolve_notifications(stale_notifications)


def clear_follow_up_notifications_for_record(record_type, record_id):
    if record_type == FollowUp.RecordType.LEAD:
        titles = ['Lead follow-up due today', 'Missed lead follow-up']
        related_url = f'/leads/{record_id}'
    else:
        titles = ['Walk-in follow-up due today', 'Missed walk-in follow-up']
        related_url = f'/walkins/{record_id}'
    resolve_notifications(Notification.objects.filter(title__in=titles, related_url=related_url))


def generate_smart_notifications(user):
    if not user.is_authenticated:
        return
    today = timezone.localdate()
    lead_scope = Lead.objects.all() if user.is_super_admin else Lead.objects.filter(branch=user.branch)
    walkin_scope = WalkIn.objects.all() if user.is_super_admin else WalkIn.objects.filter(branch=user.branch)
    lead_due_qs = active_lead_follow_up_queryset(lead_scope, 'next_follow_up_date', today)
    lead_missed_qs = missed_lead_follow_up_queryset(lead_scope, 'next_follow_up_date', today)
    walkin_due_qs = active_walkin_follow_up_queryset(walkin_scope, 'follow_up_date', today)
    walkin_missed_qs = missed_walkin_follow_up_queryset(walkin_scope, 'follow_up_date', today)

    lead_due_ids = list(lead_due_qs.values_list('id', flat=True)[:25])
    lead_missed_ids = list(lead_missed_qs.values_list('id', flat=True)[:25])
    walkin_due_ids = list(walkin_due_qs.values_list('id', flat=True)[:25])
    walkin_missed_ids = list(walkin_missed_qs.values_list('id', flat=True)[:25])
    prune_stale_follow_up_notifications(user, lead_due_ids, lead_missed_ids, walkin_due_ids, walkin_missed_ids)

    for lead in lead_due_qs.filter(id__in=lead_due_ids):
        create_notification_once(user, 'Lead follow-up due today', f'{lead.name} needs follow-up today.', Notification.NType.WARNING, f'/leads/{lead.id}')
    for lead in lead_missed_qs.filter(id__in=lead_missed_ids):
        create_notification_once(user, 'Missed lead follow-up', f'{lead.name} has a missed follow-up.', Notification.NType.ERROR, f'/leads/{lead.id}')
    for walkin in walkin_due_qs.filter(id__in=walkin_due_ids):
        create_notification_once(user, 'Walk-in follow-up due today', f'{walkin.name} needs follow-up today.', Notification.NType.WARNING, f'/walkins/{walkin.id}')
    for walkin in walkin_missed_qs.filter(id__in=walkin_missed_ids):
        create_notification_once(user, 'Missed walk-in follow-up', f'{walkin.name} has a missed follow-up.', Notification.NType.ERROR, f'/walkins/{walkin.id}')
    payment_qs = Payment.objects.filter(next_payment_date=today, status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL]).select_related('enrollment')
    if not user.is_super_admin:
        payment_qs = payment_qs.filter(enrollment__branch=user.branch)
    for payment in payment_qs[:25]:
        create_notification_once(user, 'Payment due today', f'{payment.enrollment.name} has a payment due today.', Notification.NType.WARNING, f'/payments/{payment.id}')
    enrollment_qs = Enrollment.objects.filter(
        status__in=Enrollment.FINAL_STATUSES,
        dob__month=today.month,
        dob__day=today.day,
    )
    if not user.is_super_admin:
        enrollment_qs = enrollment_qs.filter(branch=user.branch)
    for enrollment in enrollment_qs[:25]:
        create_notification_once(user, 'Birthday reminder', f'{enrollment.name} has a birthday today.', Notification.NType.WARNING, f'/students/{enrollment.id}')


def add_one_month(value):
    if not value:
        return None
    month = value.month + 1
    year = value.year + (month - 1) // 12
    month = ((month - 1) % 12) + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def build_default_installment_plan(enrollment):
    return [
        {
            **item,
            'date': item.get('due_date'),
        }
        for item in get_default_installment_schedule(enrollment)
    ]


def extract_rules_template_text():
    template_path = Path(settings.MEDIA_ROOT) / 'rules_templates' / 'rules_and_regulations.docx'
    if not template_path.exists():
        return ['Rules and Regulations template is not available.']
    try:
        with zipfile.ZipFile(template_path) as docx:
            xml = docx.read('word/document.xml')
        root = ElementTree.fromstring(xml)
        namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        paragraphs = []
        for paragraph in root.findall('.//w:p', namespace):
            text = ''.join(node.text or '' for node in paragraph.findall('.//w:t', namespace)).strip()
            if text:
                paragraphs.append(text)
        return paragraphs or ['Rules and Regulations']
    except Exception:
        return ['Rules and Regulations template could not be rendered. Please contact IIE.']


def wrap_text(draw, text, font, max_width):
    words = str(text).split()
    lines = []
    current = ''
    for word in words:
        candidate = f'{current} {word}'.strip()
        if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or ['']


def validate_data_image(image_data, label):
    if not image_data or ',' not in image_data:
        raise ValueError(f'{label} is required.')
    try:
        image_bytes = base64.b64decode(image_data.split(',', 1)[1])
        from PIL import Image
        Image.open(io.BytesIO(image_bytes)).verify()
        return image_bytes
    except ImportError:
        raise RuntimeError('Pillow is required to process form images. Please install Pillow in the active virtual environment.')
    except ValueError:
        raise
    except Exception:
        raise ValueError(f'Invalid {label.lower()} image.')


def build_signed_rules_pdf(enrollment, signature_bytes, selfie_bytes=None, submitted_at=None):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as exc:
        raise RuntimeError('Pillow is required to generate signed Rules & Regulation PDFs.') from exc

    width, height = 1240, 1754
    margin = 80
    font = ImageFont.load_default()
    title_font = ImageFont.load_default()
    pages = []
    page = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(page)
    y = margin

    def add_page():
        nonlocal page, draw, y
        pages.append(page)
        page = Image.new('RGB', (width, height), 'white')
        draw = ImageDraw.Draw(page)
        y = margin

    def write_line(text, spacing=26):
        nonlocal y
        for line in wrap_text(draw, text, font, width - margin * 2):
            if y > height - margin - 220:
                add_page()
            draw.text((margin, y), line, fill='black', font=font)
            y += spacing

    draw.text((margin, y), 'IIE Rules & Regulations Form', fill='black', font=title_font)
    y += 45
    if selfie_bytes:
        selfie = Image.open(io.BytesIO(selfie_bytes)).convert('RGB')
        selfie.thumbnail((180, 220))
        selfie_x = width - margin - 180
        draw.rectangle((selfie_x - 8, margin - 8, selfie_x + 188, margin + 228), outline='black')
        page.paste(selfie, (selfie_x, margin))
        draw.text((selfie_x, margin + 205), 'Student Identity Photo', fill='black', font=font)
    details = [
        f'Name: {enrollment.name}',
        f'Phone: {enrollment.phone}',
        f'Course Enrolled: {enrollment.course.name if enrollment.course else ""}',
        f'Batch Timing: {enrollment.batch_timing or enrollment.get_preferred_timing_display() or ""}',
        f'Batch Start Date: {enrollment.start_date or ""}',
        f'Duration: {enrollment.course.duration_months if enrollment.course and enrollment.course.duration_months else ""}',
        f'Actual Fees: Rs {enrollment.actual_fees}',
        f'Discount: Rs {enrollment.discount_amount}',
        f'Final Fees: Rs {enrollment.final_fees}',
        f'Spot Conversion Discount: Rs {enrollment.spot_conversion_discount_amount}',
        f'Net Payable Fees: Rs {enrollment_payable_fee(enrollment)}',
    ]
    for detail in details:
        write_line(detail)
    write_line('Payment Schedule:')
    for item in build_default_installment_plan(enrollment):
        write_line(f'{item["label"]}: Rs {item["amount"]} on {item["date"]}')
    y += 20
    for paragraph in extract_rules_template_text():
        write_line(paragraph, spacing=24)
        y += 10

    if y > height - margin - 260:
        add_page()
    draw.text((margin, y + 20), 'Student Signature:', fill='black', font=font)
    signature = Image.open(io.BytesIO(signature_bytes)).convert('RGBA')
    signature.thumbnail((420, 180))
    page.paste(signature, (margin, y + 55), signature)
    submitted_value = submitted_at or timezone.now()
    draw.text((margin, y + 245), f'Submitted At: {timezone.localtime(submitted_value).strftime("%d %b %Y %I:%M %p")}', fill='black', font=font)
    pages.append(page)

    output = io.BytesIO()
    pages[0].save(output, format='PDF', save_all=True, append_images=pages[1:])
    output.seek(0)
    return output.read()


def create_enrollment_from_transfer_request(transfer_request, reviewer):
    from serializers import EnrollmentDetailSerializer

    if transfer_request.enrollment_id or hasattr(transfer_request.walkin, 'enrollment'):
        raise ValueError('This walk-in is already enrolled.')

    payload = dict(transfer_request.enrollment_payload or {})
    payload['branch'] = transfer_request.requested_branch_id
    required_fields = [
        'name', 'phone', 'course', 'branch', 'preferred_timing',
        'enrollment_date', 'start_date',
    ]
    missing = [field for field in required_fields if payload.get(field) in (None, '')]
    if missing:
        raise ValueError(f'Please complete all mandatory fields: {", ".join(missing)}.')
    serializer = EnrollmentDetailSerializer(data=payload)
    serializer.is_valid(raise_exception=True)
    enrollment = serializer.save(
        walkin=transfer_request.walkin,
        original_walkin_course=transfer_request.walkin.course,
        final_enrollment_course_id=payload.get('course'),
        enrolled_by=reviewer,
        created_by=reviewer,
        status=Enrollment.Status.PENDING_RULES,
    )

    walkin = transfer_request.walkin
    walkin.name = payload.get('name') or walkin.name
    walkin.phone = payload.get('phone') or walkin.phone
    walkin.email = payload.get('email') or walkin.email
    walkin.dob = payload.get('dob') or walkin.dob
    walkin.location = payload.get('location') or walkin.location
    walkin.pincode = payload.get('pincode') or walkin.pincode
    walkin.preferred_timing = payload.get('preferred_timing') or walkin.preferred_timing
    walkin.status = WalkIn.Status.TRANSFERRED
    walkin.remarks = (walkin.remarks + '\n' if walkin.remarks else '') + f'Transferred to {transfer_request.requested_branch.name if transfer_request.requested_branch else "requested branch"}.'
    walkin.save(update_fields=[
        'name', 'phone', 'email', 'dob', 'location', 'pincode',
        'preferred_timing', 'status', 'remarks', 'updated_at',
    ])
    clear_follow_up_notifications_for_record(FollowUp.RecordType.WALKIN, walkin.id)
    resolve_public_walkin_notifications(walkin.id)

    transfer_request.enrollment = enrollment
    transfer_request.status = transfer_request.Status.APPROVED
    transfer_request.reviewed_by = reviewer
    transfer_request.reviewed_at = timezone.now()
    transfer_request.save(update_fields=['enrollment', 'status', 'reviewed_by', 'reviewed_at', 'updated_at'])
    return enrollment


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ — Returns access + refresh JWT tokens."""
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        user_data = response.data.get('user') if response.status_code == 200 else None
        if user_data and user_data.get('role') != User.Role.SUPER_ADMIN:
            session_log = UserSessionLog.objects.create(
                user_id=user_data['id'],
                ip_address=get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
            )
            response.data['session_log_id'] = session_log.id
        return response


class LogoutView(APIView):
    """POST /api/auth/logout/ — Blacklists the refresh token."""
    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        if not request.user.is_super_admin:
            session_log_id = request.data.get('session_log_id')
            session_qs = UserSessionLog.objects.filter(
                user=request.user,
                is_active_session=True,
                logout_at__isnull=True,
            )
            if session_log_id:
                session_qs = session_qs.filter(id=session_log_id)
            else:
                latest = session_qs.order_by('-login_at').first()
                session_qs = session_qs.filter(id=latest.id) if latest else session_qs.none()
            session_qs.update(
                logout_at=timezone.now(),
                last_seen_at=timezone.now(),
                is_active_session=False,
            )
        try:
            refresh = RefreshToken(request.data['refresh'])
            refresh.blacklist()
            return Response({'detail': 'Successfully logged out.'}, status=200)
        except Exception:
            return Response({'detail': 'Invalid token.'}, status=400)


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/auth/me/ — Current user profile."""
    permission_classes = [IsStaffOrAdmin]
    serializer_class   = UserSerializer

    def get_object(self):
        touch_user_session(self.request)
        return self.request.user


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ - lets users clear first-login password change."""
    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        user = request.user
        current_password = request.data.get('current_password')
        new_password = request.data.get('new_password')

        if not current_password or not user.check_password(current_password):
            return Response({'current_password': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        if not new_password:
            return Response({'new_password': 'New password is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            return Response({'new_password': list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.must_change_password = False
        user.save(update_fields=['password', 'must_change_password', 'updated_at'])
        return Response({'detail': 'Password changed successfully.'})


class BranchViewSet(viewsets.ModelViewSet):
    """CRUD for branches. Only super admin can write."""
    serializer_class   = BranchSerializer
    permission_classes = [IsSuperAdminOrReadOnly]
    filter_backends    = [SearchFilter, OrderingFilter]
    pagination_class   = None
    search_fields      = ['name', 'city']

    def get_queryset(self):
        queryset = Branch.objects.order_by('name')
        if self.request.user.is_super_admin:
            return queryset
        return queryset.filter(is_active=True)


class UserViewSet(viewsets.ModelViewSet):
    """Manage staff users. Only super admin."""
    queryset           = User.objects.all().select_related('branch').order_by('username')
    serializer_class   = UserSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends    = [DjangoFilterBackend, SearchFilter]
    filterset_fields   = ['role', 'branch', 'is_active']
    pagination_class   = None
    search_fields      = ['username', 'email', 'first_name', 'last_name']

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        headers = self.get_success_headers(serializer.data)

        try:
            send_login_credentials_email(
                user=user,
                plain_password=user._plain_password,
                login_url=build_login_url(request),
            )
        except Exception:
            return Response(
                {
                    **serializer.data,
                    'detail': 'User created, but credential email failed to send.',
                    'credential_email_sent': False,
                },
                status=status.HTTP_201_CREATED,
                headers=headers,
            )

        return Response(
            {
                **serializer.data,
                'detail': 'User created successfully. Login credentials sent to email.',
                'credential_email_sent': True,
            },
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        user = self.get_object()
        new_password = request.data.get('new_password')
        if not new_password or len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters.'}, status=400)
        user.set_password(new_password)
        user.save(update_fields=['password', 'updated_at'])
        return Response({'detail': 'Password reset successfully.'})


class UserTargetViewSet(viewsets.ModelViewSet):
    """Set monthly targets per user."""
    queryset           = UserTarget.objects.select_related('user').order_by('-year', '-month')
    serializer_class   = UserTargetSerializer
    permission_classes = [IsSuperAdmin]
    pagination_class   = None
    filterset_fields   = ['user', 'month', 'year']


class BranchTargetViewSet(viewsets.ModelViewSet):
    """Monthly targets per branch. Staff can read only their branch target."""
    serializer_class = BranchTargetSerializer
    permission_classes = [IsSuperAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['branch', 'month', 'year']
    pagination_class = None
    ordering_fields = ['year', 'month', 'branch']
    ordering = ['-year', '-month', 'branch']

    def get_queryset(self):
        queryset = BranchTarget.objects.select_related('branch', 'created_by')
        if self.request.user.is_super_admin:
            return queryset
        return queryset.filter(branch=self.request.user.branch)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class HistoricalAnalyticsEntryViewSet(viewsets.ModelViewSet):
    """Admin CRUD for manually entered 2023-2025 branch analytics."""
    serializer_class = HistoricalAnalyticsEntrySerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['branch', 'month', 'year']
    pagination_class = None
    ordering_fields = ['year', 'month', 'branch']
    ordering = ['-year', '-month', 'branch']

    def get_queryset(self):
        return HistoricalAnalyticsEntry.objects.select_related('branch', 'created_by')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class UserPerformanceReportView(APIView):
    """GET /api/reports/user-performance/?month=YYYY-MM — super admin user summary."""
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        month_str = request.query_params.get('month', timezone.now().strftime('%Y-%m'))
        year, month = map(int, month_str.split('-'))

        users = User.objects.filter(is_active=True).exclude(role=User.Role.SUPER_ADMIN).select_related('branch').order_by('username')
        report_rows = []

        def attainment(actual, target):
            actual_value = float(actual or 0)
            target_value = float(target or 0)
            if target_value <= 0:
                return 100.0 if actual_value > 0 else 0.0
            return min((actual_value / target_value) * 100, 100.0)

        for user in users:
            target = BranchTarget.objects.filter(branch=user.branch, year=year, month=month).first()
            leads_count = Lead.objects.filter(
                created_by=user, created_at__year=year, created_at__month=month
            ).count()
            walkins_count = WalkIn.objects.filter(
                created_by=user, visit_date__year=year, visit_date__month=month
            ).count()
            enrollments_count = Enrollment.objects.filter(
                created_by=user, enrollment_date__year=year, enrollment_date__month=month
            ).count()
            value_total = Enrollment.objects.filter(
                created_by=user, enrollment_date__year=year, enrollment_date__month=month
            ).aggregate(total=Sum('final_fees'))['total'] or 0

            lead_target = target.lead_target if target else 0
            walkin_target = target.walkin_target if target else 0
            enroll_target = target.enroll_target if target else 0
            value_target = target.revenue_target if target else 0
            performance_score = round(
                (
                    attainment(leads_count, lead_target)
                    + attainment(walkins_count, walkin_target)
                    + attainment(enrollments_count, enroll_target)
                    + attainment(value_total, value_target)
                ) / 4,
                2,
            )

            report_rows.append({
                'position': 0,
                'user_id': user.id,
                'username': user.username,
                'full_name': user.full_name,
                'branch_id': user.branch_id,
                'branch_name': user.branch.name if user.branch else None,
                'target_scope': 'branch',
                'lead_target': lead_target,
                'walkin_target': walkin_target,
                'enroll_target': enroll_target,
                'revenue_target': value_target,
                'value_target': value_target,
                'leads': leads_count,
                'walkins': walkins_count,
                'enrollments': enrollments_count,
                'revenue': value_total,
                'value': value_total,
                'performance_score': performance_score,
            })

        report_rows.sort(
            key=lambda row: (
                -row['performance_score'],
                -row['value'],
                -row['enrollments'],
                -row['walkins'],
                -row['leads'],
                row['username'],
            )
        )

        for index, row in enumerate(report_rows, start=1):
            row['position'] = index

        serializer = UserPerformanceReportSerializer(report_rows, many=True)
        return Response(serializer.data)


class SessionHeartbeatView(APIView):
    """POST /api/auth/heartbeat/ — updates the current user's last seen timestamp."""
    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        touch_user_session(request)
        return Response({'detail': 'ok', 'last_seen': timezone.now()})


class UserMonitoringView(APIView):
    """GET /api/admin/user-monitoring/ — admin-only session monitoring."""
    permission_classes = [IsSuperAdmin]

    def get_date_range(self, request):
        today = timezone.localdate()
        date_filter = request.query_params.get('date_filter', '').strip()
        from_date = parse_date(request.query_params.get('from_date', '').strip())
        to_date = parse_date(request.query_params.get('to_date', '').strip())

        if date_filter == 'today':
            return today, today
        if date_filter == 'yesterday':
            yesterday = today - timedelta(days=1)
            return yesterday, yesterday
        if date_filter == 'this_week':
            week_start = today - timedelta(days=today.weekday())
            return week_start, today
        if date_filter == 'this_month':
            return today.replace(day=1), today
        if date_filter == 'custom':
            return from_date, to_date
        return None, None

    def apply_filters(self, request, queryset, cutoff):
        search = request.query_params.get('search', '').strip()
        branch = request.query_params.get('branch', '').strip()
        status_filter = request.query_params.get('status', '').strip().lower()
        start_date, end_date = self.get_date_range(request)

        if search:
            queryset = queryset.filter(
                Q(user__username__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__email__icontains=search)
            )
        if branch:
            queryset = queryset.filter(user__branch_id=branch)
        if status_filter == 'online':
            queryset = queryset.filter(is_active_session=True, last_seen_at__gte=cutoff)
        elif status_filter == 'offline':
            queryset = queryset.exclude(is_active_session=True, last_seen_at__gte=cutoff)
        if start_date:
            queryset = queryset.filter(login_at__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(login_at__date__lte=end_date)
        return queryset

    def get(self, request):
        today = timezone.localdate()
        cutoff = timezone.now() - timedelta(minutes=5)
        sessions = UserSessionLog.objects.filter(user__role=User.Role.STAFF)
        stale_sessions = sessions.filter(is_active_session=True, last_seen_at__lt=cutoff)
        stale_sessions.update(is_active_session=False, logout_at=timezone.now())
        sessions = self.apply_filters(
            request,
            UserSessionLog.objects.filter(user__role=User.Role.STAFF),
            cutoff,
        ).select_related('user__branch').order_by('-login_at', 'user__username')
        serializer = UserMonitoringSerializer(sessions, many=True)
        return Response({
            'total_logins_today': sessions.filter(login_at__date=today).count(),
            'currently_online_users': sessions.filter(
                is_active_session=True,
                last_seen_at__gte=cutoff,
            ).values('user_id').distinct().count(),
            'branches': BranchSerializer(
                Branch.objects.filter(is_active=True).order_by('name'),
                many=True,
            ).data,
            'users': serializer.data,
        })


# ============================================================
# backend/apps/courses/views.py
# ============================================================
from crm.models import Course
from serializers import COURSE_LINKED_DELETE_MESSAGE, CourseSerializer, course_is_linked


class CourseViewSet(viewsets.ModelViewSet):
    """
    Course catalogue.
    - GET: any authenticated user
    - POST/PUT/DELETE: super admin only
    """
    serializer_class   = CourseSerializer
    permission_classes = [IsSuperAdminOrReadOnly]
    filter_backends    = [SearchFilter]
    pagination_class   = None
    search_fields      = ['name']

    def get_queryset(self):
        queryset = Course.objects.order_by('name')
        include_inactive = self.request.query_params.get('include_inactive') in ('1', 'true', 'yes')
        if self.request.user.is_super_admin and (include_inactive or self.request.method not in SAFE_METHODS):
            return queryset
        return queryset.filter(is_active=True)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        course = self.get_object()
        if course_is_linked(course):
            return Response({'detail': COURSE_LINKED_DELETE_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)


# ============================================================
# backend/apps/discounts/views.py
# ============================================================
from crm.models import Discount
from serializers import DiscountSerializer


class DiscountViewSet(viewsets.ModelViewSet):
    """Admin CRUD for discounts; staff can read currently available discounts."""
    serializer_class = DiscountSerializer
    permission_classes = [IsSuperAdminOrReadOnly]
    pagination_class = None
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active', 'apply_to_all_courses', 'courses', 'apply_to_all_branches', 'branches']
    search_fields = ['name']
    ordering_fields = ['valid_from', 'valid_to', 'name', 'created_at']
    ordering = ['-valid_to', 'name']

    def get_queryset(self):
        queryset = Discount.objects.prefetch_related('courses', 'branches').select_related('created_by')
        course_id = self.request.query_params.get('course')
        branch_id = self.request.query_params.get('branch')
        available_only = self.request.query_params.get('available') in ('1', 'true', 'yes')
        if available_only or not self.request.user.is_super_admin:
            today = timezone.localdate()
            queryset = queryset.filter(
                is_active=True,
                valid_from__lte=today,
            ).filter(Q(valid_to__isnull=True) | Q(valid_to__gte=today))
        if course_id:
            queryset = queryset.filter(Q(apply_to_all_courses=True) | Q(courses__id=course_id)).distinct()
        if branch_id:
            queryset = queryset.filter(Q(apply_to_all_branches=True) | Q(branches__id=branch_id)).distinct()
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError as exc:
            logger.exception('Discount create failed because of a database constraint.')
            return Response(
                {
                    'detail': 'Could not create discount because the submitted values conflict with the database schema or an existing record.',
                    'error': str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except DRFValidationError:
            raise
        except Exception as exc:
            logger.exception('Discount create failed unexpectedly.')
            return Response(
                {'detail': 'Could not create discount. Please check the submitted discount details and try again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ============================================================
# backend/apps/leads/views.py
# ============================================================
from crm.models import FollowUp, Lead, LeadImportHistory
from serializers import (
    FollowUpSerializer, LeadListSerializer, LeadDetailSerializer,
    LeadStaffUpdateSerializer, LeadImportHistorySerializer, LeadInboxSerializer
)
import django_filters
import csv


def create_follow_up_entry(record, record_type, request):
    data = request.data.copy()
    data.pop('close_follow_up', None)
    serializer = FollowUpSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    follow_up = serializer.save(
        record_type=record_type,
        record_id=record.id,
        updated_by=request.user,
    )
    return Response(FollowUpSerializer(follow_up).data, status=status.HTTP_201_CREATED)


class LeadFilter(django_filters.FilterSet):
    name = django_filters.CharFilter(method='filter_name')
    phone = django_filters.CharFilter(method='filter_phone')
    source = django_filters.CharFilter(method='filter_source')
    follow_up_by = django_filters.NumberFilter(field_name='assigned_to')
    assigned_user = django_filters.NumberFilter(field_name='assigned_to')
    walkin_date_from = django_filters.DateFilter(field_name='walkin_date', lookup_expr='gte')
    walkin_date_to   = django_filters.DateFilter(field_name='walkin_date', lookup_expr='lte')
    next_follow_up_date_from = django_filters.DateFilter(method='filter_next_follow_up_date_from')
    next_follow_up_date_to   = django_filters.DateFilter(method='filter_next_follow_up_date_to')
    created_from     = django_filters.DateFilter(field_name='created_at', lookup_expr='date__gte')
    created_to       = django_filters.DateFilter(field_name='created_at', lookup_expr='date__lte')

    def filter_name(self, queryset, name, value):
        value = (value or '').strip()
        return queryset.filter(name__icontains=value) if value else queryset

    def filter_phone(self, queryset, name, value):
        value = (value or '').strip()
        return queryset.filter(phone__icontains=value) if value else queryset

    def filter_source(self, queryset, name, value):
        value = (value or '').strip()
        if not value:
            return queryset
        if value == 'manual':
            if 'imported_via_csv' in missing_model_columns(Lead, ['imported_via_csv']):
                return queryset.filter(created_by__isnull=False)
            return queryset.filter(created_by__isnull=False, imported_via_csv=False)
        if value == 'csv_import':
            if 'imported_via_csv' in missing_model_columns(Lead, ['imported_via_csv']):
                return queryset.none()
            return queryset.filter(imported_via_csv=True)
        valid_sources = {choice[0] for choice in Lead.Source.choices}
        if value in valid_sources:
            return queryset.filter(source=value)
        return queryset.none()

    def filter_next_follow_up_date_from(self, queryset, name, value):
        if not value or 'next_follow_up_date' in missing_model_columns(Lead, ['next_follow_up_date']):
            return queryset
        return queryset.filter(next_follow_up_date__gte=value)

    def filter_next_follow_up_date_to(self, queryset, name, value):
        if not value or 'next_follow_up_date' in missing_model_columns(Lead, ['next_follow_up_date']):
            return queryset
        return queryset.filter(next_follow_up_date__lte=value)

    class Meta:
        model  = Lead
        fields = ['status', 'source', 'branch', 'assigned_to', 'course']


class LeadViewSet(viewsets.ModelViewSet):
    """
    Leads module.
    - Staff can create leads and update ONLY walkin_date + next_follow_up_date + remarks + status
    - Super admin has full access
    - Branch-level data isolation for staff
    """
    permission_classes = [IsStaffOrAdmin]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = LeadFilter
    pagination_class   = None
    search_fields      = ['name', 'phone', 'lead_number']
    ordering_fields    = ['created_at', 'walkin_date', 'name']
    ordering           = ['-created_at']

    def get_queryset(self):
        missing_columns = missing_model_columns(Lead, [
            'qualification', 'degree', 'willing_to_join',
            'external_course_interested', 'external_message',
            'is_duplicate', 'imported_via_csv', 'preferred_timing',
            'next_follow_up_date', 'converted_to_type',
            'converted_record_id', 'converted_at', 'converted_by',
        ])
        if self.action == 'list':
            qs = Lead.objects.select_related('course', 'branch', 'assigned_to')
        else:
            related = ['course', 'branch', 'assigned_to', 'created_by']
            if 'converted_by' not in missing_columns:
                related.append('converted_by')
            qs = Lead.objects.select_related(*related)
        if missing_columns:
            qs = qs.defer(*missing_columns)
        if self.action != 'list':
            missing_user_columns = missing_model_columns(User, ['must_change_password'])
            if missing_user_columns:
                qs = qs.defer(
                    *[f'assigned_to__{field}' for field in missing_user_columns],
                    *[f'created_by__{field}' for field in missing_user_columns],
                    *[f'converted_by__{field}' for field in missing_user_columns],
                )
        # Staff can only see their branch's leads
        if not self.request.user.is_super_admin:
            qs = qs.filter(branch=self.request.user.branch)
        if (
            self.request.query_params.get('focus') == 'today-follow-up'
            and 'next_follow_up_date' not in missing_columns
        ):
            qs = active_lead_follow_up_queryset(
                qs,
                'next_follow_up_date',
                timezone.localdate(),
            )
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return LeadListSerializer
        # Staff can only patch walkin_date + next_follow_up_date + remarks
        if self.action in ('partial_update',) and not self.request.user.is_super_admin:
            return LeadDetailSerializer
        return LeadDetailSerializer

    @action(detail=True, methods=['post'], url_path='send-follow-up-whatsapp')
    def send_follow_up_whatsapp(self, request, pk=None):
        _, response = send_candidate_template(
            self.get_object(),
            WhatsAppTemplate.TemplateType.LEAD_FOLLOW_UP,
            WhatsAppMessage.MsgType.FOLLOW_UP,
            request,
            'lead',
        )
        return response

    @action(detail=True, methods=['post'], url_path='send-offer-whatsapp')
    def send_offer_whatsapp(self, request, pk=None):
        _, response = send_candidate_template(
            self.get_object(),
            WhatsAppTemplate.TemplateType.OFFER_MESSAGE,
            WhatsAppMessage.MsgType.OFFER_MESSAGE,
            request,
            'lead',
        )
        return response

    def perform_create(self, serializer):
        # Auto-set branch + created_by for staff
        branch = self.request.user.branch if not self.request.user.is_super_admin else None
        assigned_to = serializer.validated_data.get('assigned_to')
        serializer.save(
            created_by=self.request.user,
            branch=branch or serializer.validated_data.get('branch'),
            assigned_to=assigned_to or self.request.user,
        )

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError as exc:
            logger.exception('Lead create failed because of a database constraint.')
            return Response(
                {
                    'detail': 'Could not create lead because one of the generated or selected values conflicts with an existing record.',
                    'error': str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=['get'], url_path='staff-options')
    def staff_options(self, request):
        users = User.objects.filter(is_active=True).select_related('branch').order_by(
            'first_name', 'last_name', 'username'
        )
        if not request.user.is_super_admin:
            users = users.filter(branch=request.user.branch).exclude(role=User.Role.SUPER_ADMIN)
        branch_id = request.query_params.get('branch')
        if branch_id:
            users = users.filter(Q(branch_id=branch_id) | Q(branch__isnull=True))
        rows = []
        seen = set()
        for user in users:
            if user.id in seen:
                continue
            seen.add(user.id)
            rows.append({
                'id': user.id,
                'name': user.full_name or user.username,
                'branch_id': user.branch_id,
                'branch_name': user.branch.name if user.branch else '',
            })
        return Response(rows)

    def update(self, request, *args, **kwargs):
        # Staff can update candidate details and follow-up fields only.
        lead = self.get_object()
        old_next_follow_up_date = lead.next_follow_up_date
        data = request.data.copy()
        if not request.user.is_super_admin:
            if 'branch' in request.data:
                return Response({'detail': 'Only admin can change a lead branch.'}, status=status.HTTP_403_FORBIDDEN)
            allowed = {
                'name', 'phone', 'dob', 'email', 'location', 'pincode',
                'course', 'preferred_timing', 'qualification', 'degree', 'walkin_date',
                'next_follow_up_date', 'remarks', 'status', 'assigned_to', 'follow_up_by',
            }
            if set(request.data.keys()) - allowed:
                return Response(
                    {'error': 'Staff can only update candidate, follow-up, status, and Follow-up By fields.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        if request.user.is_super_admin and 'branch' in data:
            branch = Branch.objects.filter(pk=data.get('branch'), is_active=True).first()
            if not branch and data.get('branch') not in (None, ''):
                return Response({'detail': 'Select a valid active branch.'}, status=status.HTTP_400_BAD_REQUEST)
        kwargs['partial'] = kwargs.get('partial', False)
        serializer = self.get_serializer(lead, data=data, partial=kwargs['partial'])
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        response = Response(serializer.data)
        lead.refresh_from_db()
        if (
            old_next_follow_up_date != lead.next_follow_up_date
            or lead.status in LEAD_CLOSED_FOLLOW_UP_STATUSES
        ):
            clear_follow_up_notifications_for_record(FollowUp.RecordType.LEAD, lead.id)
        return response

    @action(detail=True, methods=['post'], url_path='convert-to-walkin')
    def convert_to_walkin(self, request, pk=None):
        """Create a walk-in entry from this lead after required details are completed."""
        lead = self.get_object()
        from crm.models import WalkIn
        from serializers import WalkInDetailSerializer
        existing_walkin = None
        if lead.converted_to_type == 'walkin' and lead.converted_record_id:
            existing_walkin = WalkIn.objects.filter(pk=lead.converted_record_id).first()
        existing_walkin = existing_walkin or WalkIn.objects.filter(lead=lead).first()
        if existing_walkin:
            if (
                lead.status != Lead.Status.CONVERTED
                or lead.converted_to_type != 'walkin'
                or lead.converted_record_id != existing_walkin.id
            ):
                lead.status = Lead.Status.CONVERTED
                lead.converted_to_type = 'walkin'
                lead.converted_record_id = existing_walkin.id
                lead.converted_at = lead.converted_at or existing_walkin.created_at
                lead.converted_by = lead.converted_by or existing_walkin.created_by
                lead.save(update_fields=[
                    'status', 'converted_to_type', 'converted_record_id',
                    'converted_at', 'converted_by', 'updated_at',
                ])
            clear_follow_up_notifications_for_record(FollowUp.RecordType.LEAD, lead.id)
            return Response(WalkInDetailSerializer(existing_walkin).data, status=200)
        if lead.converted_to_type == 'enrollment' or lead.enrollments.exists():
            return Response({'detail': 'This record has already been converted.'}, status=status.HTTP_400_BAD_REQUEST)
        data = request.data.copy()
        data.setdefault('name', lead.name)
        data.setdefault('phone', lead.phone)
        data.setdefault('dob', lead.dob)
        data.setdefault('email', lead.email)
        data.setdefault('location', lead.location)
        data.setdefault('pincode', lead.pincode)
        data.setdefault('course', lead.course_id)
        data.setdefault('branch', lead.branch_id)
        data.setdefault('preferred_timing', lead.preferred_timing)
        data.setdefault('qualification', lead.qualification)
        data.setdefault('degree', lead.degree)
        data.setdefault('visit_date', lead.walkin_date or timezone.localdate())
        if not request.user.is_super_admin:
            if not request.user.branch_id:
                return Response(
                    {'detail': 'Your account is not assigned to a branch.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            data['branch'] = request.user.branch_id
        required_fields = ['name', 'phone', 'course', 'branch', 'visit_date']
        missing = [field for field in required_fields if data.get(field) in (None, '')]
        if missing:
            return Response(
                {'detail': 'Please complete all mandatory fields.', 'missing_fields': missing},
                status=status.HTTP_400_BAD_REQUEST,
            )
        branch = Branch.objects.filter(pk=data.get('branch'), is_active=True).first()
        if not branch:
            return Response({'branch': 'Please select a valid active branch.'}, status=status.HTTP_400_BAD_REQUEST)
        course = Course.objects.filter(pk=data.get('course'), is_active=True).first()
        if not course:
            return Response({'course': 'Please select a valid active course.'}, status=status.HTTP_400_BAD_REQUEST)
        year_of_passing = None
        if data.get('year_of_passing') not in (None, ''):
            try:
                year_of_passing = int(data.get('year_of_passing'))
            except (TypeError, ValueError):
                return Response({'year_of_passing': 'Enter a valid passed out year.'}, status=status.HTTP_400_BAD_REQUEST)
            if year_of_passing < 1900 or year_of_passing > 2100:
                return Response({'year_of_passing': 'Enter a valid passed out year.'}, status=status.HTTP_400_BAD_REQUEST)

        walkin_source_values = {choice[0] for choice in WalkIn.Source.choices}
        source = lead.source if lead.source in walkin_source_values else WalkIn.Source.GOOGLE
        with transaction.atomic():
            walkin = WalkIn.objects.create(
                lead=lead,
                branch=branch,
                course=course,
                assigned_to=lead.assigned_to,
                created_by=request.user,
                name=str(data.get('name') or '').strip(),
                phone=str(data.get('phone') or '').strip(),
                dob=data.get('dob') or None,
                email=str(data.get('email') or '').strip(),
                location=str(data.get('location') or '').strip(),
                pincode=str(data.get('pincode') or '').strip(),
                qualification=data.get('qualification') or '',
                degree=data.get('degree') or '',
                year_of_passing=year_of_passing,
                college_company=data.get('college_company') or '',
                preferred_timing=data.get('preferred_timing') or '',
                visit_date=data.get('visit_date'),
                source=source,
                demo_class=data.get('demo_class', False),
                interested_global_certification=data.get('interested_global_certification', False),
            )

            lead.name = str(data.get('name') or '').strip()
            lead.phone = str(data.get('phone') or '').strip()
            lead.dob = data.get('dob') or None
            lead.email = str(data.get('email') or '').strip()
            lead.location = str(data.get('location') or '').strip()
            lead.pincode = str(data.get('pincode') or '').strip()
            lead.preferred_timing = data.get('preferred_timing') or ''
            lead.qualification = data.get('qualification') or ''
            lead.degree = data.get('degree') or ''
            lead.branch = branch
            lead.course = course
            lead.walkin_date = data.get('visit_date')
            lead.status = Lead.Status.CONVERTED
            lead.converted_to_type = 'walkin'
            lead.converted_record_id = walkin.id
            lead.converted_at = timezone.now()
            lead.converted_by = request.user
            lead.save(update_fields=[
                'name', 'phone', 'dob', 'email', 'location', 'pincode', 'preferred_timing', 'qualification', 'degree',
                'branch', 'course', 'walkin_date', 'status', 'converted_to_type',
                'converted_record_id', 'converted_at', 'converted_by', 'updated_at',
            ])
            walkin.refresh_from_db()
        clear_follow_up_notifications_for_record(FollowUp.RecordType.LEAD, lead.id)
        return Response(WalkInDetailSerializer(walkin).data, status=201)

    @action(detail=True, methods=['post'], url_path='convert-to-enrollment')
    def convert_to_enrollment(self, request, pk=None):
        """Create an enrollment directly from this lead after required details are completed."""
        lead = self.get_object()
        from crm.models import Course, Enrollment, WalkIn
        from serializers import EnrollmentDetailSerializer
        existing_enrollment = None
        if lead.converted_to_type == 'enrollment' and lead.converted_record_id:
            existing_enrollment = Enrollment.objects.filter(pk=lead.converted_record_id).first()
        existing_enrollment = existing_enrollment or Enrollment.objects.filter(lead=lead).first()
        if existing_enrollment:
            if (
                lead.status != Lead.Status.CONVERTED
                or lead.converted_to_type != 'enrollment'
                or lead.converted_record_id != existing_enrollment.id
            ):
                lead.status = Lead.Status.CONVERTED
                lead.converted_to_type = 'enrollment'
                lead.converted_record_id = existing_enrollment.id
                lead.converted_at = lead.converted_at or existing_enrollment.created_at
                lead.converted_by = lead.converted_by or existing_enrollment.enrolled_by
                lead.save(update_fields=[
                    'status', 'converted_to_type', 'converted_record_id',
                    'converted_at', 'converted_by', 'updated_at',
                ])
            clear_follow_up_notifications_for_record(FollowUp.RecordType.LEAD, lead.id)
            return Response(EnrollmentDetailSerializer(existing_enrollment).data, status=200)
        if lead.converted_to_type == 'walkin' or hasattr(lead, 'walkin'):
            return Response({'detail': 'This record has already been converted.'}, status=status.HTTP_400_BAD_REQUEST)
        data = request.data.copy()
        data.setdefault('name', lead.name)
        data.setdefault('phone', lead.phone)
        data.setdefault('dob', lead.dob)
        data.setdefault('email', lead.email)
        data.setdefault('location', lead.location)
        data.setdefault('pincode', lead.pincode)
        data.setdefault('course', lead.course_id)
        data.setdefault('branch', lead.branch_id)
        data.setdefault('preferred_timing', lead.preferred_timing)
        data.setdefault('qualification', lead.qualification)
        data.setdefault('degree', lead.degree)
        if not request.user.is_super_admin:
            if not request.user.branch_id:
                return Response(
                    {'detail': 'Your account is not assigned to a branch.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            data['branch'] = request.user.branch_id
        required_fields = [
            'name', 'phone', 'course', 'branch', 'preferred_timing',
            'enrollment_date', 'start_date',
        ]
        missing = [field for field in required_fields if data.get(field) in (None, '')]
        if missing:
            return Response(
                {'detail': 'Please complete all mandatory fields.', 'missing_fields': missing},
                status=status.HTTP_400_BAD_REQUEST,
            )

        course = Course.objects.filter(pk=data.get('course')).first()
        if not course:
            return Response({'detail': 'Please select a valid course.'}, status=status.HTTP_400_BAD_REQUEST)
        data['actual_fees'] = data.get('actual_fees') or course.actual_fees
        try:
            apply_enrollment_discount(data, course, data.get('branch'))
            apply_spot_conversion_discount(data, lead.walkin_date)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        enrollment_source_values = {choice[0] for choice in Enrollment._meta.get_field('source').choices}
        source = lead.source if lead.source in enrollment_source_values else WalkIn.Source.GOOGLE

        with transaction.atomic():
            enrollment = Enrollment.objects.create(
                lead=lead,
                branch_id=data.get('branch'),
                course_id=data.get('course'),
                original_walkin_course_id=lead.course_id,
                final_enrollment_course_id=data.get('course'),
                enrolled_by=request.user,
                created_by=request.user,
                name=data.get('name'),
                phone=data.get('phone'),
                dob=data.get('dob'),
                email=data.get('email'),
                location=data.get('location'),
                pincode=data.get('pincode'),
                qualification=data.get('qualification', ''),
                degree=data.get('degree', ''),
                preferred_timing=data.get('preferred_timing'),
                enrollment_date=data.get('enrollment_date'),
                source=source,
                actual_fees=data.get('actual_fees'),
                discount_amount=data.get('discount_amount') or 0,
                discount_reason=data.get('discount_reason') or '',
                discount_id=data.get('discount') or None,
                spot_conversion_discount_applied=data.get('spot_conversion_discount_applied', False),
                start_date=data.get('start_date') or None,
                batch_timing=data.get('batch_timing') or '',
                demo_class=data.get('demo_class', False),
                interested_global_certification=data.get('interested_global_certification', False),
                status=Enrollment.Status.PENDING_RULES,
            )
            enrollment.refresh_from_db()

            lead.name = data.get('name')
            lead.phone = data.get('phone')
            lead.dob = data.get('dob')
            lead.email = data.get('email')
            lead.location = data.get('location')
            lead.pincode = data.get('pincode')
            lead.preferred_timing = data.get('preferred_timing')
            lead.qualification = data.get('qualification', '')
            lead.degree = data.get('degree', '')
            lead.branch_id = data.get('branch')
            lead.status = Lead.Status.CONVERTED
            lead.converted_to_type = 'enrollment'
            lead.converted_record_id = enrollment.id
            lead.converted_at = timezone.now()
            lead.converted_by = request.user
            lead.save(update_fields=[
                'name', 'phone', 'dob', 'email', 'location', 'pincode', 'preferred_timing', 'qualification', 'degree',
                'branch', 'status', 'converted_to_type', 'converted_record_id',
                'converted_at', 'converted_by', 'updated_at',
            ])
        clear_follow_up_notifications_for_record(FollowUp.RecordType.LEAD, lead.id)
        return Response(EnrollmentDetailSerializer(enrollment).data, status=201)

    @action(detail=True, methods=['post'], url_path='follow-ups')
    def add_follow_up(self, request, pk=None):
        lead = self.get_object()
        response = create_follow_up_entry(lead, FollowUp.RecordType.LEAD, request)
        if response.status_code >= 400:
            return response

        lead.next_follow_up_date = response.data['next_follow_up_date']
        close_follow_up = request.data.get('close_follow_up') in (True, 'true', '1', 1)
        if close_follow_up:
            lead.status = Lead.Status.LOST
        elif lead.status == Lead.Status.NEW:
            lead.status = Lead.Status.FOLLOW_UP
        lead.save(update_fields=['next_follow_up_date', 'status', 'updated_at'])
        clear_follow_up_notifications_for_record(FollowUp.RecordType.LEAD, lead.id)
        return response

    @action(detail=False, methods=['get'], url_path='admin-inbox', permission_classes=[IsSuperAdmin])
    def admin_inbox(self, request):
        queryset = Lead.objects.filter(branch__isnull=True).select_related('course', 'created_by').order_by('-created_at')
        return Response(LeadInboxSerializer(queryset, many=True).data)

    @action(detail=True, methods=['post'], url_path='assign-branch')
    def assign_branch(self, request, pk=None):
        if not request.user.is_super_admin:
            return Response({'detail': 'Only admin can assign lead branches.'}, status=status.HTTP_403_FORBIDDEN)
        lead = self.get_object()
        branch = Branch.objects.filter(pk=request.data.get('branch'), is_active=True).first()
        if not branch:
            return Response({'detail': 'Select a valid active branch.'}, status=status.HTTP_400_BAD_REQUEST)
        lead.branch = branch
        lead.save(update_fields=['branch', 'updated_at'])
        notify_branch_users(
            branch,
            'New lead assigned',
            f'{lead.name} has been assigned to {branch.name}.',
            Notification.NType.INFO,
            f'/leads/{lead.id}',
        )
        return Response(LeadDetailSerializer(lead, context={'request': request}).data)

    @action(detail=False, methods=['get'], url_path='duplicate-check')
    def duplicate_check(self, request):
        phone = request.query_params.get('phone', '').strip()
        if not phone:
            return Response({'duplicate': False, 'records': []})
        records = []
        for lead in Lead.objects.filter(phone=phone).select_related('branch', 'course')[:10]:
            records.append({
                'type': 'Lead',
                'id': lead.id,
                'name': lead.name,
                'phone': lead.phone,
                'branch_name': lead.branch.name if lead.branch else 'Unassigned',
                'course_name': lead.course.name if lead.course else '',
                'status': lead.get_status_display(),
                'url': f'/leads/{lead.id}',
            })
        for walkin in WalkIn.objects.filter(phone=phone).select_related('branch', 'course')[:10]:
            records.append({
                'type': 'Walk-in',
                'id': walkin.id,
                'name': walkin.name,
                'phone': walkin.phone,
                'branch_name': walkin.branch.name if walkin.branch else '',
                'course_name': walkin.course.name if walkin.course else '',
                'status': walkin.get_status_display(),
                'url': f'/walkins/{walkin.id}',
            })
        for enrollment in Enrollment.objects.filter(phone=phone).select_related('branch', 'course')[:10]:
            records.append({
                'type': 'Student',
                'id': enrollment.id,
                'name': enrollment.name,
                'phone': enrollment.phone,
                'branch_name': enrollment.branch.name if enrollment.branch else '',
                'course_name': enrollment.course.name if enrollment.course else '',
                'status': enrollment.get_status_display(),
                'url': f'/students/{enrollment.id}',
            })
        return Response({'duplicate': bool(records), 'warning': 'Duplicate lead found' if records else '', 'records': records})


REQUIRED_LEAD_IMPORT_HEADINGS = [
    'Candidate Name',
    'Phone Number',
    'Course Interested',
    'Branch',
    'How They Know IIE',
    'Follow-up Date',
    'Remarks',
]


def normalise_import_cell(value):
    if value is None:
        return ''
    if hasattr(value, 'date') and not isinstance(value, str):
        return value.date().isoformat()
    return str(value).strip()


def parse_import_followup_date(value):
    value = normalise_import_cell(value)
    if not value:
        return None
    parsed = parse_date(value)
    if parsed:
        return parsed
    for fmt in ('%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y'):
        try:
            return timezone.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def read_lead_import_rows(uploaded_file):
    name = uploaded_file.name.lower()
    if name.endswith('.csv'):
        text = uploaded_file.read().decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(text))
        return reader.fieldnames or [], [dict(row) for row in reader]
    if name.endswith('.xlsx'):
        import openpyxl
        workbook = openpyxl.load_workbook(uploaded_file, read_only=True, data_only=True)
        sheet = workbook.active
        raw_headings = next(sheet.iter_rows(min_row=1, max_row=1, values_only=True), None) or []
        headings = [normalise_import_cell(value) for value in raw_headings]
        rows = []
        for values in sheet.iter_rows(min_row=2, values_only=True):
            if not any(normalise_import_cell(value) for value in values):
                continue
            rows.append({
                heading: normalise_import_cell(values[index] if index < len(values) else '')
                for index, heading in enumerate(headings)
            })
        return headings, rows
    raise ValueError('Only CSV and .xlsx files are supported.')


class LeadImportView(APIView):
    """Counselor-only CSV/XLSX lead import."""
    permission_classes = [IsStaffOrAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if request.user.is_super_admin:
            return Response({'detail': 'Lead import is available only for users/counselors.'}, status=403)
        if not request.user.branch_id:
            return Response({'detail': 'Your account is not assigned to a branch.'}, status=400)

        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'detail': 'Upload a CSV or Excel file.'}, status=400)

        history = LeadImportHistory.objects.create(
            uploaded_by=request.user,
            branch=request.user.branch,
            file_name=uploaded_file.name,
        )

        try:
            headings, rows = read_lead_import_rows(uploaded_file)
        except Exception as exc:
            history.error_log = [{'row': None, 'error': str(exc)}]
            history.status = LeadImportHistory.Status.FAILED
            history.save(update_fields=['error_log', 'status', 'updated_at'])
            return Response({'detail': str(exc), 'history': LeadImportHistorySerializer(history).data}, status=400)

        missing = [heading for heading in REQUIRED_LEAD_IMPORT_HEADINGS if heading not in headings]
        unexpected = [heading for heading in headings if heading and heading not in REQUIRED_LEAD_IMPORT_HEADINGS]
        if missing or unexpected:
            errors = []
            if missing:
                errors.append({'row': None, 'error': f'Missing columns: {", ".join(missing)}'})
            if unexpected:
                errors.append({'row': None, 'error': f'Unexpected columns: {", ".join(unexpected)}'})
            history.total_rows = len(rows)
            history.failed_count = len(rows)
            history.status = LeadImportHistory.Status.FAILED
            history.error_log = errors
            history.save(update_fields=['total_rows', 'failed_count', 'status', 'error_log', 'updated_at'])
            return Response({
                'detail': 'Import failed. File headings do not match the required format.',
                'missing_columns': missing,
                'history': LeadImportHistorySerializer(history).data,
            }, status=400)

        course_map = {course.name.strip().lower(): course for course in Course.objects.filter(is_active=True)}
        source_map = {label.lower(): value for value, label in Lead.Source.choices}
        existing_phones = set(Lead.objects.values_list('phone', flat=True))
        seen_phones = set()
        errors = []
        imported = 0
        duplicates = 0

        for index, row in enumerate(rows, start=2):
            name = normalise_import_cell(row.get('Candidate Name'))
            phone = normalise_import_cell(row.get('Phone Number'))
            course_name = normalise_import_cell(row.get('Course Interested'))
            source_label = normalise_import_cell(row.get('How They Know IIE'))
            followup_raw = normalise_import_cell(row.get('Follow-up Date'))
            followup_date = parse_import_followup_date(followup_raw)
            remarks = normalise_import_cell(row.get('Remarks'))

            row_errors = []
            if not name:
                row_errors.append('Candidate Name is required.')
            if not phone:
                row_errors.append('Phone Number is required.')
            if phone and (phone in existing_phones or phone in seen_phones):
                duplicates += 1
                row_errors.append('Duplicate phone number.')
            course = course_map.get(course_name.lower())
            if not course:
                row_errors.append('Course Interested does not match an active course.')
            source = source_map.get(source_label.lower())
            if not source:
                row_errors.append('How They Know IIE does not match an allowed source.')
            if followup_raw and not followup_date:
                row_errors.append('Follow-up Date is invalid. Use YYYY-MM-DD or DD-MM-YYYY.')

            if row_errors:
                errors.append({'row': index, 'phone': phone, 'error': ' '.join(row_errors)})
                if phone:
                    seen_phones.add(phone)
                continue

            lead_kwargs = {
                'name': name,
                'phone': phone,
                'course': course,
                'branch': request.user.branch,
                'source': source,
                'next_follow_up_date': followup_date,
                'remarks': remarks,
                'created_by': request.user,
                'assigned_to': request.user,
            }
            if 'imported_via_csv' not in missing_model_columns(Lead, ['imported_via_csv']):
                lead_kwargs['imported_via_csv'] = True
            Lead.objects.create(**lead_kwargs)
            imported += 1
            seen_phones.add(phone)
            existing_phones.add(phone)

        failed = len(errors)
        if imported and failed:
            import_status = LeadImportHistory.Status.PARTIAL
        elif imported:
            import_status = LeadImportHistory.Status.SUCCESS
        else:
            import_status = LeadImportHistory.Status.FAILED

        history.total_rows = len(rows)
        history.success_count = imported
        history.failed_count = failed
        history.duplicate_count = duplicates
        history.status = import_status
        history.error_log = errors
        history.save()

        response_status = status.HTTP_201_CREATED if imported else status.HTTP_400_BAD_REQUEST
        return Response({
            'total_rows': history.total_rows,
            'successfully_imported': imported,
            'failed_rows': failed,
            'duplicate_rows': duplicates,
            'errors': errors,
            'status': history.status,
            'history': LeadImportHistorySerializer(history).data,
        }, status=response_status)


class LeadImportHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LeadImportHistorySerializer
    permission_classes = [IsSuperAdmin]
    pagination_class = None

    def get_queryset(self):
        return LeadImportHistory.objects.select_related('uploaded_by', 'branch').order_by('-created_at')


class ExternalLeadCaptureView(APIView):
    """Public/API endpoint for auto-captured leads. Leads remain unassigned for admin review."""
    permission_classes = [AllowAny]

    def post(self, request):
        configured_key = getattr(settings, 'LEAD_CAPTURE_API_KEY', '')
        supplied_key = request.headers.get('X-API-KEY') or request.query_params.get('key')
        if not configured_key or supplied_key != configured_key:
            logger.warning(
                'Rejected external lead capture attempt from %s. API key missing or invalid.',
                get_client_ip(request),
            )
            return Response({'detail': 'Invalid API key.'}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        raw_phone = str(data.get('phone_number') or data.get('phone') or '').strip()
        phone_digits = normalize_phone_number(raw_phone)
        if phone_digits.startswith('0') and len(phone_digits) == 11:
            phone_digits = phone_digits[1:]
        if phone_digits.startswith('91') and len(phone_digits) == 12:
            phone_digits = phone_digits[2:]
        name = str(data.get('candidate_name') or data.get('name') or '').strip()
        if not name or not phone_digits:
            return Response({'detail': 'Candidate name and phone number are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(phone_digits) != 10:
            return Response({'detail': 'Phone number must be a valid 10 digit Indian mobile number.'}, status=status.HTTP_400_BAD_REQUEST)

        course = None
        course_name = str(data.get('course_interested') or data.get('course') or data.get('course_name') or '').strip()
        if course_name:
            course = Course.objects.filter(name__iexact=course_name, is_active=True).first()
        source_label = str(data.get('source') or 'website').strip().lower()
        source_map = {
            'website': Lead.Source.WEBSITE,
            'google': Lead.Source.GOOGLE,
            'justdial': Lead.Source.JUSTDIAL,
        }
        source_value = source_map.get(source_label)
        if not source_value:
            return Response({'detail': 'Source must be Website, Google, or Justdial.'}, status=status.HTTP_400_BAD_REQUEST)

        duplicate_records = matching_candidate_phone_records(phone_digits)
        message = str(data.get('message') or '').strip()
        duplicate_note = ''
        if duplicate_records:
            duplicate_note = 'Duplicate phone found in CRM: ' + '; '.join(
                f"{item['type']} #{item['id']} {item['name']} ({item['branch_name']})"
                for item in duplicate_records[:5]
            )
        remarks = '\n'.join(part for part in [message, duplicate_note] if part)

        lead = Lead.objects.create(
            name=name,
            phone=phone_digits,
            email=data.get('email', ''),
            location=data.get('location', ''),
            course=course,
            source=source_value,
            status=Lead.Status.NEW,
            branch=None,
            remarks=remarks,
            external_course_interested=course_name,
            external_message=message,
            is_duplicate=bool(duplicate_records),
            assigned_to=None,
            created_by=None,
        )
        for admin_user in User.objects.filter(role=User.Role.SUPER_ADMIN, is_active=True):
            create_user_notification(
                admin_user,
                'New unassigned lead',
                f'{lead.name} was captured from an external source.',
                Notification.NType.INFO,
                f'/leads/{lead.id}',
            )
        return Response({
            'id': lead.id,
            'lead_number': lead.lead_number,
            'duplicate': bool(duplicate_records),
            'duplicate_records': duplicate_records,
            'detail': 'Lead captured and added to Admin Lead Inbox.',
        }, status=status.HTTP_201_CREATED)


class PublicLeadFormThrottle(ScopedRateThrottle):
    scope = 'public_lead_form'


class PublicLeadFormView(APIView):
    """GET/POST /api/public/lead-form/ - public website lead capture."""
    permission_classes = [AllowAny]
    throttle_classes = [PublicLeadFormThrottle]

    willing_to_join_options = [
        {'value': Lead.WillingToJoin.WITHIN_MONTH, 'label': 'Within a month'},
        {'value': Lead.WillingToJoin.MONTH_LATER, 'label': 'A month later'},
        {'value': Lead.WillingToJoin.JUST_ENQUIRY, 'label': 'Just enquiry'},
    ]
    qualification_options = [
        {'value': Lead.Qualification.SCHOOL_STUDENT, 'label': 'School Student'},
        {'value': Lead.Qualification.COLLEGE_STUDENT, 'label': 'College Student'},
        {'value': Lead.Qualification.GRADUATE, 'label': 'Graduate'},
        {'value': Lead.Qualification.HOUSEWIFE, 'label': 'Housewife'},
        {'value': Lead.Qualification.WORKING_PROFESSIONAL, 'label': 'Working Professional'},
    ]

    def get(self, request):
        branches = Branch.objects.filter(
            is_active=True,
            name__in=['Gandhipuram', 'Hopes', 'Kuniyamuthur'],
        ).order_by('name')
        courses = Course.objects.filter(is_active=True).order_by('name')
        return Response({
            'branches': BranchSerializer(branches, many=True).data,
            'courses': [{'id': course.id, 'name': course.name} for course in courses],
            'willing_to_join_options': self.willing_to_join_options,
            'qualification_options': self.qualification_options,
        })

    def post(self, request):
        if request.data.get('company'):
            return Response({'detail': 'Spam detected.'}, status=status.HTTP_400_BAD_REQUEST)

        name = str(request.data.get('full_name') or '').strip()
        phone = normalize_phone_number(request.data.get('mobile_number'))
        city = str(request.data.get('city') or '').strip()
        qualification = str(request.data.get('qualification') or '').strip()
        willing_to_join = str(request.data.get('willing_to_join') or '').strip()
        branch_id = request.data.get('branch')
        course_id = request.data.get('course_interested')

        if not name or not phone:
            return Response({'detail': 'Full Name and Mobile Number are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(phone) == 12 and phone.startswith('91'):
            phone = phone[2:]
        if len(phone) != 10:
            return Response({'detail': 'Mobile Number must be a valid 10 digit Indian number.'}, status=status.HTTP_400_BAD_REQUEST)

        if branch_id in (None, ''):
            return Response({'detail': 'Please select a valid branch.'}, status=status.HTTP_400_BAD_REQUEST)
        if course_id in (None, ''):
            return Response({'detail': 'Please select a valid course.'}, status=status.HTTP_400_BAD_REQUEST)

        branch = Branch.objects.filter(pk=branch_id, is_active=True).first()
        if not branch:
            return Response({'detail': 'Please select a valid branch.'}, status=status.HTTP_400_BAD_REQUEST)

        course = Course.objects.filter(pk=course_id, is_active=True).first()
        if not course:
            return Response({'detail': 'Please select a valid course.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_join = {item['value'] for item in self.willing_to_join_options}
        valid_qualification = {item['value'] for item in self.qualification_options}
        if willing_to_join not in valid_join:
            return Response({'detail': 'Please select when willing to join.'}, status=status.HTTP_400_BAD_REQUEST)
        if qualification not in valid_qualification:
            return Response({'detail': 'Please select qualification.'}, status=status.HTTP_400_BAD_REQUEST)

        duplicate_records = matching_candidate_phone_records(phone)
        existing_lead = Lead.objects.filter(phone=phone).order_by('-updated_at', '-created_at').first()
        if existing_lead:
            existing_lead.next_follow_up_date = timezone.localdate()
            existing_lead.is_duplicate = True
            existing_lead.external_message = 'Duplicate public website lead submission.'
            existing_lead.save(update_fields=['next_follow_up_date', 'is_duplicate', 'external_message', 'updated_at'])
            return Response({
                'duplicate': True,
                'detail': 'Thank you! Our team will contact you shortly.',
                'lead_id': existing_lead.id,
            }, status=status.HTTP_200_OK)

        if duplicate_records:
            return Response({
                'duplicate': True,
                'detail': 'Thank you! Our team will contact you shortly.',
                'records': duplicate_records,
            }, status=status.HTTP_200_OK)

        lead = Lead.objects.create(
            name=name,
            phone=phone,
            location=city,
            course=course,
            branch=branch,
            status=Lead.Status.NEW,
            source=Lead.Source.WEBSITE,
            qualification=qualification,
            willing_to_join=willing_to_join,
            remarks='Public website lead form submission.',
            created_by=None,
            assigned_to=None,
        )
        notify_branch_users(
            branch,
            'New website lead assigned',
            f'{lead.name} submitted a website enquiry for {course.name}.',
            Notification.NType.INFO,
            f'/leads/{lead.id}',
        )
        return Response({
            'id': lead.id,
            'detail': 'Thank you! Our team will contact you shortly.',
        }, status=status.HTTP_201_CREATED)


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsStaffOrAdmin]
    pagination_class = None

    def get_queryset(self):
        generate_smart_notifications(self.request.user)
        queryset = Notification.objects.filter(user=self.request.user).order_by('-created_at')
        scope = self.request.query_params.get('scope', 'active')
        status_filter = self.request.query_params.get('status', '').strip()
        state_filter = self.request.query_params.get('state', '').strip()
        date_filter = parse_date(self.request.query_params.get('date', '').strip())

        if status_filter in dict(Notification.Status.choices):
            queryset = queryset.filter(status=status_filter)
        if state_filter == 'active':
            queryset = queryset.exclude(status=Notification.Status.RESOLVED)
        elif state_filter == 'done':
            queryset = queryset.filter(status=Notification.Status.RESOLVED)
        if date_filter:
            queryset = queryset.filter(created_at__date=date_filter)
        if scope != 'all':
            queryset = queryset.exclude(status=Notification.Status.RESOLVED).filter(is_read=False)
        return queryset

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        self.get_queryset().exclude(status=Notification.Status.RESOLVED).update(
            is_read=True,
            status=Notification.Status.READ,
        )
        return Response({'detail': 'Notifications marked as read.'})


class WhatsAppTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = WhatsAppTemplateSerializer
    permission_classes = [IsSuperAdminOrReadOnly]
    pagination_class = None
    filterset_fields = ['template_type', 'is_active']

    def get_queryset(self):
        qs = WhatsAppTemplate.objects.order_by('template_type', 'name')
        if not self.request.user.is_super_admin:
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


# ============================================================
# backend/apps/walkins/views.py
# ============================================================
from crm.models import WalkIn, WalkInBranchChangeHistory
from serializers import WalkInListSerializer, WalkInDetailSerializer
import django_filters


class WalkInFilter(django_filters.FilterSet):
    name = django_filters.CharFilter(field_name='name', lookup_expr='icontains')
    phone = django_filters.CharFilter(field_name='phone', lookup_expr='icontains')
    source = django_filters.CharFilter(method='filter_source')
    branch = django_filters.ModelChoiceFilter(queryset=Branch.objects.all(), method='filter_branch')
    created_by = django_filters.ModelChoiceFilter(queryset=User.objects.all(), method='filter_created_by')
    visit_date_from = django_filters.DateFilter(field_name='visit_date', lookup_expr='gte')
    visit_date_to   = django_filters.DateFilter(field_name='visit_date', lookup_expr='lte')
    follow_up_date_from = django_filters.DateFilter(field_name='follow_up_date', lookup_expr='gte')
    follow_up_date_to   = django_filters.DateFilter(field_name='follow_up_date', lookup_expr='lte')

    def filter_branch(self, queryset, name, value):
        if not self.request or not self.request.user.is_super_admin:
            return queryset
        return queryset.filter(branch=value)

    def filter_created_by(self, queryset, name, value):
        if not self.request or not self.request.user.is_super_admin:
            return queryset
        return queryset.filter(created_by=value)

    def filter_source(self, queryset, name, value):
        value = (value or '').strip()
        if not value:
            return queryset
        valid_sources = {choice[0] for choice in WalkIn.Source.choices}
        if value in valid_sources:
            return queryset.filter(source=value)
        return queryset.none()

    class Meta:
        model  = WalkIn
        fields = ['status', 'branch', 'created_by', 'assigned_to', 'course', 'source', 'demo_class']


class WalkInViewSet(viewsets.ModelViewSet):
    """Walk-in management. Staff sees own branch; admin sees all."""
    permission_classes = [IsStaffOrAdmin]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = WalkInFilter
    pagination_class   = None
    search_fields      = ['name', 'phone', 'candidate_number', 'email']
    ordering_fields    = ['visit_date', 'created_at']
    ordering           = ['-visit_date']

    def get_queryset(self):
        if self.action == 'list':
            qs = WalkIn.objects.select_related('course', 'branch', 'enrollment')
        else:
            qs = WalkIn.objects.select_related('course','branch','assigned_to','created_by','lead','enrollment')
        missing_columns = missing_model_columns(WalkIn, [
            'qualification', 'degree', 'profession', 'year_of_passing',
            'college_company', 'preferred_timing', 'interested_global_certification',
            'walk_in_by', 'follow_up_date', 'converted_to_type',
            'converted_record_id', 'converted_at', 'converted_by',
        ])
        if missing_columns:
            qs = qs.defer(*missing_columns)
        if not self.request.user.is_super_admin:
            qs = qs.filter(branch=self.request.user.branch)
        if self.request.query_params.get('focus') == 'today-follow-up':
            qs = active_walkin_follow_up_queryset(
                qs,
                'follow_up_date',
                timezone.localdate(),
            )
        return qs

    @action(detail=True, methods=['post'], url_path='send-follow-up-whatsapp')
    def send_follow_up_whatsapp(self, request, pk=None):
        _, response = send_candidate_template(
            self.get_object(),
            WhatsAppTemplate.TemplateType.WALKIN_FOLLOW_UP,
            WhatsAppMessage.MsgType.WALKIN_REMIND,
            request,
            'walkin',
        )
        return response

    @action(detail=True, methods=['post'], url_path='send-offer-whatsapp')
    def send_offer_whatsapp(self, request, pk=None):
        _, response = send_candidate_template(
            self.get_object(),
            WhatsAppTemplate.TemplateType.OFFER_MESSAGE,
            WhatsAppMessage.MsgType.OFFER_MESSAGE,
            request,
            'walkin',
        )
        return response

    def get_serializer_class(self):
        return WalkInListSerializer if self.action == 'list' else WalkInDetailSerializer

    def list(self, request, *args, **kwargs):
        if request.query_params.get('sectioned') not in ('1', 'true', 'yes'):
            return super().list(request, *args, **kwargs)
        return self._sectioned_response()

    def retrieve(self, request, *args, **kwargs):
        walkin = self.get_object()
        if clear_stale_walkin_conversion(walkin):
            walkin.refresh_from_db()
        mark_public_walkin_notifications_read(walkin.id)
        serializer = self.get_serializer(walkin)
        return Response(serializer.data)

    def _sectioned_response(self):
        queryset = self.filter_queryset(self.get_queryset())
        now = timezone.localtime(timezone.now())
        current_month_filter = {
            'created_at__year': now.year,
            'created_at__month': now.month,
        }
        current_month_walkins = queryset.filter(**current_month_filter)
        other_walkins = queryset.exclude(**current_month_filter)

        current_serializer = self.get_serializer(current_month_walkins, many=True)
        other_serializer = self.get_serializer(other_walkins, many=True)
        return Response({
            'current_month_walkins': current_serializer.data,
            'other_walkins': other_serializer.data,
            'current_month_count': current_month_walkins.count(),
            'other_walkins_count': other_walkins.count(),
        })

    @action(detail=False, methods=['get'], url_path='sectioned')
    def sectioned(self, request):
        return self._sectioned_response()

    def perform_create(self, serializer):
        branch = self.request.user.branch if not self.request.user.is_super_admin else None
        serializer.save(
            created_by=self.request.user,
            branch=branch or serializer.validated_data.get('branch'),
            status=WalkIn.Status.NEW,
            converted_to_type='',
            converted_record_id=None,
            converted_at=None,
            converted_by=None,
        )

    @action(detail=False, methods=['get'], url_path='staff-options')
    def staff_options(self, request):
        users = User.objects.filter(
            is_active=True,
            role=User.Role.STAFF,
        ).select_related('branch').order_by('first_name', 'last_name', 'username')
        if request.user.is_super_admin:
            branch_id = request.query_params.get('branch')
            if not branch_id:
                return Response([])
            users = users.filter(branch_id=branch_id)
        else:
            users = users.filter(branch=request.user.branch)
        seen = set()
        rows = []
        for user in users:
            if user.id in seen:
                continue
            seen.add(user.id)
            rows.append({
                'id': user.id,
                'name': user.full_name or user.username,
                'branch_id': user.branch_id,
                'branch_name': user.branch.name if user.branch else '',
            })
        return Response(rows)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        walkin = self.get_object()
        old_follow_up_date = walkin.follow_up_date
        data = request.data.copy()
        branch_changed = False
        old_branch = walkin.branch
        new_branch = None

        if 'branch' in request.data:
            if not request.user.is_super_admin:
                return Response({'detail': 'Only admin can change a walk-in branch.'}, status=status.HTTP_403_FORBIDDEN)
            new_branch = Branch.objects.filter(pk=request.data.get('branch'), is_active=True).first()
            if not new_branch:
                return Response({'detail': 'Select a valid active branch.'}, status=status.HTTP_400_BAD_REQUEST)
            branch_changed = walkin.branch_id != new_branch.id
            if branch_changed and walkin.assigned_to_id and walkin.assigned_to.branch_id != new_branch.id:
                data['assigned_to'] = None
        data.pop('branch_change_reason', None)

        assigned_to = data.get('assigned_to')
        if assigned_to not in (None, ''):
            user_qs = User.objects.filter(
                pk=assigned_to,
                is_active=True,
                role=User.Role.STAFF,
                branch=new_branch or walkin.branch,
            )
            if not request.user.is_super_admin:
                user_qs = user_qs.filter(branch=request.user.branch)
            if not user_qs.exists():
                return Response({'detail': 'Select a valid staff user for Walk-in By.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(walkin, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        if branch_changed:
            WalkInBranchChangeHistory.objects.create(
                walkin=walkin,
                old_branch=old_branch,
                new_branch=new_branch,
                changed_by=request.user,
                reason='Updated from walk-in detail edit.',
            )
        walkin.refresh_from_db()
        mark_public_walkin_notifications_read(walkin.id)
        if (
            old_follow_up_date != walkin.follow_up_date
            or walkin.status in WALKIN_CLOSED_FOLLOW_UP_STATUSES
        ):
            clear_follow_up_notifications_for_record(FollowUp.RecordType.WALKIN, walkin.id)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='change-branch')
    def change_branch(self, request, pk=None):
        if not request.user.is_super_admin:
            return Response({'detail': 'Only admin can change a walk-in branch.'}, status=status.HTTP_403_FORBIDDEN)

        walkin = self.get_object()
        branch_id = request.data.get('branch')
        reason = request.data.get('reason', '')
        if not branch_id:
            return Response({'detail': 'Branch is required.'}, status=status.HTTP_400_BAD_REQUEST)

        new_branch = Branch.objects.filter(pk=branch_id, is_active=True).first()
        if not new_branch:
            return Response({'detail': 'Select a valid active branch.'}, status=status.HTTP_400_BAD_REQUEST)

        old_branch = walkin.branch
        if old_branch_id := getattr(old_branch, 'id', None):
            if old_branch_id == new_branch.id:
                return Response(WalkInDetailSerializer(walkin, context={'request': request}).data)

        WalkInBranchChangeHistory.objects.create(
            walkin=walkin,
            old_branch=old_branch,
            new_branch=new_branch,
            changed_by=request.user,
            reason=reason,
        )
        walkin.branch = new_branch
        update_fields = ['branch', 'updated_at']
        if walkin.assigned_to_id and walkin.assigned_to.branch_id != new_branch.id:
            walkin.assigned_to = None
            update_fields.append('assigned_to')
        walkin.save(update_fields=update_fields)
        mark_public_walkin_notifications_read(walkin.id)
        return Response(WalkInDetailSerializer(walkin, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='follow-ups')
    def add_follow_up(self, request, pk=None):
        walkin = self.get_object()
        response = create_follow_up_entry(walkin, FollowUp.RecordType.WALKIN, request)
        if response.status_code >= 400:
            return response

        walkin.follow_up_date = response.data['next_follow_up_date']
        close_follow_up = request.data.get('close_follow_up') in (True, 'true', '1', 1)
        if close_follow_up:
            walkin.status = WalkIn.Status.NOT_INTERESTED
        elif walkin.status == WalkIn.Status.NEW:
            walkin.status = WalkIn.Status.FOLLOW_UP
        walkin.save(update_fields=['follow_up_date', 'status', 'updated_at'])
        clear_follow_up_notifications_for_record(FollowUp.RecordType.WALKIN, walkin.id)
        return response

    @action(detail=True, methods=['post'], url_path='convert-to-enrollment')
    def convert_to_enrollment(self, request, pk=None):
        """Convert walk-in to confirmed enrollment."""
        walkin = self.get_object()
        from serializers import EnrollmentDetailSerializer
        data = request.data.copy()
        if valid_walkin_enrollment(walkin):
            return Response({'detail': 'This record has already been converted.'}, status=status.HTTP_400_BAD_REQUEST)
        clear_stale_walkin_conversion(walkin)
        walkin.refresh_from_db()

        data.setdefault('name',        walkin.name)
        data.setdefault('phone',       walkin.phone)
        data.setdefault('email',       walkin.email)
        data.setdefault('dob',         walkin.dob)
        data.setdefault('location',    walkin.location)
        data.setdefault('pincode',     walkin.pincode)
        data.setdefault('source',      walkin.source)
        data.setdefault('preferred_timing', walkin.preferred_timing)
        data.setdefault('qualification', walkin.qualification)
        data.setdefault('degree', walkin.degree)
        data.setdefault('demo_class',  walkin.demo_class)
        data.setdefault('interested_global_certification', walkin.interested_global_certification)
        data.setdefault('branch',      walkin.branch_id)
        data.setdefault('course',      walkin.course_id)
        required_fields = [
            'name', 'phone', 'course', 'branch', 'preferred_timing',
            'enrollment_date', 'start_date',
        ]
        missing = [field for field in required_fields if data.get(field) in (None, '')]
        if missing:
            return Response(
                {'detail': 'Please complete all mandatory fields.', 'missing_fields': missing},
                status=status.HTTP_400_BAD_REQUEST,
            )
        course = Course.objects.filter(pk=data.get('course')).first()
        if not course:
            return Response({'detail': 'Please select a valid course.'}, status=status.HTTP_400_BAD_REQUEST)
        data['actual_fees'] = data.get('actual_fees') or course.actual_fees
        try:
            apply_enrollment_discount(data, course, data.get('branch'))
            apply_spot_conversion_discount(data, walkin.visit_date)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = EnrollmentDetailSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        enrollment = serializer.save(
            walkin=walkin,
            original_walkin_course=walkin.course,
            final_enrollment_course=course,
            enrolled_by=request.user,
            created_by=request.user,
            status=Enrollment.Status.PENDING_RULES,
        )
        enrollment.refresh_from_db()

        walkin.name = data.get('name')
        walkin.phone = data.get('phone')
        walkin.email = data.get('email')
        walkin.dob = data.get('dob')
        walkin.location = data.get('location')
        walkin.pincode = data.get('pincode')
        walkin.branch_id = data.get('branch')
        walkin.preferred_timing = data.get('preferred_timing')
        walkin.qualification = data.get('qualification', '')
        walkin.degree = data.get('degree', '')
        walkin.status = WalkIn.Status.CONVERTED
        walkin.converted_to_type = 'enrollment'
        walkin.converted_record_id = enrollment.id
        walkin.converted_at = timezone.now()
        walkin.converted_by = request.user
        walkin.save(update_fields=[
            'name', 'phone', 'email', 'dob', 'location', 'pincode',
            'branch', 'preferred_timing', 'qualification', 'degree', 'status', 'converted_to_type',
            'converted_record_id', 'converted_at', 'converted_by', 'updated_at',
        ])
        clear_follow_up_notifications_for_record(FollowUp.RecordType.WALKIN, walkin.id)
        resolve_public_walkin_notifications(walkin.id)
        return Response(EnrollmentDetailSerializer(enrollment).data, status=201)


from serializers import BranchTransferRequestSerializer


class BranchTransferRequestViewSet(viewsets.ModelViewSet):
    """Branch-change approval workflow for walk-in to enrollment conversion."""
    serializer_class = BranchTransferRequestSerializer
    permission_classes = [IsStaffOrAdmin]
    pagination_class = None
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'walkin', 'current_branch', 'requested_branch', 'course', 'requested_by']
    search_fields = ['candidate_name', 'phone']
    ordering_fields = ['created_at', 'reviewed_at', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = BranchTransferRequest.objects.select_related(
            'walkin', 'current_branch', 'requested_branch', 'course',
            'requested_by', 'reviewed_by', 'enrollment',
        )
        if not self.request.user.is_super_admin:
            queryset = queryset.filter(requested_by=self.request.user)
        return queryset

    def create(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Transfer requests are created from walk-in enrollment conversion.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def update(self, request, *args, **kwargs):
        return Response({'detail': 'Use approve or reject actions.'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def partial_update(self, request, *args, **kwargs):
        return Response({'detail': 'Use approve or reject actions.'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_super_admin:
            return Response({'detail': 'Only admin can delete transfer requests.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        if not request.user.is_super_admin:
            return Response({'detail': 'Only admin can approve transfer requests.'}, status=status.HTTP_403_FORBIDDEN)

        transfer_request = self.get_object()
        if transfer_request.status != BranchTransferRequest.Status.PENDING:
            return Response({'detail': 'Only pending transfer requests can be approved.'}, status=status.HTTP_400_BAD_REQUEST)
        if BranchTransferRequest.objects.filter(
            walkin=transfer_request.walkin,
            status=BranchTransferRequest.Status.APPROVED,
        ).exclude(pk=transfer_request.pk).exists():
            return Response({'detail': 'This walk-in already has an approved transfer.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                create_enrollment_from_transfer_request(transfer_request, request.user)
                transfer_request.review_remarks = request.data.get('review_remarks') or request.data.get('remarks') or ''
                transfer_request.save(update_fields=['review_remarks', 'updated_at'])
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        transfer_request.refresh_from_db()
        return Response(self.get_serializer(transfer_request).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        if not request.user.is_super_admin:
            return Response({'detail': 'Only admin can reject transfer requests.'}, status=status.HTTP_403_FORBIDDEN)

        transfer_request = self.get_object()
        if transfer_request.status != BranchTransferRequest.Status.PENDING:
            return Response({'detail': 'Only pending transfer requests can be rejected.'}, status=status.HTTP_400_BAD_REQUEST)

        transfer_request.status = BranchTransferRequest.Status.REJECTED
        transfer_request.reviewed_by = request.user
        transfer_request.reviewed_at = timezone.now()
        transfer_request.review_remarks = request.data.get('review_remarks') or request.data.get('remarks') or ''
        transfer_request.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_remarks', 'updated_at'])
        return Response(self.get_serializer(transfer_request).data)


from serializers import PublicWalkInCreateSerializer


class PublicWalkInFormView(APIView):
    """POST /api/public/walkin/ — public walk-in capture."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        allowed_branch_names = ['Gandhipuram', 'Hopes', 'Kuniyamuthur']
        branch_rows = [
            {'id': branch.id, 'name': branch.name}
            for branch in Branch.objects.filter(
                is_active=True,
                name__in=allowed_branch_names,
            ).order_by('name')
        ]
        course_rows = [
            {'id': course.id, 'name': course.name}
            for course in Course.objects.filter(is_active=True).order_by('name')
        ]
        return Response({
            'branches': branch_rows,
            'courses': course_rows,
            'preferred_timing_options': [
                {'value': value, 'label': label}
                for value, label in WalkIn.PreferredTiming.choices
            ],
            'qualification_options': [
                {'value': value, 'label': label}
                for value, label in WalkIn.Qualification.choices
            ],
            'source_options': [
                {'value': value, 'label': label}
                for value, label in WalkIn.Source.choices
            ],
        })

    def post(self, request):
        data = request.data.copy()
        phone = normalize_phone_number(data.get('phone'))
        if len(phone) == 12 and phone.startswith('91'):
            phone = phone[2:]
        data['phone'] = phone

        if not phone:
            return Response({'phone': 'Phone number is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(phone) != 10:
            return Response({'phone': 'Phone number should be 10 digits.'}, status=status.HTTP_400_BAD_REQUEST)

        branch_id = data.get('branch')
        course_id = data.get('course')
        branch = Branch.objects.filter(pk=branch_id, is_active=True).first()
        if not branch:
            return Response({'branch': 'Please select a valid active branch.'}, status=status.HTTP_400_BAD_REQUEST)
        course = Course.objects.filter(pk=course_id, is_active=True).first()
        if not course:
            return Response({'course': 'Please select a valid active course.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = PublicWalkInCreateSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        duplicate_records = matching_candidate_phone_records(phone)
        existing_walkin = None
        active_walkins = WalkIn.objects.exclude(
            status=WalkIn.Status.CONVERTED,
        ).filter(
            Q(converted_to_type__isnull=True) | Q(converted_to_type='')
        ).order_by('-updated_at', '-created_at')
        for walkin in active_walkins:
            if normalize_phone_number(walkin.phone) == phone:
                existing_walkin = walkin
                break

        save_kwargs = {
            'status': WalkIn.Status.NEW,
            'branch': branch,
            'course': course,
            'converted_to_type': '',
            'converted_record_id': None,
            'converted_at': None,
            'converted_by': None,
        }
        if existing_walkin:
            walkin = serializer.update(existing_walkin, {**serializer.validated_data, **save_kwargs})
        else:
            walkin = serializer.save(**save_kwargs)

        notify_branch_users(
            branch,
            'New public walk-in submitted',
            f'{walkin.name} submitted the public walk-in form for {course.name}.',
            Notification.NType.INFO,
            f'/walkins/{walkin.id}',
        )
        for admin_user in User.objects.filter(role=User.Role.SUPER_ADMIN, is_active=True):
            create_user_notification(
                admin_user,
                'New public walk-in submitted',
                f'{walkin.name} submitted the public walk-in form for {branch.name}.',
                Notification.NType.INFO,
                f'/walkins/{walkin.id}',
            )
        return Response(
            {
                'detail': 'Thanks for filling out the form.',
                'candidate_number': walkin.candidate_number,
                'id': walkin.id,
                'duplicate': bool(duplicate_records),
                'updated': bool(existing_walkin),
            },
            status=status.HTTP_200_OK if existing_walkin else status.HTTP_201_CREATED
        )


class PublicRulesSigningView(APIView):
    """Public token endpoint for rules signing."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_signing(self, token):
        return RulesSigningRequest.objects.defer(
            'selfie_image',
            'selfie_image_file',
            'signature_image_file',
            'signed_pdf_file',
            'submitted_ip',
            'submitted_user_agent',
        ).select_related(
            'enrollment__course',
            'enrollment__branch',
        ).filter(token=token).first()

    def public_pdf_url(self, request, signing):
        try:
            has_pdf = bool(getattr(signing, 'signed_pdf_file', None) or signing.signed_pdf)
        except (OperationalError, ProgrammingError):
            has_pdf = bool(signing.signed_pdf)
        if not has_pdf:
            return None
        return request.build_absolute_uri(f'{app_url(f"public/rules-signed-pdf/{signing.token}")}/')

    def get(self, request, token):
        signing = self.get_signing(token)
        if not signing:
            return Response({'detail': 'Invalid signing link.'}, status=404)
        enrollment = signing.enrollment
        installments = build_default_installment_plan(enrollment)
        payment_mode = ''
        first_installment = enrollment.installments.order_by('payment_date', 'id').first()
        if first_installment:
            payment_mode = first_installment.get_payment_mode_display()
        return Response({
            'status': signing.status,
            'candidate': {
                'name': enrollment.name,
                'phone': enrollment.phone,
                'course': enrollment.course.name if enrollment.course else '',
                'course_enrolled': enrollment.course.name if enrollment.course else '',
                'batch_timing': enrollment.batch_timing or enrollment.get_preferred_timing_display() or '',
                'batch_start_date': enrollment.start_date,
                'duration': enrollment.course.duration_months if enrollment.course else None,
                'actual_fees': enrollment.actual_fees,
                'course_discount': enrollment.discount_amount,
                'final_fees': enrollment.final_fees,
                'spot_conversion_discount': enrollment.spot_conversion_discount_amount,
                'net_payable_fee': enrollment_payable_fee(enrollment),
                'total_course_fee': enrollment_payable_fee(enrollment),
                'payment_mode': payment_mode,
                'enrollment_date': enrollment.enrollment_date,
            },
            'installments': installments,
            'rules_paragraphs': extract_rules_template_text(),
            'rules_content': extract_rules_template_text(),
            'signed_pdf_url': self.public_pdf_url(request, signing),
            'selfie_url': self.file_url(request, signing, 'selfie_image'),
        })

    def file_url(self, request, signing, field_name):
        try:
            field = getattr(signing, field_name)
            return request.build_absolute_uri(field.url) if field else None
        except (OperationalError, ProgrammingError, ValueError):
            return None

    def post(self, request, token):
        signing = self.get_signing(token)
        if not signing:
            return Response({'detail': 'Invalid signing link.'}, status=404)
        if signing.status == RulesSigningRequest.Status.SUBMITTED:
            return Response({'detail': 'Rules & Regulation form has already been submitted.'}, status=400)

        try:
            selfie_bytes = validate_data_image(request.data.get('selfie'), 'Identity photo')
            signature_bytes = validate_data_image(request.data.get('signature'), 'Signature')
        except RuntimeError as exc:
            return Response({'detail': str(exc)}, status=503)
        except ValueError as exc:
            detail = str(exc)
            if detail == 'Identity photo is required.':
                detail = 'Identity photo is required before signing the form.'
            return Response({'detail': detail}, status=400)

        enrollment = signing.enrollment
        submitted_at = timezone.now()
        try:
            try:
                pdf_bytes = build_signed_rules_pdf(enrollment, signature_bytes, selfie_bytes, submitted_at)
            except RuntimeError as exc:
                return Response({'detail': str(exc)}, status=503)
            signing.selfie_image_file = selfie_bytes
            signing.signature_image_file = signature_bytes
            signing.signed_pdf_file = pdf_bytes
            signing.status = RulesSigningRequest.Status.SUBMITTED
            signing.submitted_at = submitted_at
            signing.submitted_ip = get_client_ip(request)
            signing.submitted_user_agent = request.META.get('HTTP_USER_AGENT', '')[:2000]
            signing.save(update_fields=[
                'selfie_image_file',
                'signature_image_file',
                'signed_pdf_file',
                'status',
                'submitted_at',
                'submitted_ip',
                'submitted_user_agent',
                'updated_at',
            ])
        except (OperationalError, ProgrammingError):
            return Response({'detail': 'Rules signing storage is not ready. Please run database migrations and try again.'}, status=503)
        if enrollment.status != Enrollment.Status.ENROLLED:
            enrollment.status = Enrollment.Status.RULES_SUBMITTED
            enrollment.save(update_fields=['status', 'updated_at'])
        notify_rules_signed(enrollment, signing.submitted_at)
        return Response({
            'detail': 'Rules & Regulation form submitted successfully.',
            'status': signing.status,
            'signed_pdf_url': self.public_pdf_url(request, signing),
            'selfie_url': None,
            'submitted_at': signing.submitted_at,
        })


def proof_filename(enrollment):
    student_id = enrollment.student_number or enrollment.id
    return f'IIE-Rules-Regulations-{student_id}.pdf'


def proof_unavailable_response():
    return Response(
        {'detail': 'Signed PDF is not available. Please resend and collect the signed form again.'},
        status=404,
    )


def binary_or_legacy_file(signing, binary_field, legacy_field):
    try:
        binary_value = getattr(signing, binary_field, None)
    except (OperationalError, ProgrammingError):
        binary_value = None
    if binary_value:
        return bytes(binary_value)
    try:
        field = getattr(signing, legacy_field, None)
        if field:
            with field.open('rb') as handle:
                return handle.read()
    except Exception:
        return None
    return None


class RulesSignedPdfView(APIView):
    permission_classes = [IsStaffOrAdmin]

    def get(self, request, enrollment_id):
        signing = RulesSigningRequest.objects.defer(
            'selfie_image',
            'selfie_image_file',
            'signature_image_file',
            'signed_pdf_file',
            'submitted_ip',
            'submitted_user_agent',
        ).select_related('enrollment__branch').filter(enrollment_id=enrollment_id).first()
        if not signing:
            return proof_unavailable_response()
        enrollment = signing.enrollment
        if not request.user.is_super_admin and enrollment.branch_id != request.user.branch_id:
            return Response({'detail': 'You do not have permission to view this signed PDF.'}, status=403)
        pdf_bytes = binary_or_legacy_file(signing, 'signed_pdf_file', 'signed_pdf')
        if not pdf_bytes:
            return proof_unavailable_response()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{proof_filename(enrollment)}"'
        return response


class RulesSelfieView(APIView):
    permission_classes = [IsStaffOrAdmin]

    def get(self, request, enrollment_id):
        signing = RulesSigningRequest.objects.defer(
            'selfie_image',
            'selfie_image_file',
            'signature_image_file',
            'signed_pdf_file',
            'submitted_ip',
            'submitted_user_agent',
        ).select_related('enrollment__branch').filter(enrollment_id=enrollment_id).first()
        if not signing:
            return Response({'detail': 'Selfie is not available.'}, status=404)
        enrollment = signing.enrollment
        if not request.user.is_super_admin and enrollment.branch_id != request.user.branch_id:
            return Response({'detail': 'You do not have permission to view this selfie.'}, status=403)
        image_bytes = binary_or_legacy_file(signing, 'selfie_image_file', 'selfie_image')
        if not image_bytes:
            return Response({'detail': 'Selfie is not available.'}, status=404)
        return HttpResponse(image_bytes, content_type='image/jpeg')


class PublicRulesSignedPdfView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        signing = RulesSigningRequest.objects.defer(
            'selfie_image',
            'selfie_image_file',
            'signature_image_file',
            'signed_pdf_file',
            'submitted_ip',
            'submitted_user_agent',
        ).select_related('enrollment').filter(
            token=token,
            status=RulesSigningRequest.Status.SUBMITTED,
        ).first()
        if not signing:
            return proof_unavailable_response()
        pdf_bytes = binary_or_legacy_file(signing, 'signed_pdf_file', 'signed_pdf')
        if not pdf_bytes:
            return proof_unavailable_response()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{proof_filename(signing.enrollment)}"'
        return response


# ============================================================
# backend/apps/enrollments/views.py
# ============================================================
from crm.models import Enrollment
from serializers import EnrollmentListSerializer, EnrollmentDetailSerializer
import django_filters


class EnrollmentFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(method='filter_status')
    enrolled_from = django_filters.DateFilter(field_name='enrollment_date', lookup_expr='gte')
    enrolled_to   = django_filters.DateFilter(field_name='enrollment_date', lookup_expr='lte')

    def filter_status(self, queryset, name, value):
        if value == Enrollment.Status.ACTIVE:
            return queryset.filter(status__in=[Enrollment.Status.ACTIVE, Enrollment.Status.ENROLLED])
        return queryset.filter(status=value) if value else queryset

    class Meta:
        model  = Enrollment
        fields = ['status', 'branch', 'course']


class EnrollmentViewSet(viewsets.ModelViewSet):
    """Enrollment records. Staff sees own branch."""
    permission_classes = [IsStaffOrAdmin]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class    = EnrollmentFilter
    pagination_class   = None
    search_fields      = ['name', 'phone', 'student_number', 'email']
    ordering_fields    = ['enrollment_date', 'name']
    ordering           = ['-enrollment_date']

    def get_queryset(self):
        qs = Enrollment.objects.select_related(
            'course','branch','enrolled_by','created_by'
        ).prefetch_related('payment__installments')
        if not self.request.user.is_super_admin:
            qs = qs.filter(branch=self.request.user.branch)
        if getattr(self, 'action', None) == 'list':
            qs = qs.filter(status__in=Enrollment.FINAL_STATUSES)
        return qs

    def get_serializer_class(self):
        return EnrollmentListSerializer if self.action == 'list' else EnrollmentDetailSerializer

    def perform_create(self, serializer):
        serializer.save(enrolled_by=self.request.user, created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        if 'branch' in request.data and not request.user.is_super_admin:
            return Response({'detail': 'Only admin can change an enrollment branch.'}, status=status.HTTP_403_FORBIDDEN)
        enrollment = self.get_object()
        response = super().update(request, *args, **kwargs)
        enrollment.refresh_from_db()
        if enrollment.status in Enrollment.FINAL_STATUSES:
            resolve_rules_signed_notifications(enrollment.id)
        return response

    @action(detail=True, methods=['post'], url_path='send-rules-form')
    def send_rules_form(self, request, pk=None):
        enrollment = self.get_object()
        errors = {}
        if not enrollment.start_date:
            errors['start_date'] = 'Course start date is required.'
        if not str(enrollment.batch_timing or '').strip():
            errors['batch_timing'] = 'Batch timing is required.'
        if errors:
            return Response(
                {'detail': 'Course start date and batch timing are required before sending the Rules & Regulation form.', **errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        signing, _ = RulesSigningRequest.objects.get_or_create(enrollment=enrollment)
        signing.status = RulesSigningRequest.Status.SENT
        signing.sent_at = timezone.now()
        signing.sent_by = request.user
        signing.save(update_fields=['status', 'sent_at', 'sent_by', 'updated_at'])
        if enrollment.status != Enrollment.Status.ENROLLED:
            enrollment.status = Enrollment.Status.RULES_SENT
            enrollment.save(update_fields=['status', 'updated_at'])

        signing_path = f'{app_url(f"IIE-Rules-Regulations/{signing.token}")}/'
        signing_link = request.build_absolute_uri(signing_path)
        default_message = (
            f'Hi {enrollment.name},\n\n'
            'Please review and sign the IIE Rules & Regulations form using the link below:\n\n'
            'IIE Rules & Regulations Form:\n'
            f'{signing_link}\n\n'
            'After signing, our team will proceed with your enrollment.\n\n'
            '-Team IIE'
        )
        template = active_whatsapp_template(WhatsAppTemplate.TemplateType.RULES_FORM_LINK)
        payment = getattr(enrollment, 'payment', None)
        values = {
            'student_name': enrollment.name,
            'candidate_name': enrollment.name,
            'course_name': enrollment.course.name if enrollment.course else '',
            'branch_name': enrollment.branch.name if enrollment.branch else '',
            'phone_number': enrollment.phone,
            'total_fee': whatsapp_currency(enrollment_payable_fee(enrollment)),
            'paid_amount': whatsapp_currency(payment.paid_amount if payment else 0),
            'pending_amount': whatsapp_currency((payment.balance if payment else enrollment_payable_fee(enrollment))),
            'due_date': whatsapp_date(enrollment.start_date),
            'next_payment_date': whatsapp_date(payment.next_payment_date if payment else None),
            'rules_link': signing_link,
            'institute_name': 'IIE',
        }
        message = render_whatsapp_template(template.message_body if template else default_message, values)
        log = send_candidate_message(
            candidate_name=enrollment.name,
            phone=enrollment.phone,
            message_type=WhatsAppMessage.MsgType.RULES_FORM_LINK,
            message_body=template.message_body if template else default_message,
            template=template,
            values=values,
            sent_by=request.user,
            related_model='enrollment',
            related_id=enrollment.id,
            dedupe=False,
        )
        return Response({
            'detail': 'Rules & Regulation form link generated.',
            'signing_link': signing_link,
            'whatsapp_message': message,
            'phone': enrollment.phone,
            'status': signing.status,
            'enrollment_status': enrollment.status,
            **whatsapp_send_payload(log),
        })

    @action(detail=True, methods=['post'], url_path='enroll-student')
    def enroll_student(self, request, pk=None):
        enrollment = self.get_object()
        signing = getattr(enrollment, 'rules_signing', None)
        if not signing or signing.status != RulesSigningRequest.Status.SUBMITTED:
            return Response({'detail': 'Rules & Regulation form must be signed before enrollment can proceed.'}, status=400)
        with transaction.atomic():
            if enrollment.status not in Enrollment.FINAL_STATUSES:
                enrollment.status = Enrollment.Status.ACTIVE
                enrollment.enrolled_by = enrollment.enrolled_by or request.user
                enrollment.save(update_fields=['status', 'enrolled_by', 'student_number', 'final_fees', 'net_payable_fee', 'spot_conversion_discount_amount', 'updated_at'])
            resolve_rules_signed_notifications(enrollment.id)
            payment, created = Payment.objects.get_or_create(
                enrollment=enrollment,
                defaults={
                    'total_fees': enrollment_payable_fee(enrollment),
                    'status': Payment.Status.UNPAID,
                    'manual_installment_schedule': [
                        {
                            **item,
                            'due_date': item['due_date'].isoformat() if item.get('due_date') else None,
                        }
                        for item in get_default_installment_schedule(enrollment)
                    ],
                },
            )
            if not created:
                update_fields = []
                if payment.total_fees != enrollment_payable_fee(enrollment):
                    payment.total_fees = enrollment_payable_fee(enrollment)
                    update_fields.append('total_fees')
                if not payment.manual_installment_schedule:
                    payment.manual_installment_schedule = [
                        {
                            **item,
                            'due_date': item['due_date'].isoformat() if item.get('due_date') else None,
                        }
                        for item in get_default_installment_schedule(enrollment)
                    ]
                    update_fields.append('manual_installment_schedule')
                if update_fields:
                    update_fields.extend(['paid_amount', 'status', 'next_payment_date', 'updated_at'])
                    payment.save(update_fields=update_fields)
        return Response(EnrollmentDetailSerializer(enrollment, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='add-to-payment')
    def add_to_payment(self, request, pk=None):
        enrollment = self.get_object()
        if enrollment.status not in {
            Enrollment.Status.ENROLLED,
            Enrollment.Status.ACTIVE,
            Enrollment.Status.COMPLETED,
        }:
            return Response(
                {'detail': 'Only enrolled or completed enrollments can be added to payments.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not enrollment.start_date:
            return Response(
                {'detail': 'Course start date is required to create payment schedule.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Payment.objects.filter(enrollment=enrollment).exists():
            return Response(
                {'detail': 'Payment record already exists for this enrollment.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            payment = Payment.objects.create(
                enrollment=enrollment,
                total_fees=enrollment_payable_fee(enrollment),
                status=Payment.Status.UNPAID,
                manual_installment_schedule=[
                    {
                        **item,
                        'due_date': item['due_date'].isoformat() if item.get('due_date') else None,
                    }
                    for item in get_default_installment_schedule(enrollment)
                ],
            )

        enrollment.refresh_from_db()
        return Response({
            'detail': 'Payment record created.',
            'payment': PaymentSerializer(payment, context={'request': request}).data,
            'enrollment': EnrollmentDetailSerializer(enrollment, context={'request': request}).data,
        }, status=status.HTTP_201_CREATED)


# ============================================================
# backend/apps/payments/views.py
# ============================================================
from crm.models import Payment, PaymentInstallment, get_payment_installment_schedule
from serializers import PaymentSerializer, PaymentInstallmentSerializer, payment_installment_summary


class PaymentFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(method='filter_status')
    due_this_week = django_filters.BooleanFilter(method='filter_due_this_week')
    next_payment_from = django_filters.DateFilter(field_name='next_payment_date', lookup_expr='gte')
    next_payment_to = django_filters.DateFilter(field_name='next_payment_date', lookup_expr='lte')

    class Meta:
        model = Payment
        fields = ['status', 'enrollment__branch', 'due_this_week', 'next_payment_from', 'next_payment_to']

    def filter_status(self, queryset, name, value):
        if value == 'pending':
            return queryset.filter(status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL])
        return queryset.filter(status=value)

    def filter_due_this_week(self, queryset, name, value):
        if not value:
            return queryset
        today = timezone.localdate()
        week_start = today - timedelta(days=(today.weekday() + 1) % 7)
        week_end = week_start + timedelta(days=6)
        return queryset.filter(
            status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL],
            paid_amount__lt=F('total_fees'),
            next_payment_date__gte=week_start,
            next_payment_date__lte=week_end,
        )


class PaymentViewSet(mixins.DestroyModelMixin, viewsets.ReadOnlyModelViewSet):
    """Read payment records (aggregate)."""
    permission_classes = [IsStaffOrAdmin]
    serializer_class   = PaymentSerializer
    filter_backends    = [DjangoFilterBackend, SearchFilter]
    filterset_class    = PaymentFilter
    pagination_class   = None
    search_fields      = ['enrollment__name', 'enrollment__student_number', 'enrollment__phone']

    def _month_bounds(self):
        raw_month = self.request.query_params.get('month')
        today = timezone.localdate()
        if raw_month:
            try:
                year, month = [int(part) for part in raw_month.split('-', 1)]
                start = today.replace(year=year, month=month, day=1)
            except (TypeError, ValueError):
                start = today.replace(day=1)
        else:
            start = today.replace(day=1)
        end = start.replace(day=monthrange(start.year, start.month)[1])
        return start, end

    def get_queryset(self):
        qs = Payment.objects.select_related(
            'enrollment__branch','enrollment__course'
        ).prefetch_related('installments').filter(enrollment__status__in=Enrollment.FINAL_STATUSES)
        if not self.request.user.is_super_admin:
            qs = qs.filter(enrollment__branch=self.request.user.branch)
        elif self.request.query_params.get('branch'):
            qs = qs.filter(enrollment__branch_id=self.request.query_params.get('branch'))
        if self.action in ('list', 'export'):
            month_start, month_end = self._month_bounds()
            qs = qs.filter(
                Q(installments__payment_date__gte=month_start, installments__payment_date__lte=month_end)
                | Q(next_payment_date__gte=month_start, next_payment_date__lte=month_end)
                | Q(status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL], enrollment__enrollment_date__lte=month_end)
            ).distinct().order_by('enrollment__name', 'id')
        return qs

    def get_summary_queryset(self):
        qs = Payment.objects.select_related('enrollment__branch').filter(
            enrollment__status__in=Enrollment.FINAL_STATUSES,
            status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL],
            paid_amount__lt=F('total_fees'),
        )
        if not self.request.user.is_super_admin:
            qs = qs.filter(enrollment__branch=self.request.user.branch)
        elif self.request.query_params.get('branch'):
            qs = qs.filter(enrollment__branch_id=self.request.query_params.get('branch'))
        return qs

    def pending_amount_for_month(self, queryset, month_start, month_end):
        month_queryset = queryset.filter(
            next_payment_date__gte=month_start,
            next_payment_date__lte=month_end,
        ).distinct()
        return sum((payment.balance for payment in month_queryset), Decimal('0'))

    def pending_summary(self):
        today = timezone.localdate()
        this_month_start = today.replace(day=1)
        this_month_end = this_month_start.replace(day=monthrange(this_month_start.year, this_month_start.month)[1])
        last_month_end = this_month_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        next_month_seed = this_month_end + timedelta(days=1)
        next_month_start = next_month_seed.replace(day=1)
        next_month_end = next_month_start.replace(day=monthrange(next_month_start.year, next_month_start.month)[1])
        queryset = self.get_summary_queryset()
        return {
            'total_pending_amount': sum((payment.balance for payment in queryset), Decimal('0')),
            'this_month_pending': self.pending_amount_for_month(queryset, this_month_start, this_month_end),
            'last_month_pending': self.pending_amount_for_month(queryset, last_month_start, last_month_end),
            'next_month_pending': self.pending_amount_for_month(queryset, next_month_start, next_month_end),
        }

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        month_start, month_end = self._month_bounds()
        today = timezone.localdate()
        collection = PaymentInstallment.objects.filter(
            payment__in=queryset,
            payment_date__gte=month_start,
            payment_date__lte=month_end,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        partial_payments = PaymentInstallment.objects.filter(
            payment__in=queryset,
            payment_date__gte=month_start,
            payment_date__lte=month_end,
            document_type=PaymentInstallment.DocumentType.RECEIPT,
        ).count()
        completed_installments = PaymentInstallment.objects.filter(
            payment__in=queryset,
            payment_date__gte=month_start,
            payment_date__lte=month_end,
            document_type=PaymentInstallment.DocumentType.BILL,
        ).count()
        pending = sum((payment.balance for payment in queryset), Decimal('0'))
        due_queryset = queryset.filter(
            status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL],
            next_payment_date__isnull=False,
            next_payment_date__gte=month_start,
            next_payment_date__lte=month_end,
        )
        if month_start <= today <= month_end:
            upcoming = due_queryset.filter(next_payment_date__gte=today).count()
            overdue = queryset.filter(
                status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL],
                next_payment_date__lt=today,
            ).count()
        else:
            upcoming = due_queryset.count()
            overdue = queryset.filter(
                status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL],
                next_payment_date__lte=month_end,
            ).count()
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'results': serializer.data,
            'summary': {
                'total_collection': collection,
                'pending_amount': pending,
                'partial_payments': partial_payments,
                'completed_installments': completed_installments,
                'upcoming_payments': upcoming,
                'overdue_payments': overdue,
                **self.pending_summary(),
            },
            'filters': {
                'month': month_start.strftime('%Y-%m'),
                'month_start': month_start,
                'month_end': month_end,
            },
        })

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_super_admin:
            return Response({'detail': 'Only admin can delete payments.'}, status=status.HTTP_403_FORBIDDEN)
        payment = self.get_object()
        reason = str(request.data.get('reason') or '').strip()
        if not reason:
            return Response({'detail': 'Reason for deletion is required.'}, status=status.HTTP_400_BAD_REQUEST)
        has_generated_documents = payment.installments.filter(
            Q(receipt_number__gt='') | Q(bill_number__gt='') | Q(bill_generated_at__isnull=False)
        ).exists()
        if has_generated_documents:
            return Response(
                {'detail': 'This payment has generated documents and cannot be deleted. Use Void/Cancel instead.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        enrollment = payment.enrollment
        logger.warning(
            'Admin %s deleted payment %s for enrollment %s. Reason: %s',
            request.user.id,
            payment.id,
            enrollment.id,
            reason,
        )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        try:
            import openpyxl
        except ImportError:
            return self._export_csv()
        queryset = self.filter_queryset(self.get_queryset())
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = 'Payment Worksheet'
        headers = [
            'Student Name', 'Student ID', 'Course', 'Total Fees', 'First Class Date',
            '1st Payment Amount', '1st Payment Date',
            '2nd Payment Amount', '2nd Payment Date',
            '3rd Payment Amount', '3rd Payment Date',
            'Balance Amount', 'Payment Status',
        ]
        max_installments = max([payment.installments.count() for payment in queryset] or [3])
        for index in range(4, max_installments + 1):
            headers.insert(-2, f'{index}th Payment Amount')
            headers.insert(-2, f'{index}th Payment Date')
        sheet.append(headers)
        for payment in queryset:
            installments = list(payment.installments.all().order_by('payment_date', 'id'))
            row = [
                payment.enrollment.name,
                payment.enrollment.student_number,
                payment.enrollment.course.name if payment.enrollment.course else '',
                payment.total_fees,
                payment.enrollment.start_date,
            ]
            for index in range(max_installments):
                installment = installments[index] if index < len(installments) else None
                row.extend([
                    installment.amount if installment else '',
                    installment.payment_date if installment else '',
                ])
            row.extend([payment.balance, payment.get_status_display()])
            sheet.append(row)
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        month_start, _ = self._month_bounds()
        response['Content-Disposition'] = f'attachment; filename="payment-worksheet-{month_start:%Y-%m}.xlsx"'
        workbook.save(response)
        return response

    def _worksheet_export_rows(self, queryset):
        max_installments = max([payment.installments.count() for payment in queryset] or [3])
        headers = [
            'Student Name', 'Student ID', 'Course', 'Total Fees', 'First Class Date',
            '1st Payment Amount', '1st Payment Date',
            '2nd Payment Amount', '2nd Payment Date',
            '3rd Payment Amount', '3rd Payment Date',
            'Balance Amount', 'Payment Status',
        ]
        for index in range(4, max_installments + 1):
            headers.insert(-2, f'{index}th Payment Amount')
            headers.insert(-2, f'{index}th Payment Date')
        rows = []
        for payment in queryset:
            installments = list(payment.installments.all().order_by('payment_date', 'id'))
            row = [
                payment.enrollment.name,
                payment.enrollment.student_number,
                payment.enrollment.course.name if payment.enrollment.course else '',
                payment.total_fees,
                payment.enrollment.start_date,
            ]
            for index in range(max_installments):
                installment = installments[index] if index < len(installments) else None
                row.extend([
                    installment.amount if installment else '',
                    installment.payment_date if installment else '',
                ])
            row.extend([payment.balance, payment.get_status_display()])
            rows.append(row)
        return headers, rows

    def _export_csv(self):
        import csv
        queryset = self.filter_queryset(self.get_queryset())
        headers, rows = self._worksheet_export_rows(queryset)
        month_start, _ = self._month_bounds()
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="payment-worksheet-{month_start:%Y-%m}.csv"'
        writer = csv.writer(response)
        writer.writerow(headers)
        writer.writerows(rows)
        return response

    @action(detail=True, methods=['post'], url_path='send-reminder')
    def send_reminder(self, request, pk=None):
        payment = self.get_object()
        if payment.status == Payment.Status.PAID or payment.balance <= 0:
            return Response({'detail': 'This payment has no pending balance.'}, status=400)
        enrollment = payment.enrollment
        template_id = request.data.get('template_id')
        template = None
        if template_id:
            template = WhatsAppTemplate.objects.filter(
                pk=template_id,
                template_type=WhatsAppTemplate.TemplateType.PAYMENT_REMINDER,
                is_active=True,
            ).first()
        template = template or active_whatsapp_template(WhatsAppTemplate.TemplateType.PAYMENT_REMINDER)
        default_message = (
            'Hi {{student_name}},\n\n'
            'This is a gentle reminder regarding your pending course fee payment.\n\n'
            'Total Fee: {{total_fee}}\n'
            'Paid: {{paid_amount}}\n'
            'Balance: {{pending_amount}}\n\n'
            'Kindly complete the pending payment at your earliest convenience.\n\n'
            '-Team IIE'
        )
        values = {
            'student_name': enrollment.name,
            'candidate_name': enrollment.name,
            'course_name': enrollment.course.name if enrollment.course else '',
            'branch_name': enrollment.branch.name if enrollment.branch else '',
            'phone_number': enrollment.phone,
            'total_fee': whatsapp_currency(payment.total_fees),
            'paid_amount': whatsapp_currency(payment.paid_amount),
            'pending_amount': whatsapp_currency(payment.balance),
            'next_payment_date': whatsapp_date(payment.next_payment_date),
            'institute_name': 'IIE',
        }
        body = template.message_body if template else default_message
        log = send_candidate_message(
            candidate_name=enrollment.name,
            phone=enrollment.phone,
            message_type=WhatsAppMessage.MsgType.PAYMENT_REMINDER,
            message_body=body,
            template=template,
            values=values,
            sent_by=request.user,
            related_model='payment',
            related_id=payment.id,
            dedupe=False,
        )
        return Response({
            'detail': 'Payment reminder processed.',
            'phone': enrollment.phone,
            'whatsapp_message': render_whatsapp_template(body, values),
            **whatsapp_send_payload(log),
        })

    @action(detail=True, methods=['post'], url_path='update-schedule')
    def update_schedule(self, request, pk=None):
        if not request.user.is_super_admin:
            return Response({'detail': 'Only admin can override payment schedules.'}, status=403)
        payment = self.get_object()
        schedule = request.data.get('payment_schedule')
        if not isinstance(schedule, list) or not schedule:
            return Response({'detail': 'Payment schedule is required.'}, status=400)
        cleaned = []
        for index, item in enumerate(schedule, start=1):
            amount = item.get('amount')
            due_date = item.get('due_date')
            if amount in (None, '') or not due_date:
                return Response({'detail': 'Each installment needs amount and due date.'}, status=400)
            try:
                amount = int(float(amount))
            except (TypeError, ValueError):
                return Response({'detail': 'Installment amount must be numeric.'}, status=400)
            if amount < 0:
                return Response({'detail': 'Installment amount cannot be negative.'}, status=400)
            cleaned.append({
                'label': item.get('label') or f'{index} Installment',
                'amount': amount,
                'due_date': due_date,
            })
        payment.manual_installment_schedule = cleaned
        payment.update_status()
        payment.save(update_fields=['manual_installment_schedule', 'paid_amount', 'status', 'next_payment_date', 'updated_at'])
        return Response(PaymentSerializer(payment, context={'request': request}).data)


class PaymentInstallmentViewSet(viewsets.ModelViewSet):
    """Add/view payment installments."""
    permission_classes = [IsStaffOrAdmin]
    serializer_class   = PaymentInstallmentSerializer
    pagination_class   = None
    filterset_fields   = ['enrollment', 'payment_mode', 'payment_date']

    def get_queryset(self):
        qs = PaymentInstallment.objects.select_related(
            'payment',
            'enrollment__branch',
            'enrollment__course',
            'collected_by',
            'bill_generated_by',
        )
        if not self.request.user.is_super_admin:
            qs = qs.filter(enrollment__branch=self.request.user.branch)
        return qs

    def create(self, request, *args, **kwargs):
        payment_id = request.data.get('payment')
        enrollment_id = request.data.get('enrollment')
        if not payment_id:
            return Response({'detail': 'Payment record is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            payment = Payment.objects.select_related('enrollment__branch').get(pk=payment_id)
        except Payment.DoesNotExist:
            return Response({'detail': 'Payment record not found.'}, status=404)
        if not request.user.is_super_admin and payment.enrollment.branch_id != request.user.branch_id:
            return Response({'detail': 'You do not have access to this payment.'}, status=403)
        if enrollment_id and str(payment.enrollment_id) != str(enrollment_id):
            return Response(
                {'detail': 'Installment payment and enrollment do not match.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            amount = Decimal(str(request.data.get('amount') or '0'))
        except (TypeError, ValueError):
            return Response({'detail': 'Payment amount must be numeric.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0:
            return Response({'detail': 'Payment amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)

        allow_overpayment = request.user.is_super_admin and str(request.data.get('allow_overpayment', '')).lower() in {'1', 'true', 'yes'}
        if amount > payment.balance and not allow_overpayment:
            return Response({'detail': 'Payment amount cannot exceed the pending total fee balance.'}, status=status.HTTP_400_BAD_REQUEST)

        active = self._active_installment(payment)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        save_kwargs = {
            'payment': payment,
            'enrollment': payment.enrollment,
            'collected_by': request.user,
            'installment_index': active['index'],
            'installment_label': active['label'],
            'document_type': PaymentInstallment.DocumentType.RECEIPT,
        }
        self.perform_create(serializer, save_kwargs)
        headers = self.get_success_headers(serializer.data)
        message = 'Payment entry saved and marked Pending Approval.'
        self._notify_admins_payment_added(serializer.instance)
        return Response({'detail': message, 'installment': serializer.data}, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer, save_kwargs=None):
        serializer.save(**(save_kwargs or {'collected_by': self.request.user}))

    def _notify_admins_payment_added(self, installment):
        message = f'{installment.enrollment.name} payment added and awaiting approval.'
        for admin_user in User.objects.filter(role=User.Role.SUPER_ADMIN, is_active=True):
            create_user_notification(
                admin_user,
                'Payment Awaiting Approval',
                message,
                Notification.NType.INFO,
                f'/payments/{installment.payment_id}',
            )

    def _notify_collector_document_generated(self, installment):
        if not installment.collected_by_id:
            return
        document_label = 'Bill' if installment.bill_number else 'Receipt'
        create_notification_once(
            installment.collected_by,
            f'{document_label} Generated',
            f'{document_label} generated for {installment.enrollment.name}.',
            Notification.NType.SUCCESS,
            f'/payments/{installment.payment_id}',
        )

    def update(self, request, *args, **kwargs):
        installment = self.get_object()
        if self._document_number(installment) or installment.bill_generated_at:
            return Response({'detail': 'Generated payment documents cannot be edited.'}, status=400)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        installment = self.get_object()
        if self._document_number(installment) or installment.bill_generated_at:
            return Response({'detail': 'Generated payment documents cannot be deleted.'}, status=400)
        return super().destroy(request, *args, **kwargs)

    def _active_installment(self, payment):
        summary = payment_installment_summary(payment)
        if not summary:
            return {
                'index': 1,
                'label': '1 Installment',
                'required_amount': payment.total_fees,
                'paid_amount': Decimal('0'),
                'pending_amount': payment.total_fees,
                'status': 'pending',
            }
        for item in summary:
            if item['status'] != 'paid':
                return item
        return summary[-1]

    def _document_number(self, installment):
        if installment.bill_number:
            return installment.bill_number
        return installment.receipt_number

    def _build_bill_html(self, installment):
        enrollment = installment.enrollment
        payment = installment.payment
        branch = enrollment.branch
        branch_address_line_1 = 'First Floor, AAKIFAH 2017 Complex, Palghat Main Road,'
        branch_address_line_2 = 'Near Muthoot Finance, Kuniyamuthur, Coimbatore - 641008'
        branch_phone = branch.phone if branch and branch.phone else 'Phone number not set'
        schedule = get_payment_installment_schedule(payment)

        def receipt_date(value):
            if not value:
                return 'Not set'
            if isinstance(value, str):
                value = parse_date(value)
            if hasattr(value, 'date') and not hasattr(value, 'day'):
                value = value.date()
            if hasattr(value, 'strftime'):
                return value.strftime('%d/%m/%Y')
            return str(value)

        paid_running_total = 0
        schedule_rows = []
        for item in schedule:
            paid_running_total += int(float(item.get('amount') or 0))
            due_date_display = receipt_date(item.get('due_date'))
            row_status = 'Paid' if payment.paid_amount >= paid_running_total else 'Upcoming'
            status_class = 'paid' if row_status == 'Paid' else 'upcoming'
            schedule_rows.append(
                f"""
                <tr>
                  <td>{escape(str(item.get('label') or 'Installment'))}</td>
                  <td>{escape(due_date_display)}</td>
                  <td class="amount">Rs {int(float(item.get('amount') or 0)):,.2f}</td>
                  <td class="status-cell"><span class="badge {status_class}">{escape(row_status)}</span></td>
                </tr>
                """
            )
        logo_src = ''
        logo_candidates = [
            Path(settings.BASE_DIR) / 'frontend' / 'public' / 'iie-white.png',
            Path(settings.BASE_DIR) / 'frontend' / 'dist' / 'iie-white.png',
            Path(settings.BASE_DIR) / 'frontend' / 'src' / 'assets' / 'brand-logo.png',
            Path(settings.BASE_DIR) / 'frontend' / 'dist' / 'brand-logo.png',
            Path(settings.BASE_DIR) / 'frontend' / 'dist' / 'receipt-logo.png',
        ]
        for logo_path in logo_candidates:
            if logo_path.exists():
                logo_src = f"data:image/png;base64,{base64.b64encode(logo_path.read_bytes()).decode('ascii')}"
                break
        is_bill = bool(installment.bill_number) or installment.document_type == PaymentInstallment.DocumentType.BILL
        document_title = 'Official Payment Bill' if is_bill else 'Payment Receipt'
        document_number_label = 'Bill No' if is_bill else 'Receipt No'
        document_number = self._document_number(installment)
        partial_note = '' if is_bill else '<div class="partial-note">Partial Payment Received</div>'
        return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>{escape(document_number or document_title)}</title>
    <style>
      * {{ box-sizing: border-box; }}
      body {{ font-family: Libertine, "Linux Libertine", "Libertinus Serif", Georgia, "Times New Roman", serif; color: #111827; margin: 14px; background: #F8FAFC; }}
      .sheet {{ max-width: 780px; margin: 0 auto; border: 1px solid #CBD5E1; background: white; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }}
      .header {{ display: grid; grid-template-columns: 68px minmax(0, 1fr); gap: 18px; align-items: center; padding: 11px 22px; background: #1E3A5F; color: white; }}
      .logo {{ display: flex; align-items: center; justify-content: flex-start; }}
      .logo img {{ width: auto; height: 48px; object-fit: contain; display: block; }}
      .brand {{ align-self: center; min-width: 0; text-align: center; padding-right: 68px; }}
      .brand h1 {{ margin: 0 0 3px; font-size: 20px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: white; }}
      .brand .tagline {{ margin: 0 0 4px; font-size: 12.5px; font-weight: 600; color: #F8FAFC; }}
      .brand .address {{ margin: 0 0 4px; }}
      .brand .address p {{ margin: 1px 0; font-size: 10.8px; line-height: 1.22; color: #F8FAFC; }}
      .brand .phone {{ margin: 0; font-size: 11px; line-height: 1.2; color: #F8FAFC; }}
      .receipt-bar {{ display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 38px; padding: 9px 18px; border-bottom: 1px solid #CBD5E1; background: #ffffff; }}
      .receipt-title {{ font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; color: #111827; line-height: 1.1; }}
      .receipt-no {{ font-size: 12px; font-weight: 800; color: #1E3A5F; line-height: 1.1; }}
      .partial-note {{ padding: 7px 18px; border-bottom: 1px solid #CBD5E1; background: #FFF7ED; color: #9A3412; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }}
      .section {{ padding: 12px 18px; border-bottom: 1px solid #CBD5E1; background: #ffffff; }}
      .grid {{ display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 24px; row-gap: 9px; }}
      .field {{ display: grid; grid-template-columns: 150px minmax(0, 220px); gap: 10px; align-items: baseline; min-height: 22px; }}
      .label {{ font-size: 9.8px; text-transform: uppercase; letter-spacing: 0.07em; color: #334155; line-height: 1.2; }}
      .value {{ font-size: 12.2px; font-weight: 800; color: #111827; line-height: 1.25; text-align: left; }}
      .field .amount {{ text-align: left; color: #111827; }}
      .section h2 {{ margin: 0 0 8px; font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.12em; color: #111827; }}
      table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
      th, td {{ padding: 6px 9px; border: 1px solid #CBD5E1; text-align: left; vertical-align: middle; }}
      th {{ background: #F8FAFC; color: #334155; text-transform: uppercase; letter-spacing: 0.08em; font-size: 9.5px; }}
      tr:nth-child(even) td {{ background: #F8FAFC; }}
      table .amount {{ text-align: right; font-weight: 800; color: #1E3A5F; }}
      td.status-cell {{ text-align: center; }}
      .badge {{ display: inline-block; min-width: 70px; border-radius: 999px; padding: 2px 8px; text-align: center; font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid #CBD5E1; line-height: 1.25; }}
      .badge.paid {{ background: #DCFCE7; color: #334155; border-color: #86EFAC; }}
      .badge.upcoming {{ background: #FFF7ED; color: #334155; border-color: #FED7AA; }}
      .generated-info {{ padding: 18px 24px; background: white; color: #334155; font-size: 11.5px; line-height: 1.8; }}
      .generated-info p {{ margin: 0; }}
      .generated-info .info-label {{ font-weight: 700; }}
      .generated-info .info-value {{ font-weight: 400; color: #111827; }}
      .bottom {{ display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 52px; margin-top: 8px; padding: 10px 24px; background: #1E3A5F; border-top: 1px solid #d6dce5; color: white; font-size: 13px; line-height: 1.35; }}
      @media print {{
        body {{ margin: 0; background: white; }}
        .sheet {{ border: 1px solid #CBD5E1; max-width: none; box-shadow: none; }}
        .header {{ print-color-adjust: exact; -webkit-print-color-adjust: exact; }}
        .bottom, th, tr:nth-child(even) td {{ print-color-adjust: exact; -webkit-print-color-adjust: exact; }}
      }}
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div class="logo">
          {'<img src="' + logo_src + '" alt="Indra Institute of Education logo">' if logo_src else ''}
        </div>
        <div class="brand">
          <h1>Indra Institute of Education</h1>
          <div class="tagline">IT Training &amp; Testing Services</div>
          <div class="address">
            <p>{escape(branch_address_line_1)}</p>
            <p>{escape(branch_address_line_2)}</p>
          </div>
          <p class="phone">{escape(branch_phone)}</p>
        </div>
      </div>
      <div class="receipt-bar">
        <div class="receipt-title">{escape(document_title)}</div>
        <div class="receipt-no">{escape(document_number_label)}: {escape(document_number or '')}</div>
      </div>
      {partial_note}
      <div class="section">
        <div class="grid">
          <div class="field"><div class="label">STUDENT NAME</div><div class="value">{escape(enrollment.name)}</div></div>
          <div class="field"><div class="label">STUDENT ID</div><div class="value">{escape(enrollment.student_number)}</div></div>
          <div class="field"><div class="label">COURSE</div><div class="value">{escape(enrollment.course.name)}</div></div>
          <div class="field"><div class="label">BRANCH</div><div class="value">{escape(branch.name if branch else 'No branch')}</div></div>
          <div class="field"><div class="label">PAYMENT MODE</div><div class="value">{escape(installment.get_payment_mode_display())}</div></div>
          <div class="field"><div class="label">REFERENCE NO</div><div class="value">{escape(installment.reference_number or 'Not provided')}</div></div>
          <div class="field"><div class="label">PAYMENT DATE</div><div class="value">{escape(receipt_date(installment.payment_date))}</div></div>
          <div class="field"><div class="label">INSTALLMENT</div><div class="value">{escape(installment.installment_label or str(installment.installment_index))}</div></div>
          <div class="field"><div class="label">PAYMENT AMOUNT</div><div class="value amount">Rs {installment.amount:,.2f}</div></div>
          <div class="field"><div class="label">TOTAL FEES</div><div class="value amount">Rs {payment.total_fees:,.2f}</div></div>
          <div class="field"><div class="label">PAID AMOUNT</div><div class="value amount">Rs {payment.paid_amount:,.2f}</div></div>
          <div class="field"><div class="label">BALANCE</div><div class="value amount">Rs {payment.balance:,.2f}</div></div>
        </div>
      </div>
      <div class="section">
        <h2>Next Payment Schedule</h2>
        <table>
          <thead>
            <tr>
              <th>INSTALLMENT</th>
              <th>DUE DATE</th>
              <th class="amount">Amount</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {''.join(schedule_rows)}
          </tbody>
        </table>
      </div>
      <div class="generated-info">
        <p><span class="info-label">GENERATED BY:</span> <span class="info-value">Indra Institute of Education</span></p>
        <p><span class="info-label">GENERATED ON:</span> <span class="info-value">{escape(receipt_date(installment.bill_generated_at))}</span></p>
      </div>
      <div class="bottom">
        <div>Fees once paid cannot be refunded.</div>
        <div>This is a computer-generated document, no signature required.</div>
      </div>
    </div>
  </body>
</html>"""

    def _branch_receipt_code(self, branch):
        if not branch:
            return 'GEN'
        raw_code = str(branch.branch_code or '').strip().upper()
        if raw_code and not raw_code.isdigit():
            return re.sub(r'[^A-Z0-9]', '', raw_code)[:6] or 'GEN'
        branch_name_key = re.sub(r'[^a-z0-9]', '', branch.name or '').lower()
        known_codes = {
            'kuniyamuthur': 'KUN',
            'gandhipuram': 'GDP',
            'hopes': 'HOP',
        }
        if branch_name_key in known_codes:
            return known_codes[branch_name_key]
        words = re.findall(r'[A-Za-z0-9]+', branch.name or '')
        if len(words) >= 2:
            return ''.join(word[0] for word in words).upper()[:3]
        return re.sub(r'[^A-Z0-9]', '', (branch.name or 'GEN').upper())[:3] or 'GEN'

    def _generate_document_number(self, branch, document_type):
        year = timezone.localdate().year
        branch_code = self._branch_receipt_code(branch)
        prefix = 'BILL' if document_type == PaymentInstallment.DocumentType.BILL else 'RCPT'
        number_prefix = f'{prefix}-{branch_code}-{year}-'
        field = 'bill_number__startswith' if document_type == PaymentInstallment.DocumentType.BILL else 'receipt_number__startswith'
        generated_count = PaymentInstallment.objects.filter(enrollment__branch=branch, **{field: number_prefix}).count()
        return f'{number_prefix}{generated_count + 1:04d}'

    @action(detail=True, methods=['post'], url_path='generate-bill')
    def generate_bill(self, request, pk=None):
        installment = self.get_object()
        if not request.user.is_super_admin:
            return Response({'detail': 'Only admin can generate bills.'}, status=403)

        installment_status = PaymentInstallmentSerializer(installment).data.get('installment_status')
        if installment_status != 'paid':
            return Response({'detail': 'Official bill can be generated only after the required installment amount is fully paid.'}, status=400)
        if not installment.bill_number:
            installment.bill_number = self._generate_document_number(installment.enrollment.branch, PaymentInstallment.DocumentType.BILL)
        installment.document_type = PaymentInstallment.DocumentType.BILL
        installment.bill_generated_at = timezone.now()
        installment.bill_generated_by = request.user
        installment.save(update_fields=['document_type', 'bill_number', 'bill_generated_at', 'bill_generated_by'])
        self._notify_collector_document_generated(installment)
        return Response(PaymentInstallmentSerializer(installment).data)

    @action(detail=True, methods=['post'], url_path='generate-receipt')
    def generate_receipt(self, request, pk=None):
        installment = self.get_object()
        if not request.user.is_super_admin:
            return Response({'detail': 'Only admin can generate receipts.'}, status=403)
        if installment.bill_number:
            return Response({'detail': 'Official bill already generated for this payment entry.'}, status=400)
        if not installment.receipt_number:
            installment.receipt_number = self._generate_document_number(installment.enrollment.branch, PaymentInstallment.DocumentType.RECEIPT)
        installment.document_type = PaymentInstallment.DocumentType.RECEIPT
        installment.bill_generated_at = timezone.now()
        installment.bill_generated_by = request.user
        installment.save(update_fields=['document_type', 'receipt_number', 'bill_generated_at', 'bill_generated_by'])
        self._notify_collector_document_generated(installment)
        return Response(PaymentInstallmentSerializer(installment).data)

    @action(detail=True, methods=['get'], url_path='view-bill')
    def view_bill(self, request, pk=None):
        installment = self.get_object()
        document_number = self._document_number(installment)
        if not document_number:
            return Response({'detail': 'Payment document has not been generated yet.'}, status=404)

        response = HttpResponse(self._build_bill_html(installment), content_type='text/html; charset=utf-8')
        response['Content-Disposition'] = f'inline; filename="{document_number}.html"'
        return response

    @action(detail=True, methods=['get'], url_path='download-bill')
    def download_bill(self, request, pk=None):
        installment = self.get_object()
        document_number = self._document_number(installment)
        if not document_number:
            return Response({'detail': 'Payment document has not been generated yet.'}, status=404)

        response = HttpResponse(self._build_bill_html(installment), content_type='text/html; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{document_number}.html"'
        return response


class AdminReceiptViewSet(viewsets.ModelViewSet):
    """Admin-only standalone receipts for miscellaneous payments."""
    serializer_class = AdminReceiptSerializer
    permission_classes = [IsSuperAdmin]
    pagination_class = None
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['purpose', 'payment_mode', 'payment_date']
    search_fields = ['receipt_number', 'name', 'phone', 'purpose']
    ordering_fields = ['payment_date', 'generated_on', 'amount', 'name', 'purpose']
    ordering = ['-payment_date', '-created_at']

    def get_queryset(self):
        return AdminReceipt.objects.select_related('generated_by').all()

    def _generate_receipt_number(self):
        year = timezone.localdate().year
        prefix = f'IIE-REC-{year}-'
        count = AdminReceipt.objects.filter(receipt_number__startswith=prefix).count()
        return f'{prefix}{count + 1:04d}'

    def perform_create(self, serializer):
        receipt_number = self._generate_receipt_number()
        while AdminReceipt.objects.filter(receipt_number=receipt_number).exists():
            sequence = int(receipt_number.rsplit('-', 1)[1]) + 1
            receipt_number = f'IIE-REC-{timezone.localdate().year}-{sequence:04d}'
        serializer.save(
            receipt_number=receipt_number,
            generated_by=self.request.user,
            generated_on=timezone.now(),
        )

    def _receipt_date(self, value):
        if not value:
            return 'Not set'
        if isinstance(value, str):
            value = parse_date(value)
        if hasattr(value, 'strftime'):
            return value.strftime('%d/%m/%Y')
        return str(value)

    def _logo_src(self):
        logo_candidates = [
            Path(settings.BASE_DIR) / 'frontend' / 'public' / 'iie-white.png',
            Path(settings.BASE_DIR) / 'frontend' / 'dist' / 'iie-white.png',
            Path(settings.BASE_DIR) / 'frontend' / 'src' / 'assets' / 'brand-logo.png',
            Path(settings.BASE_DIR) / 'frontend' / 'dist' / 'brand-logo.png',
            Path(settings.BASE_DIR) / 'frontend' / 'dist' / 'receipt-logo.png',
        ]
        for logo_path in logo_candidates:
            if logo_path.exists():
                return f"data:image/png;base64,{base64.b64encode(logo_path.read_bytes()).decode('ascii')}"
        return ''

    def _build_receipt_html(self, receipt):
        logo_src = self._logo_src()
        generated_by = receipt.generated_by.full_name if receipt.generated_by else 'Admin'
        amount = Decimal(str(receipt.amount or 0))
        notes_row = ''
        if receipt.notes:
            notes_row = f'<div class="field field-wide"><div class="label">NOTES</div><div class="value">{escape(receipt.notes)}</div></div>'
        return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>{escape(receipt.receipt_number or 'Receipt')}</title>
    <style>
      * {{ box-sizing: border-box; }}
      body {{ font-family: Libertine, "Linux Libertine", "Libertinus Serif", Georgia, "Times New Roman", serif; color: #111827; margin: 14px; background: #F8FAFC; }}
      .sheet {{ max-width: 780px; margin: 0 auto; border: 1px solid #CBD5E1; background: white; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }}
      .header {{ display: grid; grid-template-columns: 68px minmax(0, 1fr); gap: 18px; align-items: center; padding: 11px 22px; background: #1E3A5F; color: white; }}
      .logo {{ display: flex; align-items: center; justify-content: flex-start; }}
      .logo img {{ width: auto; height: 48px; object-fit: contain; display: block; }}
      .brand {{ align-self: center; min-width: 0; text-align: center; padding-right: 68px; }}
      .brand h1 {{ margin: 0 0 3px; font-size: 20px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: white; }}
      .brand .tagline {{ margin: 0 0 4px; font-size: 12.5px; font-weight: 600; color: #F8FAFC; }}
      .brand .address {{ margin: 0 0 4px; }}
      .brand .address p {{ margin: 1px 0; font-size: 10.8px; line-height: 1.22; color: #F8FAFC; }}
      .brand .phone {{ margin: 0; font-size: 11px; line-height: 1.2; color: #F8FAFC; }}
      .receipt-bar {{ display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 38px; padding: 9px 18px; border-bottom: 1px solid #CBD5E1; background: #ffffff; }}
      .receipt-title {{ font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; color: #111827; line-height: 1.1; }}
      .receipt-no {{ font-size: 12px; font-weight: 800; color: #1E3A5F; line-height: 1.1; }}
      .section {{ padding: 14px 18px; border-bottom: 1px solid #CBD5E1; background: #ffffff; }}
      .grid {{ display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 24px; row-gap: 10px; }}
      .field {{ display: grid; grid-template-columns: 145px minmax(0, 220px); gap: 10px; align-items: baseline; min-height: 22px; }}
      .field-wide {{ grid-column: 1 / -1; grid-template-columns: 145px minmax(0, 1fr); }}
      .label {{ font-size: 9.8px; text-transform: uppercase; letter-spacing: 0.07em; color: #334155; line-height: 1.2; }}
      .value {{ font-size: 12.2px; font-weight: 800; color: #111827; line-height: 1.35; text-align: left; }}
      .amount {{ color: #1E3A5F; }}
      .generated-info {{ padding: 18px 24px; background: white; color: #334155; font-size: 11.5px; line-height: 1.8; }}
      .generated-info p {{ margin: 0; }}
      .generated-info .info-label {{ font-weight: 700; }}
      .generated-info .info-value {{ font-weight: 400; color: #111827; }}
      .bottom {{ display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 52px; margin-top: 8px; padding: 10px 24px; background: #1E3A5F; border-top: 1px solid #d6dce5; color: white; font-size: 13px; line-height: 1.35; }}
      @media print {{
        body {{ margin: 0; background: white; }}
        .sheet {{ border: 1px solid #CBD5E1; max-width: none; box-shadow: none; }}
        .header, .bottom {{ print-color-adjust: exact; -webkit-print-color-adjust: exact; }}
      }}
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div class="logo">
          {'<img src="' + logo_src + '" alt="Indra Institute of Education logo">' if logo_src else ''}
        </div>
        <div class="brand">
          <h1>Indra Institute of Education</h1>
          <div class="tagline">IT Training &amp; Testing Services</div>
          <div class="address">
            <p>First Floor, AAKIFAH 2017 Complex, Palghat Main Road,</p>
            <p>Near Muthoot Finance, Kuniyamuthur, Coimbatore - 641008</p>
          </div>
          <p class="phone">Phone number not set</p>
        </div>
      </div>
      <div class="receipt-bar">
        <div class="receipt-title">PAYMENT RECEIPT</div>
        <div class="receipt-no">Receipt No: {escape(receipt.receipt_number)}</div>
      </div>
      <div class="section">
        <div class="grid">
          <div class="field"><div class="label">RECEIPT NO</div><div class="value">{escape(receipt.receipt_number)}</div></div>
          <div class="field"><div class="label">PAYMENT DATE</div><div class="value">{escape(self._receipt_date(receipt.payment_date))}</div></div>
          <div class="field"><div class="label">NAME</div><div class="value">{escape(receipt.name)}</div></div>
          <div class="field"><div class="label">PHONE NUMBER</div><div class="value">{escape(receipt.phone)}</div></div>
          <div class="field"><div class="label">PURPOSE</div><div class="value">{escape(receipt.purpose)}</div></div>
          <div class="field"><div class="label">PAYMENT MODE</div><div class="value">{escape(receipt.get_payment_mode_display())}</div></div>
          <div class="field"><div class="label">AMOUNT</div><div class="value amount">Rs {amount:,.2f}</div></div>
          {notes_row}
        </div>
      </div>
      <div class="generated-info">
        <p><span class="info-label">GENERATED BY:</span> <span class="info-value">{escape(generated_by)}</span></p>
        <p><span class="info-label">GENERATED ON:</span> <span class="info-value">{escape(self._receipt_date(receipt.generated_on))}</span></p>
      </div>
      <div class="bottom">
        <div>Fees once paid cannot be refunded.</div>
        <div>This is a computer-generated bill, no signature required.</div>
      </div>
    </div>
  </body>
</html>"""

    def _build_receipt_pdf(self, receipt):
        try:
            from PIL import Image, ImageDraw, ImageFont
        except ImportError as exc:
            raise RuntimeError('Pillow is required to generate receipt PDFs.') from exc

        width, height = 1240, 1754
        margin = 82
        navy = '#1E3A5F'
        slate = '#334155'
        border = '#CBD5E1'
        page = Image.new('RGB', (width, height), 'white')
        draw = ImageDraw.Draw(page)
        font = ImageFont.load_default()
        title_font = ImageFont.load_default()
        label_font = ImageFont.load_default()

        draw.rectangle((0, 0, width, 170), fill=navy)
        logo_candidates = [
            Path(settings.BASE_DIR) / 'frontend' / 'public' / 'iie-white.png',
            Path(settings.BASE_DIR) / 'frontend' / 'src' / 'assets' / 'brand-logo.png',
        ]
        for logo_path in logo_candidates:
            if logo_path.exists():
                logo = Image.open(logo_path).convert('RGBA')
                logo.thumbnail((112, 112))
                page.paste(logo, (margin, 28), logo)
                break

        def center_text(text, y, fill='white'):
            bbox = draw.textbbox((0, 0), text, font=title_font)
            draw.text(((width - (bbox[2] - bbox[0])) / 2, y), text, fill=fill, font=title_font)

        center_text('INDRA INSTITUTE OF EDUCATION', 34)
        center_text('IT Training & Testing Services', 66)
        center_text('First Floor, AAKIFAH 2017 Complex, Palghat Main Road,', 98)
        center_text('Near Muthoot Finance, Kuniyamuthur, Coimbatore - 641008', 124)

        y = 170
        draw.rectangle((0, y, width, y + 70), fill='white', outline=border)
        draw.text((margin, y + 24), 'PAYMENT RECEIPT', fill='black', font=title_font)
        receipt_label = f'Receipt No: {receipt.receipt_number}'
        receipt_bbox = draw.textbbox((0, 0), receipt_label, font=title_font)
        draw.text((width - margin - (receipt_bbox[2] - receipt_bbox[0]), y + 24), receipt_label, fill=navy, font=title_font)

        y += 110
        amount = Decimal(str(receipt.amount or 0))
        fields = [
            ('RECEIPT NO', receipt.receipt_number),
            ('PAYMENT DATE', self._receipt_date(receipt.payment_date)),
            ('NAME', receipt.name),
            ('PHONE NUMBER', receipt.phone),
            ('PURPOSE', receipt.purpose),
            ('PAYMENT MODE', receipt.get_payment_mode_display()),
            ('AMOUNT', f'Rs {amount:,.2f}'),
        ]
        if receipt.notes:
            fields.append(('NOTES', receipt.notes))

        col_width = (width - (margin * 2) - 40) / 2
        row_height = 76
        for index, (label, value) in enumerate(fields):
            col = index % 2
            row = index // 2
            x = margin + col * (col_width + 40)
            row_y = y + row * row_height
            if label == 'NOTES':
                x = margin
                col_width = width - (margin * 2)
            draw.text((x, row_y), label, fill=slate, font=label_font)
            lines = wrap_text(draw, str(value), font, int(col_width))
            for line_index, line in enumerate(lines[:3]):
                draw.text((x, row_y + 26 + (line_index * 22)), line, fill='black', font=font)

        generated_by = receipt.generated_by.full_name if receipt.generated_by else 'Admin'
        info_y = y + (((len(fields) + 1) // 2) * row_height) + 55
        draw.line((margin, info_y - 24, width - margin, info_y - 24), fill=border, width=2)
        draw.text((margin, info_y), f'GENERATED BY: {generated_by}', fill=slate, font=font)
        draw.text((margin, info_y + 34), f'GENERATED ON: {self._receipt_date(receipt.generated_on)}', fill=slate, font=font)

        footer_y = height - 92
        draw.rectangle((0, footer_y, width, height), fill=navy)
        draw.text((margin, footer_y + 34), 'Fees once paid cannot be refunded.', fill='white', font=font)
        footer_text = 'This is a computer-generated bill, no signature required.'
        footer_bbox = draw.textbbox((0, 0), footer_text, font=font)
        draw.text((width - margin - (footer_bbox[2] - footer_bbox[0]), footer_y + 34), footer_text, fill='white', font=font)

        output = io.BytesIO()
        page.save(output, format='PDF')
        output.seek(0)
        return output.read()

    @action(detail=True, methods=['get'], url_path='view-receipt')
    def view_receipt(self, request, pk=None):
        receipt = self.get_object()
        response = HttpResponse(self._build_receipt_pdf(receipt), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{receipt.receipt_number}.pdf"'
        return response

    @action(detail=True, methods=['get'], url_path='download-receipt')
    def download_receipt(self, request, pk=None):
        receipt = self.get_object()
        response = HttpResponse(self._build_receipt_pdf(receipt), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{receipt.receipt_number}.pdf"'
        return response


def next_birthday(dob, today):
    try:
        birthday = dob.replace(year=today.year)
    except ValueError:
        birthday = dob.replace(year=today.year, month=2, day=28)
    if birthday < today:
        try:
            birthday = dob.replace(year=today.year + 1)
        except ValueError:
            birthday = dob.replace(year=today.year + 1, month=2, day=28)
    return birthday


def rating_stars(score):
    if score >= 90:
        return 5
    if score >= 75:
        return 4
    if score >= 60:
        return 3
    if score >= 40:
        return 2
    return 1


def month_window(year, month):
    start = timezone.datetime(year, month, 1).date()
    end = start.replace(day=monthrange(year, month)[1])
    return start, end


def previous_months(count=3, start_date=None):
    current = start_date or timezone.localdate()
    year = current.year
    month = current.month
    result = []
    for _ in range(count):
        result.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return result


def calculate_user_monthly_rating(user, year=None, month=None):
    if user.role == User.Role.SUPER_ADMIN:
        return None

    today = timezone.localdate()
    year = year or today.year
    month = month or today.month
    start, end = month_window(year, month)
    effective_end = min(end, today)
    score = 100
    breakdown = {}

    def deduct(key, points, detail):
        nonlocal score
        score -= points
        breakdown[key] = {'deduction': points, 'detail': detail}

    lead_qs = Lead.objects.filter(created_by=user, created_at__date__gte=start, created_at__date__lte=end)
    walkin_qs = WalkIn.objects.filter(created_by=user, visit_date__gte=start, visit_date__lte=end)
    enroll_qs = Enrollment.objects.filter(created_by=user, enrollment_date__gte=start, enrollment_date__lte=end)
    lead_count = lead_qs.count()
    enroll_count = enroll_qs.count()
    conversion_rate = 100 if lead_count == 0 else (enroll_count / lead_count) * 100
    if conversion_rate < 55:
        deduct('conversion_rate', 20, f'Conversion rate {conversion_rate:.2f}% is below 55%.')
    elif conversion_rate < 70:
        deduct('conversion_rate', 10, f'Conversion rate {conversion_rate:.2f}% is between 55% and 70%.')
    else:
        breakdown['conversion_rate'] = {'deduction': 0, 'detail': f'Conversion rate {conversion_rate:.2f}%.'}

    overdue_payments = Payment.objects.filter(
        enrollment__created_by=user,
        status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL],
        next_payment_date__gte=start,
        next_payment_date__lte=effective_end,
    )
    if overdue_payments.filter(status=Payment.Status.UNPAID).exists():
        deduct('payment_reminder', 10, 'Missed payment reminder found for an unpaid due payment.')
    elif overdue_payments.filter(status=Payment.Status.PARTIAL).exists():
        deduct('payment_reminder', 5, 'Delayed payment reminder found for a partial due payment.')
    else:
        breakdown['payment_reminder'] = {'deduction': 0, 'detail': 'No missed or delayed payment reminders detected.'}

    pending_not_collected = overdue_payments.exists()
    if pending_not_collected:
        deduct('payment_collection', 15, 'Pending payment due in the month was not fully collected.')
    else:
        breakdown['payment_collection'] = {'deduction': 0, 'detail': 'No pending uncollected due payment detected.'}

    birthday_count = Enrollment.objects.filter(
        branch=user.branch,
        dob__month=month,
    ).exclude(dob__isnull=True).count() if user.branch_id else 0
    birthday_sent = WhatsAppMessage.objects.filter(
        sent_by=user,
        message_type=WhatsAppMessage.MsgType.BIRTHDAY,
        created_at__date__gte=start,
        created_at__date__lte=end,
    ).exists()
    if birthday_count and not birthday_sent:
        deduct('birthday_wishes', 5, 'Birthday window had students but no birthday wish log was found.')
    else:
        breakdown['birthday_wishes'] = {'deduction': 0, 'detail': 'Birthday wish requirement met or no birthdays detected.'}

    missed_lead_followups = Lead.objects.filter(
        created_by=user,
        next_follow_up_date__gte=start,
        next_follow_up_date__lt=effective_end,
    ).exclude(status__in=[Lead.Status.ENROLLED, Lead.Status.CONVERTED, Lead.Status.DROPPED, Lead.Status.LOST]).exists()
    if missed_lead_followups:
        deduct('lead_followups', 10, 'Lead follow-up due date was missed.')
    else:
        breakdown['lead_followups'] = {'deduction': 0, 'detail': 'No missed lead follow-ups detected.'}

    missed_walkin_followups = WalkIn.objects.filter(
        created_by=user,
        follow_up_date__gte=start,
        follow_up_date__lt=effective_end,
    ).exclude(status__in=[WalkIn.Status.CONVERTED, WalkIn.Status.NOT_INTERESTED]).exists()
    if missed_walkin_followups:
        deduct('walkin_followups', 10, 'Walk-in follow-up due date was missed.')
    else:
        breakdown['walkin_followups'] = {'deduction': 0, 'detail': 'No missed walk-in follow-ups detected.'}

    late_response_cutoff = timezone.now() - timedelta(days=1)
    late_response = Lead.objects.filter(
        created_by=user,
        created_at__date__gte=start,
        created_at__date__lte=end,
        created_at__lt=late_response_cutoff,
        status=Lead.Status.NEW,
    ).exists()
    if late_response:
        deduct('response_time', 10, 'New lead remained unanswered for more than one day.')
    else:
        breakdown['response_time'] = {'deduction': 0, 'detail': 'No late new-lead response detected.'}

    active_login = UserSessionLog.objects.filter(
        user=user,
        login_at__date__gte=start,
        login_at__date__lte=end,
    ).exists()
    if not active_login:
        deduct('activity', 5, 'No login activity found for the month.')
    else:
        breakdown['activity'] = {'deduction': 0, 'detail': 'Login activity found for the month.'}

    target = BranchTarget.objects.filter(branch=user.branch, year=year, month=month).first()
    target_not_achieved = False
    if target:
        target_not_achieved = (
            lead_qs.count() < target.lead_target
            or walkin_qs.count() < target.walkin_target
            or enroll_qs.count() < target.enroll_target
        )
    if target_not_achieved:
        deduct('target_achievement', 15, 'Monthly target was not achieved.')
    else:
        breakdown['target_achievement'] = {'deduction': 0, 'detail': 'Monthly target achieved or no user target set.'}

    score = max(0, min(100, score))
    rating, _ = UserMonthlyRating.objects.update_or_create(
        user=user,
        year=year,
        month=month,
        defaults={
            'score': score,
            'stars': rating_stars(score),
            'breakdown': breakdown,
        },
    )
    return rating


class DashboardSummaryView(APIView):
    """
    GET /api/dashboard/summary/
    Returns KPI tiles for the logged-in user (branch-scoped for staff).
    """
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        user    = request.user
        today   = timezone.localdate()
        year = today.year
        month = today.month

        # Branch filter
        lead_qs   = Lead.objects.all()
        walkin_qs = WalkIn.objects.all()
        enroll_qs = Enrollment.objects.all()
        pay_qs    = Payment.objects.all()
        collection_qs = PaymentInstallment.objects.all()
        transfer_qs = BranchTransferRequest.objects.filter(status=BranchTransferRequest.Status.PENDING)
        target_qs = BranchTarget.objects.filter(year=year, month=month)
        selected_branch = None

        if not user.is_super_admin:
            lead_qs = lead_qs.filter(branch=user.branch)
            walkin_qs = walkin_qs.filter(branch=user.branch)
            enroll_qs = enroll_qs.filter(branch=user.branch)
            pay_qs = pay_qs.filter(enrollment__branch=user.branch)
            collection_qs = collection_qs.filter(enrollment__branch=user.branch)
            transfer_qs = transfer_qs.filter(Q(current_branch=user.branch) | Q(requested_branch=user.branch))
            target_qs = target_qs.filter(branch=user.branch)
            selected_branch = user.branch
        else:
            branch_id = request.query_params.get('branch')
            if branch_id:
                selected_branch = Branch.objects.filter(pk=branch_id, is_active=True).first()
                if selected_branch:
                    lead_qs = lead_qs.filter(branch=selected_branch)
                    walkin_qs = walkin_qs.filter(branch=selected_branch)
                    enroll_qs = enroll_qs.filter(branch=selected_branch)
                    pay_qs = pay_qs.filter(enrollment__branch=selected_branch)
                    collection_qs = collection_qs.filter(enrollment__branch=selected_branch)
                    transfer_qs = transfer_qs.filter(Q(current_branch=selected_branch) | Q(requested_branch=selected_branch))
                    target_qs = target_qs.filter(branch=selected_branch)

        total_fee_amount = pay_qs.aggregate(total=Sum('total_fees'))['total'] or 0
        total_paid_amount = pay_qs.aggregate(total=Sum('paid_amount'))['total'] or 0
        value_this_month = enroll_qs.filter(enrollment_date__year=year, enrollment_date__month=month).aggregate(
            total=Sum('final_fees')
        )['total'] or 0
        current_month_collected_amount = collection_qs.filter(
            payment_date__year=year,
            payment_date__month=month,
        ).aggregate(total=Sum('amount'))['total'] or 0
        target_count = target_qs.count()
        target_totals = target_qs.aggregate(
            lead_target=Sum('lead_target'),
            walkin_target=Sum('walkin_target'),
            enroll_target=Sum('enroll_target'),
            value_target=Sum('revenue_target'),
        )
        birthday_rows = []
        if not user.is_super_admin:
            birthday_start = today
            birthday_end = today + timedelta(days=6)
            birthday_rows = [
                {
                    'id': enrollment.id,
                    'name': enrollment.name,
                    'phone': enrollment.phone,
                    'birthday_date': next_birthday(enrollment.dob, today),
                    'days_left': (next_birthday(enrollment.dob, today) - today).days,
                    'course_name': enrollment.course.name if enrollment.course else '',
                    'branch_name': enrollment.branch.name if enrollment.branch else '',
                }
                for enrollment in enroll_qs.exclude(dob__isnull=True).select_related('course', 'branch').order_by('name')
                if birthday_start <= next_birthday(enrollment.dob, today) <= birthday_end
            ]
            birthday_rows.sort(key=lambda row: (row['days_left'], row['name']))

        week_start = today - timedelta(days=(today.weekday() + 1) % 7)
        week_end = week_start + timedelta(days=6)
        active_pending_due_qs = pay_qs.filter(
            status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL],
            paid_amount__lt=F('total_fees'),
            next_payment_date__isnull=False,
            next_payment_date__lte=today,
        )
        weekly_pending_qs = pay_qs.filter(
            status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL],
            paid_amount__lt=F('total_fees'),
            next_payment_date__isnull=False,
            next_payment_date__gte=week_start,
            next_payment_date__lte=week_end,
        )
        weekly_totals = weekly_pending_qs.aggregate(
            total=Sum('total_fees'),
            paid=Sum('paid_amount'),
        )
        weekly_pending_amount = (weekly_totals['total'] or 0) - (weekly_totals['paid'] or 0)
        leads_this_month = lead_qs.filter(created_at__year=year, created_at__month=month).count()
        walkins_this_month = walkin_qs.filter(visit_date__year=year, visit_date__month=month).count()
        enroll_this_month = enroll_qs.filter(enrollment_date__year=year, enrollment_date__month=month).count()
        conversion_rate = round((enroll_this_month / leads_this_month) * 100, 2) if leads_this_month else 0

        return Response({
            'total_leads':        lead_qs.count(),
            'leads_this_month':   leads_this_month,
            'leads_followup_today': active_lead_follow_up_queryset(
                lead_qs,
                'next_follow_up_date',
                today,
            ).count(),
            'total_walkins':      walkin_qs.count(),
            'walkins_this_month': walkins_this_month,
            'walkins_followup_today': active_walkin_follow_up_queryset(
                walkin_qs,
                'follow_up_date',
                today,
            ).count(),
            'total_enrollments':  enroll_qs.count(),
            'enroll_this_month':  enroll_this_month,
            'conversion_rate':    conversion_rate,
            'total_revenue':      pay_qs.aggregate(r=Sum('paid_amount'))['r'] or 0,
            'value_this_month':   value_this_month,
            'revenue_this_month': value_this_month,
            'current_month_collected_amount': current_month_collected_amount,
            'monthly_collection': current_month_collected_amount,
            'pending_payments':   active_pending_due_qs.count(),
            'this_week_pending_payments': weekly_pending_amount,
            'pending_transfer_requests': transfer_qs.count(),
            'pending_amount':     total_fee_amount - total_paid_amount,
            'targets_set':        target_count > 0,
            'lead_target':        target_totals['lead_target'] if target_count else None,
            'walkin_target':      target_totals['walkin_target'] if target_count else None,
            'enroll_target':      target_totals['enroll_target'] if target_count else None,
            'value_target':       target_totals['value_target'] if target_count else None,
            'revenue_target':     target_totals['value_target'] if target_count else None,
            'today_birthdays':    birthday_rows,
            'selected_branch_id':  selected_branch.id if selected_branch else None,
            'selected_branch_name': selected_branch.name if selected_branch else 'All Branches',
            'performance_scope': 'branch' if user.is_super_admin else 'user',
        })


class DashboardBranchComparisonView(APIView):
    """GET /api/dashboard/branch-comparison/ — Super admin only."""
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        branches  = Branch.objects.filter(is_active=True)
        month_str = request.query_params.get('month', timezone.now().strftime('%Y-%m'))

        data = []
        for branch in branches:
            year, month = map(int, month_str.split('-'))
            enroll = Enrollment.objects.filter(
                branch=branch, enrollment_date__year=year, enrollment_date__month=month
            )
            data.append({
                'branch_id':   branch.id,
                'branch_name': branch.name,
                'leads':       Lead.objects.filter(branch=branch, created_at__year=year,
                                                   created_at__month=month).count(),
                'walkins':     WalkIn.objects.filter(branch=branch, visit_date__year=year,
                                                     visit_date__month=month).count(),
                'enrollments': enroll.count(),
                'value':       enroll.aggregate(v=Sum('final_fees'))['v'] or 0,
            })
        return Response(data)


class DashboardTrendView(APIView):
    """GET /api/dashboard/trends/?days=30 — daily trend data."""
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        days   = int(request.query_params.get('days', 30))
        user   = request.user
        result = []

        for i in range(days - 1, -1, -1):
            day = (timezone.now() - timedelta(days=i)).date()
            lead_qs   = Lead.objects.filter(created_at__date=day)
            walkin_qs = WalkIn.objects.filter(visit_date=day)
            enroll_qs = Enrollment.objects.filter(enrollment_date=day)

            if not user.is_super_admin:
                lead_qs   = lead_qs.filter(branch=user.branch)
                walkin_qs = walkin_qs.filter(branch=user.branch)
                enroll_qs = enroll_qs.filter(branch=user.branch)

            result.append({
                'date':        str(day),
                'leads':       lead_qs.count(),
                'walkins':     walkin_qs.count(),
                'enrollments': enroll_qs.count(),
            })
        return Response(result)


class DashboardHistoricalAnalyticsView(APIView):
    """
    GET /api/dashboard/historical-analytics/?branch=all
    Returns current-month historical analytics compared across 2023-2025.
    """
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        user = request.user
        current_month = timezone.localdate().month
        queryset = HistoricalAnalyticsEntry.objects.filter(
            year__in=[2023, 2024, 2025],
            month=current_month,
        )
        selected_branch = None

        if user.is_super_admin:
            branch_id = request.query_params.get('branch')
            if branch_id and branch_id != 'all':
                selected_branch = Branch.objects.filter(pk=branch_id, is_active=True).first()
                if not selected_branch:
                    return Response({'detail': 'Branch not found.'}, status=status.HTTP_404_NOT_FOUND)
                queryset = queryset.filter(branch=selected_branch)
        else:
            selected_branch = user.branch
            if not selected_branch:
                queryset = queryset.none()
            else:
                queryset = queryset.filter(branch=selected_branch)

        year_rows = {
            year: {
                'year': year,
                'label': str(year),
                'leads': 0,
                'walkins': 0,
                'enrollments': 0,
                'value_amount': Decimal('0'),
            }
            for year in (2023, 2024, 2025)
        }

        for row in queryset.values('year').annotate(
            leads=Sum('leads_count'),
            walkins=Sum('walkins_count'),
            enrollments=Sum('enrollments_count'),
            value_amount=Sum('value_amount'),
        ):
            year = row['year']
            year_rows[year]['leads'] = row['leads'] or 0
            year_rows[year]['walkins'] = row['walkins'] or 0
            year_rows[year]['enrollments'] = row['enrollments'] or 0
            year_rows[year]['value_amount'] = row['value_amount'] or Decimal('0')

        return Response({
            'month': current_month,
            'month_name': month_abbr[current_month],
            'branch_id': selected_branch.id if selected_branch else None,
            'branch_name': selected_branch.name if selected_branch else 'All Branches',
            'results': [year_rows[year] for year in (2023, 2024, 2025)],
        })


class DashboardMyRatingView(APIView):
    """GET /api/dashboard/my-rating/ - current user's monthly star rating."""
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        if request.user.role == User.Role.SUPER_ADMIN:
            return Response({'detail': 'Star rating applies only to users.'}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.localdate()
        rating = calculate_user_monthly_rating(request.user, today.year, today.month)
        return Response(UserMonthlyRatingSerializer(rating).data)


class UserRatingReportView(APIView):
    """GET /api/reports/user-ratings/ - last 3 months user star ratings."""
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        months = previous_months(3)
        users = User.objects.filter(is_active=True).exclude(role=User.Role.SUPER_ADMIN).select_related('branch').order_by('username')
        rows = []
        for user in users:
            ratings = []
            for year, month in months:
                rating = calculate_user_monthly_rating(user, year, month)
                ratings.append(UserMonthlyRatingSerializer(rating).data)
            rows.append({
                'user_id': user.id,
                'username': user.username,
                'full_name': user.full_name,
                'branch_name': user.branch.name if user.branch else None,
                'ratings': ratings,
            })
        return Response({
            'months': [{'year': year, 'month': month} for year, month in months],
            'results': rows,
        })


class ConversionFunnelReportView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        year = int(request.query_params.get('year') or timezone.localdate().year)
        month = int(request.query_params.get('month') or timezone.localdate().month)
        branch_id = request.query_params.get('branch')
        lead_qs = Lead.objects.filter(created_at__year=year, created_at__month=month)
        walkin_qs = WalkIn.objects.filter(visit_date__year=year, visit_date__month=month)
        enroll_qs = Enrollment.objects.filter(enrollment_date__year=year, enrollment_date__month=month)
        if branch_id and branch_id != 'all':
            lead_qs = lead_qs.filter(branch_id=branch_id)
            walkin_qs = walkin_qs.filter(branch_id=branch_id)
            enroll_qs = enroll_qs.filter(branch_id=branch_id)
        total_leads = lead_qs.count()
        contacted = lead_qs.filter(status__in=[Lead.Status.CONTACTED, Lead.Status.INTERESTED, Lead.Status.FOLLOW_UP, Lead.Status.WALK_IN, Lead.Status.ENROLLED, Lead.Status.CONVERTED]).count()
        walkins = walkin_qs.count()
        enrollments = enroll_qs.count()

        def pct(value, base):
            return round((value / base) * 100, 2) if base else 0

        return Response({
            'filters': {'year': year, 'month': month, 'branch': branch_id or 'all'},
            'funnel': [
                {'stage': 'Leads', 'count': total_leads, 'conversion_percent': 100 if total_leads else 0},
                {'stage': 'Contacted', 'count': contacted, 'conversion_percent': pct(contacted, total_leads)},
                {'stage': 'Walk-ins', 'count': walkins, 'conversion_percent': pct(walkins, total_leads)},
                {'stage': 'Enrollments', 'count': enrollments, 'conversion_percent': pct(enrollments, total_leads)},
            ],
        })


class BranchPerformanceComparisonReportView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        year = int(request.query_params.get('year') or timezone.localdate().year)
        month = int(request.query_params.get('month') or timezone.localdate().month)
        today = timezone.localdate()
        rows = []
        for branch in Branch.objects.filter(is_active=True).order_by('name'):
            leads = Lead.objects.filter(branch=branch, created_at__year=year, created_at__month=month)
            walkins = WalkIn.objects.filter(branch=branch, visit_date__year=year, visit_date__month=month)
            enrollments = Enrollment.objects.filter(branch=branch, enrollment_date__year=year, enrollment_date__month=month)
            payments = Payment.objects.filter(enrollment__branch=branch)
            target = BranchTarget.objects.filter(branch=branch, year=year, month=month).first()
            missed_leads = Lead.objects.filter(branch=branch, next_follow_up_date__lt=today).exclude(status__in=[Lead.Status.ENROLLED, Lead.Status.CONVERTED, Lead.Status.DROPPED, Lead.Status.LOST]).count()
            missed_walkins = WalkIn.objects.filter(branch=branch, follow_up_date__lt=today).exclude(status__in=[WalkIn.Status.CONVERTED, WalkIn.Status.NOT_INTERESTED]).count()
            completed_followups = FollowUp.objects.filter(created_at__year=year, created_at__month=month).filter(
                Q(record_type=FollowUp.RecordType.LEAD, record_id__in=leads.values('id')) |
                Q(record_type=FollowUp.RecordType.WALKIN, record_id__in=walkins.values('id'))
            ).count()
            due_followups = missed_leads + missed_walkins + completed_followups
            value = enrollments.aggregate(total=Sum('final_fees'))['total'] or 0
            target_score = 0
            if target:
                achieved = sum([
                    leads.count() >= target.lead_target,
                    walkins.count() >= target.walkin_target,
                    enrollments.count() >= target.enroll_target,
                    value >= target.revenue_target,
                ])
                target_score = round((achieved / 4) * 100, 2)
            pending_totals = payments.filter(status__in=[Payment.Status.UNPAID, Payment.Status.PARTIAL]).aggregate(
                total=Sum('total_fees'), paid=Sum('paid_amount')
            )
            rows.append({
                'branch_id': branch.id,
                'branch_name': branch.name,
                'leads': leads.count(),
                'walkins': walkins.count(),
                'enrollments': enrollments.count(),
                'value': value,
                'target_achievement': target_score,
                'follow_up_completion': round((completed_followups / due_followups) * 100, 2) if due_followups else 100,
                'payment_pending': (pending_totals['total'] or 0) - (pending_totals['paid'] or 0),
                'missed_followups': missed_leads + missed_walkins,
            })
        return Response(rows)


class ExportLeadsExcelView(APIView):
    """GET /api/reports/export/leads/ — Download leads as Excel."""
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        try:
            import openpyxl
        except ImportError:
            return Response(
                {'detail': 'Excel export is unavailable because openpyxl is not installed.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        qs = Lead.objects.select_related('course','branch','assigned_to').order_by('-created_at')
        if not request.user.is_super_admin:
            qs = qs.filter(branch=request.user.branch)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Leads'
        headers = ['Lead No','Name','Phone','Location','Course',
                   'Status','Source','Walk-in Date','Branch','Assigned To','Created']
        ws.append(headers)

        for lead in qs:
            ws.append([
                lead.lead_number, lead.name, lead.phone, lead.location,
                lead.course.name if lead.course else '',
                lead.get_status_display(), lead.get_source_display(),
                str(lead.walkin_date) if lead.walkin_date else '',
                lead.branch.name if lead.branch else '',
                lead.assigned_to.full_name if lead.assigned_to else '',
                lead.created_at.strftime('%Y-%m-%d %H:%M'),
            ])

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="leads_export.xlsx"'
        return response


class ExportEnrollmentsExcelView(APIView):
    """GET /api/reports/export/enrollments/"""
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        try:
            import openpyxl
        except ImportError:
            return Response(
                {'detail': 'Excel export is unavailable because openpyxl is not installed.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        qs = Enrollment.objects.select_related(
            'course','branch','enrolled_by','payment'
        ).order_by('-enrollment_date')
        if not request.user.is_super_admin:
            qs = qs.filter(branch=request.user.branch)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Enrollments'
        headers = ['Student ID','Name','Phone','Email','Course','Branch',
                   'Actual Fees','Discount','Final Fees','Start Date',
                   'Enrollment Date','Status','Payment Status','Paid','Balance']
        ws.append(headers)

        for enroll in qs:
            pay = getattr(enroll, 'payment', None)
            ws.append([
                enroll.student_number, enroll.name, enroll.phone, enroll.email,
                enroll.course.name, enroll.branch.name if enroll.branch else '',
                float(enroll.actual_fees), float(enroll.discount_amount), float(enroll.final_fees),
                str(enroll.start_date) if enroll.start_date else '',
                str(enroll.enrollment_date), enroll.get_status_display(),
                pay.get_status_display() if pay else '',
                float(pay.paid_amount) if pay else 0,
                float(pay.balance) if pay else float(enroll.final_fees),
            ])

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="enrollments_export.xlsx"'
        return response
