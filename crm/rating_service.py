from calendar import monthrange

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.db.models import Count, Exists, F, OuterRef, Q
from django.utils import timezone

from crm.models import Enrollment, FollowUp, Lead, PaymentInstallment, UserMonthlyRating, WalkIn


User = get_user_model()

RATING_CACHE_SECONDS = 10 * 60

LEAD_CANCELLED_STATUSES = (
    Lead.Status.NOT_INTERESTED,
    Lead.Status.DROPPED,
    Lead.Status.LOST,
)
WALKIN_CANCELLED_STATUSES = (
    WalkIn.Status.NOT_INTERESTED,
    WalkIn.Status.TRANSFERRED,
)
ENROLLMENT_CANCELLED_STATUSES = (
    Enrollment.Status.DRAFT,
    Enrollment.Status.DROPPED,
    Enrollment.Status.INACTIVE,
    Enrollment.Status.TRANSFERRED,
)
LEAD_CLOSED_FOLLOW_UP_STATUSES = (
    Lead.Status.ENROLLED,
    Lead.Status.CONVERTED,
    Lead.Status.CONVERTED_TO_WALKIN,
    Lead.Status.NOT_INTERESTED,
    Lead.Status.DROPPED,
    Lead.Status.LOST,
)
WALKIN_CLOSED_FOLLOW_UP_STATUSES = (
    WalkIn.Status.CONVERTED,
    WalkIn.Status.NOT_INTERESTED,
    WalkIn.Status.TRANSFERRED,
)


def month_window(year=None, month=None):
    today = timezone.localdate()
    year = year or today.year
    month = month or today.month
    start = timezone.datetime(year, month, 1).date()
    return start, start.replace(day=monthrange(year, month)[1])


def rating_stars(score):
    if score <= 20:
        return 1
    if score <= 40:
        return 2
    if score <= 60:
        return 3
    if score <= 80:
        return 4
    return 5


def _rating_cache_key(user_id, year, month):
    return f'kpi-rating:{user_id}:{year}:{month}'


def _visible(queryset):
    model_fields = {field.name for field in queryset.model._meta.fields}
    if 'is_deleted' in model_fields:
        return queryset.filter(is_deleted=False)
    return queryset


def _has_db_column(model, column_name):
    table_name = model._meta.db_table
    cache_key = f'kpi-rating-column:{table_name}:{column_name}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        with connection.cursor() as cursor:
            columns = {column.name for column in connection.introspection.get_table_description(cursor, table_name)}
    except Exception:
        columns = {field.column for field in model._meta.fields}
    result = column_name in columns
    cache.set(cache_key, result, RATING_CACHE_SECONDS)
    return result


def _walkin_owner_q(user):
    owner_q = Q(assigned_to=user) | Q(created_by=user)
    if _has_db_column(WalkIn, 'counseling_by_id'):
        owner_q |= Q(counseling_by=user)
    return owner_q


def _owned_leads(user, start, end):
    return _visible(
        Lead.objects.filter(
            Q(assigned_to=user) | Q(created_by=user),
            created_at__date__gte=start,
            created_at__date__lte=end,
        )
    ).exclude(status__in=LEAD_CANCELLED_STATUSES)


def _owned_walkins(user, start, end):
    return _visible(
        WalkIn.objects.filter(
            _walkin_owner_q(user),
            visit_date__gte=start,
            visit_date__lte=end,
        )
    ).exclude(status__in=WALKIN_CANCELLED_STATUSES)


def _owned_enrollments(user, start, end):
    return _visible(
        Enrollment.objects.filter(
            Q(enrolled_by=user) | Q(created_by=user),
            enrollment_date__gte=start,
            enrollment_date__lte=end,
        )
    ).exclude(status__in=ENROLLMENT_CANCELLED_STATUSES)


def _pending_follow_up_count(user, start, end):
    lead_pending = _visible(
        Lead.objects.filter(
            Q(assigned_to=user) | Q(created_by=user),
            next_follow_up_date__gte=start,
            next_follow_up_date__lte=end,
        )
    ).exclude(status__in=LEAD_CLOSED_FOLLOW_UP_STATUSES).annotate(
        has_completed_current_due=Exists(
            FollowUp.objects.filter(
                record_type=FollowUp.RecordType.LEAD,
                record_id=OuterRef('pk'),
                follow_up_date=OuterRef('next_follow_up_date'),
            )
        )
    ).filter(has_completed_current_due=False).count()

    walkin_pending = _visible(
        WalkIn.objects.filter(
            _walkin_owner_q(user),
            follow_up_date__gte=start,
            follow_up_date__lte=end,
        )
    ).exclude(status__in=WALKIN_CLOSED_FOLLOW_UP_STATUSES).annotate(
        has_completed_current_due=Exists(
            FollowUp.objects.filter(
                record_type=FollowUp.RecordType.WALKIN,
                record_id=OuterRef('pk'),
                follow_up_date=OuterRef('follow_up_date'),
            )
        )
    ).filter(has_completed_current_due=False).count()

    return lead_pending + walkin_pending


