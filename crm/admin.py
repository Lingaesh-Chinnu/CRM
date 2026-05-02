from django.contrib import admin

from .models import BranchTarget, HistoricalAnalyticsEntry, LeadImportHistory, WalkInBranchChangeHistory


@admin.register(BranchTarget)
class BranchTargetAdmin(admin.ModelAdmin):
    list_display = ('branch', 'month', 'year', 'lead_target', 'walkin_target', 'enroll_target', 'value_target')
    list_filter = ('year', 'month', 'branch')
    search_fields = ('branch__name',)

    @admin.display(description='Value target')
    def value_target(self, obj):
        return obj.revenue_target


@admin.register(HistoricalAnalyticsEntry)
class HistoricalAnalyticsEntryAdmin(admin.ModelAdmin):
    list_display = ('branch', 'month', 'year', 'leads_count', 'walkins_count', 'enrollments_count')
    list_filter = ('year', 'month', 'branch')
    search_fields = ('branch__name',)


@admin.register(LeadImportHistory)
class LeadImportHistoryAdmin(admin.ModelAdmin):
    list_display = ('file_name', 'uploaded_by', 'branch', 'total_rows', 'success_count', 'failed_count', 'status', 'created_at')
    list_filter = ('status', 'branch', 'created_at')
    search_fields = ('file_name', 'uploaded_by__username', 'uploaded_by__first_name', 'uploaded_by__last_name', 'branch__name')


@admin.register(WalkInBranchChangeHistory)
class WalkInBranchChangeHistoryAdmin(admin.ModelAdmin):
    list_display = ('walkin', 'old_branch', 'new_branch', 'changed_by', 'changed_at')
    list_filter = ('old_branch', 'new_branch', 'changed_at')
    search_fields = ('walkin__candidate_number', 'walkin__name', 'changed_by__username')
