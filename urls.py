from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

if getattr(settings, 'HAS_DRF_SPECTACULAR', False):
    from drf_spectacular.views import (
        SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
    )

from views import (
    LoginView, LogoutView, MeView,
    BranchViewSet, UserViewSet, UserTargetViewSet, BranchTargetViewSet,
    HistoricalAnalyticsEntryViewSet,
    CourseViewSet, LeadViewSet, WalkInViewSet, EnrollmentViewSet,
    PaymentViewSet, PaymentInstallmentViewSet, DiscountViewSet,
    LeadImportView, LeadImportHistoryViewSet,
    ExternalLeadCaptureView, NotificationViewSet, WhatsAppTemplateViewSet,
    DashboardSummaryView, DashboardBranchComparisonView, DashboardTrendView,
    DashboardHistoricalAnalyticsView, DashboardMyRatingView,
    ExportLeadsExcelView, ExportEnrollmentsExcelView,
    UserPerformanceReportView, UserRatingReportView, ConversionFunnelReportView,
    BranchPerformanceComparisonReportView, PublicWalkInFormView, PublicRulesSigningView,
    SessionHeartbeatView, UserMonitoringView, PhoneNumberUpdateView, rules_sign_view,
    RulesSignedPdfView, RulesSelfieView, PublicRulesSignedPdfView,
)

router = DefaultRouter()
router.register(r'branches', BranchViewSet, basename='branch')
router.register(r'users', UserViewSet, basename='user')
router.register(r'branch-targets', BranchTargetViewSet, basename='branch-target')
router.register(r'historical-analytics', HistoricalAnalyticsEntryViewSet, basename='historical-analytics')
router.register(r'courses', CourseViewSet, basename='course')
router.register(r'discounts', DiscountViewSet, basename='discount')
router.register(r'leads', LeadViewSet, basename='lead')
router.register(r'lead-import-history', LeadImportHistoryViewSet, basename='lead-import-history')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'whatsapp-templates', WhatsAppTemplateViewSet, basename='whatsapp-template')
router.register(r'walkins', WalkInViewSet, basename='walkin')
router.register(r'enrollments', EnrollmentViewSet, basename='enrollment')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'installments', PaymentInstallmentViewSet, basename='installment')

api_urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', MeView.as_view(), name='me'),
    path('auth/heartbeat/', SessionHeartbeatView.as_view(), name='heartbeat'),

    path('leads/import/', LeadImportView.as_view(), name='lead-import'),
    path('external/leads/', ExternalLeadCaptureView.as_view(), name='external-lead-capture'),
    path('', include(router.urls)),

    path('dashboard/summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('dashboard/branch-comparison/', DashboardBranchComparisonView.as_view(), name='branch-comparison'),
    path('dashboard/trends/', DashboardTrendView.as_view(), name='dashboard-trends'),
    path('dashboard/historical-analytics/', DashboardHistoricalAnalyticsView.as_view(), name='dashboard-historical-analytics'),
    path('dashboard/my-rating/', DashboardMyRatingView.as_view(), name='dashboard-my-rating'),

    path('reports/export/leads/', ExportLeadsExcelView.as_view(), name='export-leads'),
    path('reports/export/enrollments/', ExportEnrollmentsExcelView.as_view(), name='export-enrollments'),
    path('reports/user-performance/', UserPerformanceReportView.as_view(), name='user-performance-report'),
    path('reports/user-ratings/', UserRatingReportView.as_view(), name='user-rating-report'),
    path('reports/conversion-funnel/', ConversionFunnelReportView.as_view(), name='conversion-funnel-report'),
    path('reports/branch-performance/', BranchPerformanceComparisonReportView.as_view(), name='branch-performance-report'),
    path('admin/user-monitoring/', UserMonitoringView.as_view(), name='user-monitoring'),
    path('phone-numbers/<str:record_type>/<int:record_id>/', PhoneNumberUpdateView.as_view(), name='phone-number-update'),

    path('public/walkin/', PublicWalkInFormView.as_view(), name='public-walkin'),
    path('public/rules-sign/<uuid:token>/', PublicRulesSigningView.as_view(), name='public-rules-sign'),
]

urlpatterns = [
    path('IIE-Rules-Regulations/<uuid:token>/', rules_sign_view, name='rules_sign_public'),
    path('rules-sign/<uuid:token>/', rules_sign_view, name='rules_sign_legacy'),
    path('rules-signed-pdf/<int:enrollment_id>/', RulesSignedPdfView.as_view(), name='rules_signed_pdf'),
    path('rules-selfie/<int:enrollment_id>/', RulesSelfieView.as_view(), name='rules_selfie'),
    path('public/rules-signed-pdf/<uuid:token>/', PublicRulesSignedPdfView.as_view(), name='public_rules_signed_pdf'),
    re_path(r'^admin/(users|courses|discounts|targets|historical-analytics|lead-inbox|whatsapp-templates|branches|reports|user-monitoring|lead-import-history)(/.*)?$', TemplateView.as_view(template_name='index.html'), name='spa-admin'),
    path('admin/', admin.site.urls),
    path('api/', include(api_urlpatterns)),
]

if getattr(settings, 'HAS_DRF_SPECTACULAR', False):
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path('api/docs/', SpectacularSwaggerView.as_view(), name='swagger-ui'),
        path('api/docs/redoc/', SpectacularRedocView.as_view(), name='redoc'),
    ]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += staticfiles_urlpatterns()

urlpatterns += [
    re_path(
        r'^(?!api/|admin/|media/|static/).*$',
        TemplateView.as_view(template_name='index.html'),
        name='spa',
    ),
]
