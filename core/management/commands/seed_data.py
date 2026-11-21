import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from core.models import Application, Branch, LoanScheme


class Command(BaseCommand):
    help = "Load demo schemes, branches and sample applications from JSON."

    def handle(self, *args, **options):
        base = Path(settings.BASE_DIR)
        schemes = json.loads((base / "schemes.json").read_text(encoding="utf-8"))
        branches = json.loads((base / "branches.json").read_text(encoding="utf-8"))

        LoanScheme.objects.all().delete()
        for row in schemes:
            LoanScheme.objects.create(**row)
        self.stdout.write(f"Loaded {len(schemes)} schemes")

        Branch.objects.all().delete()
        for row in branches:
            Branch.objects.create(**row)
        self.stdout.write(f"Loaded {len(branches)} branches")

        Application.objects.all().delete()
        samples = [
            {
                "ref_no": "SS-2026-10001",
                "applicant_name": "Sunita Meghwal",
                "scheme_code": "MSY",
                "partner": "ANUPEKSHA, Jaipur",
                "stage": "Decision",
                "status": "approved",
                "pending_document": "",
                "rejection_reason": "",
                "fix_suggestion": "",
                "payload": {"loan_amount": 80000, "state": "Rajasthan"},
            },
            {
                "ref_no": "SS-2026-10002",
                "applicant_name": "Ramesh Verma",
                "scheme_code": "TL",
                "partner": "UPSCFDC, Lucknow",
                "stage": "Decision",
                "status": "rejected",
                "pending_document": "Income proof",
                "rejection_reason": "The income paper shows more than the scheme ceiling, so the file was closed.",
                "fix_suggestion": "If the family income is actually within the limit, get a fresh income certificate from the tehsil and apply again. Or pick a scheme with a higher ceiling.",
                "payload": {"loan_amount": 400000, "state": "Uttar Pradesh"},
            },
            {
                "ref_no": "SS-2026-10003",
                "applicant_name": "Kavita Devi",
                "scheme_code": "MCF",
                "partner": "Aryavart Bank, Lucknow",
                "stage": "Document Verification",
                "status": "in_progress",
                "pending_document": "Caste certificate with current year stamp",
                "rejection_reason": "",
                "fix_suggestion": "",
                "payload": {"loan_amount": 50000, "state": "Uttar Pradesh"},
            },
            {
                "ref_no": "SS-2026-10004",
                "applicant_name": "Murugan S",
                "scheme_code": "LVY",
                "partner": "TAHDCO, Chennai",
                "stage": "Field/Police Verification",
                "status": "in_progress",
                "pending_document": "Shop photos and rent receipt",
                "rejection_reason": "",
                "fix_suggestion": "",
                "payload": {"loan_amount": 250000, "state": "Tamil Nadu"},
            },
        ]
        for row in samples:
            Application.objects.create(**row)
        self.stdout.write("Loaded 4 sample applications")
        self.stdout.write(self.style.SUCCESS("Demo data ready. Verify with the official partner."))
