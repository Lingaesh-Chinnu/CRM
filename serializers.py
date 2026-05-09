# ============================================================
# backend/apps/accounts/serializers.py
# ============================================================
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from django.conf import settings
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
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def validate_month(self, value):
        if value < 1 or value > 12:
            raise serializers.ValidationError('Month must be between 1 and 12.')
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


class FollowUpSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(source='updated_by.full_name', read_only=True)

    class Meta:
        model = FollowUp
        fields = [
            'id', 'record_type', 'record_id', 'follow_up_date',
            'next_follow_up_date', 'remarks', 'updated_by',
            'updated_by_name', 'created_at',
        ]
        read_only_fields = ['record_type', 'record_id', 'updated_by', 'created_at']


class LeadListSerializer(serializers.ModelSerializer):
    """Compact serializer for list endpoints."""
    course_name  = serializers.CharField(source='course.name', read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.full_name', read_only=True)
    branch_name  = serializers.CharField(source='branch.name', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    class Meta:
        model  = Lead
        fields = ['id','lead_number','name','phone','location','course_name',
                  'status','source','source_display','walkin_date','next_follow_up_date',
                  'assigned_to_name','branch_name','created_at']


class LeadInboxSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source='course.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    willing_to_join_display = serializers.CharField(source='get_willing_to_join_display', read_only=True)
    qualification_display = serializers.CharField(source='get_qualification_display', read_only=True)

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


class LeadDetailSerializer(serializers.ModelSerializer):
    """Full serializer for retrieve/create/update."""
    course_name      = serializers.CharField(source='course.name',        read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.full_name', read_only=True)
    branch_name      = serializers.CharField(source='branch.name',         read_only=True)
    created_by_name  = serializers.CharField(source='created_by.full_name', read_only=True)
    converted_by_name = serializers.CharField(source='converted_by.full_name', read_only=True)
    source_display   = serializers.CharField(source='get_source_display', read_only=True)
    willing_to_join_display = serializers.CharField(source='get_willing_to_join_display', read_only=True)
    qualification_display = serializers.CharField(source='get_qualification_display', read_only=True)
    follow_ups       = serializers.SerializerMethodField()

    class Meta:
        model  = Lead
        fields = '__all__'
        read_only_fields = ['lead_number', 'created_by']

    def get_follow_ups(self, obj):
        follow_ups = FollowUp.objects.filter(
            record_type=FollowUp.RecordType.LEAD,
            record_id=obj.id,
        ).order_by('-created_at', '-id')
        return FollowUpSerializer(follow_ups, many=True).data

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is None:
            data = {**getattr(self, 'initial_data', {}), **attrs}
            required_fields = ['name', 'phone', 'course', 'source']
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
    assigned_name= serializers.CharField(source='assigned_to.full_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    converted_by_name = serializers.CharField(source='converted_by.full_name', read_only=True)
    preferred_timing_display = serializers.CharField(source='get_preferred_timing_display', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    walk_in_by_display = serializers.CharField(source='get_walk_in_by_display', read_only=True)

    class Meta:
        model  = WalkIn
        fields = ['id','candidate_number','name','phone','email','course_name',
                  'branch_name','status','visit_date','demo_class','assigned_name',
                  'created_by','created_by_name','converted_by_name',
                  'preferred_timing','preferred_timing_display','source','source_display',
                  'walk_in_by','walk_in_by_display','converted_to_type',
                  'converted_record_id','converted_at']


class WalkInDetailSerializer(serializers.ModelSerializer):
    course_name   = serializers.CharField(source='course.name',          read_only=True)
    branch_name   = serializers.CharField(source='branch.name',          read_only=True)
    assigned_name = serializers.CharField(source='assigned_to.full_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    converted_by_name = serializers.CharField(source='converted_by.full_name', read_only=True)
    preferred_timing_display = serializers.CharField(source='get_preferred_timing_display', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    walk_in_by_display = serializers.CharField(source='get_walk_in_by_display', read_only=True)
    follow_ups = serializers.SerializerMethodField()
    branch_change_history = serializers.SerializerMethodField()

    class Meta:
        model  = WalkIn
        fields = '__all__'
        read_only_fields = ['candidate_number', 'created_by', 'walk_in_by']

    def get_follow_ups(self, obj):
        follow_ups = FollowUp.objects.filter(
            record_type=FollowUp.RecordType.WALKIN,
            record_id=obj.id,
        ).order_by('-created_at', '-id')
        return FollowUpSerializer(follow_ups, many=True).data

    def get_branch_change_history(self, obj):
        return WalkInBranchChangeHistorySerializer(obj.branch_change_history.select_related(
            'old_branch', 'new_branch', 'changed_by',
        ), many=True).data

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is None:
            data = {**getattr(self, 'initial_data', {}), **attrs}
            required_fields = [
                'branch', 'name', 'dob', 'phone', 'email', 'location', 'pincode',
                'course', 'preferred_timing', 'visit_date',
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
            'preferred_timing', 'demo_class', 'interested_global_certification',
            'source', 'visit_date'
        ]


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
    branch_name = serializers.CharField(source='branch.name',  read_only=True)
    payment_status = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    preferred_timing_display = serializers.CharField(source='get_preferred_timing_display', read_only=True)

    class Meta:
        model  = Enrollment
        fields = ['id','student_number','name','dob','phone','email','location','pincode',
                  'course_name','branch_name','final_fees','enrollment_date','status',
                  'payment_status','source','source_display','preferred_timing',
                  'preferred_timing_display','demo_class','interested_global_certification']

    def get_payment_status(self, obj):
        if hasattr(obj, 'payment'):
            return obj.payment.status
        return None


class EnrollmentDetailSerializer(serializers.ModelSerializer):
    course_name  = serializers.CharField(source='course.name', read_only=True)
    branch_name  = serializers.CharField(source='branch.name', read_only=True)
    payment_info = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    preferred_timing_display = serializers.CharField(source='get_preferred_timing_display', read_only=True)
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
from crm.models import Payment, PaymentInstallment, AdminReceipt, get_payment_installment_schedule


class PaymentInstallmentSerializer(serializers.ModelSerializer):
    collected_by_name = serializers.CharField(source='collected_by.full_name', read_only=True)
    bill_generated_by_name = serializers.CharField(source='bill_generated_by.full_name', read_only=True)
    bill_is_generated = serializers.SerializerMethodField()

    class Meta:
        model  = PaymentInstallment
        fields = '__all__'
        read_only_fields = ['collected_by', 'created_at']

    def get_bill_is_generated(self, obj):
        return bool(obj.bill_number and obj.bill_generated_at)


class PaymentSerializer(serializers.ModelSerializer):
    balance       = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    installments  = PaymentInstallmentSerializer(many=True, read_only=True)
    student_name  = serializers.CharField(source='enrollment.name',          read_only=True)
    student_number= serializers.CharField(source='enrollment.student_number', read_only=True)
    student_phone = serializers.CharField(source='enrollment.phone', read_only=True)
    course_name = serializers.CharField(source='enrollment.course.name', read_only=True)
    branch_name = serializers.SerializerMethodField()
    payment_schedule = serializers.SerializerMethodField()

    class Meta:
        model  = Payment
        fields = ['id','enrollment','student_name','student_number','student_phone',
                  'course_name','branch_name','total_fees','paid_amount','balance','status',
                  'next_payment_date','payment_schedule','manual_installment_schedule',
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

    class Meta:
        model  = Notification
        fields = '__all__'
        read_only_fields = ['created_at']
