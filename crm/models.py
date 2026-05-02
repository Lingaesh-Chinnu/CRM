# ============================================================
# backend/apps/core/models.py
# Base abstract model — timestamps for all models
# ============================================================
from django.db import models
from django.utils import timezone


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
        return self.create_user(username, email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    """Central user model for all staff and admins."""

    class Role(models.TextChoices):
        SUPER_ADMIN = 'super_admin', 'Admin'
        STAFF       = 'staff',       'Staff'

    branch     = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='staff_members')
    username   = models.CharField(max_length=150, unique=True)
    email      = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name  = models.CharField(max_length=100, blank=True)
    phone      = models.CharField(max_length=20, blank=True)
    role       = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF)
    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)  # Django admin access

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
        return self.role == self.Role.SUPER_ADMIN

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
    last   = Lead.objects.filter(lead_number__startswith=prefix).count() + 1
    return f'{prefix}-{last:04d}'


class Lead(TimeStampedModel):
    """Prospective student enquiry."""

    class Status(models.TextChoices):
        NEW        = 'new',       'New'
        CONTACTED  = 'contacted', 'Contacted'
        INTERESTED = 'interested','Interested'
        FOLLOW_UP  = 'follow_up', 'Follow Up'
        WALK_IN    = 'walk_in',   'Walk-in Scheduled'
        ENROLLED   = 'enrolled',  'Enrolled'
        DROPPED    = 'dropped',   'Dropped'
        CONVERTED  = 'converted', 'Converted'
        LOST       = 'lost',      'Lost'

    class Source(models.TextChoices):
        GOOGLE            = 'google',            'Google'
        INSTAGRAM         = 'instagram',         'Instagram'
        FACEBOOK          = 'facebook',          'Facebook'
        WHATSAPP          = 'whatsapp',          'Whatsapp'
        JUSTDIAL          = 'justdial',          'JustDial'
        TEAM_REFERENCE    = 'team_reference',    'Team Reference'
        FRIENDS_REFERENCE = 'friends_reference', 'Friends Reference'
        OTHERS            = 'others',            'Others'

    class PreferredTiming(models.TextChoices):
        WEEKDAY_MORNING = 'weekday_morning', 'Weekdays (Morning)'
        WEEKDAY_EVENING = 'weekday_evening', 'Weekdays (Evening)'
        WEEKENDS = 'weekends', 'Weekends'

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
    preferred_timing = models.CharField(max_length=30, choices=PreferredTiming.choices, blank=True)
    walkin_date = models.DateField(null=True, blank=True)
    next_follow_up_date = models.DateField(null=True, blank=True)
    remarks     = models.TextField(blank=True)
    status      = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    source      = models.CharField(max_length=20, choices=Source.choices, default=Source.GOOGLE)
    converted_to_type = models.CharField(max_length=20, blank=True)
    converted_record_id = models.PositiveIntegerField(null=True, blank=True)
    converted_at = models.DateTimeField(null=True, blank=True)
    converted_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name='converted_leads')

    class Meta:
        db_table = 'leads'
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.lead_number:
            self.lead_number = generate_lead_number()
        super().save(*args, **kwargs)

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


