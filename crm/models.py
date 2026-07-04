# ============================================================
# backend/apps/core/models.py
# Base abstract model — timestamps for all models
# ============================================================
from django.db import IntegrityError, models, transaction
from django.db.models.signals import post_delete
from django.core.exceptions import ObjectDoesNotExist
from django.dispatch import receiver
from django.utils import timezone
from django.utils.dateparse import parse_date
from decimal import Decimal


class TimeStampedModel(models.Model):
    """Abstract base model providing created_at / updated_at on every model."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


# ============================================================
# backend/apps/accounts/models.py
# ============================================================
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Branch(TimeStampedModel):
    """Physical branch / center of the institute."""
    name       = models.CharField(max_length=150)
    branch_code = models.CharField(max_length=2, unique=True, null=True, blank=True)
    address    = models.TextField(blank=True)
    city       = models.CharField(max_length=100, blank=True)
    state      = models.CharField(max_length=100, blank=True)
    pincode    = models.CharField(max_length=10, blank=True)
    phone      = models.CharField(max_length=20, blank=True)
    email      = models.EmailField(blank=True)
    is_active  = models.BooleanField(default=True)

    class Meta:
        db_table   = 'branches'
        verbose_name_plural = 'branches'
        ordering   = ['name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.branch_code:
            self.branch_code = get_next_branch_code()
        else:
            self.branch_code = str(self.branch_code).zfill(2)
        super().save(*args, **kwargs)


def get_next_branch_code():
    numeric_codes = []
    for code in Branch.objects.exclude(branch_code__isnull=True).exclude(branch_code='').values_list('branch_code', flat=True):
        try:
            numeric_codes.append(int(code))
        except (TypeError, ValueError):
            continue
    return f'{(max(numeric_codes) if numeric_codes else 0) + 1:02d}'


class UserManager(BaseUserManager):
    """Custom manager to create regular and super-admin users."""

    def create_user(self, username, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user  = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault('role', User.Role.SUPER_ADMIN)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        if extra_fields.get('role') != User.Role.SUPER_ADMIN:
            raise ValueError('Superuser must have role=super_admin')
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True')
        return self.create_user(username, email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    """Central user model for all staff and admins."""

    class Role(models.TextChoices):
        SUPER_ADMIN = 'super_admin', 'Admin'
        STAFF       = 'staff',       'Staff'

    class IdentityColor(models.TextChoices):
        PURPLE = 'purple', 'Purple'
        GREEN  = 'green',  'Green'
        ORANGE = 'orange', 'Orange'
        BLUE   = 'blue',   'Blue'
        CYAN   = 'cyan',   'Cyan'
        TEAL   = 'teal',   'Teal'
        AMBER  = 'amber',  'Amber'
        ROSE   = 'rose',   'Rose'

    branch     = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='staff_members')
    username   = models.CharField(max_length=150, unique=True)
    email      = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name  = models.CharField(max_length=100, blank=True)
    phone      = models.CharField(max_length=20, blank=True)
    role       = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF)
    identity_color = models.CharField(
        max_length=20,
        choices=IdentityColor.choices,
        blank=True,
        default='',
    )
    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)  # Django admin access
    must_change_password = models.BooleanField(default=False)

    objects    = UserManager()

    USERNAME_FIELD  = 'username'
    REQUIRED_FIELDS = ['email']

    class Meta:
        db_table = 'users'
        ordering = ['username']

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip() or self.username

    @property
    def is_super_admin(self):
        return self.role == self.Role.SUPER_ADMIN or self.is_superuser

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = self.Role.SUPER_ADMIN
            self.is_staff = True
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.username} ({self.get_role_display()})'


class UserSessionLog(TimeStampedModel):
    """Lightweight login/session activity log for admin monitoring."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='session_logs')
    login_at = models.DateTimeField(default=timezone.now, db_index=True)
    logout_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(default=timezone.now, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    is_active_session = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = 'user_session_logs'
        ordering = ['-login_at']

    @property
    def is_online(self):
        return self.is_active_session and self.last_seen_at >= timezone.now() - timezone.timedelta(minutes=5)

    def __str__(self):
        return f'{self.user.username} login at {self.login_at}'


class UserTarget(TimeStampedModel):
    """Monthly performance targets set by super admin for each staff user."""
    user           = models.ForeignKey(User, on_delete=models.CASCADE, related_name='targets')
    month          = models.PositiveSmallIntegerField()   # 1–12
    year           = models.PositiveSmallIntegerField()
    lead_target    = models.PositiveIntegerField(default=0)
    walkin_target  = models.PositiveIntegerField(default=0)
    enroll_target  = models.PositiveIntegerField(default=0)
    revenue_target = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table    = 'user_targets'
        unique_together = ('user', 'month', 'year')

    def __str__(self):
        return f'{self.user} — {self.month}/{self.year}'

class UserMonthlyRating(TimeStampedModel):
    """Stored monthly user star rating with deduction breakdown."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='monthly_ratings')
    year = models.PositiveSmallIntegerField(db_index=True)
    month = models.PositiveSmallIntegerField(db_index=True)
    score = models.PositiveSmallIntegerField(default=100)
    stars = models.PositiveSmallIntegerField(default=5)
    breakdown = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'user_monthly_ratings'
        unique_together = ('user', 'year', 'month')
        ordering = ['-year', '-month', 'user__username']

    def __str__(self):
        return f'{self.user.username} - {self.month}/{self.year}: {self.score}'


class BranchTarget(TimeStampedModel):
    """Monthly performance targets set by super admin for each branch."""
    branch         = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='targets')
    month          = models.PositiveSmallIntegerField()   # 1-12
    year           = models.PositiveSmallIntegerField()
    lead_target    = models.PositiveIntegerField(default=0)
    walkin_target  = models.PositiveIntegerField(default=0)
    enroll_target  = models.PositiveIntegerField(default=0)
    revenue_target = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_by     = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name='branch_targets_created')

    class Meta:
        db_table = 'branch_targets'
        unique_together = ('branch', 'month', 'year')
        ordering = ['-year', '-month', 'branch__name']

    def __str__(self):
        return f'{self.branch} - {self.month}/{self.year}'


class HistoricalAnalyticsEntry(TimeStampedModel):
    """Manually entered monthly historical activity counts for past-year analytics."""

    class Year(models.IntegerChoices):
        Y2023 = 2023, '2023'
        Y2024 = 2024, '2024'
        Y2025 = 2025, '2025'

    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='historical_analytics')
    year = models.PositiveSmallIntegerField(choices=Year.choices, db_index=True)
    month = models.PositiveSmallIntegerField(db_index=True)
    leads_count = models.PositiveIntegerField()
    walkins_count = models.PositiveIntegerField()
    enrollments_count = models.PositiveIntegerField()
    value_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='historical_analytics_created')

    class Meta:
        db_table = 'historical_analytics_entries'
        unique_together = ('year', 'month', 'branch')
        ordering = ['-year', '-month', 'branch__name']

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.month < 1 or self.month > 12:
            raise ValidationError({'month': 'Month must be between 1 and 12.'})

    def __str__(self):
        return f'{self.branch} - {self.month}/{self.year}'


class Course(TimeStampedModel):
    """Course catalogue. Only super admin can create / modify."""
    name             = models.CharField(max_length=200)
    description      = models.TextField(blank=True)
    duration_months  = models.PositiveSmallIntegerField(null=True, blank=True)
    actual_fees      = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount  = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active        = models.BooleanField(default=True)
    created_by       = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='courses_created')

    class Meta:
        db_table = 'courses'
        ordering = ['name']

    @property
    def final_fees(self):
        return max(self.actual_fees - self.discount_amount, 0)

    def __str__(self):
        return self.name


import uuid
from calendar import monthrange
from django.utils import timezone


def generate_lead_number():
    now    = timezone.now()
    prefix = f'LD-{now.strftime("%Y%m")}'
    numbers = []
    for lead_number in Lead.objects.filter(lead_number__startswith=prefix).values_list('lead_number', flat=True):
        try:
            numbers.append(int(str(lead_number).rsplit('-', 1)[-1]))
        except (TypeError, ValueError):
            continue
    next_number = (max(numbers) if numbers else 0) + 1
    while Lead.objects.filter(lead_number=f'{prefix}-{next_number:04d}').exists():
        next_number += 1
    return f'{prefix}-{next_number:04d}'


def is_lead_number_integrity_error(exc):
    message = str(exc)
    return 'leads_lead_number_key' in message or 'lead_number' in message


class Lead(TimeStampedModel):
    """Prospective student enquiry."""

    class Status(models.TextChoices):
        NEW                              = 'new',                              'New'
        COUNSELING_COMPLETED             = 'counseling_completed',             'Counseling Completed'
        DEMO_ATTENDED                    = 'demo_attended',                    'Demo Attended'
        INTERESTED                       = 'interested',                       'Interested'
        WILL_ENROLL                      = 'will_enroll',                      'Will Enroll'
        WILL_WALK_IN                     = 'will_walk_in',                     'Will Walk-in'
        NOT_ANSWERING                    = 'not_answering',                    'Not Answering'
        CALL_NOT_ATTENDED                = 'call_not_attended',                'Call Not Attended'
        SWITCHED_OFF                     = 'switched_off',                     'Switched Off'
        WRONG_NUMBER                     = 'wrong_number',                     'Wrong Number'
        NOT_INTERESTED                   = 'not_interested',                   'Not Interested'
        JOINED_OTHER_INSTITUTE           = 'joined_other_institute',           'Joined Other Institute'
        CALLBACK_LATER                   = 'callback_later',                   'Callback Later'
        FUTURE_LEAD                      = 'future_lead',                      'Future Lead'
        CONTINUOUSLY_NOT_ANSWERING_CALLS = 'continuously_not_answering_calls', 'Continuously Not Answering Calls'
        CONTACTED                        = 'contacted',                        'Contacted'
        FOLLOW_UP                        = 'follow_up',                        'Follow Up'
        WALK_IN                          = 'walk_in',                          'Walk-in Scheduled'
        ENROLLED                         = 'enrolled',                         'Enrolled'
        DROPPED                          = 'dropped',                          'Dropped'
        CONVERTED                        = 'converted',                        'Converted'
        CONVERTED_TO_WALKIN              = 'converted_to_walkin',              'Converted to Walk-in'
        LOST                             = 'lost',                             'Lost'

    class Source(models.TextChoices):
        MANUAL            = 'manual',            'Manual'
        GOOGLE            = 'google',            'Google'
        WEBSITE           = 'website',           'Website'
        INSTAGRAM         = 'instagram',         'Instagram'
        FACEBOOK          = 'facebook',          'Facebook'
        WHATSAPP          = 'whatsapp',          'WhatsApp'
        JUSTDIAL          = 'justdial',          'JustDial'
        TEAM_REFERENCE    = 'team_reference',    'Team Reference'
        FRIENDS_REFERENCE = 'friends_reference', 'Friends Reference'
        OTHERS            = 'others',            'Others'

    class PreferredTiming(models.TextChoices):
        MORNING = 'morning', 'Morning'
        AFTERNOON = 'afternoon', 'Afternoon'
        EVENING = 'evening', 'Evening'
        WEEKEND = 'weekend', 'Weekend'
        WEEKDAY_MORNING = 'weekday_morning', 'Weekdays (Morning)'
        WEEKDAY_EVENING = 'weekday_evening', 'Weekdays (Evening)'
        WEEKENDS = 'weekends', 'Weekends'

    class WillingToJoin(models.TextChoices):
        WITHIN_MONTH = 'within_month', 'Within a month'
        MONTH_LATER = 'month_later', 'A month later'
        JUST_ENQUIRY = 'just_enquiry', 'Just enquiry'

    class Qualification(models.TextChoices):
        SCHOOL_STUDENT = 'school_student', 'School Student'
        COLLEGE_STUDENT = 'college_student', 'College Student'
        GRADUATE = 'graduate', 'Graduate'
        HOUSEWIFE = 'housewife', 'Housewife'
        WORKING_PROFESSIONAL = 'working_professional', 'Working Professional'

    class ExpectedCourseBudget(models.TextChoices):
        RANGE_15000_25000 = '15000_25000', 'Rs 15,000-Rs 25,000'
        RANGE_26000_36000 = '26000_36000', 'Rs 26,000-Rs 36,000'
        RANGE_37000_47000 = '37000_47000', 'Rs 37,000-Rs 47,000'
        NOT_DECIDED = 'not_decided', 'Not Decided'

    class PlannedJoiningTime(models.TextChoices):
        IMMEDIATELY = 'immediately', 'Immediately'
        WITHIN_1_WEEK = 'within_1_week', 'Within 1 Week'
        WITHIN_1_MONTH = 'within_1_month', 'Within 1 Month'
        NOT_DECIDED = 'not_decided', 'Not Decided'

    class PrimaryGoal(models.TextChoices):
        GET_JOB = 'get_job', 'Get a Job'
        CAREER_SWITCH = 'career_switch', 'Career Switch'
        SALARY_HIKE = 'salary_hike', 'Salary Hike'
        INTERNSHIP_SKILL = 'internship_skill', 'Internship / Skill Enhancement'

    class CounselorStatus(models.TextChoices):
        NEW_LEAD = 'new_lead', 'New Lead'
        CONTACTED = 'contacted', 'Contacted'
        WILL_WALK_IN = 'will_walk_in', 'Will Walk-in'
        WALK_IN_COMPLETED = 'walk_in_completed', 'Walk-in Completed'
        DEMO_ATTENDED = 'demo_attended', 'Demo Attended'
        FOLLOW_UP = 'follow_up', 'Follow-up'
        READY_TO_JOIN = 'ready_to_join', 'Ready to Join'
        JOINED = 'joined', 'Joined'
        NA = 'na', 'NA'
        CNA = 'cna', 'CNA'
        NOT_INTERESTED = 'not_interested', 'Not Interested'
        LOST_TO_COMPETITOR = 'lost_to_competitor', 'Lost to Competitor'

    class CompetitorStatus(models.TextChoices):
        NOT_ENQUIRED_ELSEWHERE = 'not_enquired_elsewhere', 'Not Enquired Elsewhere'
        ENQUIRED_1 = 'enquired_1', 'Enquired at 1 Institute'
        ENQUIRED_2_3 = 'enquired_2_3', 'Enquired at 2-3 Institutes'
        ENQUIRED_MORE_3 = 'enquired_more_3', 'Enquired at More Than 3 Institutes'
        FAKE_ENQUIRY = 'fake_enquiry', 'Fake Enquiry'

    class FollowUpPriority(models.TextChoices):
        HIGH = 'high', 'High'
        MEDIUM = 'medium', 'Medium'
        LOW = 'low', 'Low'

    class ConversionProbability(models.TextChoices):
        P90 = '90', '90%'
        P75 = '75', '75%'
        P50 = '50', '50%'
        P25 = '25', '25%'
        P10 = '10', '10%'

    lead_number = models.CharField(max_length=20, unique=True, editable=False)
    assigned_to = models.ForeignKey(User,   null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='assigned_leads')
    branch      = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='leads')
    course      = models.ForeignKey(Course, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='leads')
    created_by  = models.ForeignKey(User,   null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='leads_created')

    name        = models.CharField(max_length=200)
    phone       = models.CharField(max_length=20)
    dob         = models.DateField(null=True, blank=True)
    email       = models.EmailField(blank=True)
    location    = models.CharField(max_length=200, blank=True)
    pincode     = models.CharField(max_length=10, blank=True)
    qualification = models.CharField(max_length=200, blank=True)
    degree = models.CharField(max_length=200, blank=True)
    expected_course_budget = models.CharField(max_length=20, choices=ExpectedCourseBudget.choices, blank=True)
    planned_joining_time = models.CharField(max_length=20, choices=PlannedJoiningTime.choices, blank=True)
    primary_goal = models.CharField(max_length=30, choices=PrimaryGoal.choices, blank=True)
    other_institutes_considering = models.CharField(max_length=300, blank=True)
    counselor_status = models.CharField(max_length=30, choices=CounselorStatus.choices, blank=True)
    competitor_status = models.CharField(max_length=40, choices=CompetitorStatus.choices, blank=True)
    follow_up_priority = models.CharField(max_length=10, choices=FollowUpPriority.choices, blank=True)
    conversion_probability = models.CharField(max_length=3, choices=ConversionProbability.choices, blank=True)
    willing_to_join = models.CharField(max_length=20, choices=WillingToJoin.choices, blank=True)
    preferred_timing = models.CharField(max_length=30, choices=PreferredTiming.choices, blank=True)
    walkin_date = models.DateField(null=True, blank=True)
    next_follow_up_date = models.DateField(null=True, blank=True)
    remarks     = models.TextField(blank=True)
    external_course_interested = models.CharField(max_length=200, blank=True)
    external_message = models.TextField(blank=True)
    is_duplicate = models.BooleanField(default=False, db_index=True)
    imported_via_csv = models.BooleanField(default=False, db_index=True)
    is_important = models.BooleanField(default=False, db_index=True)
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='deleted_leads')
    status      = models.CharField(max_length=40, choices=Status.choices, default=Status.NEW, db_index=True)
    source      = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)
    source_description = models.TextField(blank=True)
    converted_to_type = models.CharField(max_length=20, blank=True)
    converted_record_id = models.PositiveIntegerField(null=True, blank=True)
    converted_at = models.DateTimeField(null=True, blank=True)
    converted_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name='converted_leads')

    class Meta:
        db_table = 'leads'
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if self.lead_number:
            super().save(*args, **kwargs)
            return

        last_error = None
        for _ in range(10):
            self.lead_number = generate_lead_number()
            try:
                with transaction.atomic():
                    super().save(*args, **kwargs)
                return
            except IntegrityError as exc:
                if not is_lead_number_integrity_error(exc):
                    raise
                last_error = exc
                self.lead_number = ''

        raise last_error

    def __str__(self):
        return f'{self.lead_number} — {self.name}'


class LeadImportHistory(TimeStampedModel):
    """Audit record for counselor lead imports."""

    class Status(models.TextChoices):
        SUCCESS = 'success', 'Success'
        PARTIAL = 'partial', 'Partial'
        FAILED = 'failed', 'Failed'

    uploaded_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='lead_imports')
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name='lead_imports')
    file_name = models.CharField(max_length=255)
    total_rows = models.PositiveIntegerField(default=0)
    success_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    duplicate_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.FAILED, db_index=True)
    error_log = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = 'lead_import_history'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.file_name} - {self.get_status_display()}'


class LeadTransferHistory(TimeStampedModel):
    """Audit trail for direct lead ownership transfers."""

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name='transfer_history')
    from_user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='lead_transfers_sent')
    to_user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='lead_transfers_received')
    transferred_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='lead_transfers_made')
    from_branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name='lead_transfers_out')
    to_branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name='lead_transfers_in')
    note = models.CharField(max_length=300, blank=True)

    class Meta:
        db_table = 'lead_transfer_history'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['lead', '-created_at'], name='lead_transfer_lead_time_idx'),
            models.Index(fields=['from_user', 'created_at'], name='lead_transfer_from_idx'),
            models.Index(fields=['to_user', 'created_at'], name='lead_transfer_to_idx'),
            models.Index(fields=['from_branch', 'created_at'], name='lead_transfer_from_branch_idx'),
            models.Index(fields=['to_branch', 'created_at'], name='lead_transfer_to_branch_idx'),
        ]

    def __str__(self):
        return f'{self.lead_id}: {self.from_user} -> {self.to_user}'


class DataImportHistory(TimeStampedModel):
    """Admin audit log for Excel imports across CRM modules."""

    class ImportType(models.TextChoices):
        LEADS = 'leads', 'Leads'
        WALKINS = 'walkins', 'Walk-ins'
        COURSES = 'courses', 'Courses'
        ENROLLMENTS = 'enrollments', 'Enrollments'
        STUDENTS = 'students', 'Students'
        PAYMENTS = 'payments', 'Payments'

    class Status(models.TextChoices):
        PREVIEWED = 'previewed', 'Previewed'
        SUCCESS = 'success', 'Success'
        PARTIAL = 'partial', 'Partial'
        FAILED = 'failed', 'Failed'

    imported_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='data_imports')
    file_name = models.CharField(max_length=255)
    import_type = models.CharField(max_length=30, choices=ImportType.choices, db_index=True)
    rows_imported = models.PositiveIntegerField(default=0)
    rows_skipped = models.PositiveIntegerField(default=0)
    rows_failed = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PREVIEWED, db_index=True)
    error_log = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = 'data_import_history'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_import_type_display()} import - {self.file_name}'


def generate_walkin_number():
    now    = timezone.now()
    prefix = f'WI-{now.strftime("%Y%m")}'
    numbers = []
    for candidate_number in WalkIn.objects.filter(candidate_number__startswith=prefix).values_list('candidate_number', flat=True):
        try:
            numbers.append(int(str(candidate_number).rsplit('-', 1)[-1]))
        except (TypeError, ValueError):
            continue
    next_number = (max(numbers) if numbers else 0) + 1
    while WalkIn.objects.filter(candidate_number=f'{prefix}-{next_number:04d}').exists():
        next_number += 1
    return f'{prefix}-{next_number:04d}'


class WalkIn(TimeStampedModel):
    """Candidate who physically visited the branch."""

    class Status(models.TextChoices):
        NEW            = 'new',            'New'
        FOLLOW_UP      = 'follow_up',      'Follow Up'
        CONVERTED      = 'converted',      'Converted'
        NOT_INTERESTED = 'not_interested', 'Not Interested'
        TRANSFERRED    = 'transferred',    'Transferred'

    class Source(models.TextChoices):
        GOOGLE            = 'google',            'Google'
        JUSTDIAL          = 'justdial',          'JustDial'
        DIRECT            = 'direct',            'Direct'
        INSTAGRAM         = 'instagram',         'Instagram'
        FACEBOOK          = 'facebook',          'Facebook'
        WHATSAPP          = 'whatsapp',          'WhatsApp'
        FRIENDS_REFERENCE = 'friends_reference', 'Friends Reference'
        LEAD_CONVERSION   = 'lead_conversion',   'Lead Conversion'

    class WalkInBy(models.TextChoices):
        DIRECT            = 'Direct',            'Direct'
        FRIENDS_REFERENCE = 'Friends Reference', 'Friends Reference'
        LINCY_SCANIA = 'lincy_scania', 'Mrs. Lincy Scania'
        RANGANAYAGI  = 'ranganayagi',  'Mrs. Ranganayagi'
        PAVITHRA     = 'pavithra',     'Ms. Pavithra'
        MAHALAKSHMI  = 'mahalakshmi',  'Ms. Mahalakshmi'
        SARATHA      = 'saratha',      'Mrs. Saratha'

    class PreferredTiming(models.TextChoices):
        WEEKDAY_MORNING = 'weekday_morning', 'Weekdays (Morning)'
        WEEKDAY_EVENING = 'weekday_evening', 'Weekdays (Evening)'
        WEEKENDS = 'weekends', 'Weekends'

    class Qualification(models.TextChoices):
        SCHOOL_STUDENT = 'school_student', 'School Student'
        COLLEGE_STUDENT = 'college_student', 'College Student'
        GRADUATE = 'graduate', 'Graduate'
        WORKING_PROFESSIONAL = 'working_professional', 'Working Professional'
        HOUSEWIFE = 'housewife', 'Housewife'

    ExpectedCourseBudget = Lead.ExpectedCourseBudget
    PlannedJoiningTime = Lead.PlannedJoiningTime
    PrimaryGoal = Lead.PrimaryGoal
    CounselorStatus = Lead.CounselorStatus
    CompetitorStatus = Lead.CompetitorStatus
    FollowUpPriority = Lead.FollowUpPriority
    ConversionProbability = Lead.ConversionProbability

    candidate_number = models.CharField(max_length=20, unique=True, editable=False)
    lead             = models.OneToOneField(Lead,   null=True, blank=True, on_delete=models.SET_NULL,
                                            related_name='walkin')
    branch           = models.ForeignKey(Branch,   null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='walkins')
    assigned_to      = models.ForeignKey(User,     null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='assigned_walkins')
    counseling_by    = models.ForeignKey(User,     null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='counseled_walkins')
    course           = models.ForeignKey(Course,   null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='walkins')
    created_by       = models.ForeignKey(User,     null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='walkins_created')

    # Personal
    name            = models.CharField(max_length=200)
    dob             = models.DateField(null=True, blank=True)
    phone           = models.CharField(max_length=20)
    email           = models.EmailField(blank=True)
    location        = models.CharField(max_length=200, blank=True)
    pincode         = models.CharField(max_length=10, blank=True)

    # Academic / Professional
    qualification   = models.CharField(max_length=200, blank=True)
    degree          = models.CharField(max_length=200, blank=True)
    expected_course_budget = models.CharField(max_length=20, choices=ExpectedCourseBudget.choices, blank=True)
    planned_joining_time = models.CharField(max_length=20, choices=PlannedJoiningTime.choices, blank=True)
    primary_goal = models.CharField(max_length=30, choices=PrimaryGoal.choices, blank=True)
    other_institutes_considering = models.CharField(max_length=300, blank=True)
    counselor_status = models.CharField(max_length=30, choices=CounselorStatus.choices, blank=True)
    competitor_status = models.CharField(max_length=40, choices=CompetitorStatus.choices, blank=True)
    follow_up_priority = models.CharField(max_length=10, choices=FollowUpPriority.choices, blank=True)
    conversion_probability = models.CharField(max_length=3, choices=ConversionProbability.choices, blank=True)
    profession      = models.CharField(max_length=200, blank=True)
    year_of_passing = models.PositiveSmallIntegerField(null=True, blank=True)
    college_company = models.CharField(max_length=300, blank=True)

    # Visit
    demo_class                      = models.BooleanField(default=False)
    interested_global_certification = models.BooleanField(default=False)
    source                          = models.CharField(max_length=30, choices=Source.choices, default=Source.GOOGLE)
    walk_in_by                      = models.CharField(max_length=30, choices=WalkInBy.choices, blank=True)
    preferred_timing                = models.CharField(max_length=30, choices=PreferredTiming.choices, blank=True)
    follow_up_date                  = models.DateField(null=True, blank=True)
    remarks                         = models.TextField(blank=True)
    status                          = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    is_important                    = models.BooleanField(default=False, db_index=True)
    visit_date                      = models.DateField(default=timezone.now)
    converted_to_type               = models.CharField(max_length=20, blank=True)
    converted_record_id             = models.PositiveIntegerField(null=True, blank=True)
    converted_at                    = models.DateTimeField(null=True, blank=True)
    converted_by                    = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                                        related_name='converted_walkins')
    is_deleted                      = models.BooleanField(default=False, db_index=True)
    deleted_at                      = models.DateTimeField(null=True, blank=True)
    deleted_by                      = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                                        related_name='deleted_walkins')

    class Meta:
        db_table = 'walkins'
        ordering = ['-visit_date', '-created_at']

    def save(self, *args, **kwargs):
        if not self.candidate_number:
            self.candidate_number = generate_walkin_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.candidate_number} — {self.name}'


class WalkInBranchChangeHistory(models.Model):
    """Audit trail for admin walk-in branch corrections."""

    walkin = models.ForeignKey(WalkIn, on_delete=models.CASCADE, related_name='branch_change_history')
    old_branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='walkin_branch_changes_from')
    new_branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='walkin_branch_changes_to')
    changed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='walkin_branch_changes')
    changed_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField(blank=True)

    class Meta:
        db_table = 'walkin_branch_change_history'
        ordering = ['-changed_at']

    def __str__(self):
        return f'{self.walkin_id}: {self.old_branch} -> {self.new_branch}'


class WalkInAssignmentChangeRequest(models.Model):
    """Approval workflow for locked Walk-in By and Counseling By changes."""

    class FieldType(models.TextChoices):
        WALK_IN_BY = 'assigned_to', 'Walk-in By'
        COUNSELING_BY = 'counseling_by', 'Counseling By'

    class Status(models.TextChoices):
        PENDING_COUNSELOR = 'pending_counselor_approval', 'Pending Counselor Approval'
        PENDING_ADMIN = 'pending_admin_approval', 'Pending Admin Approval'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    walkin = models.ForeignKey(WalkIn, on_delete=models.CASCADE, related_name='assignment_change_requests')
    field_type = models.CharField(max_length=30, choices=FieldType.choices, db_index=True)
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name='walkin_assignment_change_requests')
    candidate_name = models.CharField(max_length=200)
    candidate_phone = models.CharField(max_length=20, blank=True)
    previous_user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                      related_name='walkin_assignment_previous_requests')
    previous_walk_in_by = models.CharField(max_length=30, blank=True)
    requested_walk_in_by = models.CharField(max_length=30, blank=True)
    requested_user = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE,
                                       related_name='walkin_assignment_requested_requests')
    requested_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name='walkin_assignment_change_requests')
    reason = models.TextField()
    status = models.CharField(max_length=40, choices=Status.choices, default=Status.PENDING_COUNSELOR, db_index=True)
    counselor_reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                              related_name='walkin_assignment_counselor_reviewed_requests')
    counselor_reviewed_at = models.DateTimeField(null=True, blank=True)
    counselor_remarks = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='walkin_assignment_reviewed_requests')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_remarks = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'walkin_assignment_change_requests'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['walkin', 'field_type', 'status']),
        ]

    def __str__(self):
        return f'{self.walkin_id} {self.field_type}: {self.status}'


class PhoneNumberChangeHistory(models.Model):
    """Audit trail for phone number changes on CRM records."""

    record_type = models.CharField(max_length=20, db_index=True)
    record_id = models.PositiveIntegerField(db_index=True)
    old_phone_number = models.CharField(max_length=20)
    new_phone_number = models.CharField(max_length=20)
    changed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='phone_number_changes')
    changed_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'phone_number_change_history'
        ordering = ['-changed_at']

    def __str__(self):
        return f'{self.record_type}:{self.record_id} {self.old_phone_number} -> {self.new_phone_number}'


class Discount(TimeStampedModel):
    """Admin-managed discount that can apply to all or selected courses."""

    class DiscountType(models.TextChoices):
        FIXED = 'fixed', 'Fixed Amount'
        PERCENTAGE = 'percentage', 'Percentage'

    name = models.CharField(max_length=150)
    discount_type = models.CharField(max_length=20, choices=DiscountType.choices, default=DiscountType.FIXED)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name='legacy_discounts')
    apply_to_all_branches = models.BooleanField(default=True)
    branches = models.ManyToManyField(Branch, blank=True, related_name='discounts')
    apply_to_all_courses = models.BooleanField(default=False)
    courses = models.ManyToManyField(Course, blank=True, related_name='discounts')
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='discounts_created')

    class Meta:
        db_table = 'discounts'
        ordering = ['-valid_to', 'name']

    @property
    def status_label(self):
        today = timezone.localdate()
        if self.valid_to and today > self.valid_to:
            return 'Expired'
        return 'Active' if self.is_active else 'Inactive'

    def is_available_for_course(self, course_id, branch_id=None):
        today = timezone.localdate()
        if not self.is_active or self.valid_from > today or (self.valid_to and self.valid_to < today):
            return False
        if self.apply_to_all_branches:
            branch_matches = True
        elif branch_id:
            branch_matches = self.branches.filter(pk=branch_id).exists()
        else:
            branch_matches = False
        if not branch_matches:
            return False
        if self.apply_to_all_courses:
            return True
        return self.courses.filter(pk=course_id).exists()

    def calculate_amount(self, course_fee):
        course_fee = course_fee or 0
        return min(self.value, course_fee)

    def __str__(self):
        return self.name


class FollowUp(models.Model):
    """Append-only follow-up history for leads and walk-ins."""

    class RecordType(models.TextChoices):
        LEAD = 'lead', 'Lead'
        WALKIN = 'walkin', 'Walk-in'

    record_type = models.CharField(max_length=10, choices=RecordType.choices, db_index=True)
    record_id = models.PositiveIntegerField(db_index=True)
    follow_up_date = models.DateField()
    next_follow_up_date = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True)
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='follow_ups_created')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'follow_ups'
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['record_type', 'record_id']),
        ]

    def __str__(self):
        return f'{self.get_record_type_display()} #{self.record_id} follow-up'


def get_branch_student_id_code(branch):
    if not branch:
        return '00'
    if branch.branch_code:
        return str(branch.branch_code).zfill(2)
    return f'{branch.id:02d}'


def generate_student_number(branch):
    year = timezone.localdate().year
    branch_code = get_branch_student_id_code(branch)
    prefix = f'STU{year}{branch_code}-'
    branch_year_count = Enrollment.objects.filter(
        branch=branch,
        enrollment_date__year=year,
        student_number__startswith=prefix,
    ).count() if branch else 0
    last_count = branch_year_count

    for student_number in Enrollment.objects.filter(
        student_number__startswith=prefix,
    ).values_list('student_number', flat=True):
        try:
            last_count = max(last_count, int(student_number.rsplit('-', 1)[1]))
        except (IndexError, TypeError, ValueError):
            continue

    return f'{prefix}{last_count + 1:04d}'


def add_month_to_date(value):
    if not value:
        return None
    if isinstance(value, str):
        value = parse_date(value)
        if not value:
            return None
    month = value.month + 1
    year = value.year + (month - 1) // 12
    month = ((month - 1) % 12) + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def calculate_next_payment_date(enrollment, paid_amount, total_fees):
    paid_amount = paid_amount or 0
    total_fees = total_fees or 0
    if paid_amount >= total_fees:
        return None
    return calculate_next_payment_date_from_schedule(
        get_default_installment_schedule(enrollment),
        paid_amount,
        total_fees,
    )


def enrollment_payable_fee(enrollment):
    override = getattr(enrollment, 'custom_payable_fee', None)
    if override is not None:
        return override
    return enrollment.net_payable_fee if enrollment.net_payable_fee is not None else enrollment.final_fees


ENROLLMENT_PAYMENT_AMOUNT = 5000
MIN_INSTALLMENT_AMOUNT = 5000
LOW_FEE_SINGLE_PAYMENT_MAX_COURSE_FEE = 6900
SINGLE_INSTALLMENT_MAX_COURSE_FEE = 18900


def _split_integer_amount(total_amount, parts):
    total_amount = max(int(round(float(total_amount or 0))), 0)
    parts = max(int(parts or 1), 1)
    base_amount = total_amount // parts
    amounts = [base_amount for _ in range(parts)]
    amounts[-1] += total_amount - (base_amount * parts)
    return amounts


def _installment_label(index):
    known = {
        1: '1st Installment',
        2: '2nd Installment',
        3: '3rd Installment',
    }
    if index in known:
        return known[index]
    if 10 <= index % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(index % 10, 'th')
    return f'{index}{suffix} Installment'


def normalize_installment_schedule(schedule):
    rows = []
    for item in schedule or []:
        amount = max(int(round(float(item.get('amount') or 0))), 0)
        due_date = item.get('due_date')
        rows.append({
            'label': item.get('label') or f'{len(rows) + 1} Installment',
            'amount': amount,
            'due_date': due_date.isoformat() if hasattr(due_date, 'isoformat') else due_date,
        })
    return rows


def _single_payment_schedule(enrollment, total_fees=None):
    final_fees = int(round(float(total_fees if total_fees is not None else enrollment_payable_fee(enrollment) or 0)))
    if 0 < final_fees <= LOW_FEE_SINGLE_PAYMENT_MAX_COURSE_FEE:
        return [{'label': 'Single Payment', 'amount': final_fees, 'due_date': enrollment.enrollment_date}]
    return None


def get_default_installment_schedule(enrollment, split_count=2):
    final_fees = int(round(float(enrollment_payable_fee(enrollment) or 0)))
    enrollment_date = enrollment.enrollment_date
    first_due_date = enrollment.start_date or add_month_to_date(enrollment_date) or enrollment_date

    single_payment_schedule = _single_payment_schedule(enrollment, final_fees)
    if single_payment_schedule:
        return single_payment_schedule
    if final_fees < ENROLLMENT_PAYMENT_AMOUNT:
        return []

    remaining = max(final_fees - ENROLLMENT_PAYMENT_AMOUNT, 0)
    rows = [{'label': 'Enrollment', 'amount': ENROLLMENT_PAYMENT_AMOUNT, 'due_date': enrollment_date}]
    if not remaining:
        return rows

    requested_count = (
        1
        if final_fees <= SINGLE_INSTALLMENT_MAX_COURSE_FEE
        else min(max(int(split_count or 2), 1), 12)
    )
    max_count = max(((remaining - 1) // MIN_INSTALLMENT_AMOUNT) + 1, 1)
    split_count = min(requested_count, max_count)
    due_date = first_due_date
    for index, amount in enumerate(_split_integer_amount(remaining, split_count), start=1):
        rows.append({'label': _installment_label(index), 'amount': amount, 'due_date': due_date})
        due_date = add_month_to_date(due_date) or due_date
    return rows


def get_enrollment_installment_schedule(enrollment):
    single_payment_schedule = _single_payment_schedule(enrollment)
    if single_payment_schedule:
        return normalize_installment_schedule(single_payment_schedule)
    if getattr(enrollment, 'payment_schedule', None):
        return normalize_installment_schedule(enrollment.payment_schedule)
    return normalize_installment_schedule(get_default_installment_schedule(enrollment))


def get_saved_enrollment_installment_schedule(enrollment):
    single_payment_schedule = _single_payment_schedule(enrollment)
    if single_payment_schedule:
        return normalize_installment_schedule(single_payment_schedule)
    try:
        payment = getattr(enrollment, 'payment', None)
    except ObjectDoesNotExist:
        payment = None
    if payment and getattr(payment, 'manual_installment_schedule', None):
        return normalize_installment_schedule(payment.manual_installment_schedule)
    if getattr(enrollment, 'payment_schedule', None):
        return normalize_installment_schedule(enrollment.payment_schedule)
    return []


def get_payment_installment_schedule(payment):
    single_payment_schedule = _single_payment_schedule(payment.enrollment, payment.total_fees)
    if single_payment_schedule:
        return normalize_installment_schedule(single_payment_schedule)
    if payment.manual_installment_schedule:
        return normalize_installment_schedule(payment.manual_installment_schedule)
    return get_enrollment_installment_schedule(payment.enrollment)


def calculate_next_payment_date_from_schedule(schedule, paid_amount, total_fees):
    paid_amount = paid_amount or 0
    total_fees = total_fees or 0
    if paid_amount >= total_fees:
        return None

    running_total = 0
    for item in schedule or []:
        running_total += int(float(item.get('amount') or 0))
        if paid_amount < running_total:
            return item.get('due_date')
    return None


class Enrollment(TimeStampedModel):
    """Confirmed student enrollment record."""

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING_RULES = 'pending_rules_form', 'Pending Rules Form'
        RULES_SENT = 'rules_form_sent', 'Rules Form Sent'
        RULES_SUBMITTED = 'rules_form_submitted', 'Rules Form Submitted'
        ENROLLED = 'enrolled', 'Enrolled'
        ACTIVE    = 'active',    'Active'
        COMPLETED = 'completed', 'Completed'
        INACTIVE  = 'inactive',  'Inactive'
        DROPPED   = 'dropped',   'Dropped'
        ON_HOLD   = 'on_hold',   'Hold'
        TRANSFERRED = 'transferred', 'Transferred'

    FINAL_STATUSES = {'enrolled', 'active', 'completed', 'inactive', 'dropped', 'on_hold', 'transferred'}

    student_number  = models.CharField(max_length=20, unique=True, editable=False, null=True, blank=True)
    walkin          = models.OneToOneField(WalkIn, null=True, blank=True, on_delete=models.SET_NULL,
                                           related_name='enrollment')
    lead            = models.ForeignKey(Lead,   null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='enrollments')
    branch          = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='enrollments')
    course          = models.ForeignKey(Course, on_delete=models.RESTRICT, related_name='enrollments')
    original_walkin_course = models.ForeignKey(Course, null=True, blank=True, on_delete=models.SET_NULL,
                                               related_name='enrollments_original_walkin_course')
    final_enrollment_course = models.ForeignKey(Course, null=True, blank=True, on_delete=models.SET_NULL,
                                                related_name='enrollments_final_course')
    enrolled_by     = models.ForeignKey(User,   null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='enrollments_created')
    created_by      = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='enrollments_entered')
    counselor       = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='counseled_enrollments')

    # Personal
    name             = models.CharField(max_length=200)
    dob              = models.DateField(null=True, blank=True)
    phone            = models.CharField(max_length=20)
    email            = models.EmailField(blank=True)
    location         = models.CharField(max_length=200, blank=True)
    pincode          = models.CharField(max_length=10, blank=True)
    qualification    = models.CharField(max_length=200, blank=True)
    degree           = models.CharField(max_length=200, blank=True)
    expected_course_budget = models.CharField(max_length=20, choices=Lead.ExpectedCourseBudget.choices, blank=True)
    planned_joining_time = models.CharField(max_length=20, choices=Lead.PlannedJoiningTime.choices, blank=True)
    primary_goal = models.CharField(max_length=30, choices=Lead.PrimaryGoal.choices, blank=True)
    other_institutes_considering = models.CharField(max_length=300, blank=True)
    counselor_status = models.CharField(max_length=30, choices=Lead.CounselorStatus.choices, blank=True)
    competitor_status = models.CharField(max_length=40, choices=Lead.CompetitorStatus.choices, blank=True)
    follow_up_priority = models.CharField(max_length=10, choices=Lead.FollowUpPriority.choices, blank=True)
    conversion_probability = models.CharField(max_length=3, choices=Lead.ConversionProbability.choices, blank=True)
    source           = models.CharField(max_length=20, choices=WalkIn.Source.choices, blank=True)
    preferred_timing = models.CharField(max_length=30, choices=WalkIn.PreferredTiming.choices, blank=True)
    demo_class       = models.BooleanField(default=False)
    interested_global_certification = models.BooleanField(default=False)

    # Fees
    actual_fees      = models.DecimalField(max_digits=10, decimal_places=2)
    discount_amount  = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_reason  = models.CharField(max_length=300, blank=True)
    final_fees       = models.DecimalField(max_digits=10, decimal_places=2)
    spot_conversion_discount_applied = models.BooleanField(default=False)
    spot_conversion_discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    custom_payable_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    net_payable_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_schedule = models.JSONField(default=list, blank=True)
    payment_schedule_locked = models.BooleanField(default=False)
    payment_schedule_finalized_at = models.DateTimeField(null=True, blank=True)
    discount          = models.ForeignKey(Discount, null=True, blank=True, on_delete=models.SET_NULL,
                                          related_name='enrollments')

    # Dates
    start_date       = models.DateField(null=True, blank=True)
    batch_timing     = models.CharField(max_length=100, blank=True)
    enrollment_date  = models.DateField(default=timezone.now)

    status           = models.CharField(max_length=30, choices=Status.choices,
                                        default=Status.PENDING_RULES, db_index=True)
    is_important     = models.BooleanField(default=False, db_index=True)
    is_deleted       = models.BooleanField(default=False, db_index=True)
    deleted_at       = models.DateTimeField(null=True, blank=True)
    deleted_by       = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='deleted_enrollments')

    class Meta:
        db_table = 'enrollments'
        ordering = ['-enrollment_date', '-created_at']

    def save(self, *args, **kwargs):
        if self.course_id and not self.final_enrollment_course_id:
            self.final_enrollment_course_id = self.course_id
        if not self.student_number and self.status in self.FINAL_STATUSES:
            self.student_number = generate_student_number(self.branch)
        # Auto-compute payable fees. Course discount affects final_fees; spot discount affects only net_payable_fee.
        self.final_fees = max(self.actual_fees - self.discount_amount, 0)
        if self.spot_conversion_discount_applied:
            self.spot_conversion_discount_amount = Decimal('2000')
        else:
            self.spot_conversion_discount_amount = Decimal('0')
        calculated_payable_fee = max(self.final_fees - self.spot_conversion_discount_amount, 0)
        self.net_payable_fee = self.custom_payable_fee if self.custom_payable_fee is not None else calculated_payable_fee
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.student_number or "Pending"} - {self.name}'


class CourseChangeHistory(TimeStampedModel):
    """Audit trail for enrollment course changes."""

    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='course_change_history')
    old_course = models.ForeignKey(Course, null=True, blank=True, on_delete=models.SET_NULL, related_name='course_changes_from')
    new_course = models.ForeignKey(Course, null=True, blank=True, on_delete=models.SET_NULL, related_name='course_changes_to')
    changed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='course_changes_made')
    old_fee = models.DecimalField(max_digits=10, decimal_places=2)
    new_fee = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField(blank=True)
    effective_date = models.DateField()

    class Meta:
        db_table = 'course_change_history'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.enrollment_id}: {self.old_course} -> {self.new_course}'


class EnrollmentCounselorChangeHistory(models.Model):
    """Audit trail for admin enrollment counselor reassignments."""

    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='counselor_change_history')
    old_counselor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='counselor_changes_from')
    new_counselor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='counselor_changes_to')
    changed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='counselor_changes_made')
    reason = models.TextField(blank=True)
    changed_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'enrollment_counselor_change_history'
        ordering = ['-changed_at', '-id']
        indexes = [
            models.Index(fields=['enrollment', 'changed_at'], name='enr_coun_hist_enr_chg_idx'),
            models.Index(fields=['new_counselor', 'changed_at'], name='enr_coun_hist_new_chg_idx'),
        ]

    def __str__(self):
        return f'{self.enrollment_id}: {self.old_counselor} -> {self.new_counselor}'


class CounselorChangeRequest(models.Model):
    """Two-stage approval workflow for lead/enrollment counselor transfers."""

    class RecordType(models.TextChoices):
        LEAD = 'lead', 'Lead'
        ENROLLMENT = 'enrollment', 'Enrollment'

    class Status(models.TextChoices):
        PENDING_COUNSELOR = 'pending_counselor_approval', 'Pending Counselor Approval'
        PENDING_ADMIN = 'pending_admin_approval', 'Pending Admin Approval'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    record_type = models.CharField(max_length=20, choices=RecordType.choices, db_index=True)
    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.CASCADE, related_name='counselor_change_requests')
    enrollment = models.ForeignKey(Enrollment, null=True, blank=True, on_delete=models.CASCADE, related_name='counselor_change_requests')
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name='counselor_change_requests')
    candidate_name = models.CharField(max_length=200)
    candidate_phone = models.CharField(max_length=20, blank=True)
    current_counselor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='counselor_transfer_requests_from')
    requested_counselor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='counselor_transfer_requests_to')
    requested_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='counselor_transfer_requests_made')
    requested_at = models.DateTimeField(default=timezone.now, db_index=True)
    reason = models.TextField()
    status = models.CharField(max_length=40, choices=Status.choices, default=Status.PENDING_COUNSELOR, db_index=True)
    counselor_decision_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='counselor_transfer_decisions')
    counselor_decision_at = models.DateTimeField(null=True, blank=True)
    counselor_remarks = models.TextField(blank=True)
    admin_decision_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='counselor_transfer_admin_decisions')
    admin_decision_at = models.DateTimeField(null=True, blank=True)
    admin_remarks = models.TextField(blank=True)
    force_transfer = models.BooleanField(default=False)

    class Meta:
        db_table = 'counselor_change_requests'
        ordering = ['-requested_at', '-id']
        indexes = [
            models.Index(fields=['status', 'requested_at'], name='coun_req_status_req_idx'),
            models.Index(fields=['current_counselor', 'status'], name='coun_req_current_status_idx'),
            models.Index(fields=['requested_counselor', 'status'], name='coun_req_new_status_idx'),
        ]

    def __str__(self):
        return f'{self.candidate_name}: {self.current_counselor} -> {self.requested_counselor}'


class CourseChangeRequest(TimeStampedModel):
    """Approval workflow for staff-requested enrollment course changes."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    student = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='course_change_requests')
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='course_change_request_records')
    old_course = models.ForeignKey(Course, null=True, blank=True, on_delete=models.SET_NULL, related_name='course_change_requests_from')
    requested_course = models.ForeignKey(Course, null=True, blank=True, on_delete=models.SET_NULL, related_name='course_change_requests_to')
    requested_batch_date = models.DateField(null=True, blank=True)
    reason = models.TextField()
    requested_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='course_change_requests_made')
    requested_at = models.DateTimeField(default=timezone.now, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='course_change_requests_reviewed')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_remarks = models.TextField(blank=True)
    old_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    new_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        db_table = 'course_change_requests'
        ordering = ['-requested_at', '-created_at']
        indexes = [
            models.Index(fields=['status', 'requested_at']),
            models.Index(fields=['enrollment', 'status']),
        ]

    def __str__(self):
        return f'{self.enrollment_id}: {self.old_course} -> {self.requested_course} ({self.status})'


