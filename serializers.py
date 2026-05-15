# ============================================================
# backend/apps/accounts/serializers.py
# ============================================================
import re

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from django.conf import settings
from django.utils import timezone
from django.core.files.storage import default_storage
from django.db.utils import OperationalError, ProgrammingError
from crm.models import Branch, UserTarget, UserMonthlyRating, BranchTarget, HistoricalAnalyticsEntry, UserSessionLog

User = get_user_model()


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
                  'phone','role','branch','branch_name','is_active',
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


# ============================================================
# backend/apps/courses/serializers.py
# ============================================================
from crm.models import Course, Enrollment, Lead, Payment, PaymentInstallment, RulesSigningRequest, WalkIn


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
from crm.models import FollowUp, Lead, LeadImportHistory


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


class LeadListSerializer(serializers.ModelSerializer):
    """Compact serializer for list endpoints."""
    course_name  = serializers.CharField(source='course.name', read_only=True)
    status = serializers.SerializerMethodField()
    lead_status = serializers.SerializerMethodField()
    source = serializers.SerializerMethodField()
    source_display = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    follow_up_by = serializers.IntegerField(source='assigned_to_id', read_only=True)
    assigned_user = serializers.SerializerMethodField()
    branch_name  = serializers.CharField(source='branch.name', read_only=True)
    next_follow_up_date = serializers.SerializerMethodField()
    imported_via_csv = serializers.SerializerMethodField()

    class Meta:
        model  = Lead
        fields = ['id','lead_number','name','phone','location','course_name','remarks',
                  'status','lead_status','source','source_display','walkin_date','next_follow_up_date',
                  'assigned_to','follow_up_by','assigned_to_name','assigned_user',
                  'branch_name','created_by','imported_via_csv','created_at']

    def get_status(self, obj):
        return safe_deferred_value(obj, 'status', Lead.Status.NEW) or Lead.Status.NEW

    def get_lead_status(self, obj):
        return self.get_status(obj)

    def get_source(self, obj):
        return safe_deferred_value(obj, 'source', Lead.Source.MANUAL) or Lead.Source.MANUAL

    def get_source_display(self, obj):
        source = self.get_source(obj)
        return dict(Lead.Source.choices).get(source, source or 'Manual')

    def get_next_follow_up_date(self, obj):
        value = safe_deferred_value(obj, 'next_follow_up_date', None)
        return value.isoformat() if hasattr(value, 'isoformat') else value

    def get_imported_via_csv(self, obj):
        try:
            return bool(safe_deferred_value(obj, 'imported_via_csv', False))
        except Exception:
            return False

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
            return {
                'id': user.id,
                'name': user.full_name or user.username,
                'branch_id': user.branch_id,
                'branch_name': user.branch.name if user.branch else '',
            }
        except Exception:
            return None


class LeadInboxSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source='course.name', read_only=True)
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


class LeadDetailSerializer(serializers.ModelSerializer):
    """Full serializer for retrieve/create/update."""
    course_name      = serializers.CharField(source='course.name',        read_only=True)
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
    source_display   = serializers.CharField(source='get_source_display', read_only=True)
    willing_to_join_display = serializers.CharField(source='get_willing_to_join_display', read_only=True)
    qualification_display = serializers.SerializerMethodField()
    follow_ups       = serializers.SerializerMethodField()

    class Meta:
        model  = Lead
        fields = '__all__'
        read_only_fields = ['lead_number', 'created_by']

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            data = data.copy()
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
        return super().to_representation(instance)

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
            return {
                'id': user.id,
                'name': user.full_name or user.username,
                'branch_id': user.branch_id,
                'branch_name': user.branch.name if user.branch else '',
            }
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

    def get_qualification_display(self, obj):
        return qualification_display_value(safe_deferred_value(obj, 'qualification', ''))

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
        fields = ['walkin_date', 'next_follow_up_date', 'remarks', 'status']


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


# ============================================================
# backend/apps/walkins/serializers.py
# ============================================================
from crm.models import WalkIn, WalkInBranchChangeHistory


