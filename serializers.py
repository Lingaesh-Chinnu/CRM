# ============================================================
# backend/apps/accounts/serializers.py
# ============================================================
import re
from calendar import monthrange
from datetime import date, timedelta

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.core.files.storage import default_storage
from django.db.models import BooleanField, Case, Value, When
from django.db.utils import OperationalError, ProgrammingError
from crm.models import Branch, UserTarget, UserMonthlyRating, BranchTarget, HistoricalAnalyticsEntry, UserSessionLog, TeamNotice, TeamNoticeReply

User = get_user_model()


def user_identity_payload(user):
    if not user:
        return None
    return {
        'id': user.id,
        'name': user.full_name or user.username,
        'branch_id': user.branch_id,
        'branch_name': user.branch.name if user.branch else '',
        'identity_color': getattr(user, 'identity_color', '') or '',
    }


QUALIFICATION_KPI_FIELDS = (
    'expected_course_budget',
    'planned_joining_time',
    'primary_goal',
    'other_institutes_considering',
    'counselor_status',
    'competitor_status',
    'follow_up_priority',
    'conversion_probability',
)


def enrollment_counselor(enrollment):
    return getattr(enrollment, 'counselor', None) or getattr(enrollment, 'created_by', None) or getattr(enrollment, 'enrolled_by', None)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds user info payload to JWT tokens."""

    @staticmethod
    def effective_role(user):
        return User.Role.SUPER_ADMIN if user.is_super_admin else user.role

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Custom claims injected into the JWT payload
        token['username']  = user.username
        token['full_name'] = user.full_name
        token['role']      = cls.effective_role(user)
        token['branch_id'] = user.branch_id
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        # Also return user info in the response body
        data['user'] = {
            'id':         self.user.id,
            'username':   self.user.username,
            'full_name':  self.user.full_name,
            'email':      self.user.email,
            'role':       self.effective_role(self.user),
            'branch_id':  self.user.branch_id,
            'branch_name': self.user.branch.name if self.user.branch else None,
            'identity_color': self.user.identity_color or '',
            'must_change_password': self.user.must_change_password,
        }
        return data


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Branch
        fields = '__all__'

    def validate_branch_code(self, value):
        if value in (None, ''):
            return value
        code = str(value).strip().zfill(2)
        if not code.isdigit() or len(code) != 2:
            raise serializers.ValidationError('Branch code must be a 2 digit number.')
        queryset = Branch.objects.filter(branch_code=code)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError('Branch code must be unique.')
        return code


class UserSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    full_name   = serializers.SerializerMethodField()
    password    = serializers.CharField(write_only=True, required=True, allow_blank=False)

    class Meta:
        model  = User
        fields = ['id','username','email','first_name','last_name','full_name',
                  'phone','role','branch','branch_name','identity_color','is_active',
                  'must_change_password','created_at','password']
        read_only_fields = ['must_change_password']

    def get_full_name(self, obj):
        return obj.full_name

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_super_admin:
            data['role'] = User.Role.SUPER_ADMIN
        return data

    def create(self, validated_data):
        password = validated_data.pop('password')
        user     = User(**validated_data)
        if user.role == User.Role.SUPER_ADMIN:
            user.is_staff = True
            user.is_superuser = True
        user.set_password(password)
        user.save()
        user._plain_password = password
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        if instance.role == User.Role.SUPER_ADMIN:
            instance.is_staff = True
            instance.is_superuser = True
        else:
            instance.is_staff = False
            instance.is_superuser = False
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UserTargetSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model  = UserTarget
        fields = '__all__'

    def validate_user(self, value):
        if getattr(value, 'role', None) == User.Role.SUPER_ADMIN:
            raise serializers.ValidationError('Targets can only be assigned to staff users.')
        return value


class BranchTargetSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    value_target = serializers.DecimalField(
        source='revenue_target',
        max_digits=12,
        decimal_places=2,
        required=False,
    )

    class Meta:
        model = BranchTarget
        fields = ['id', 'branch', 'branch_name', 'month', 'year', 'lead_target', 'walkin_target',
                  'enroll_target', 'value_target', 'revenue_target', 'created_by',
                  'created_at', 'updated_at']
        read_only_fields = ['created_by']

    def validate(self, attrs):
        branch = attrs.get('branch') or getattr(self.instance, 'branch', None)
        month = attrs.get('month') or getattr(self.instance, 'month', None)
        year = attrs.get('year') or getattr(self.instance, 'year', None)
        if self.instance is None and branch and month and year:
            if BranchTarget.objects.filter(branch=branch, month=month, year=year).exists():
                raise serializers.ValidationError({
                    'detail': 'Target already exists for this branch and month. Delete the existing target to create a new one.'
                })
        return attrs


class HistoricalAnalyticsEntrySerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = HistoricalAnalyticsEntry
        fields = [
            'id', 'year', 'month', 'branch', 'branch_name',
            'leads_count', 'walkins_count', 'enrollments_count',
            'value_amount',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def validate_month(self, value):
        if value < 1 or value > 12:
            raise serializers.ValidationError('Month must be between 1 and 12.')
        return value

    def validate_value_amount(self, value):
        if value < 0:
            raise serializers.ValidationError('Value amount cannot be negative.')
        return value


class UserPerformanceReportSerializer(serializers.Serializer):
    position = serializers.IntegerField()
    user_id = serializers.IntegerField()
    username = serializers.CharField()
    full_name = serializers.CharField()
    branch_name = serializers.CharField(allow_null=True)
    lead_target = serializers.IntegerField()
    walkin_target = serializers.IntegerField()
    enroll_target = serializers.IntegerField()
    revenue_target = serializers.DecimalField(max_digits=12, decimal_places=2)
    value_target = serializers.DecimalField(max_digits=12, decimal_places=2)
    leads = serializers.IntegerField()
    transferred_leads = serializers.IntegerField()
    received_leads = serializers.IntegerField()
    walkins = serializers.IntegerField()
    enrollments = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    value = serializers.DecimalField(max_digits=12, decimal_places=2)
    performance_score = serializers.FloatField()


class UserMonthlyRatingSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    branch_name = serializers.CharField(source='user.branch.name', read_only=True)
    star_display = serializers.SerializerMethodField()

    class Meta:
        model = UserMonthlyRating
        fields = [
            'id', 'user', 'username', 'full_name', 'branch_name',
            'year', 'month', 'score', 'stars', 'star_display',
            'breakdown', 'created_at', 'updated_at',
        ]

    def get_star_display(self, obj):
        return '★' * obj.stars + '☆' * (5 - obj.stars)


class UserMonitoringSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    branch_name = serializers.SerializerMethodField()
    current_status = serializers.SerializerMethodField()

    class Meta:
        model = UserSessionLog
        fields = [
            'id', 'username', 'full_name', 'branch_name', 'login_at', 'logout_at',
            'last_seen_at', 'current_status', 'ip_address',
        ]

    def get_current_status(self, obj):
        return 'Online' if obj.is_online else 'Offline'

    def get_branch_name(self, obj):
        return obj.user.branch.name if obj.user.branch else None


class TeamNoticeReplySerializer(serializers.ModelSerializer):
    replied_by_name = serializers.CharField(source='replied_by.full_name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    created_display = serializers.SerializerMethodField()

    class Meta:
        model = TeamNoticeReply
        fields = [
            'id', 'notice', 'reply_message', 'replied_by', 'replied_by_name',
            'branch', 'branch_name', 'created_at', 'created_display',
        ]
        read_only_fields = ['notice', 'replied_by', 'branch', 'created_at']

    def get_created_display(self, obj):
        return timezone.localtime(obj.created_at).strftime('%d %b %Y, %I:%M %p')


class TeamNoticeSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    audience_display = serializers.CharField(source='get_audience_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_display = serializers.SerializerMethodField()
    replies = TeamNoticeReplySerializer(many=True, read_only=True)

    class Meta:
        model = TeamNotice
        fields = [
            'id', 'title', 'message', 'audience_type', 'audience_display',
            'branch', 'branch_name', 'created_by', 'created_by_name',
            'status', 'status_display', 'created_at', 'created_display',
            'updated_at', 'closed_at', 'archived_at', 'replies',
        ]
        read_only_fields = [
            'created_by', 'created_at', 'updated_at', 'closed_at',
            'archived_at', 'replies',
        ]

    def get_created_display(self, obj):
        return timezone.localtime(obj.created_at).strftime('%d %b %Y, %I:%M %p')

    def validate(self, attrs):
        attrs = super().validate(attrs)
        audience_type = attrs.get('audience_type', getattr(self.instance, 'audience_type', TeamNotice.AudienceType.ALL_BRANCHES))
        branch = attrs.get('branch', getattr(self.instance, 'branch', None))
        if audience_type == TeamNotice.AudienceType.SPECIFIC_BRANCH and not branch:
            raise serializers.ValidationError({'branch': 'Select a branch for a specific branch notice.'})
        if audience_type == TeamNotice.AudienceType.ALL_BRANCHES:
            attrs['branch'] = None
        return attrs


# ============================================================
# backend/apps/courses/serializers.py
# ============================================================
from crm.models import Course, Enrollment, Lead, Payment, PaymentInstallment, RulesSigningRequest, WalkIn, enrollment_payable_fee


COURSE_LINKED_DELETE_MESSAGE = (
    'This course is already linked with existing records, so it cannot be deleted. '
    'You can mark it as Inactive instead.'
)


def course_linked_record_flags(course):
    return {
        'enrollments': Enrollment.objects.filter(course=course).exists(),
        'students': Enrollment.objects.filter(course=course, student_number__isnull=False).exists(),
        'payments': Payment.objects.filter(enrollment__course=course).exists(),
        'walk_ins': WalkIn.objects.filter(course=course).exists(),
        'leads': Lead.objects.filter(course=course).exists(),
        'rules_forms': RulesSigningRequest.objects.filter(enrollment__course=course).exists(),
        'receipts': PaymentInstallment.objects.filter(enrollment__course=course).exists(),
    }


def course_is_linked(course):
    return any(course_linked_record_flags(course).values())


class CourseSerializer(serializers.ModelSerializer):
    final_fees   = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    can_delete = serializers.SerializerMethodField()
    linked_record_count = serializers.SerializerMethodField()

    class Meta:
        model  = Course
        fields = ['id','name','description','duration_months','actual_fees',
                  'discount_amount','final_fees','is_active','created_by',
                  'created_by_name','can_delete','linked_record_count',
                  'created_at','updated_at']
        read_only_fields = ['created_by']

    def get_can_delete(self, obj):
        return not course_is_linked(obj)

    def get_linked_record_count(self, obj):
        return sum(1 for linked in course_linked_record_flags(obj).values() if linked)


# ============================================================
# backend/apps/leads/serializers.py
# ============================================================
from crm.models import CandidateStatusHistory, DataImportHistory, FollowUp, Lead, LeadImportHistory


QUALIFICATION_LABELS = {
    value: label for value, label in Lead.Qualification.choices
}


def normalize_choice_value(value, choices):
    if value in (None, ''):
        return value
    text = str(value).strip()
    normalized_text = text.casefold().replace('-', ' ').replace('_', ' ')
    for choice_value, label in choices:
        candidates = {
            str(choice_value).casefold(),
            str(choice_value).casefold().replace('-', ' ').replace('_', ' '),
            str(label).casefold(),
            str(label).casefold().replace('-', ' ').replace('_', ' '),
        }
        if normalized_text in candidates:
            return choice_value
    return value


def status_history_rows(record_type, record_id, choices):
    labels = dict(choices)
    rows = CandidateStatusHistory.objects.filter(
        record_type=record_type,
        record_id=record_id,
    ).select_related('changed_by').order_by('changed_at', 'id')
    return [
        {
            'id': row.id,
            'old_status': row.old_status,
            'old_status_display': labels.get(row.old_status, row.old_status.replace('_', ' ').title() if row.old_status else ''),
            'new_status': row.new_status,
            'new_status_display': labels.get(row.new_status, row.new_status.replace('_', ' ').title()),
            'remarks': row.remarks,
            'changed_by': row.changed_by_id,
            'changed_by_name': row.changed_by.full_name if row.changed_by else '',
            'changed_at': row.changed_at,
        }
        for row in rows
    ]


def normalize_related_id(value, model, field_name):
    if value in (None, ''):
        return value
    if isinstance(value, model):
        return value.pk
    text = str(value).strip()
    if text.isdigit():
        return value
    lookup = {f'{field_name}__iexact': text}
    match = model.objects.filter(**lookup).order_by('id').first()
    return match.pk if match else value


def normalize_user_id(value):
    if value in (None, ''):
        return value
    if isinstance(value, User):
        return value.pk
    text = str(value).strip()
    if text.isdigit():
        return value
    matches = []
    for user in User.objects.filter(is_active=True).select_related('branch').order_by('id'):
        names = {
            user.username,
            user.full_name,
            user.first_name,
            f'{user.first_name} {user.last_name}'.strip(),
        }
        if any(name and name.casefold() == text.casefold() for name in names):
            matches.append(user)
    return matches[0].pk if len(matches) == 1 else value


def qualification_display_value(value):
    value = value or ''
    return QUALIFICATION_LABELS.get(value, value)


def safe_deferred_value(obj, field_name, default=''):
    if field_name in getattr(obj, 'get_deferred_fields', lambda: set())():
        return default
    try:
        value = getattr(obj, field_name)
    except Exception:
        return default
    return default if value is None else value


def lead_has_enrollment(obj):
    annotated = getattr(obj, 'has_enrollment_record', None)
    if annotated is not None:
        return bool(annotated)
    try:
        if obj.enrollments.exists():
            return True
    except Exception:
        pass
    try:
        walkin = getattr(obj, 'walkin', None)
        if walkin and getattr(walkin, 'enrollment', None):
            return True
    except Exception:
        pass
    if safe_deferred_value(obj, 'converted_to_type', '') == 'enrollment':
        record_id = safe_deferred_value(obj, 'converted_record_id', None)
        if record_id:
            return Enrollment.objects.filter(pk=record_id, lead=obj).exists()
    return False


def lead_has_walkin(obj):
    annotated = getattr(obj, 'has_walkin_record', None)
    if annotated is not None:
        return bool(annotated)
    try:
        if getattr(obj, 'walkin', None):
            return True
    except Exception:
        pass
    if safe_deferred_value(obj, 'converted_to_type', '') == 'walkin':
        record_id = safe_deferred_value(obj, 'converted_record_id', None)
        if record_id:
            return WalkIn.objects.filter(pk=record_id, lead=obj).exists()
    return False


def effective_lead_status(obj):
    if lead_has_enrollment(obj):
        return Lead.Status.ENROLLED
    if lead_has_walkin(obj):
        return Lead.Status.CONVERTED_TO_WALKIN
    stored_status = safe_deferred_value(obj, 'status', Lead.Status.NEW) or Lead.Status.NEW
    if stored_status == Lead.Status.LOST:
        return Lead.Status.LOST
    return stored_status or Lead.Status.NEW


def effective_lead_status_display(obj):
    status = effective_lead_status(obj)
    if status == Lead.Status.ENROLLED:
        return 'Enrolled'
    if status == Lead.Status.CONVERTED_TO_WALKIN:
        return 'Converted to Walk-in'
    if status == Lead.Status.NEW and safe_deferred_value(obj, 'source', '') == Lead.Source.MANUAL:
        return 'Follow-up'
    return dict(Lead.Status.choices).get(status, str(status).replace('_', ' ').title())


class FollowUpSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FollowUp
        fields = [
            'id', 'record_type', 'record_id', 'follow_up_date',
            'next_follow_up_date', 'remarks', 'updated_by',
            'updated_by_name', 'created_at',
        ]
        read_only_fields = ['record_type', 'record_id', 'updated_by', 'created_at']

    def get_updated_by_name(self, obj):
        try:
            return obj.updated_by.full_name if obj.updated_by_id and obj.updated_by else ''
        except Exception:
            return ''


def lead_course_display(obj):
    return (
        getattr(getattr(obj, 'course', None), 'name', '')
        or safe_deferred_value(obj, 'external_course_interested', '')
        or ''
    )


class LeadListSerializer(serializers.ModelSerializer):
    """Compact serializer for list endpoints."""
    course_name = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    lead_status = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    source = serializers.SerializerMethodField()
    source_display = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    follow_up_by = serializers.IntegerField(source='assigned_to_id', read_only=True)
    assigned_user = serializers.SerializerMethodField()
    branch_name  = serializers.CharField(source='branch.name', read_only=True)
    next_follow_up_date = serializers.SerializerMethodField()
    imported_via_csv = serializers.SerializerMethodField()
    remarks = serializers.SerializerMethodField()
    latest_follow_up_at = serializers.SerializerMethodField()
    latest_remark = serializers.SerializerMethodField()
    source_description = serializers.SerializerMethodField()

    class Meta:
        model  = Lead
        fields = ['id','lead_number','name','phone','location','course_name','remarks',
                  'source_description','latest_follow_up_at','latest_remark',
                  'status','status_display','lead_status','source','source_display','walkin_date','next_follow_up_date',
                  'assigned_to','follow_up_by','assigned_to_name','assigned_user',
                  'branch_name','created_by','converted_to_type','converted_record_id',
                  'expected_course_budget','planned_joining_time','primary_goal','other_institutes_considering',
                  'counselor_status','competitor_status','follow_up_priority','conversion_probability',
                  'imported_via_csv','is_important','created_at','updated_at']

    def get_status(self, obj):
        return effective_lead_status(obj)

    def get_lead_status(self, obj):
        return self.get_status(obj)

    def get_status_display(self, obj):
        return effective_lead_status_display(obj)

    def get_source(self, obj):
        return safe_deferred_value(obj, 'source', '') or ''

    def get_source_display(self, obj):
        source = self.get_source(obj)
        return dict(Lead.Source.choices).get(source, source or 'Unknown')

    def get_next_follow_up_date(self, obj):
        value = safe_deferred_value(obj, 'next_follow_up_date', None)
        return value.isoformat() if hasattr(value, 'isoformat') else value

    def get_imported_via_csv(self, obj):
        try:
            return bool(safe_deferred_value(obj, 'imported_via_csv', False))
        except Exception:
            return False

    def get_remarks(self, obj):
        latest = getattr(obj, 'latest_follow_up_remark', None)
        return latest if latest not in (None, '') else safe_deferred_value(obj, 'remarks', '') or ''

    def get_latest_remark(self, obj):
        return self.get_remarks(obj)

    def get_latest_follow_up_at(self, obj):
        value = getattr(obj, 'latest_follow_up_at', None)
        return value.isoformat() if hasattr(value, 'isoformat') else value

    def get_source_description(self, obj):
        return safe_deferred_value(obj, 'source_description', '') or ''

    def get_assigned_to_name(self, obj):
        try:
            return obj.assigned_to.full_name if obj.assigned_to_id and obj.assigned_to else ''
        except Exception:
            return ''

    def get_assigned_user(self, obj):
        if not getattr(obj, 'assigned_to_id', None):
            return None
        try:
            user = obj.assigned_to
            return user_identity_payload(user)
        except Exception:
            return None

    def get_course_name(self, obj):
        return lead_course_display(obj)


class LeadInboxSerializer(serializers.ModelSerializer):
    course_name = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    willing_to_join_display = serializers.CharField(source='get_willing_to_join_display', read_only=True)
    qualification_display = serializers.SerializerMethodField()

    class Meta:
        model = Lead
        fields = [
            'id', 'lead_number', 'name', 'phone', 'branch_name',
            'course_name', 'source', 'source_display', 'status',
            'qualification', 'qualification_display',
            'willing_to_join', 'willing_to_join_display',
            'external_course_interested', 'external_message',
            'is_duplicate', 'created_at',
        ]

    def get_qualification_display(self, obj):
        return qualification_display_value(obj.qualification)

    def get_course_name(self, obj):
        return lead_course_display(obj)


class LeadDetailSerializer(serializers.ModelSerializer):
    """Full serializer for retrieve/create/update."""
    course_name      = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    dob              = serializers.DateField(
        required=False,
        allow_null=True,
        input_formats=['iso-8601', '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y'],
    )
    walkin_date      = serializers.DateField(
        required=False,
        allow_null=True,
        input_formats=['iso-8601', '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y'],
    )
    next_follow_up_date = serializers.DateField(
        required=False,
        allow_null=True,
        input_formats=['iso-8601', '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y'],
    )
    follow_up_by     = serializers.PrimaryKeyRelatedField(
        source='assigned_to',
        queryset=User.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    assigned_user    = serializers.SerializerMethodField()
    branch_name      = serializers.CharField(source='branch.name',         read_only=True)
    created_by_name  = serializers.SerializerMethodField()
    converted_by_name = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    source_display   = serializers.CharField(source='get_source_display', read_only=True)
    willing_to_join_display = serializers.CharField(source='get_willing_to_join_display', read_only=True)
    qualification_display = serializers.SerializerMethodField()
    follow_ups       = serializers.SerializerMethodField()
    transfer_history = serializers.SerializerMethodField()
    status_history = serializers.SerializerMethodField()
    latest_follow_up_at = serializers.SerializerMethodField()
    latest_remark = serializers.SerializerMethodField()

    class Meta:
        model  = Lead
        fields = '__all__'
        read_only_fields = ['lead_number', 'created_by']

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            data = data.copy()
            data.pop('transfer_to', None)
            data.pop('transfer_to_user', None)
            for field in ('follow_up_by', 'assigned_to', 'branch', 'course', 'dob', 'walkin_date', 'next_follow_up_date'):
                if data.get(field) == '':
                    data[field] = None
            if data.get('source') not in (None, ''):
                data['source'] = normalize_choice_value(data.get('source'), Lead.Source.choices)
            if data.get('status') not in (None, ''):
                data['status'] = normalize_choice_value(data.get('status'), Lead.Status.choices)
            if data.get('lead_status') not in (None, ''):
                data['lead_status'] = normalize_choice_value(data.get('lead_status'), Lead.Status.choices)
            if data.get('qualification') not in (None, ''):
                data['qualification'] = normalize_choice_value(data.get('qualification'), Lead.Qualification.choices)
            if data.get('course') not in (None, ''):
                data['course'] = normalize_related_id(data.get('course'), Course, 'name')
            if data.get('branch') not in (None, ''):
                data['branch'] = normalize_related_id(data.get('branch'), Branch, 'name')
            if data.get('follow_up_by') not in (None, ''):
                data['follow_up_by'] = normalize_user_id(data.get('follow_up_by'))
            if data.get('assigned_to') not in (None, ''):
                data['assigned_to'] = normalize_user_id(data.get('assigned_to'))
            if data.get('status') in (None, '') and data.get('lead_status') not in (None, ''):
                data['status'] = data.get('lead_status')
            if data.get('status') in (None, ''):
                data['status'] = Lead.Status.NEW
            if data.get('source') in (None, ''):
                data['source'] = Lead.Source.MANUAL
        return super().to_internal_value(data)

    def to_representation(self, instance):
        defaults = {
            'qualification': '',
            'degree': '',
            'willing_to_join': '',
            'preferred_timing': '',
            'next_follow_up_date': None,
            'external_course_interested': '',
            'external_message': '',
            'source_description': '',
            'expected_course_budget': '',
            'planned_joining_time': '',
            'primary_goal': '',
            'other_institutes_considering': '',
            'counselor_status': '',
            'competitor_status': '',
            'follow_up_priority': '',
            'conversion_probability': '',
            'is_duplicate': False,
            'imported_via_csv': False,
            'converted_to_type': '',
            'converted_record_id': None,
            'converted_at': None,
            'converted_by_id': None,
        }
        deferred = getattr(instance, 'get_deferred_fields', lambda: set())()
        for field_name, default in defaults.items():
            if field_name in deferred:
                instance.__dict__[field_name] = default
        data = super().to_representation(instance)
        data['status'] = effective_lead_status(instance)
        data['lead_status'] = data['status']
        data['status_display'] = effective_lead_status_display(instance)
        return data

    def get_assigned_to_name(self, obj):
        try:
            return obj.assigned_to.full_name if obj.assigned_to_id and obj.assigned_to else ''
        except Exception:
            return ''

    def get_course_name(self, obj):
        return lead_course_display(obj)

    def get_assigned_user(self, obj):
        if not getattr(obj, 'assigned_to_id', None):
            return None
        try:
            user = obj.assigned_to
            return user_identity_payload(user)
        except Exception:
            return None

    def get_created_by_name(self, obj):
        try:
            return obj.created_by.full_name if obj.created_by_id and obj.created_by else ''
        except Exception:
            return ''

    def get_converted_by_name(self, obj):
        try:
            return obj.converted_by.full_name if obj.converted_by_id and obj.converted_by else ''
        except Exception:
            return ''

    def get_follow_ups(self, obj):
        follow_ups = FollowUp.objects.filter(
            record_type=FollowUp.RecordType.LEAD,
            record_id=obj.id,
        ).order_by('-created_at', '-id')
        return FollowUpSerializer(follow_ups, many=True).data

    def get_transfer_history(self, obj):
        rows = obj.transfer_history.select_related(
            'from_user', 'to_user', 'transferred_by', 'from_branch', 'to_branch'
        ).order_by('-created_at')
        return [
            {
                'id': row.id,
                'from_user': row.from_user_id,
                'from_user_name': row.from_user.full_name if row.from_user else '',
                'to_user': row.to_user_id,
                'to_user_name': row.to_user.full_name if row.to_user else '',
                'transferred_by': row.transferred_by_id,
                'transferred_by_name': row.transferred_by.full_name if row.transferred_by else '',
                'from_branch': row.from_branch_id,
                'from_branch_name': row.from_branch.name if row.from_branch else '',
                'to_branch': row.to_branch_id,
                'to_branch_name': row.to_branch.name if row.to_branch else '',
                'note': row.note,
                'created_at': row.created_at,
            }
            for row in rows
        ]

    def get_status_history(self, obj):
        return status_history_rows(
            CandidateStatusHistory.RecordType.LEAD,
            obj.id,
            [*Lead.Status.choices, *Lead.CounselorStatus.choices],
        )

    def get_latest_follow_up_at(self, obj):
        follow_up = FollowUp.objects.filter(
            record_type=FollowUp.RecordType.LEAD,
            record_id=obj.id,
        ).order_by('-created_at', '-id').first()
        return follow_up.created_at.isoformat() if follow_up else None

    def get_latest_remark(self, obj):
        follow_up = FollowUp.objects.filter(
            record_type=FollowUp.RecordType.LEAD,
            record_id=obj.id,
        ).order_by('-created_at', '-id').first()
        return follow_up.remarks if follow_up else obj.remarks

    def get_qualification_display(self, obj):
        return qualification_display_value(safe_deferred_value(obj, 'qualification', ''))

    def get_status_display(self, obj):
        return effective_lead_status_display(obj)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if self.instance is None:
            attrs.setdefault('status', Lead.Status.NEW)
            attrs.setdefault('source', Lead.Source.MANUAL)
            if user and user.is_authenticated and not user.is_super_admin:
                if not user.branch_id:
                    raise serializers.ValidationError({
                        'branch': 'Your account is not assigned to a branch.'
                    })
                attrs['branch'] = user.branch
        branch = attrs.get('branch') or getattr(self.instance, 'branch', None)
        requested_status = attrs.get('status')
        if self.instance and requested_status == Lead.Status.LOST:
            if lead_has_enrollment(self.instance):
                attrs['status'] = Lead.Status.ENROLLED
            elif lead_has_walkin(self.instance):
                attrs['status'] = Lead.Status.CONVERTED_TO_WALKIN
        if branch and not getattr(branch, 'is_active', True):
            raise serializers.ValidationError({'branch': 'Select a valid active branch.'})
        assigned_to = attrs.get('assigned_to')
        if assigned_to:
            if not assigned_to.is_active:
                raise serializers.ValidationError({
                    'follow_up_by': 'Select an active user.'
                })
            if user and user.is_authenticated and not user.is_super_admin:
                if assigned_to.branch_id != user.branch_id:
                    raise serializers.ValidationError({
                        'follow_up_by': 'Select an active user from your branch.'
                    })
            elif branch and assigned_to.branch_id and assigned_to.branch_id != branch.id:
                raise serializers.ValidationError({
                    'follow_up_by': 'Select a user from the selected branch.'
                })
        year = attrs.get('year_of_passing')
        if year not in (None, '') and (year < 1900 or year > 2100):
            raise serializers.ValidationError({'year_of_passing': 'Enter a valid passed out year.'})
        if self.instance is None:
            data = {**getattr(self, 'initial_data', {}), **attrs}
            required_fields = ['name', 'phone', 'course']
            missing = [
                field for field in required_fields
                if data.get(field) in (None, '')
            ]
            if missing:
                raise serializers.ValidationError({
                    field: 'This field is required.' for field in missing
                })
        return attrs


class LeadStaffUpdateSerializer(serializers.ModelSerializer):
    """Staff can only update walkin_date + next follow-up + remarks."""

    class Meta:
        model  = Lead
        fields = [
            'walkin_date', 'next_follow_up_date', 'remarks', 'status',
            'expected_course_budget', 'planned_joining_time', 'primary_goal',
            'other_institutes_considering', 'counselor_status', 'competitor_status',
            'follow_up_priority', 'conversion_probability',
        ]


class LeadImportHistorySerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = LeadImportHistory
        fields = [
            'id', 'uploaded_by', 'uploaded_by_name', 'branch', 'branch_name',
            'file_name', 'total_rows', 'success_count', 'failed_count',
            'duplicate_count', 'status', 'status_display', 'error_log',
            'created_at', 'updated_at',
        ]


class DataImportHistorySerializer(serializers.ModelSerializer):
    imported_by_name = serializers.CharField(source='imported_by.full_name', read_only=True)
    import_type_display = serializers.CharField(source='get_import_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = DataImportHistory
        fields = [
            'id', 'imported_by', 'imported_by_name', 'file_name',
            'import_type', 'import_type_display', 'created_at',
            'rows_imported', 'rows_skipped', 'rows_failed',
            'status', 'status_display', 'error_log',
        ]


# ============================================================
# backend/apps/walkins/serializers.py
# ============================================================
from crm.models import WalkIn, WalkInAssignmentChangeRequest, WalkInBranchChangeHistory


def effective_walkin_status(obj):
    try:
        if getattr(obj, 'enrollment', None):
            return WalkIn.Status.CONVERTED
    except Exception:
        pass
    if safe_deferred_value(obj, 'converted_to_type', '') == 'enrollment':
        record_id = safe_deferred_value(obj, 'converted_record_id', None)
        if record_id and Enrollment.objects.filter(pk=record_id, walkin_id=obj.id).exists():
            return WalkIn.Status.CONVERTED
    stored_status = safe_deferred_value(obj, 'status', WalkIn.Status.NEW) or WalkIn.Status.NEW
    if stored_status == WalkIn.Status.CONVERTED:
        return WalkIn.Status.CONVERTED
    return safe_deferred_value(obj, 'counselor_status', '') or stored_status


def effective_walkin_status_display(obj):
    status = effective_walkin_status(obj)
    labels = {**dict(WalkIn.Status.choices), **dict(WalkIn.CounselorStatus.choices)}
    return labels.get(status, str(status).replace('_', ' ').title())


class WalkInListSerializer(serializers.ModelSerializer):
    course_name  = serializers.CharField(source='course.name',  read_only=True)
    branch_name  = serializers.CharField(source='branch.name',  read_only=True)
    assigned_name= serializers.SerializerMethodField()
    assigned_user = serializers.SerializerMethodField()
    counseling_by_name = serializers.SerializerMethodField()
    counseling_user = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    converted_by_name = serializers.SerializerMethodField()
    preferred_timing_display = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    walk_in_by_display = serializers.SerializerMethodField()
    enrollment_id = serializers.SerializerMethodField()
    is_converted_to_enrollment = serializers.SerializerMethodField()
    remarks = serializers.SerializerMethodField()
    latest_remark = serializers.SerializerMethodField()
    latest_follow_up_at = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    fees_reduction_available = serializers.SerializerMethodField()
    fees_reduction_expires_at = serializers.SerializerMethodField()

    class Meta:
        model  = WalkIn
        fields = ['id','candidate_number','name','phone','email','course_name',
                  'branch_name','status','status_display','visit_date','follow_up_date','remarks','demo_class','assigned_name',
                  'assigned_to','assigned_user','counseling_by','counseling_by_name','counseling_user',
                  'created_by','created_by_name','converted_by_name',
                  'preferred_timing','preferred_timing_display','source','source_display','source_description',
                  'walk_in_by','walk_in_by_display','converted_to_type',
                  'converted_record_id','converted_at','enrollment_id',
                  'expected_course_budget','planned_joining_time','primary_goal','other_institutes_considering',
                  'counselor_status','competitor_status','follow_up_priority','conversion_probability',
                  'is_converted_to_enrollment','latest_remark','latest_follow_up_at','is_important','created_at',
                  'fees_reduction_available', 'fees_reduction_expires_at']

    def to_representation(self, instance):
        defaults = {
            'preferred_timing': '',
            'source_description': '',
            'walk_in_by': '',
            'counseling_by_id': None,
            'converted_to_type': '',
            'converted_record_id': None,
            'converted_at': None,
            'converted_by_id': None,
            'expected_course_budget': '',
            'planned_joining_time': '',
            'primary_goal': '',
            'other_institutes_considering': '',
            'counselor_status': '',
            'competitor_status': '',
            'follow_up_priority': '',
            'conversion_probability': '',
        }
        deferred = getattr(instance, 'get_deferred_fields', lambda: set())()
        for field_name, default in defaults.items():
            if field_name in deferred:
                instance.__dict__[field_name] = default
        data = super().to_representation(instance)
        data['status'] = effective_walkin_status(instance)
        data['status_display'] = effective_walkin_status_display(instance)
        return data

    def get_status_display(self, obj):
        return effective_walkin_status_display(obj)

    def get_assigned_name(self, obj):
        try:
            return obj.assigned_to.full_name if obj.assigned_to_id and obj.assigned_to else ''
        except Exception:
            return ''

    def get_assigned_user(self, obj):
        if not getattr(obj, 'assigned_to_id', None):
            return None
        try:
            return user_identity_payload(obj.assigned_to)
        except Exception:
            return None

    def get_counseling_by_name(self, obj):
        try:
            return obj.counseling_by.full_name if obj.counseling_by_id and obj.counseling_by else ''
        except Exception:
            return ''

    def get_counseling_user(self, obj):
        if not getattr(obj, 'counseling_by_id', None):
            return None
        try:
            return user_identity_payload(obj.counseling_by)
        except Exception:
            return None

    def get_created_by_name(self, obj):
        try:
            return obj.created_by.full_name if obj.created_by_id and obj.created_by else ''
        except Exception:
            return ''

    def get_converted_by_name(self, obj):
        try:
            return obj.converted_by.full_name if obj.converted_by_id and obj.converted_by else ''
        except Exception:
            return ''

    def get_preferred_timing_display(self, obj):
        if 'preferred_timing' in getattr(obj, 'get_deferred_fields', lambda: set())():
            return ''
        try:
            return obj.get_preferred_timing_display()
        except Exception:
            return ''

    def get_walk_in_by_display(self, obj):
        if 'walk_in_by' in getattr(obj, 'get_deferred_fields', lambda: set())():
            return ''
        try:
            return obj.get_walk_in_by_display()
        except Exception:
            return ''

    def get_enrollment_id(self, obj):
        try:
            enrollment = getattr(obj, 'enrollment', None)
        except Enrollment.DoesNotExist:
            enrollment = None
        if enrollment:
            return enrollment.id
        if obj.converted_to_type == 'enrollment' and obj.converted_record_id:
            exists = Enrollment.objects.filter(pk=obj.converted_record_id, walkin_id=obj.id).exists()
            if exists:
                return obj.converted_record_id
        return None

    def get_is_converted_to_enrollment(self, obj):
        return self.get_enrollment_id(obj) is not None

    def get_latest_remark(self, obj):
        return self.get_remarks(obj)

    def get_remarks(self, obj):
        latest = getattr(obj, 'latest_follow_up_remark', None)
        return latest if latest not in (None, '') else safe_deferred_value(obj, 'remarks', '') or ''

    def get_latest_follow_up_at(self, obj):
        value = getattr(obj, 'latest_follow_up_at', None)
        return value.isoformat() if hasattr(value, 'isoformat') else value

    def get_fees_reduction_expires_at(self, obj):
        value = obj.created_at + timedelta(hours=24) if obj.created_at else None
        return value.isoformat() if hasattr(value, 'isoformat') else value

    def get_fees_reduction_available(self, obj):
        expires_at = obj.created_at + timedelta(hours=24) if obj.created_at else None
        return bool(expires_at and timezone.now() <= expires_at)


class WalkInDetailSerializer(serializers.ModelSerializer):
    course_name   = serializers.CharField(source='course.name',          read_only=True)
    branch_name   = serializers.CharField(source='branch.name',          read_only=True)
    course_interested = serializers.CharField(source='course.name', read_only=True)
    assigned_name = serializers.CharField(source='assigned_to.full_name', read_only=True)
    counseling_by_name = serializers.CharField(source='counseling_by.full_name', read_only=True)
    counseling_user = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    converted_by_name = serializers.CharField(source='converted_by.full_name', read_only=True)
    preferred_timing_display = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    walk_in_by_display = serializers.SerializerMethodField()
    qualification_display = serializers.SerializerMethodField()
    degree_department = serializers.CharField(source='degree', read_only=True)
    passed_out_year = serializers.IntegerField(source='year_of_passing', read_only=True)
    college_company_name = serializers.CharField(source='college_company', read_only=True)
    follow_ups = serializers.SerializerMethodField()
    branch_change_history = serializers.SerializerMethodField()
    status_history = serializers.SerializerMethodField()
    enrollment_id = serializers.SerializerMethodField()
    is_converted_to_enrollment = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    fees_reduction_available = serializers.SerializerMethodField()
    fees_reduction_expires_at = serializers.SerializerMethodField()

    class Meta:
        model  = WalkIn
        fields = '__all__'
        read_only_fields = [
            'candidate_number', 'created_by',
            'converted_to_type', 'converted_record_id', 'converted_at', 'converted_by',
        ]

    def to_representation(self, instance):
        defaults = {
            'qualification': '',
            'degree': '',
            'profession': '',
            'year_of_passing': None,
            'college_company': '',
            'expected_course_budget': '',
            'planned_joining_time': '',
            'primary_goal': '',
            'other_institutes_considering': '',
            'counselor_status': '',
            'competitor_status': '',
            'follow_up_priority': '',
            'conversion_probability': '',
            'preferred_timing': '',
            'source_description': '',
            'interested_global_certification': False,
            'walk_in_by': '',
            'counseling_by_id': None,
            'follow_up_date': None,
            'converted_to_type': '',
            'converted_record_id': None,
            'converted_at': None,
            'converted_by_id': None,
        }
        deferred = getattr(instance, 'get_deferred_fields', lambda: set())()
        for field_name, default in defaults.items():
            if field_name in deferred:
                instance.__dict__[field_name] = default
        data = super().to_representation(instance)
        data['status'] = effective_walkin_status(instance)
        data['status_display'] = effective_walkin_status_display(instance)
        return data

    def get_status_display(self, obj):
        return effective_walkin_status_display(obj)

    def get_fees_reduction_expires_at(self, obj):
        value = obj.created_at + timedelta(hours=24) if obj.created_at else None
        return value.isoformat() if hasattr(value, 'isoformat') else value

    def get_fees_reduction_available(self, obj):
        expires_at = obj.created_at + timedelta(hours=24) if obj.created_at else None
        return bool(expires_at and timezone.now() <= expires_at)

    def get_follow_ups(self, obj):
        follow_ups = FollowUp.objects.filter(
            record_type=FollowUp.RecordType.WALKIN,
            record_id=obj.id,
        ).order_by('-created_at', '-id')
        return FollowUpSerializer(follow_ups, many=True).data

    def get_qualification_display(self, obj):
        return qualification_display_value(safe_deferred_value(obj, 'qualification', ''))

    def get_preferred_timing_display(self, obj):
        if 'preferred_timing' in getattr(obj, 'get_deferred_fields', lambda: set())():
            return ''
        try:
            return obj.get_preferred_timing_display()
        except Exception:
            return ''

    def get_walk_in_by_display(self, obj):
        if 'walk_in_by' in getattr(obj, 'get_deferred_fields', lambda: set())():
            return ''
        try:
            return obj.get_walk_in_by_display()
        except Exception:
            return ''

    def get_counseling_user(self, obj):
        if not getattr(obj, 'counseling_by_id', None):
            return None
        try:
            return user_identity_payload(obj.counseling_by)
        except Exception:
            return None

    def get_branch_change_history(self, obj):
        try:
            return WalkInBranchChangeHistorySerializer(obj.branch_change_history.select_related(
                'old_branch', 'new_branch', 'changed_by',
            ), many=True).data
        except (OperationalError, ProgrammingError):
            return []

    def get_status_history(self, obj):
        return status_history_rows(
            CandidateStatusHistory.RecordType.WALKIN,
            obj.id,
            [*WalkIn.Status.choices, *WalkIn.CounselorStatus.choices],
        )

    def get_enrollment_id(self, obj):
        try:
            enrollment = getattr(obj, 'enrollment', None)
        except Enrollment.DoesNotExist:
            enrollment = None
        if enrollment:
            return enrollment.id
        if obj.converted_to_type == 'enrollment' and obj.converted_record_id:
            exists = Enrollment.objects.filter(pk=obj.converted_record_id, walkin_id=obj.id).exists()
            if exists:
                return obj.converted_record_id
        return None

    def get_is_converted_to_enrollment(self, obj):
        return self.get_enrollment_id(obj) is not None

    def validate(self, attrs):
        attrs = super().validate(attrs)
        initial_data = getattr(self, 'initial_data', {})
        fixed_walk_in_by = initial_data.get('walk_in_by')
        fixed_selected = fixed_walk_in_by in (
            WalkIn.WalkInBy.DIRECT,
            WalkIn.WalkInBy.FRIENDS_REFERENCE,
        )
        assigned_to = attrs.get('assigned_to', getattr(self.instance, 'assigned_to', None))
        if fixed_selected:
            attrs['walk_in_by'] = fixed_walk_in_by
            attrs['assigned_to'] = None
        elif 'assigned_to' in attrs and attrs.get('assigned_to'):
            attrs['walk_in_by'] = ''
        if self.instance is None:
            data = {**getattr(self, 'initial_data', {}), **attrs}
            required_fields = [
                'branch', 'name', 'dob', 'phone', 'email', 'location', 'pincode',
                'course', 'preferred_timing', 'visit_date',
                'qualification', 'year_of_passing', 'college_company',
            ]
            missing = [
                field for field in required_fields
                if data.get(field) in (None, '')
            ]
            if missing:
                raise serializers.ValidationError({
                    field: 'This field is required.' for field in missing
                })
            if not fixed_selected and not assigned_to:
                raise serializers.ValidationError({'walk_in_by': 'Select Walk-in By.'})
        return attrs


class WalkInBranchChangeHistorySerializer(serializers.ModelSerializer):
    old_branch_name = serializers.CharField(source='old_branch.name', read_only=True)
    new_branch_name = serializers.CharField(source='new_branch.name', read_only=True)
    changed_by_name = serializers.CharField(source='changed_by.full_name', read_only=True)

    class Meta:
        model = WalkInBranchChangeHistory
        fields = [
            'id', 'old_branch', 'old_branch_name', 'new_branch', 'new_branch_name',
            'changed_by', 'changed_by_name', 'changed_at', 'reason',
        ]


class WalkInAssignmentChangeRequestSerializer(serializers.ModelSerializer):
    field_type_display = serializers.CharField(source='get_field_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    previous_user_name = serializers.CharField(source='previous_user.full_name', read_only=True)
    requested_user_name = serializers.CharField(source='requested_user.full_name', read_only=True)
    previous_assignment_name = serializers.SerializerMethodField()
    requested_assignment_name = serializers.SerializerMethodField()
    requested_by_name = serializers.CharField(source='requested_by.full_name', read_only=True)
    counselor_reviewed_by_name = serializers.CharField(source='counselor_reviewed_by.full_name', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True)

    class Meta:
        model = WalkInAssignmentChangeRequest
        fields = [
            'id', 'walkin', 'field_type', 'field_type_display', 'branch', 'branch_name',
            'candidate_name', 'candidate_phone', 'previous_user', 'previous_user_name',
            'requested_user', 'requested_user_name', 'requested_by', 'requested_by_name',
            'previous_walk_in_by', 'requested_walk_in_by',
            'previous_assignment_name', 'requested_assignment_name',
            'reason', 'status', 'status_display',
            'counselor_reviewed_by', 'counselor_reviewed_by_name',
            'counselor_reviewed_at', 'counselor_remarks',
            'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'admin_remarks', 'created_at', 'updated_at',
        ]

    def get_previous_assignment_name(self, obj):
        return obj.previous_walk_in_by or (
            obj.previous_user.full_name if obj.previous_user_id and obj.previous_user else 'Unassigned'
        )

    def get_requested_assignment_name(self, obj):
        return obj.requested_walk_in_by or (
            obj.requested_user.full_name if obj.requested_user_id and obj.requested_user else 'Unassigned'
        )


class PublicWalkInCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalkIn
        fields = [
            'branch', 'name', 'dob', 'phone', 'email', 'location', 'pincode', 'course',
            'qualification', 'degree', 'year_of_passing', 'college_company',
            'expected_course_budget', 'planned_joining_time', 'primary_goal',
            'other_institutes_considering',
            'preferred_timing', 'demo_class', 'interested_global_certification',
            'source', 'visit_date'
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        year = attrs.get('year_of_passing')
        if year not in (None, '') and (year < 1900 or year > 2100):
            raise serializers.ValidationError({'year_of_passing': 'Enter a valid passed out year.'})
        required_fields = [
            'branch', 'name', 'dob', 'phone', 'email', 'location', 'pincode',
            'course', 'qualification', 'year_of_passing', 'college_company',
            'expected_course_budget', 'planned_joining_time', 'primary_goal',
            'other_institutes_considering',
            'preferred_timing', 'source', 'visit_date',
        ]
        missing = [
            field for field in required_fields
            if attrs.get(field) in (None, '')
        ]
        if missing:
            raise serializers.ValidationError({
                field: 'This field is required.' for field in missing
            })
        return attrs


# ============================================================
# backend/apps/discounts/serializers.py
# ============================================================
from crm.models import Discount


DISCOUNT_VALIDITY_OPTIONS = {
    'forever': None,
    '7_days': {'days': 7},
    '15_days': {'days': 15},
    '1_month': {'months': 1},
    '3_months': {'months': 3},
    'custom': 'custom',
}


def add_months(value, months):
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)


class FlexibleDateField(serializers.DateField):
    def to_internal_value(self, value):
        if value in ('', None):
            return None
        if isinstance(value, date):
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
        self.fail('invalid', format='YYYY-MM-DD')


class DiscountSerializer(serializers.ModelSerializer):
    course_names = serializers.SerializerMethodField()
    branch_names = serializers.SerializerMethodField()
    status_label = serializers.CharField(read_only=True)
    valid_from = FlexibleDateField(required=True)
    valid_to = FlexibleDateField(required=False, allow_null=True)
    validity = serializers.ChoiceField(
        choices=[(key, key) for key in DISCOUNT_VALIDITY_OPTIONS],
        required=False,
        write_only=True,
    )

    class Meta:
        model = Discount
        fields = [
            'id', 'name', 'discount_type', 'value', 'apply_to_all_courses',
            'courses', 'course_names', 'apply_to_all_branches', 'branches', 'branch_names',
            'branch', 'valid_from', 'valid_to', 'validity', 'is_active',
            'status_label', 'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by']

    def get_course_names(self, obj):
        if obj.apply_to_all_courses:
            return ['All Courses']
        return list(obj.courses.order_by('name').values_list('name', flat=True))

    def get_branch_names(self, obj):
        if obj.apply_to_all_branches:
            return ['All Branches']
        return list(obj.branches.order_by('name').values_list('name', flat=True))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs['discount_type'] = Discount.DiscountType.FIXED
        attrs['name'] = (attrs.get('name', getattr(self.instance, 'name', '')) or '').strip()
        validity = attrs.pop('validity', None)
        valid_from = attrs.get('valid_from', getattr(self.instance, 'valid_from', None))
        valid_to = attrs.get('valid_to', getattr(self.instance, 'valid_to', None))
        apply_to_all = attrs.get('apply_to_all_courses', getattr(self.instance, 'apply_to_all_courses', False))
        courses = attrs.get('courses')
        value = attrs.get('value', getattr(self.instance, 'value', None))
        if not attrs['name']:
            raise serializers.ValidationError({'name': 'Discount name is required.'})
        if value is None:
            raise serializers.ValidationError({'value': 'Discount amount is required.'})
        if value is not None and value < 0:
            raise serializers.ValidationError({'value': 'Discount amount cannot be negative.'})
        if valid_from is None:
            raise serializers.ValidationError({'valid_from': 'Discount start date is required.'})
        if validity is None and self.instance is None:
            validity = 'custom' if valid_to else None
        if self.instance is None and not validity:
            raise serializers.ValidationError({'validity': 'Discount validity is required.'})
        if validity:
            validity_rule = DISCOUNT_VALIDITY_OPTIONS[validity]
            if validity == 'forever':
                valid_to = None
                attrs['valid_to'] = None
                attrs['is_active'] = True
            elif validity == 'custom':
                if not valid_to:
                    raise serializers.ValidationError({'valid_to': 'Discount expiry date is required for custom date validity.'})
            elif validity_rule:
                if 'days' in validity_rule:
                    valid_to = valid_from + timedelta(days=validity_rule['days'])
                else:
                    valid_to = add_months(valid_from, validity_rule['months'])
                attrs['valid_to'] = valid_to
        if valid_from and valid_to and valid_from > valid_to:
            raise serializers.ValidationError({'valid_to': 'Discount expiry date cannot be earlier than the start date.'})
        if not apply_to_all and self.instance is None and not courses:
            raise serializers.ValidationError({'courses': 'Select at least one course or apply to all courses.'})
        apply_to_all_branches = attrs.get(
            'apply_to_all_branches',
            getattr(self.instance, 'apply_to_all_branches', False),
        )
        branches = attrs.get('branches')
        if not apply_to_all_branches and branches is not None and not branches:
            raise serializers.ValidationError({'branches': 'Select at least one branch or apply to all branches.'})
        if not apply_to_all_branches and self.instance is None and not branches:
            raise serializers.ValidationError({'branches': 'Select at least one branch or apply to all branches.'})
        return attrs


# ============================================================
# backend/apps/enrollments/serializers.py
# ============================================================
from crm.models import CounselorChangeRequest, CourseChangeHistory, CourseChangeRequest, Enrollment, EnrollmentCounselorChangeHistory, EnrollmentRulesResetHistory, RulesSigningRequest, get_enrollment_installment_schedule


class CourseChangeHistorySerializer(serializers.ModelSerializer):
    old_course_name = serializers.CharField(source='old_course.name', read_only=True)
    new_course_name = serializers.CharField(source='new_course.name', read_only=True)
    changed_by_name = serializers.CharField(source='changed_by.full_name', read_only=True)

    class Meta:
        model = CourseChangeHistory
        fields = [
            'id', 'old_course', 'old_course_name', 'new_course', 'new_course_name',
            'changed_by', 'changed_by_name', 'old_fee', 'new_fee', 'reason',
            'effective_date', 'created_at',
        ]


class CourseChangeRequestSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='enrollment.name', read_only=True)
    student_phone = serializers.CharField(source='enrollment.phone', read_only=True)
    student_number = serializers.CharField(source='enrollment.student_number', read_only=True)
    branch = serializers.IntegerField(source='enrollment.branch_id', read_only=True)
    branch_name = serializers.CharField(source='enrollment.branch.name', read_only=True)
    old_course_name = serializers.CharField(source='old_course.name', read_only=True)
    requested_course_name = serializers.CharField(source='requested_course.name', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.full_name', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = CourseChangeRequest
        fields = [
            'id', 'student', 'enrollment', 'student_name', 'student_phone', 'student_number',
            'branch', 'branch_name', 'old_course', 'old_course_name', 'requested_course',
            'requested_course_name', 'requested_batch_date', 'reason', 'requested_by',
            'requested_by_name', 'requested_at', 'status', 'status_display', 'reviewed_by',
            'reviewed_by_name', 'reviewed_at', 'admin_remarks', 'old_fee', 'new_fee',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'student', 'enrollment', 'old_course', 'requested_by', 'requested_at',
            'status', 'reviewed_by', 'reviewed_at', 'old_fee', 'new_fee',
            'created_at', 'updated_at',
        ]


class EnrollmentCounselorChangeHistorySerializer(serializers.ModelSerializer):
    old_counselor_name = serializers.CharField(source='old_counselor.full_name', read_only=True)
    new_counselor_name = serializers.CharField(source='new_counselor.full_name', read_only=True)
    changed_by_name = serializers.CharField(source='changed_by.full_name', read_only=True)

    class Meta:
        model = EnrollmentCounselorChangeHistory
        fields = [
            'id', 'old_counselor', 'old_counselor_name', 'new_counselor',
            'new_counselor_name', 'changed_by', 'changed_by_name', 'reason',
            'changed_at',
        ]


class EnrollmentRulesResetHistorySerializer(serializers.ModelSerializer):
    reset_by_name = serializers.CharField(source='reset_by.full_name', read_only=True)
    previous_signed_pdf_path = serializers.CharField(source='previous_signed_pdf.name', read_only=True)

    class Meta:
        model = EnrollmentRulesResetHistory
        fields = [
            'id', 'reset_by', 'reset_by_name', 'reset_at', 'reason',
            'previous_rules_status', 'previous_signing_token',
            'previous_schedule_locked', 'previous_payment_schedule',
            'previous_signed', 'previous_signed_pdf_path',
        ]


class CounselorChangeRequestSerializer(serializers.ModelSerializer):
    current_counselor_name = serializers.CharField(source='current_counselor.full_name', read_only=True)
    requested_counselor_name = serializers.CharField(source='requested_counselor.full_name', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.full_name', read_only=True)
    counselor_decision_by_name = serializers.CharField(source='counselor_decision_by.full_name', read_only=True)
    admin_decision_by_name = serializers.CharField(source='admin_decision_by.full_name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = CounselorChangeRequest
        fields = [
            'id', 'record_type', 'lead', 'enrollment', 'candidate_name', 'candidate_phone',
            'branch', 'branch_name', 'current_counselor', 'current_counselor_name',
            'requested_counselor', 'requested_counselor_name', 'requested_by',
            'requested_by_name', 'requested_at', 'reason', 'status', 'status_display',
            'counselor_decision_by', 'counselor_decision_by_name', 'counselor_decision_at',
            'counselor_remarks', 'admin_decision_by', 'admin_decision_by_name',
            'admin_decision_at', 'admin_remarks', 'force_transfer',
        ]


class EnrollmentListSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source='course.name',  read_only=True)
    original_walkin_course_name = serializers.CharField(source='original_walkin_course.name', read_only=True)
    final_enrollment_course_name = serializers.CharField(source='final_enrollment_course.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name',  read_only=True)
    payment_status = serializers.SerializerMethodField()
    payment_balance = serializers.SerializerMethodField()
    paid_amount = serializers.SerializerMethodField()
    counselor_name = serializers.SerializerMethodField()
    counselor_user = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    preferred_timing_display = serializers.CharField(source='get_preferred_timing_display', read_only=True)
    qualification_display = serializers.SerializerMethodField()
    rules_signing_status = serializers.SerializerMethodField()
    payment_schedule_status = serializers.SerializerMethodField()

    class Meta:
        model  = Enrollment
        fields = ['id','student_number','name','dob','phone','email','location','pincode',
                  'course_name','branch_name','final_fees','enrollment_date','status',
                  'original_walkin_course','original_walkin_course_name',
                  'final_enrollment_course','final_enrollment_course_name',
                  'payment_status','payment_balance','paid_amount','counselor_name',
                  'counselor','counselor_user','is_important',
                  'custom_payable_fee','net_payable_fee','source','source_display','preferred_timing',
                  'preferred_timing_display','qualification','qualification_display','degree',
                  'expected_course_budget','planned_joining_time','primary_goal','other_institutes_considering',
                  'counselor_status','competitor_status','follow_up_priority','conversion_probability',
                  'demo_class','interested_global_certification','admin_notes','rules_signing_status',
                  'payment_schedule_status']

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        if not (request and request.user and request.user.is_super_admin):
            fields.pop('admin_notes', None)
        return fields

    def get_payment_status(self, obj):
        if hasattr(obj, 'payment'):
            return obj.payment.status
        return None

    def get_payment_balance(self, obj):
        if hasattr(obj, 'payment'):
            return obj.payment.balance
        return enrollment_payable_fee(obj)

    def get_paid_amount(self, obj):
        if hasattr(obj, 'payment'):
            return obj.payment.paid_amount
        return 0

    def get_counselor_name(self, obj):
        user = enrollment_counselor(obj)
        return user.full_name if user else ''

    def get_counselor_user(self, obj):
        return user_identity_payload(enrollment_counselor(obj))

    def get_qualification_display(self, obj):
        return qualification_display_value(obj.qualification)

    def get_rules_signing_status(self, obj):
        signing = getattr(obj, 'rules_signing', None)
        return signing.status if signing else RulesSigningRequest.Status.PENDING

    def get_payment_schedule_status(self, obj):
        if obj.payment_schedule_locked:
            return 'locked'
        if obj.payment_schedule:
            return 'saved'
        return 'draft'


class EnrollmentDetailSerializer(serializers.ModelSerializer):
    course_name  = serializers.CharField(source='course.name', read_only=True)
    course_duration_months = serializers.IntegerField(source='course.duration_months', read_only=True)
    original_walkin_course_name = serializers.CharField(source='original_walkin_course.name', read_only=True)
    final_enrollment_course_name = serializers.CharField(source='final_enrollment_course.name', read_only=True)
    branch_name  = serializers.CharField(source='branch.name', read_only=True)
    payment_info = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    preferred_timing_display = serializers.CharField(source='get_preferred_timing_display', read_only=True)
    qualification_display = serializers.SerializerMethodField()
    discount_name = serializers.CharField(source='discount.name', read_only=True)
    rules_signing_status = serializers.SerializerMethodField()
    rules_signed_pdf_url = serializers.SerializerMethodField()
    rules_selfie_url = serializers.SerializerMethodField()
    rules_submitted_at = serializers.SerializerMethodField()
    installment_schedule = serializers.SerializerMethodField()
    course_change_history = CourseChangeHistorySerializer(many=True, read_only=True)
    counselor_change_history = EnrollmentCounselorChangeHistorySerializer(many=True, read_only=True)
    counselor_change_requests = CounselorChangeRequestSerializer(many=True, read_only=True)
    rules_reset_history = EnrollmentRulesResetHistorySerializer(many=True, read_only=True)
    counselor_id = serializers.SerializerMethodField()
    counselor_name = serializers.SerializerMethodField()
    counselor_user = serializers.SerializerMethodField()
    lead_created_date = serializers.SerializerMethodField()
    walkin_date = serializers.SerializerMethodField()
    first_payment_date = serializers.SerializerMethodField()
    status_history = serializers.SerializerMethodField()

    class Meta:
        model  = Enrollment
        fields = '__all__'
        read_only_fields = [
            'student_number', 'final_fees', 'custom_payable_fee', 'net_payable_fee',
            'spot_conversion_discount_amount', 'buddy_offer_amount', 'enrolled_by', 'created_by',
        ]

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        if not (request and request.user and request.user.is_super_admin):
            fields.pop('admin_notes', None)
        return fields

    def validate(self, attrs):
        attrs = super().validate(attrs)
        spot_applied = attrs.get(
            'spot_conversion_discount_applied',
            getattr(self.instance, 'spot_conversion_discount_applied', False),
        )
        if spot_applied:
            walkin = attrs.get('walkin') or getattr(self.instance, 'walkin', None) or self.context.get('walkin')
            if not walkin:
                raise serializers.ValidationError({
                    'spot_conversion_discount_applied': 'Spot conversion discount is available only for walk-in enrollments.'
                })
            expires_at = walkin.created_at + timedelta(hours=24) if walkin.created_at else None
            if not expires_at or timezone.now() > expires_at:
                raise serializers.ValidationError({
                    'spot_conversion_discount_applied': 'Fees Reduction is available only for 24 hours from walk-in creation.'
                })
        return attrs

    def _rules_signing_data(self, obj):
        if hasattr(obj, '_rules_signing_data_cache'):
            return obj._rules_signing_data_cache
        base_fields = ['status', 'submitted_at', 'signed_pdf']
        try:
            data = RulesSigningRequest.objects.filter(enrollment=obj).annotate(
                has_signed_pdf_file=Case(
                    When(signed_pdf_file__isnull=False, then=Value(True)),
                    default=Value(False),
                    output_field=BooleanField(),
                ),
                has_selfie_image_file=Case(
                    When(selfie_image_file__isnull=False, then=Value(True)),
                    default=Value(False),
                    output_field=BooleanField(),
                ),
            ).values(
                *base_fields,
                'selfie_image',
                'has_signed_pdf_file',
                'has_selfie_image_file',
            ).first()
        except (OperationalError, ProgrammingError):
            try:
                data = RulesSigningRequest.objects.filter(enrollment=obj).values(*base_fields).first()
            except (OperationalError, ProgrammingError):
                data = None
        obj._rules_signing_data_cache = data or {}
        return obj._rules_signing_data_cache

    def _file_url(self, path):
        if not path:
            return None
        try:
            url = default_storage.url(path)
        except Exception:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url

    def _proof_url(self, obj, field_name, legacy_field_name, path_name):
        data = self._rules_signing_data(obj)
        if (
            data.get('status') != RulesSigningRequest.Status.SUBMITTED
            and not data.get(field_name)
            and not data.get(legacy_field_name)
        ):
            return None
        base_path = getattr(settings, 'APP_BASE_PATH', '') or ''
        url = f'{base_path}/{path_name}/{obj.id}/'
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url

    def get_payment_info(self, obj):
        if hasattr(obj, 'payment'):
            return PaymentSerializer(obj.payment).data
        return None

    def get_counselor_id(self, obj):
        user = enrollment_counselor(obj)
        return user.id if user else None

    def get_counselor_name(self, obj):
        user = enrollment_counselor(obj)
        return user.full_name if user else ''

    def get_counselor_user(self, obj):
        return user_identity_payload(enrollment_counselor(obj))

    def get_qualification_display(self, obj):
        return qualification_display_value(obj.qualification)

    def _journey_walkin(self, obj):
        if obj.walkin_id and obj.walkin:
            return obj.walkin
        lead = obj.lead or None
        if lead:
            linked_walkin = getattr(lead, 'walkin', None)
            if linked_walkin:
                return linked_walkin
        return WalkIn.objects.filter(converted_to_type='enrollment', converted_record_id=obj.id).select_related('lead').first()

    def get_lead_created_date(self, obj):
        walkin = self._journey_walkin(obj)
        lead = obj.lead or (walkin.lead if walkin and walkin.lead_id else None)
        return lead.created_at if lead else None

    def get_walkin_date(self, obj):
        walkin = self._journey_walkin(obj)
        if walkin:
            return walkin.visit_date
        if obj.lead_id and obj.lead:
            return obj.lead.walkin_date
        return None

    def get_first_payment_date(self, obj):
        payment = getattr(obj, 'payment', None)
        if not payment:
            return None
        installments = list(payment.installments.all())
        if not installments:
            return None
        return min((installment.payment_date for installment in installments if installment.payment_date), default=None)

    def get_status_history(self, obj):
        return status_history_rows(
            CandidateStatusHistory.RecordType.ENROLLMENT,
            obj.id,
            [*Enrollment.Status.choices, *Lead.CounselorStatus.choices],
        )

    def get_rules_signing_status(self, obj):
        return self._rules_signing_data(obj).get('status') or 'pending'

    def get_rules_signed_pdf_url(self, obj):
        return self._proof_url(obj, 'has_signed_pdf_file', 'signed_pdf', 'rules-signed-pdf')

    def get_rules_selfie_url(self, obj):
        return self._proof_url(obj, 'has_selfie_image_file', 'selfie_image', 'rules-selfie')

    def get_rules_submitted_at(self, obj):
        return self._rules_signing_data(obj).get('submitted_at')

    def get_installment_schedule(self, obj):
        schedule = get_enrollment_installment_schedule(obj)
        payment_summary = []
        if getattr(obj, 'payment', None):
            payment_summary = payment_installment_summary(obj.payment)
        summary_by_index = {item['index']: item for item in payment_summary}
        return [
            {
                **item,
                'due_date': item['due_date'].isoformat() if hasattr(item.get('due_date'), 'isoformat') else item.get('due_date'),
                'paid_amount': summary_by_index.get(index, {}).get('paid_amount', 0),
                'pending_amount': summary_by_index.get(index, {}).get('pending_amount', item.get('amount') or 0),
                'status': summary_by_index.get(index, {}).get('status', 'pending'),
            }
            for index, item in enumerate(schedule, start=1)
        ]

# ============================================================
# backend/apps/transfers/serializers.py
# ============================================================
from crm.models import BranchTransferRequest


class BranchTransferRequestSerializer(serializers.ModelSerializer):
    current_branch_name = serializers.CharField(source='current_branch.name', read_only=True)
    requested_branch_name = serializers.CharField(source='requested_branch.name', read_only=True)
    course_name = serializers.CharField(source='course.name', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.full_name', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True)

    class Meta:
        model = BranchTransferRequest
        fields = '__all__'
        read_only_fields = [
            'requested_by', 'reviewed_by', 'reviewed_at', 'status',
            'enrollment', 'created_at', 'updated_at',
        ]


# ============================================================
# backend/apps/payments/serializers.py
# ============================================================
from decimal import Decimal

from crm.models import Payment, PaymentInstallment, PaymentReasonRequest, PaymentReasonMessage, AdminReceipt, WhatsAppMessage, build_payment_installment_summary_from_records, get_payment_installment_schedule


def payment_installment_summary(payment):
    return build_payment_installment_summary_from_records(payment)


class PaymentInstallmentSerializer(serializers.ModelSerializer):
    collected_by_name = serializers.CharField(source='collected_by.full_name', read_only=True)
    bill_generated_by_name = serializers.CharField(source='bill_generated_by.full_name', read_only=True)
    bill_is_generated = serializers.SerializerMethodField()
    bill_last_sent_at = serializers.SerializerMethodField()
    bill_last_sent_at_display = serializers.SerializerMethodField()
    bill_last_sent_by_name = serializers.SerializerMethodField()
    document_number = serializers.SerializerMethodField()
    document_is_generated = serializers.SerializerMethodField()
    document_type_display = serializers.SerializerMethodField()
    document_status = serializers.SerializerMethodField()
    document_status_display = serializers.SerializerMethodField()
    installment_status = serializers.SerializerMethodField()

    class Meta:
        model  = PaymentInstallment
        fields = '__all__'
        read_only_fields = [
            'collected_by', 'created_at', 'installment_index', 'installment_label',
            'document_type', 'receipt_number', 'bill_number', 'bill_generated_at',
            'bill_generated_by', 'bill_total', 'document_snapshot', 'document_html',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.pop('document_snapshot', None)
        data.pop('document_html', None)
        return data

    def _next_cash_reference(self, payment):
        student_id = payment.enrollment.student_number or f'ENR{payment.enrollment_id}'
        payment_count = payment.installments.count()
        return f'{student_id}-P{payment_count + 1:02d}'

    def validate(self, attrs):
        attrs = super().validate(attrs)
        mode = attrs.get('payment_mode') or getattr(self.instance, 'payment_mode', PaymentInstallment.Mode.CASH)
        payment = attrs.get('payment') or getattr(self.instance, 'payment', None)
        reference = str(attrs.get('reference_number') or '').strip()

        if mode == PaymentInstallment.Mode.CASH:
            if self.instance:
                attrs['reference_number'] = reference or self.instance.reference_number
                return attrs
            if payment:
                attrs['reference_number'] = self._next_cash_reference(payment)
            elif not reference:
                raise serializers.ValidationError({'reference_number': 'Payment reference is required.'})
            return attrs

        if not reference:
            label = {
                PaymentInstallment.Mode.UPI: 'UPI Transaction ID',
                PaymentInstallment.Mode.CASH_UPI: 'UPI Transaction ID',
                PaymentInstallment.Mode.CHEQUE: 'Cheque Number',
                PaymentInstallment.Mode.BANK: 'Transfer ID / Reference ID',
                PaymentInstallment.Mode.CARD: 'Card Last 4 Digits',
            }.get(mode, 'Reference Number')
            raise serializers.ValidationError({'reference_number': f'{label} is required.'})

        if mode == PaymentInstallment.Mode.CARD and not re.fullmatch(r'\d{4}', reference):
            raise serializers.ValidationError({'reference_number': 'Card Last 4 Digits must be exactly 4 digits.'})

        attrs['reference_number'] = reference
        return attrs

    def get_bill_is_generated(self, obj):
        return bool(obj.bill_number and obj.bill_generated_at)

    def _latest_bill_send(self, obj):
        if not obj.bill_number:
            return None
        return (
            WhatsAppMessage.objects
            .filter(
                related_model='payment_installment',
                related_id=obj.id,
                status=WhatsAppMessage.MsgStatus.SENT,
            )
            .select_related('sent_by')
            .order_by('-sent_at', '-created_at')
            .first()
        )

    def get_bill_last_sent_at(self, obj):
        log = self._latest_bill_send(obj)
        if not log:
            return None
        return log.sent_at or log.created_at

    def get_bill_last_sent_at_display(self, obj):
        sent_at = self.get_bill_last_sent_at(obj)
        if not sent_at:
            return ''
        return timezone.localtime(sent_at).strftime('%d-%b-%Y %I:%M %p')

    def get_bill_last_sent_by_name(self, obj):
        log = self._latest_bill_send(obj)
        if not log or not log.sent_by:
            return ''
        return log.sent_by.full_name or log.sent_by.username

    def get_document_number(self, obj):
        if obj.bill_number:
            return obj.bill_number
        return obj.receipt_number

    def get_document_is_generated(self, obj):
        return bool(self.get_document_number(obj))

    def get_document_type_display(self, obj):
        if obj.bill_number or obj.document_type == PaymentInstallment.DocumentType.BILL:
            return 'Bill'
        if obj.receipt_number:
            return 'Receipt'
        return 'Pending Approval'

    def get_document_status(self, obj):
        if obj.bill_number:
            return 'bill_generated'
        if obj.receipt_number:
            return 'receipt_generated'
        return 'pending_approval'

    def get_document_status_display(self, obj):
        return {
            'pending_approval': 'Pending Approval',
            'receipt_generated': 'Receipt Generated',
            'bill_generated': 'Bill Generated',
        }.get(self.get_document_status(obj), 'Pending Approval')

    def get_installment_status(self, obj):
        for item in payment_installment_summary(obj.payment):
            if item['index'] == obj.installment_index:
                return item['status']
        return 'pending'


class PaymentReasonMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_role_display = serializers.CharField(source='get_sender_role_display', read_only=True)
    status_display = serializers.SerializerMethodField()
    created_display = serializers.SerializerMethodField()

    class Meta:
        model = PaymentReasonMessage
        fields = [
            'id', 'reason_request', 'sender', 'sender_name', 'sender_role',
            'sender_role_display', 'message', 'status', 'status_display',
            'promised_payment_date', 'created_at', 'created_display',
        ]
        read_only_fields = [
            'reason_request', 'sender', 'sender_name', 'sender_role',
            'sender_role_display', 'status', 'status_display', 'created_at',
            'created_display',
        ]

    def get_sender_name(self, obj):
        if obj.sender:
            return obj.sender.full_name or obj.sender.username
        return obj.get_sender_role_display()

    def get_status_display(self, obj):
        if not obj.status:
            return ''
        return dict(PaymentReasonRequest.Status.choices).get(obj.status, obj.status.replace('_', ' ').title())

    def get_created_display(self, obj):
        return timezone.localtime(obj.created_at).strftime('%d %b %Y, %I:%M %p')


class PaymentReasonRequestSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='payment.enrollment.name', read_only=True)
    course_name = serializers.CharField(source='payment.enrollment.course.name', read_only=True)
    branch_name = serializers.SerializerMethodField()
    admin_name = serializers.CharField(source='admin_user.full_name', read_only=True)
    branch_staff_name = serializers.CharField(source='branch_staff.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    submitted_by = serializers.CharField(source='branch_staff.full_name', read_only=True)
    submitted_display = serializers.SerializerMethodField()
    created_display = serializers.SerializerMethodField()
    current_installment_due_date = serializers.SerializerMethodField()
    messages = PaymentReasonMessageSerializer(many=True, read_only=True)

    class Meta:
        model = PaymentReasonRequest
        fields = [
            'id', 'payment', 'installment_index', 'installment_label',
            'installment_due_date', 'current_installment_due_date',
            'admin_user', 'admin_name', 'branch_staff', 'branch_staff_name',
            'question', 'staff_response', 'promised_payment_date', 'status',
            'status_display', 'student_name', 'course_name', 'branch_name',
            'submitted_by', 'submitted_display', 'created_display',
            'messages',
            'created_at', 'responded_at', 'approved_at', 'rejected_at', 'resolved_at',
        ]
        read_only_fields = [
            'admin_user', 'branch_staff', 'question', 'status',
            'created_at', 'responded_at', 'approved_at', 'rejected_at', 'resolved_at',
        ]

    def get_submitted_display(self, obj):
        if not obj.responded_at:
            return ''
        return timezone.localtime(obj.responded_at).strftime('%d %b %Y, %I:%M %p')

    def get_branch_name(self, obj):
        branch = obj.payment.effective_branch if obj.payment_id and obj.payment else None
        return branch.name if branch else ''

    def get_created_display(self, obj):
        return timezone.localtime(obj.created_at).strftime('%d %b %Y, %I:%M %p')

    def get_current_installment_due_date(self, obj):
        summary = payment_installment_summary(obj.payment)
        for item in summary:
            if item['index'] == obj.installment_index:
                return item.get('due_date')
        return obj.installment_due_date


class PaymentSerializer(serializers.ModelSerializer):
    balance       = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    installments  = PaymentInstallmentSerializer(many=True, read_only=True)
    student_name  = serializers.CharField(source='enrollment.name',          read_only=True)
    student_number= serializers.CharField(source='enrollment.student_number', read_only=True)
    student_phone = serializers.CharField(source='enrollment.phone', read_only=True)
    course_name = serializers.CharField(source='enrollment.course.name', read_only=True)
    first_class_date = serializers.DateField(source='enrollment.start_date', read_only=True)
    branch = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    enrollment_branch = serializers.IntegerField(source='enrollment.branch_id', read_only=True)
    enrollment_branch_name = serializers.CharField(source='enrollment.branch.name', read_only=True)
    payment_branch = serializers.IntegerField(source='payment_branch_id', read_only=True)
    counselor_name = serializers.SerializerMethodField()
    counselor_user = serializers.SerializerMethodField()
    payment_schedule = serializers.SerializerMethodField()
    installment_summary = serializers.SerializerMethodField()
    active_reason_requests = serializers.SerializerMethodField()
    latest_reason_request = serializers.SerializerMethodField()

    class Meta:
        model  = Payment
        fields = ['id','enrollment','student_name','student_number','student_phone',
                  'course_name','first_class_date','branch','branch_name','counselor_name',
                  'counselor_user','enrollment_branch','enrollment_branch_name','payment_branch',
                  'total_fees','paid_amount','balance','status',
                  'next_payment_date','payment_schedule','installment_summary','manual_installment_schedule',
                  'installments','active_reason_requests','latest_reason_request','updated_at']
        read_only_fields = ['paid_amount','balance','status']

    def to_representation(self, instance):
        view = self.context.get('view')
        if getattr(view, 'action', '') != 'list':
            instance.recalculate_from_installments(save=True)
        return super().to_representation(instance)

    def get_branch_name(self, obj):
        branch = obj.effective_branch
        return branch.name if branch else None

    def get_branch(self, obj):
        branch = obj.effective_branch
        return branch.id if branch else None

    def get_counselor_name(self, obj):
        user = enrollment_counselor(obj.enrollment)
        if not user:
            return ''
        return user.full_name or user.username

    def get_counselor_user(self, obj):
        return user_identity_payload(enrollment_counselor(obj.enrollment))

    def get_payment_schedule(self, obj):
        schedule = get_payment_installment_schedule(obj)
        return [
            {
                **item,
                'due_date': item['due_date'].isoformat() if hasattr(item.get('due_date'), 'isoformat') else item.get('due_date'),
            }
            for item in schedule
        ]

    def get_installment_summary(self, obj):
        return payment_installment_summary(obj)

    def get_active_reason_requests(self, obj):
        prefetched = getattr(obj, '_prefetched_objects_cache', {}).get('reason_requests')
        if prefetched is not None:
            requests = [
                request for request in prefetched
                if request.status in [
                    PaymentReasonRequest.Status.PENDING_RESPONSE,
                    PaymentReasonRequest.Status.PENDING_ADMIN_APPROVAL,
                ]
            ]
            return PaymentReasonRequestSerializer(requests, many=True).data
        requests = obj.reason_requests.filter(
            status__in=[
                PaymentReasonRequest.Status.PENDING_RESPONSE,
                PaymentReasonRequest.Status.PENDING_ADMIN_APPROVAL,
            ],
        ).select_related(
            'admin_user',
            'branch_staff',
            'payment__enrollment__course',
            'payment__enrollment__branch',
        ).prefetch_related('messages__sender')
        return PaymentReasonRequestSerializer(requests, many=True).data

    def get_latest_reason_request(self, obj):
        prefetched = getattr(obj, '_prefetched_objects_cache', {}).get('reason_requests')
        if prefetched is not None:
            reason_request = next(
                iter(sorted(prefetched, key=lambda item: item.created_at, reverse=True)),
                None,
            )
            return PaymentReasonRequestSerializer(reason_request).data if reason_request else None
        reason_request = obj.reason_requests.select_related(
            'admin_user',
            'branch_staff',
            'payment__enrollment__course',
            'payment__enrollment__branch',
        ).prefetch_related('messages__sender').order_by('-created_at').first()
        if not reason_request:
            return None
        return PaymentReasonRequestSerializer(reason_request).data


class AdminReceiptSerializer(serializers.ModelSerializer):
    generated_by_name = serializers.CharField(source='generated_by.full_name', read_only=True)
    payment_mode_display = serializers.CharField(source='get_payment_mode_display', read_only=True)

    class Meta:
        model = AdminReceipt
        fields = [
            'id', 'receipt_number', 'name', 'phone', 'purpose', 'amount',
            'payment_mode', 'payment_mode_display', 'payment_date', 'notes',
            'generated_by', 'generated_by_name', 'generated_on', 'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'receipt_number', 'generated_by', 'generated_by_name',
            'generated_on', 'created_at', 'updated_at',
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        for field in ('name', 'phone', 'purpose'):
            value = attrs.get(field, getattr(self.instance, field, ''))
            if not str(value or '').strip():
                raise serializers.ValidationError({field: 'This field is required.'})
            attrs[field] = str(value).strip()
        for field in ('notes',):
            if field in attrs:
                attrs[field] = str(attrs.get(field) or '').strip()
        amount = attrs.get('amount', getattr(self.instance, 'amount', None))
        if amount is not None and Decimal(str(amount or 0)) <= 0:
            raise serializers.ValidationError({'amount': 'Amount must be greater than zero.'})
        return attrs


# ============================================================
# backend/apps/automation/serializers.py
# ============================================================
from crm.models import WhatsAppMessage, WhatsAppTemplate, Notification


class WhatsAppMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = WhatsAppMessage
        fields = '__all__'
        read_only_fields = ['wa_message_id','error_message','sent_at','status']


class WhatsAppTemplateSerializer(serializers.ModelSerializer):
    template_type_display = serializers.CharField(source='get_template_type_display', read_only=True)

    class Meta:
        model = WhatsAppTemplate
        fields = ['id', 'name', 'template_type', 'template_type_display', 'message_body',
                  'wati_template_name', 'wati_language_code',
                  'is_active', 'created_by', 'created_at', 'updated_at']
        read_only_fields = ['created_by', 'created_at', 'updated_at']


class NotificationSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_display = serializers.SerializerMethodField()

    class Meta:
        model  = Notification
        fields = '__all__'
        read_only_fields = ['created_at', 'resolved_at']

    def get_created_display(self, obj):
        return timezone.localtime(obj.created_at).strftime('%d %b %Y, %I:%M %p')