class RulesSigningRequest(TimeStampedModel):
    """Public token-based Rules & Regulation signing gate for an enrollment."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        SENT = 'sent', 'Sent'
        VIEWED = 'viewed', 'Viewed'
        SUBMITTED = 'submitted', 'Submitted'

    enrollment = models.OneToOneField(Enrollment, on_delete=models.CASCADE, related_name='rules_signing')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    selfie_image = models.FileField(upload_to='rules_selfies/', null=True, blank=True)
    signature_image = models.FileField(upload_to='rules_signatures/', null=True, blank=True)
    signed_pdf = models.FileField(upload_to='signed_rules/', null=True, blank=True)
    selfie_image_file = models.BinaryField(null=True, blank=True)
    signature_image_file = models.BinaryField(null=True, blank=True)
    signed_pdf_file = models.BinaryField(null=True, blank=True)
    submitted_ip = models.GenericIPAddressField(null=True, blank=True)
    submitted_user_agent = models.TextField(blank=True)
    sent_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                related_name='rules_forms_sent')

    class Meta:
        db_table = 'rules_signing_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f'Rules signing for {self.enrollment.student_number} - {self.get_status_display()}'


class EnrollmentRulesResetHistory(models.Model):
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='rules_reset_history')
    reset_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='rules_process_resets')
    reset_at = models.DateTimeField(default=timezone.now, db_index=True)
    reason = models.TextField()
    previous_rules_status = models.CharField(max_length=20, blank=True)
    previous_signing_token = models.CharField(max_length=80, blank=True)
    previous_schedule_locked = models.BooleanField(default=False)
    previous_payment_schedule = models.JSONField(default=list, blank=True)
    previous_signed = models.BooleanField(default=False)
    previous_signed_pdf = models.FileField(upload_to='archived_signed_rules/', null=True, blank=True)
    previous_signed_pdf_file = models.BinaryField(null=True, blank=True)

    class Meta:
        db_table = 'enrollment_rules_reset_history'
        ordering = ['-reset_at', '-id']
        indexes = [
            models.Index(fields=['enrollment', 'reset_at'], name='enr_rules_reset_enr_at_idx'),
            models.Index(fields=['reset_by', 'reset_at'], name='enr_rules_reset_by_at_idx'),
        ]

    def __str__(self):
        return f'{self.enrollment_id} reset at {self.reset_at:%Y-%m-%d %H:%M}'


class BranchTransferRequest(TimeStampedModel):
    """Request to convert a walk-in into an enrollment under another branch."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    walkin = models.ForeignKey(WalkIn, on_delete=models.CASCADE, related_name='transfer_requests')
    candidate_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20)
    current_branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name='outgoing_transfer_requests')
    requested_branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name='incoming_transfer_requests')
    course = models.ForeignKey(Course, null=True, blank=True, on_delete=models.SET_NULL, related_name='transfer_requests')
    requested_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='branch_transfer_requests')
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    enrollment_payload = models.JSONField(default=dict, blank=True)
    enrollment = models.OneToOneField(Enrollment, null=True, blank=True, on_delete=models.SET_NULL, related_name='transfer_request')
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='reviewed_branch_transfer_requests')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_remarks = models.TextField(blank=True)

    class Meta:
        db_table = 'branch_transfer_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.candidate_name} transfer to {self.requested_branch}'


