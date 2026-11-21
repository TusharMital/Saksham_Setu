from django.contrib import admin

from core.models import Application, Branch, LoanScheme


@admin.register(LoanScheme)
class LoanSchemeAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "interest_rate", "max_loan", "income_ceiling", "women_only", "pwd_only")
    search_fields = ("code", "name")
    list_filter = ("women_only", "pwd_only")


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "partner_type", "city", "state", "fund_quota_crore", "npa_percent", "status")
    search_fields = ("name", "city", "state")
    list_filter = ("partner_type", "state")


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ("ref_no", "applicant_name", "scheme_code", "partner", "stage", "status", "created_at")
    search_fields = ("ref_no", "applicant_name")
    list_filter = ("stage", "status")