class WalkInListSerializer(serializers.ModelSerializer):
    course_name  = serializers.CharField(source='course.name',  read_only=True)
    branch_name  = serializers.CharField(source='branch.name',  read_only=True)
    assigned_name= serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    converted_by_name = serializers.SerializerMethodField()
    preferred_timing_display = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    walk_in_by_display = serializers.SerializerMethodField()

    class Meta:
        model  = WalkIn
        fields = ['id','candidate_number','name','phone','email','course_name',
                  'branch_name','status','visit_date','demo_class','assigned_name',
                  'created_by','created_by_name','converted_by_name',
                  'preferred_timing','preferred_timing_display','source','source_display',
                  'walk_in_by','walk_in_by_display','converted_to_type',
                  'converted_record_id','converted_at']

    def to_representation(self, instance):
        defaults = {
            'preferred_timing': '',
            'walk_in_by': '',
            'converted_to_type': '',
            'converted_record_id': None,
            'converted_at': None,
            'converted_by_id': None,
        }
        deferred = getattr(instance, 'get_deferred_fields', lambda: set())()
        for field_name, default in defaults.items():
            if field_name in deferred:
                instance.__dict__[field_name] = default
        return super().to_representation(instance)

    def get_assigned_name(self, obj):
        try:
            return obj.assigned_to.full_name if obj.assigned_to_id and obj.assigned_to else ''
        except Exception:
            return ''

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