class Payment(TimeStampedModel):
    """Aggregate payment record for an enrollment."""

    class Status(models.TextChoices):
        PAID    = 'paid',    'Paid'
        UNPAID  = 'unpaid',  'Unpaid'
        PARTIAL = 'partial', 'Partial'

    enrollment  = models.OneToOneField(Enrollment, on_delete=models.CASCADE, related_name='payment')
    total_fees  = models.DecimalField(max_digits=10, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status      = models.CharField(max_length=10, choices=Status.choices,
                                   default=Status.UNPAID, db_index=True)
    next_payment_date = models.DateField(null=True, blank=True, db_index=True)
    manual_installment_schedule = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = 'payments'

    @property
    def balance(self):
        return self.total_fees - self.paid_amount

    def update_status(self):
        if self.paid_amount <= 0:
            self.status = self.Status.UNPAID
        elif self.paid_amount >= self.total_fees:
            self.status = self.Status.PAID
        else:
            self.status = self.Status.PARTIAL
        self.next_payment_date = calculate_next_payment_date_from_schedule(
            get_payment_installment_schedule(self),
            self.paid_amount,
            self.total_fees,
        )

    def recalculate_from_installments(self, save=True):
        actual_paid = self.installments.aggregate(total=models.Sum('amount'))['total'] or Decimal('0')
        previous_paid_amount = Decimal(str(self.paid_amount or 0))
        previous_status = self.status
        previous_next_payment_date = self.next_payment_date
        self.paid_amount = Decimal(str(actual_paid or 0))
        self.update_status()
        if self.paid_amount < self.total_fees:
            self.next_payment_date = next(
                (
                    item.get('due_date')
                    for item in build_payment_installment_summary_from_records(self)
                    if item['status'] != 'paid'
                ),
                None,
            )
        changed = (
            previous_paid_amount != Decimal(str(self.paid_amount or 0))
            or previous_status != self.status
            or previous_next_payment_date != self.next_payment_date
        )
        if save and self.pk and changed:
            super().save(update_fields=['paid_amount', 'status', 'next_payment_date', 'updated_at'])
        return self

    def save(self, *args, **kwargs):
        self.update_status()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Payment for {self.enrollment.student_number} — {self.get_status_display()}'


class PaymentInstallment(models.Model):
    """Individual payment entry (instalment)."""

    class DocumentType(models.TextChoices):
        RECEIPT = 'receipt', 'Receipt'
        BILL    = 'bill',    'Bill'

    class Mode(models.TextChoices):
        CASH         = 'cash',          'Cash'
        UPI          = 'upi',           'UPI'
        CASH_UPI     = 'cash_upi',      'Cash + UPI'
        BANK         = 'bank_transfer', 'Bank Transfer'
        CHEQUE       = 'cheque',        'Cheque'
        CARD         = 'card',          'Card'
        OTHER        = 'other',         'Other'

    payment          = models.ForeignKey(Payment,    on_delete=models.CASCADE, related_name='installments')
    enrollment       = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='installments')
    amount           = models.DecimalField(max_digits=10, decimal_places=2)
    installment_index = models.PositiveSmallIntegerField(default=1, db_index=True)
    installment_label = models.CharField(max_length=80, blank=True)
    document_type    = models.CharField(max_length=20, choices=DocumentType.choices,
                                        default=DocumentType.RECEIPT, db_index=True)
    receipt_number   = models.CharField(max_length=50, blank=True, db_index=True)
    payment_mode     = models.CharField(max_length=20, choices=Mode.choices, default=Mode.CASH)
    reference_number = models.CharField(max_length=100, blank=True)
    notes            = models.TextField(blank=True)
    bill_number      = models.CharField(max_length=50, blank=True)
    bill_generated_at= models.DateTimeField(null=True, blank=True)
    bill_generated_by= models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='generated_bills')
    bill_total       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    document_snapshot = models.JSONField(default=dict, blank=True)
    document_html    = models.TextField(blank=True)
    collected_by     = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='collections')
    payment_date     = models.DateField(default=timezone.now)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'payment_installments'
        ordering = ['-payment_date']

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.payment.recalculate_from_installments()

    def __str__(self):
        return f'₹{self.amount} on {self.payment_date}'