def generate_walkin_number():
    now    = timezone.now()
    prefix = f'WI-{now.strftime("%Y%m")}'
    last   = WalkIn.objects.filter(candidate_number__startswith=prefix).count() + 1
    return f'{prefix}-{last:04d}'


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
        FRIENDS_REFERENCE = 'friends_reference', 'Friends Reference'

    class WalkInBy(models.TextChoices):
        LINCY_SCANIA = 'lincy_scania', 'Mrs. Lincy Scania'
        RANGANAYAGI  = 'ranganayagi',  'Mrs. Ranganayagi'
        PAVITHRA     = 'pavithra',     'Ms. Pavithra'
        MAHALAKSHMI  = 'mahalakshmi',  'Ms. Mahalakshmi'
        SARATHA      = 'saratha',      'Mrs. Saratha'

    class PreferredTiming(models.TextChoices):
        WEEKDAY_MORNING = 'weekday_morning', 'Weekdays (Morning)'
        WEEKDAY_EVENING = 'weekday_evening', 'Weekdays (Evening)'
        WEEKENDS = 'weekends', 'Weekends'

    candidate_number = models.CharField(max_length=20, unique=True, editable=False)
    lead             = models.OneToOneField(Lead,   null=True, blank=True, on_delete=models.SET_NULL,
                                            related_name='walkin')
    branch           = models.ForeignKey(Branch,   null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='walkins')
    assigned_to      = models.ForeignKey(User,     null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='assigned_walkins')
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
    visit_date                      = models.DateField(default=timezone.now)
    converted_to_type               = models.CharField(max_length=20, blank=True)
    converted_record_id             = models.PositiveIntegerField(null=True, blank=True)
    converted_at                    = models.DateTimeField(null=True, blank=True)
    converted_by                    = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                                        related_name='converted_walkins')

    class Meta:
        db_table = 'walkins'
        ordering = ['-visit_date', '-created_at']

    def save(self, *args, **kwargs):
        if not self.candidate_number:
            self.candidate_number = generate_walkin_number()
        # Auto-convert if remarks contain "joined" (case-insensitive)
        if self.remarks and 'joined' in self.remarks.lower():
            self.status = self.Status.CONVERTED
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
    valid_to = models.DateField()
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='discounts_created')

    class Meta:
        db_table = 'discounts'
        ordering = ['-valid_to', 'name']

    @property
    def status_label(self):
        today = timezone.localdate()
        if today > self.valid_to:
            return 'Expired'
        return 'Active' if self.is_active else 'Inactive'

    def is_available_for_course(self, course_id, branch_id=None):
        today = timezone.localdate()
        if not self.is_active or self.valid_from > today or self.valid_to < today:
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


def get_default_installment_schedule(enrollment):
    final_fees = int(enrollment.final_fees or 0)
    enrollment_date = enrollment.enrollment_date
    start_date = enrollment.start_date or enrollment.enrollment_date
    if final_fees < 5000:
        return [{
            'label': '1st Installment',
            'amount': final_fees,
            'due_date': enrollment_date,
        }]
    remaining = final_fees - 5000
    second = remaining // 2
    third = remaining - second
    return [
        {'label': '1st Installment', 'amount': 5000, 'due_date': enrollment_date},
        {'label': '2nd Installment', 'amount': second, 'due_date': start_date},
        {'label': '3rd Installment', 'amount': third, 'due_date': add_month_to_date(start_date)},
    ]


def get_payment_installment_schedule(payment):
    if payment.manual_installment_schedule:
        return payment.manual_installment_schedule
    return get_default_installment_schedule(payment.enrollment)


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
        DROPPED   = 'dropped',   'Dropped'
        ON_HOLD   = 'on_hold',   'On Hold'

    FINAL_STATUSES = {'enrolled', 'active', 'completed', 'dropped', 'on_hold'}

    student_number  = models.CharField(max_length=20, unique=True, editable=False, null=True, blank=True)
    walkin          = models.OneToOneField(WalkIn, null=True, blank=True, on_delete=models.SET_NULL,
                                           related_name='enrollment')
    lead            = models.ForeignKey(Lead,   null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='enrollments')
    branch          = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='enrollments')
    course          = models.ForeignKey(Course, on_delete=models.RESTRICT, related_name='enrollments')
    enrolled_by     = models.ForeignKey(User,   null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='enrollments_created')
    created_by      = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='enrollments_entered')

    # Personal
    name             = models.CharField(max_length=200)
    dob              = models.DateField(null=True, blank=True)
    phone            = models.CharField(max_length=20)
    email            = models.EmailField(blank=True)
    location         = models.CharField(max_length=200, blank=True)
    pincode          = models.CharField(max_length=10, blank=True)
    source           = models.CharField(max_length=20, choices=WalkIn.Source.choices, blank=True)
    preferred_timing = models.CharField(max_length=30, choices=WalkIn.PreferredTiming.choices, blank=True)
    demo_class       = models.BooleanField(default=False)
    interested_global_certification = models.BooleanField(default=False)

    # Fees
    actual_fees      = models.DecimalField(max_digits=10, decimal_places=2)
    discount_amount  = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_reason  = models.CharField(max_length=300, blank=True)
    final_fees       = models.DecimalField(max_digits=10, decimal_places=2)
    discount          = models.ForeignKey(Discount, null=True, blank=True, on_delete=models.SET_NULL,
                                          related_name='enrollments')

    # Dates
    start_date       = models.DateField(null=True, blank=True)
    batch_timing     = models.CharField(max_length=100, blank=True)
    enrollment_date  = models.DateField(default=timezone.now)

    status           = models.CharField(max_length=30, choices=Status.choices,
                                        default=Status.PENDING_RULES, db_index=True)

    class Meta:
        db_table = 'enrollments'
        ordering = ['-enrollment_date', '-created_at']

    def save(self, *args, **kwargs):
        if not self.student_number and self.status in self.FINAL_STATUSES:
            self.student_number = generate_student_number(self.branch)
        # Auto-compute final fees
        self.final_fees = max(self.actual_fees - self.discount_amount, 0)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.student_number or "Pending"} - {self.name}'


