from calendar import monthrange
from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.db.models import Count, Exists, F, OuterRef, Q
from django.utils import timezone

from crm.models import Enrollment, FollowUp, Lead, PaymentInstallment, UserMonthlyRating, UserSessionLog, WalkIn


User = get_user_model()

RATING_CACHE_SECONDS = 10 * 60
SESSION_ACTIVITY_GRACE_SECONDS = 5 * 60
MIN_DAILY_USAGE_SECONDS = 5 * 60 * 60
EXPECTED_LEAD_TO_WALKIN_RATIO = 0.25
EXPECTED_WALKIN_TO_ENROLLMENT_RATIO = 0.40
KPI_WEIGHTS = {
    'no_pending_followups': 20,
    'same_day_enrollment': 15,
    'same_day_collection': 15,
    'lead_to_walkin_conversion': 20,
    'walkin_to_enrollment_conversion': 20,
    'crm_usage_time': 10,
}

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


def _usage_seconds_for(user, start_date, end_date):
    start_dt = timezone.make_aware(datetime.combine(start_date, datetime.min.time()))
    end_dt = timezone.make_aware(datetime.combine(end_date, datetime.max.time()))
    now = timezone.now()
    effective_end_dt = min(end_dt, now)
    if effective_end_dt <= start_dt:
        return 0, {}

    sessions = UserSessionLog.objects.filter(
        user=user,
        login_at__lte=effective_end_dt,
        last_seen_at__gte=start_dt,
    ).only('login_at', 'logout_at', 'last_seen_at', 'is_active_session').order_by('login_at', 'last_seen_at')

    intervals = []
    for session in sessions:
        if not session.login_at or not session.last_seen_at:
            continue
        if session.logout_at:
            raw_end = min(session.logout_at, session.last_seen_at + timedelta(seconds=SESSION_ACTIVITY_GRACE_SECONDS))
        elif session.is_active_session:
            raw_end = min(now, session.last_seen_at + timedelta(seconds=SESSION_ACTIVITY_GRACE_SECONDS))
        else:
            raw_end = session.last_seen_at
        if raw_end <= session.login_at:
            continue
        session_start = max(session.login_at, start_dt)
        session_end = min(raw_end, effective_end_dt)
        if session_end > session_start:
            intervals.append((session_start, session_end))

    if not intervals:
        return 0, {}

    merged = []
    for interval_start, interval_end in sorted(intervals):
        if not merged or interval_start > merged[-1][1]:
            merged.append([interval_start, interval_end])
        else:
            merged[-1][1] = max(merged[-1][1], interval_end)

    total = 0
    daily = {}
    for interval_start, interval_end in merged:
        cursor = interval_start
        while cursor < interval_end:
            local_cursor = timezone.localtime(cursor)
            day_end = timezone.make_aware(datetime.combine(local_cursor.date(), datetime.max.time()))
            slice_end = min(interval_end, day_end)
            seconds = max(int((slice_end - cursor).total_seconds()), 0)
            if seconds:
                day_key = local_cursor.date().isoformat()
                daily[day_key] = min(daily.get(day_key, 0) + seconds, 86400)
                total += seconds
            cursor = slice_end + timedelta(microseconds=1)

    max_window_seconds = max(int((effective_end_dt - start_dt).total_seconds()), 0)
    return min(total, max_window_seconds), daily


def _ratio_shortfall_deduction(actual, expected, weight):
    if expected <= 0:
        return 0
    return max(0, min(weight, ((expected - actual) / expected) * weight))