def build_payment_installment_summary_from_records(payment):
    schedule = get_payment_installment_schedule(payment)
    summary = []
    for index, item in enumerate(schedule, start=1):
        required_amount = Decimal(str(item.get('amount') or 0))
        summary.append({
            'index': index,
            'label': item.get('label') or f'{index} Installment',
            'required_amount': required_amount,
            'paid_amount': Decimal('0'),
            'pending_amount': required_amount,
            'status': 'pending',
            'due_date': item.get('due_date').isoformat() if hasattr(item.get('due_date'), 'isoformat') else item.get('due_date'),
        })

    # A surviving payment record must only satisfy its recorded installment and
    # later rows. This prevents a later payment from keeping a deleted earlier
    # installment marked as paid.
    installments = payment.installments.order_by('payment_date', 'created_at', 'pk')
    for installment in installments:
        remaining_paid = Decimal(str(installment.amount or 0))
        start_index = max(int(installment.installment_index or 1) - 1, 0)
        for item in summary[start_index:]:
            if remaining_paid <= 0:
                break
            pending_amount = max(item['required_amount'] - item['paid_amount'], Decimal('0'))
            paid_amount = min(remaining_paid, pending_amount)
            item['paid_amount'] += paid_amount
            remaining_paid -= paid_amount

    for item in summary:
        required_amount = item['required_amount']
        paid_amount = item['paid_amount']
        pending_amount = max(required_amount - paid_amount, Decimal('0'))
        if paid_amount >= required_amount and required_amount > 0:
            status = 'paid'
        elif paid_amount > 0:
            status = 'partial'
        else:
            status = 'pending'
        item['pending_amount'] = pending_amount
        item['status'] = status
    return summary


