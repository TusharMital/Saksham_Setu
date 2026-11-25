from django.db import models


class LoanScheme(models.Model):
    code = models.CharField(max_length=32, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    level = models.CharField(max_length=16, default="central", db_index=True)
    applicable_states = models.JSONField(default=list)
    agency = models.CharField(max_length=255, blank=True, default="")
    eligible_categories = models.JSONField(default=list)
    max_loan = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    min_loan = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, default=0)
    interest_rate = models.FloatField(help_text="Annual indicative interest percent")
    interest_rate_note = models.TextField(blank=True, default="")
    subsidy_percent = models.FloatField(default=0)
    subsidy_margin_note = models.TextField(blank=True, default="")
    finance_percent = models.FloatField(default=90)
    tenure_months = models.PositiveIntegerField(default=60)
    moratorium_months = models.PositiveIntegerField(default=6)
    max_income = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    income_ceiling = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    min_age = models.PositiveIntegerField(default=18)
    max_age = models.PositiveIntegerField(default=65)
    applicant_types = models.JSONField(default=list)
    states_supported = models.JSONField(default=list)
    women_only = models.BooleanField(default=False)
    pwd_only = models.BooleanField(default=False)
    sectors = models.JSONField(default=list)
    overview = models.TextField(blank=True, default="")
    description = models.TextField(blank=True, default="")
    key_highlights = models.JSONField(default=list)
    required_documents = models.JSONField(default=list)
    documents = models.JSONField(default=list)
    important_notes = models.JSONField(default=list)
    available_channels = models.JSONField(default=list)
    official_portal_url = models.URLField(blank=True, default="")
    govt_portal_url = models.URLField(blank=True, default="")
    bank_portal_url = models.URLField(blank=True, default="")
    is_demo = models.BooleanField(default=False)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} — {self.name}"


class Branch(models.Model):
    PARTNER_TYPES = [
        ("SCA", "State Channelising Agency"),
        ("PSB", "Public Sector Bank"),
        ("RRB", "Regional Rural Bank"),
        ("NBFC", "NBFC-MFI"),
    ]

    name = models.CharField(max_length=255)
    partner_type = models.CharField(max_length=16, choices=PARTNER_TYPES)
    state = models.CharField(max_length=128)
    city = models.CharField(max_length=128)
    address = models.TextField()
    phone = models.CharField(max_length=32, blank=True, default="")
    lat = models.FloatField()
    lng = models.FloatField()
    schemes_supported = models.JSONField(default=list)
    fund_quota_crore = models.FloatField(default=0)
    npa_percent = models.FloatField(default=0)
    status = models.CharField(max_length=32, default="Active")
    notes = models.TextField(blank=True, default="")
    is_demo = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.city})"


class Application(models.Model):
    STAGE_CHOICES = [
        ("Submitted", "Submitted"),
        ("Document Verification", "Document Verification"),
        ("Field/Police Verification", "Field/Police Verification"),
        ("Decision", "Decision"),
    ]
    STATUS_CHOICES = [
        ("in_progress", "In progress"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    ref_no = models.CharField(max_length=32, unique=True, db_index=True)
    applicant_name = models.CharField(max_length=255)
    scheme_code = models.CharField(max_length=32)
    partner = models.CharField(max_length=255)
    stage = models.CharField(max_length=64, choices=STAGE_CHOICES, default="Submitted")
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="in_progress")
    pending_document = models.CharField(max_length=255, blank=True, default="")
    rejection_reason = models.TextField(blank=True, default="")
    fix_suggestion = models.TextField(blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.ref_no} — {self.applicant_name}"