def calculate_kpi_rating(user, year=None, month=None, use_cache=True):
    if user.role == User.Role.SUPER_ADMIN:
        return None

    start, end = month_window(year, month)
    year = start.year
    month = start.month
    cache_key = _rating_cache_key(user.id, year, month)
    if use_cache:
        cached_id = cache.get(cache_key)
        if cached_id:
            rating = UserMonthlyRating.objects.filter(pk=cached_id).first()
            if rating:
                return rating

    leads = _owned_leads(user, start, end)
    walkins = _owned_walkins(user, start, end)
    enrollments = _owned_enrollments(user, start, end)

    completed_followups = FollowUp.objects.filter(
        updated_by=user,
        follow_up_date__gte=start,
        follow_up_date__lte=end,
    ).count()
    pending_followups = _pending_follow_up_count(user, start, end)
    total_followups = completed_followups + pending_followups
    no_pending_score = 20 if total_followups == 0 else ((total_followups - pending_followups) / total_followups) * 20

    enrollment_counts = enrollments.aggregate(
        total=Count('id', distinct=True),
        same_day=Count('id', filter=Q(walkin__visit_date=F('enrollment_date')), distinct=True),
    )
    total_enrollments = enrollment_counts['total'] or 0
    same_day_enrollments = enrollment_counts['same_day'] or 0
    same_day_enrollment_score = 0 if total_enrollments == 0 else (same_day_enrollments / total_enrollments) * 20

    collections = PaymentInstallment.objects.filter(
        Q(collected_by=user) | Q(enrollment__enrolled_by=user) | Q(enrollment__created_by=user),
        enrollment__is_deleted=False,
        payment_date__gte=start,
        payment_date__lte=end,
    ).exclude(enrollment__status__in=ENROLLMENT_CANCELLED_STATUSES)
    collection_counts = collections.aggregate(
        total=Count('id', distinct=True),
        same_day=Count('id', filter=Q(payment_date=F('enrollment__enrollment_date')), distinct=True),
    )
    total_collections = collection_counts['total'] or 0
    same_day_collections = collection_counts['same_day'] or 0
    same_day_collection_score = 0 if total_collections == 0 else (same_day_collections / total_collections) * 20

    total_leads = leads.count()
    lead_walkins = walkins.filter(lead__isnull=False, lead__in=leads).count()
    lead_walkin_score = min(20, 0 if total_leads == 0 else (lead_walkins / total_leads) * 20)

    total_walkins = walkins.count()
    walkin_enrollment_score = min(20, 0 if total_walkins == 0 else (total_enrollments / total_walkins) * 20)

    raw_score = (
        no_pending_score
        + same_day_enrollment_score
        + same_day_collection_score
        + lead_walkin_score
        + walkin_enrollment_score
    )
    score = max(0, min(100, round(raw_score)))
    breakdown = {
        'no_pending_followups': {
            'score': round(no_pending_score, 2),
            'total_followups': total_followups,
            'pending_followups': pending_followups,
        },
        'same_day_enrollment': {
            'score': round(same_day_enrollment_score, 2),
            'same_day_enrollments': same_day_enrollments,
            'total_enrollments': total_enrollments,
        },
        'same_day_collection': {
            'score': round(same_day_collection_score, 2),
            'same_day_collections': same_day_collections,
            'total_collections': total_collections,
        },
        'lead_to_walkin_conversion': {
            'score': round(lead_walkin_score, 2),
            'walkins_created_from_leads': lead_walkins,
            'total_leads': total_leads,
        },
        'walkin_to_enrollment_conversion': {
            'score': round(walkin_enrollment_score, 2),
            'total_enrollments': total_enrollments,
            'total_walkins': total_walkins,
        },
    }

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
    cache.set(cache_key, rating.id, RATING_CACHE_SECONDS)
    return rating