def rebuild_enrollment_payment_schedule_from_records(enrollment, save=True):
    try:
        payment = getattr(enrollment, 'payment', None)
    except ObjectDoesNotExist:
        payment = None
    if not payment:
        return []
    payment.recalculate_from_installments(save=save)
    return build_payment_installment_summary_from_records(payment)


@receiver(post_delete, sender=PaymentInstallment)
def recalculate_payment_after_installment_delete(sender, instance, **kwargs):
    if not instance.payment_id:
        return
    payment = Payment.objects.select_related('enrollment').filter(pk=instance.payment_id).first()
    if payment:
        rebuild_enrollment_payment_schedule_from_records(payment.enrollment, save=True)


class PaymentReasonRequest(models.Model):
    """Internal admin/staff workflow for pending payment reasons."""

    class Status(models.TextChoices):
        PENDING_RESPONSE = 'pending_response', 'Pending Response'
        PENDING_ADMIN_APPROVAL = 'pending_admin_approval', 'Pending Admin Approval'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        RESOLVED = 'resolved', 'Resolved'

    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='reason_requests')
    installment_index = models.PositiveSmallIntegerField(db_index=True)
    installment_label = models.CharField(max_length=80, blank=True)
    installment_due_date = models.DateField(null=True, blank=True)
    admin_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payment_reason_requests_created')
    branch_staff = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payment_reason_requests_assigned')
    question = models.TextField(default='Why is this payment still pending?')
    staff_response = models.TextField(blank=True)
    promised_payment_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDING_RESPONSE, db_index=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payment_reason_requests'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['payment', 'installment_index', 'status']),
        ]

    def __str__(self):
        return f'{self.payment_id} installment {self.installment_index} - {self.status}'


