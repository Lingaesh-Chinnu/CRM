# ============================================================
# backend/apps/core/models.py
# Base abstract model — timestamps for all models
# ============================================================
from django.db import models


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


class UserTarget(models.Model):
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


# ============================================================
# backend/apps/courses/models.py
# ============================================================

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
        return self.actual_fees - self.discount_amount

    def __str__(self):
        return self.name


# ============================================================
# backend/apps/leads/models.py
# ============================================================
import uuid
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
        FOLLOW_UP  = 'follow_up', 'Follow Up'
        WALK_IN    = 'walk_in',   'Walk-in Scheduled'
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
    remarks     = models.TextField(blank=True)
    status      = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    source      = models.CharField(max_length=20, choices=Source.choices, default=Source.GOOGLE)

    class Meta:
        db_table = 'leads'
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.lead_number:
            self.lead_number = generate_lead_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.lead_number} — {self.name}'


# ============================================================
# backend/apps/walkins/models.py
# ============================================================

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

    class Source(models.TextChoices):
        WALK_IN       = 'walk_in',       'Walk-in'
        ONLINE        = 'online',        'Online'
        REFERRAL      = 'referral',      'Referral'
        SOCIAL_MEDIA  = 'social_media',  'Social Media'
        ADVERTISEMENT = 'advertisement', 'Advertisement'
        WHATSAPP      = 'whatsapp',      'WhatsApp'
        OTHER         = 'other',         'Other'

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
    demo_class        = models.BooleanField(default=False)
    source            = models.CharField(max_length=20, choices=Source.choices, default=Source.WALK_IN)
    preferred_timing  = models.CharField(max_length=30, choices=PreferredTiming.choices, blank=True)
    remarks           = models.TextField(blank=True)
    status            = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    visit_date        = models.DateField(default=timezone.localdate)

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


# ============================================================
# backend/apps/enrollments/models.py
# ============================================================

class FollowUp(models.Model):
    """Append-only follow-up history for leads and walk-ins."""

    class RecordType(models.TextChoices):
        LEAD = 'lead', 'Lead'
        WALKIN = 'walkin', 'Walk-in'

    record_type = models.CharField(max_length=10, choices=RecordType.choices, db_index=True)
    record_id = models.PositiveIntegerField(db_index=True)
    follow_up_date = models.DateField()
    next_follow_up_date = models.DateField()
    remarks = models.TextField(blank=True)
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='follow_ups_created')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'follow_ups'
        ordering = ['created_at', 'id']
        indexes = [
            models.Index(fields=['record_type', 'record_id']),
        ]

    def __str__(self):
        return f'{self.get_record_type_display()} #{self.record_id} follow-up'


BRANCH_STUDENT_ID_CODES = {
    'gandhipuram': '01',
    'hopes': '02',
    'kuniyamuthur': '03',
}


def get_branch_student_id_code(branch):
    if not branch:
        return '00'
    branch_name = (branch.name or '').strip().lower()
    return BRANCH_STUDENT_ID_CODES.get(branch_name, f'{branch.id:02d}')


def generate_student_number(branch):
    year = timezone.localdate().year
    branch_code = get_branch_student_id_code(branch)
    prefix = f'{year}{branch_code}-'
    branch_year_count = Enrollment.objects.filter(
        branch=branch,
        enrollment_date__year=year,
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


class Enrollment(TimeStampedModel):
    """Confirmed student enrollment record."""

    class Status(models.TextChoices):
        ACTIVE    = 'active',    'Active'
        COMPLETED = 'completed', 'Completed'
        DROPPED   = 'dropped',   'Dropped'
        ON_HOLD   = 'on_hold',   'On Hold'

    student_number  = models.CharField(max_length=20, unique=True, editable=False)
    walkin          = models.OneToOneField(WalkIn, null=True, blank=True, on_delete=models.SET_NULL,
                                           related_name='enrollment')
    lead            = models.ForeignKey(Lead,   null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='enrollments')
    branch          = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='enrollments')
    course          = models.ForeignKey(Course, on_delete=models.RESTRICT, related_name='enrollments')
    enrolled_by     = models.ForeignKey(User,   null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='enrollments_created')

    # Personal
    name             = models.CharField(max_length=200)
    dob              = models.DateField(null=True, blank=True)
    phone            = models.CharField(max_length=20)
    email            = models.EmailField(blank=True)

    # Fees
    actual_fees      = models.DecimalField(max_digits=10, decimal_places=2)
    discount_amount  = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_reason  = models.CharField(max_length=300, blank=True)
    final_fees       = models.DecimalField(max_digits=10, decimal_places=2)

    # Dates
    start_date       = models.DateField(null=True, blank=True)
    enrollment_date  = models.DateField(default=timezone.localdate)

    status           = models.CharField(max_length=20, choices=Status.choices,
                                        default=Status.ACTIVE, db_index=True)

    class Meta:
        db_table = 'enrollments'
        ordering = ['-enrollment_date', '-created_at']

    def save(self, *args, **kwargs):
        if not self.student_number:
            self.student_number = generate_student_number(self.branch)
        # Auto-compute final fees
        self.final_fees = self.actual_fees - self.discount_amount
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.student_number} — {self.name}'


# ============================================================
# backend/apps/payments/models.py
# ============================================================

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
    collected_by     = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='collections')
    payment_date     = models.DateField(default=timezone.localdate)
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


# ============================================================
# backend/apps/automation/models.py
# ============================================================

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