def calculate_kpi_rating(user, year=None, month=None, use_cache=True):
    if user.role == User.Role.SUPER_ADMIN:
        return None

    start, end = month_window(year, month)
    year = start.year
    month = start.month
    today = timezone.localdate()
    is_current_month = year == today.year and month == today.month
    cache_key = _rating_cache_key(user.id, year, month)
    if use_cache:
        cached_id = cache.get(cache_key)
        if cached_id:
            rating = UserMonthlyRating.objects.filter(pk=cached_id).first()
            if rating:
                return rating

    existing_rating = UserMonthlyRating.objects.filter(user=user, year=year, month=month).first()
    if existing_rating and not is_current_month:
        cache.set(cache_key, existing_rating.id, RATING_CACHE_SECONDS)
        return existing_rating

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
    followup_deduction = 0 if total_followups == 0 else (pending_followups / total_followups) * KPI_WEIGHTS['no_pending_followups']

    enrollment_counts = enrollments.aggregate(
        total=Count('id', distinct=True),
        same_day=Count('id', filter=Q(walkin__visit_date=F('enrollment_date')), distinct=True),
    )
    total_enrollments = enrollment_counts['total'] or 0
    same_day_enrollments = enrollment_counts['same_day'] or 0
    missed_same_day_enrollments = max(total_enrollments - same_day_enrollments, 0)
    same_day_enrollment_deduction = (
        0 if total_enrollments == 0
        else (missed_same_day_enrollments / total_enrollments) * KPI_WEIGHTS['same_day_enrollment']
    )

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
    missed_same_day_collections = max(total_collections - same_day_collections, 0)
    same_day_collection_deduction = (
        0 if total_collections == 0
        else (missed_same_day_collections / total_collections) * KPI_WEIGHTS['same_day_collection']
    )

    total_leads = leads.count()
    lead_walkins = walkins.filter(lead__isnull=False, lead__in=leads).count()
    lead_walkin_ratio = 0 if total_leads == 0 else lead_walkins / total_leads
    lead_walkin_deduction = (
        0 if total_leads == 0
        else _ratio_shortfall_deduction(
            lead_walkin_ratio,
            EXPECTED_LEAD_TO_WALKIN_RATIO,
            KPI_WEIGHTS['lead_to_walkin_conversion'],
        )
    )

    total_walkins = walkins.count()
    walkin_enrollment_ratio = 0 if total_walkins == 0 else total_enrollments / total_walkins
    walkin_enrollment_deduction = (
        0 if total_walkins == 0
        else _ratio_shortfall_deduction(
            walkin_enrollment_ratio,
            EXPECTED_WALKIN_TO_ENROLLMENT_RATIO,
            KPI_WEIGHTS['walkin_to_enrollment_conversion'],
        )
    )

    usage_seconds, daily_usage = _usage_seconds_for(user, start, end)
    active_usage_days = len(daily_usage)
    average_daily_usage_seconds = int(usage_seconds / active_usage_days) if active_usage_days else 0
    usage_deduction = (
        0 if active_usage_days == 0 or average_daily_usage_seconds >= MIN_DAILY_USAGE_SECONDS
        else ((MIN_DAILY_USAGE_SECONDS - average_daily_usage_seconds) / MIN_DAILY_USAGE_SECONDS) * KPI_WEIGHTS['crm_usage_time']
    )

    total_deduction = (
        followup_deduction
        + same_day_enrollment_deduction
        + same_day_collection_deduction
        + lead_walkin_deduction
        + walkin_enrollment_deduction
        + usage_deduction
    )
    score = max(0, min(100, round(100 - total_deduction)))
    breakdown = {
        'no_pending_followups': {
            'score': round(KPI_WEIGHTS['no_pending_followups'] - followup_deduction, 2),
            'deduction': round(followup_deduction, 2),
            'total_followups': total_followups,
            'pending_followups': pending_followups,
        },
        'same_day_enrollment': {
            'score': round(KPI_WEIGHTS['same_day_enrollment'] - same_day_enrollment_deduction, 2),
            'deduction': round(same_day_enrollment_deduction, 2),
            'same_day_enrollments': same_day_enrollments,
            'missed_same_day_enrollments': missed_same_day_enrollments,
            'total_enrollments': total_enrollments,
        },
        'same_day_collection': {
            'score': round(KPI_WEIGHTS['same_day_collection'] - same_day_collection_deduction, 2),
            'deduction': round(same_day_collection_deduction, 2),
            'same_day_collections': same_day_collections,
            'missed_same_day_collections': missed_same_day_collections,
            'total_collections': total_collections,
        },
        'lead_to_walkin_conversion': {
            'score': round(KPI_WEIGHTS['lead_to_walkin_conversion'] - lead_walkin_deduction, 2),
            'deduction': round(lead_walkin_deduction, 2),
            'actual_ratio': round(lead_walkin_ratio * 100, 2),
            'expected_ratio': round(EXPECTED_LEAD_TO_WALKIN_RATIO * 100, 2),
            'walkins_created_from_leads': lead_walkins,
            'total_leads': total_leads,
        },
        'walkin_to_enrollment_conversion': {
            'score': round(KPI_WEIGHTS['walkin_to_enrollment_conversion'] - walkin_enrollment_deduction, 2),
            'deduction': round(walkin_enrollment_deduction, 2),
            'actual_ratio': round(walkin_enrollment_ratio * 100, 2),
            'expected_ratio': round(EXPECTED_WALKIN_TO_ENROLLMENT_RATIO * 100, 2),
            'total_enrollments': total_enrollments,
            'total_walkins': total_walkins,
        },
        'crm_usage_time': {
            'score': round(KPI_WEIGHTS['crm_usage_time'] - usage_deduction, 2),
            'deduction': round(usage_deduction, 2),
            'minimum_daily_seconds': MIN_DAILY_USAGE_SECONDS,
            'average_daily_seconds': average_daily_usage_seconds,
            'active_usage_days': active_usage_days,
        },
        'total_deduction': round(total_deduction, 2),
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