class PaymentReasonMessage(models.Model):
    """Conversation entry for a payment reason request."""

    class SenderRole(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        USER = 'user', 'User'
        SYSTEM = 'system', 'System'

    reason_request = models.ForeignKey(PaymentReasonRequest, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='payment_reason_messages')
    sender_role = models.CharField(max_length=20, choices=SenderRole.choices, db_index=True)
    message = models.TextField()
    status = models.CharField(max_length=30, blank=True, db_index=True)
    promised_payment_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'payment_reason_messages'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['reason_request', 'created_at']),
            models.Index(fields=['sender_role', 'created_at']),
        ]

    def __str__(self):
        return f'{self.reason_request_id} - {self.sender_role}'


class TeamNotice(TimeStampedModel):
    """Internal CRM notice board message from admin to branches."""

    class AudienceType(models.TextChoices):
        ALL_BRANCHES = 'all_branches', 'All Branches'
        SPECIFIC_BRANCH = 'specific_branch', 'Specific Branch'

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        CLOSED = 'closed', 'Closed'
        ARCHIVED = 'archived', 'Archived'

    title = models.CharField(max_length=200)
    message = models.TextField()
    audience_type = models.CharField(max_length=30, choices=AudienceType.choices, default=AudienceType.ALL_BRANCHES, db_index=True)
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name='team_notices')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='team_notices_created')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'team_notices'
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class TeamNoticeReply(models.Model):
    """Reply thread entry for a Team Board notice."""

    notice = models.ForeignKey(TeamNotice, on_delete=models.CASCADE, related_name='replies')
    reply_message = models.TextField()
    replied_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='team_notice_replies')
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name='team_notice_replies')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'team_notice_replies'
        ordering = ['created_at']

    def __str__(self):
        return f'Reply to {self.notice_id} by {self.replied_by_id}'