class WalkInDetailSerializer(serializers.ModelSerializer):
    course_name   = serializers.CharField(source='course.name',          read_only=True)
    branch_name   = serializers.CharField(source='branch.name',          read_only=True)
    course_interested = serializers.CharField(source='course.name', read_only=True)
    assigned_name = serializers.CharField(source='assigned_to.full_name', read_only=True)
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

    class Meta:
        model  = WalkIn
        fields = '__all__'
        read_only_fields = ['candidate_number', 'created_by', 'walk_in_by']

    def to_representation(self, instance):
        defaults = {
            'qualification': '',
            'degree': '',
            'profession': '',
            'year_of_passing': None,
            'college_company': '',
            'preferred_timing': '',
            'interested_global_certification': False,
            'walk_in_by': '',
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
        return super().to_representation(instance)

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

    def get_branch_change_history(self, obj):
        try:
            return WalkInBranchChangeHistorySerializer(obj.branch_change_history.select_related(
                'old_branch', 'new_branch', 'changed_by',
            ), many=True).data
        except (OperationalError, ProgrammingError):
            return []

    def validate(self, attrs):
        attrs = super().validate(attrs)
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


class PublicWalkInCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalkIn
        fields = [
            'branch', 'name', 'dob', 'phone', 'email', 'location', 'pincode', 'course',
            'qualification', 'degree', 'year_of_passing', 'college_company',
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


class DiscountSerializer(serializers.ModelSerializer):
    course_names = serializers.SerializerMethodField()
    branch_names = serializers.SerializerMethodField()
    status_label = serializers.CharField(read_only=True)

    class Meta:
        model = Discount
        fields = [
            'id', 'name', 'discount_type', 'value', 'apply_to_all_courses',
            'courses', 'course_names', 'apply_to_all_branches', 'branches', 'branch_names',
            'branch', 'valid_from', 'valid_to', 'is_active',
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
        valid_from = attrs.get('valid_from', getattr(self.instance, 'valid_from', None))
        valid_to = attrs.get('valid_to', getattr(self.instance, 'valid_to', None))
        apply_to_all = attrs.get('apply_to_all_courses', getattr(self.instance, 'apply_to_all_courses', False))
        courses = attrs.get('courses')
        value = attrs.get('value', getattr(self.instance, 'value', None))
        if value is not None and value < 0:
            raise serializers.ValidationError({'value': 'Discount amount cannot be negative.'})
        if valid_from and valid_to and valid_from > valid_to:
            raise serializers.ValidationError({'valid_to': 'Valid to date must be after valid from date.'})
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
from crm.models import Enrollment, RulesSigningRequest, get_default_installment_schedule


class EnrollmentListSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source='course.name',  read_only=True)
    original_walkin_course_name = serializers.CharField(source='original_walkin_course.name', read_only=True)
    final_enrollment_course_name = serializers.CharField(source='final_enrollment_course.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name',  read_only=True)
    payment_status = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    preferred_timing_display = serializers.CharField(source='get_preferred_timing_display', read_only=True)
    qualification_display = serializers.SerializerMethodField()

    class Meta:
        model  = Enrollment
        fields = ['id','student_number','name','dob','phone','email','location','pincode',
                  'course_name','branch_name','final_fees','enrollment_date','status',
                  'original_walkin_course','original_walkin_course_name',
                  'final_enrollment_course','final_enrollment_course_name',
                  'payment_status','source','source_display','preferred_timing',
                  'preferred_timing_display','qualification','qualification_display','degree',
                  'demo_class','interested_global_certification']

    def get_payment_status(self, obj):
        if hasattr(obj, 'payment'):
            return obj.payment.status
        return None

    def get_qualification_display(self, obj):
        return qualification_display_value(obj.qualification)


class EnrollmentDetailSerializer(serializers.ModelSerializer):
    course_name  = serializers.CharField(source='course.name', read_only=True)
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

    class Meta:
        model  = Enrollment
        fields = '__all__'
        read_only_fields = ['student_number', 'final_fees', 'enrolled_by', 'created_by']

    def _rules_signing_data(self, obj):
        if hasattr(obj, '_rules_signing_data_cache'):
            return obj._rules_signing_data_cache
        base_fields = ['status', 'submitted_at', 'signed_pdf']
        try:
            data = RulesSigningRequest.objects.filter(enrollment=obj).values(
                *base_fields,
                'selfie_image',
                'signed_pdf_file',
                'selfie_image_file',
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
        if not data.get(field_name) and not data.get(legacy_field_name):
            return None
        base_path = getattr(settings, 'APP_BASE_PATH', '') or ''
        url = f'{base_path}/{path_name}/{obj.id}/'
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url

    def get_payment_info(self, obj):
        if hasattr(obj, 'payment'):
            return PaymentSerializer(obj.payment).data
        return None

    def get_qualification_display(self, obj):
        return qualification_display_value(obj.qualification)

    def get_rules_signing_status(self, obj):
        return self._rules_signing_data(obj).get('status') or 'pending'

    def get_rules_signed_pdf_url(self, obj):
        return self._proof_url(obj, 'signed_pdf_file', 'signed_pdf', 'rules-signed-pdf')

    def get_rules_selfie_url(self, obj):
        return self._proof_url(obj, 'selfie_image_file', 'selfie_image', 'rules-selfie')

    def get_rules_submitted_at(self, obj):
        return self._rules_signing_data(obj).get('submitted_at')

    def get_installment_schedule(self, obj):
        schedule = get_default_installment_schedule(obj)
        return [
            {
                **item,
                'due_date': item['due_date'].isoformat() if item.get('due_date') else None,
            }
            for item in schedule
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

from crm.models import Payment, PaymentInstallment, AdminReceipt, get_payment_installment_schedule


def payment_installment_summary(payment):
    schedule = get_payment_installment_schedule(payment)
    paid_by_index = {}
    for installment in payment.installments.all():
        index = installment.installment_index or 1
        paid_by_index[index] = paid_by_index.get(index, Decimal('0')) + (installment.amount or Decimal('0'))

    summary = []
    for index, item in enumerate(schedule, start=1):
        required_amount = Decimal(str(item.get('amount') or 0))
        paid_amount = paid_by_index.get(index, Decimal('0'))
        pending_amount = max(required_amount - paid_amount, Decimal('0'))
        if paid_amount >= required_amount and required_amount > 0:
            status = 'paid'
        elif paid_amount > 0:
            status = 'partial'
        else:
            status = 'pending'
        due_date = item.get('due_date')
        summary.append({
            'index': index,
            'label': item.get('label') or f'{index} Installment',
            'required_amount': required_amount,
            'paid_amount': paid_amount,
            'pending_amount': pending_amount,
            'status': status,
            'due_date': due_date.isoformat() if hasattr(due_date, 'isoformat') else due_date,
        })
    return summary


class PaymentInstallmentSerializer(serializers.ModelSerializer):
    collected_by_name = serializers.CharField(source='collected_by.full_name', read_only=True)
    bill_generated_by_name = serializers.CharField(source='bill_generated_by.full_name', read_only=True)
    bill_is_generated = serializers.SerializerMethodField()
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
            'bill_generated_by',
        ]

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


class PaymentSerializer(serializers.ModelSerializer):
    balance       = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    installments  = PaymentInstallmentSerializer(many=True, read_only=True)
    student_name  = serializers.CharField(source='enrollment.name',          read_only=True)
    student_number= serializers.CharField(source='enrollment.student_number', read_only=True)
    student_phone = serializers.CharField(source='enrollment.phone', read_only=True)
    course_name = serializers.CharField(source='enrollment.course.name', read_only=True)
    first_class_date = serializers.DateField(source='enrollment.start_date', read_only=True)
    branch = serializers.IntegerField(source='enrollment.branch_id', read_only=True)
    branch_name = serializers.SerializerMethodField()
    payment_schedule = serializers.SerializerMethodField()
    installment_summary = serializers.SerializerMethodField()

    class Meta:
        model  = Payment
        fields = ['id','enrollment','student_name','student_number','student_phone',
                  'course_name','first_class_date','branch','branch_name',
                  'total_fees','paid_amount','balance','status',
                  'next_payment_date','payment_schedule','installment_summary','manual_installment_schedule',
                  'installments','updated_at']
        read_only_fields = ['paid_amount','balance','status']

    def get_branch_name(self, obj):
        return obj.enrollment.branch.name if obj.enrollment.branch else None

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