class RulesSigningRequest(TimeStampedModel):
    """Public token-based Rules & Regulation signing gate for an enrollment."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        SENT = 'sent', 'Sent'
        SUBMITTED = 'submitted', 'Submitted'

    enrollment = models.OneToOneField(Enrollment, on_delete=models.CASCADE, related_name='rules_signing')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    signature_image = models.FileField(upload_to='rules_signatures/', null=True, blank=True)
    signed_pdf = models.FileField(upload_to='signed_rules/', null=True, blank=True)
    sent_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                related_name='rules_forms_sent')

    class Meta:
        db_table = 'rules_signing_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f'Rules signing for {self.enrollment.student_number} - {self.get_status_display()}'


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

    def save(self, *args, **kwargs):
        self.update_status()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Payment for {self.enrollment.student_number} — {self.get_status_display()}'


class PaymentInstallment(models.Model):
    """Individual payment entry (instalment)."""

    class Mode(models.TextChoices):
        CASH         = 'cash',          'Cash'
        UPI          = 'upi',           'UPI'
        BANK         = 'bank_transfer', 'Bank Transfer'
        CHEQUE       = 'cheque',        'Cheque'
        CARD         = 'card',          'Card'
        OTHER        = 'other',         'Other'

    payment          = models.ForeignKey(Payment,    on_delete=models.CASCADE, related_name='installments')
    enrollment       = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='installments')
    amount           = models.DecimalField(max_digits=10, decimal_places=2)
    payment_mode     = models.CharField(max_length=20, choices=Mode.choices, default=Mode.CASH)
    reference_number = models.CharField(max_length=100, blank=True)
    notes            = models.TextField(blank=True)
    bill_number      = models.CharField(max_length=50, blank=True)
    bill_generated_at= models.DateTimeField(null=True, blank=True)
    bill_generated_by= models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='generated_bills')
    collected_by     = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='collections')
    payment_date     = models.DateField(default=timezone.now)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'payment_installments'
        ordering = ['-payment_date']

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Recalculate aggregate
        total_paid          = self.payment.installments.aggregate(
                                  models.Sum('amount'))['amount__sum'] or 0
        self.payment.paid_amount = total_paid
        self.payment.update_status()
        self.payment.save()

    def __str__(self):
        return f'₹{self.amount} on {self.payment_date}'


class WhatsAppMessage(models.Model):
    """Log of all WhatsApp messages dispatched by the system."""

    class MsgType(models.TextChoices):
        FEE_REMINDER   = 'fee_reminder',   'Fee Reminder'
        BIRTHDAY       = 'birthday',       'Birthday Wish'
        FIRST_CLASS    = 'first_class',    'First Class Reminder'
        WALKIN_REMIND  = 'walkin_reminder','Walk-in Reminder'
        FOLLOW_UP      = 'follow_up',      'Follow-up Reminder'
        MANUAL         = 'manual',         'Manual'

    class MsgStatus(models.TextChoices):
        PENDING   = 'pending',   'Pending'
        SENT      = 'sent',      'Sent'
        DELIVERED = 'delivered', 'Delivered'
        READ      = 'read',      'Read'
        FAILED    = 'failed',    'Failed'

    recipient_phone = models.CharField(max_length=20)
    template_name   = models.CharField(max_length=100, blank=True)
    message_body    = models.TextField()
    message_type    = models.CharField(max_length=20, choices=MsgType.choices)
    status          = models.CharField(max_length=15, choices=MsgStatus.choices,
                                       default=MsgStatus.PENDING, db_index=True)
    wa_message_id   = models.CharField(max_length=100, blank=True)
    error_message   = models.TextField(blank=True)
    sent_by         = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='whatsapp_sent')
    related_model   = models.CharField(max_length=50, blank=True)
    related_id      = models.PositiveIntegerField(null=True, blank=True)
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

    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    title       = models.CharField(max_length=200)
    message     = models.TextField()
    type        = models.CharField(max_length=10, choices=NType.choices, default=NType.INFO)
    is_read     = models.BooleanField(default=False, db_index=True)
    related_url = models.CharField(max_length=300, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.title} → {self.user}'