class AdminReceipt(TimeStampedModel):
    """Standalone receipt for payments not tied to course installments."""

    class Mode(models.TextChoices):
        CASH         = 'cash',          'Cash'
        UPI          = 'upi',           'UPI'
        BANK         = 'bank_transfer', 'Bank Transfer'
        CHEQUE       = 'cheque',        'Cheque'
        CARD         = 'card',          'Card'
        OTHER        = 'other',         'Other'

    receipt_number = models.CharField(max_length=50, unique=True, editable=False)
    name           = models.CharField(max_length=200)
    phone          = models.CharField(max_length=20)
    purpose        = models.CharField(max_length=200)
    amount         = models.DecimalField(max_digits=10, decimal_places=2)
    payment_mode   = models.CharField(max_length=20, choices=Mode.choices, default=Mode.CASH)
    payment_date   = models.DateField(default=timezone.now)
    notes          = models.TextField(blank=True)
    generated_by   = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name='admin_receipts_generated')
    generated_on   = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'admin_receipts'
        ordering = ['-payment_date', '-created_at']

    def __str__(self):
        return f'{self.receipt_number} - {self.name}'


class WhatsAppMessage(models.Model):
    """Log of all WhatsApp messages dispatched by the system."""

    class MsgType(models.TextChoices):
        FEE_REMINDER   = 'fee_reminder',   'Fee Reminder'
        PAYMENT_REMINDER = 'payment_reminder', 'Payment Reminder'
        BIRTHDAY       = 'birthday',       'Birthday Wish'
        FIRST_CLASS    = 'first_class',    'First Class Reminder'
        WALKIN_REMIND  = 'walkin_reminder','Walk-in Reminder'
        FOLLOW_UP      = 'follow_up',      'Follow-up Reminder'
        RULES_FORM_LINK = 'rules_form_link', 'Rules Form Link'
        OFFER_MESSAGE = 'offer_message', 'Offer Message'
        MANUAL         = 'manual',         'Manual'

    class MsgStatus(models.TextChoices):
        PENDING   = 'pending',   'Pending'
        SENT      = 'sent',      'Sent'
        DELIVERED = 'delivered', 'Delivered'
        READ      = 'read',      'Read'
        FAILED    = 'failed',    'Failed'

    candidate_name  = models.CharField(max_length=200, blank=True)
    recipient_phone = models.CharField(max_length=20)
    template_name   = models.CharField(max_length=100, blank=True)
    message_body    = models.TextField()
    message_type    = models.CharField(max_length=30, choices=MsgType.choices)
    status          = models.CharField(max_length=15, choices=MsgStatus.choices,
                                       default=MsgStatus.PENDING, db_index=True)
    wa_message_id   = models.CharField(max_length=100, blank=True)
    error_message   = models.TextField(blank=True)
    sent_by         = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='whatsapp_sent')
    related_model   = models.CharField(max_length=50, blank=True)
    related_id      = models.PositiveIntegerField(null=True, blank=True)
    provider        = models.CharField(max_length=30, blank=True, default='wati')
    provider_response = models.JSONField(default=dict, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    sent_at         = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'whatsapp_messages'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.message_type} → {self.recipient_phone} [{self.status}]'


class WhatsAppTemplate(TimeStampedModel):
    """Admin-managed WhatsApp message template with placeholder support."""

    class TemplateType(models.TextChoices):
        LEAD_FOLLOW_UP = 'lead_follow_up', 'Lead Follow-up'
        WALKIN_FOLLOW_UP = 'walkin_follow_up', 'Walk-in Follow-up'
        PAYMENT_REMINDER = 'payment_reminder', 'Payment Reminder'
        BIRTHDAY_WISH = 'birthday_wish', 'Birthday Wish'
        RULES_FORM_LINK = 'rules_form_link', 'Rules Form Link'
        OFFER_MESSAGE = 'offer_message', 'Offer Message'

    name = models.CharField(max_length=150, unique=True)
    template_type = models.CharField(max_length=30, choices=TemplateType.choices, db_index=True)
    message_body = models.TextField()
    wati_template_name = models.CharField(max_length=150, blank=True)
    wati_language_code = models.CharField(max_length=20, default='en', blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='whatsapp_templates_created')

    class Meta:
        db_table = 'whatsapp_templates'
        ordering = ['template_type', 'name']

    def __str__(self):
        return self.name


class Notification(models.Model):
    """In-app notifications for users."""

    class NType(models.TextChoices):
        INFO    = 'info',    'Info'
        SUCCESS = 'success', 'Success'
        WARNING = 'warning', 'Warning'
        ERROR   = 'error',   'Error'

    class Status(models.TextChoices):
        UNREAD = 'unread', 'Unread'
        READ = 'read', 'Read'
        RESOLVED = 'resolved', 'Resolved / Completed'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    class Category(models.TextChoices):
        APPROVAL = 'approval', 'Approval'
        SYSTEM = 'system', 'System'
        INFO = 'info', 'Info'

    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    title       = models.CharField(max_length=200)
    message     = models.TextField()
    type        = models.CharField(max_length=10, choices=NType.choices, default=NType.INFO)
    category    = models.CharField(max_length=20, choices=Category.choices, default=Category.INFO, db_index=True)
    status      = models.CharField(max_length=20, choices=Status.choices, default=Status.UNREAD, db_index=True)
    is_read     = models.BooleanField(default=False, db_index=True)
    related_url = models.CharField(max_length=300, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.title} → {self.user}'
