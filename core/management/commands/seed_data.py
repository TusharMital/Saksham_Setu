import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Application, Branch, LoanScheme

SEEDED_SAMPLE_REFS = (
    "SS-2026-10001",
    "SS-2026-10002",
    "SS-2026-10003",
    "SS-2026-10004",
)


class Command(BaseCommand):
    help = "Load reference catalog data (NSFDC schemes and partner bank branches) from JSON."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete any previously seeded sample applications (SS-2026-10001 to SS-2026-10004).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        base = Path(settings.BASE_DIR)
        schemes_path = base / "data" / "schemes.json"
        if not schemes_path.exists():
            schemes_path = base / "schemes.json"
        schemes = json.loads(schemes_path.read_text(encoding="utf-8"))
        branches = json.loads((base / "branches.json").read_text(encoding="utf-8"))

        LoanScheme.objects.all().delete()
        for row in schemes:
            applicable_states = row.get("applicable_states") or row.get("states_supported") or ["ALL"]
            required_documents = row.get("required_documents") or row.get("documents") or []
            overview = row.get("overview") or row.get("description") or ""
            official_portal_url = row.get("official_portal_url") or row.get("govt_portal_url") or ""
            max_income = row.get("max_income", row.get("income_ceiling"))
            LoanScheme.objects.create(
                code=row["code"],
                name=row["name"],
                level=row.get("level", "central"),
                applicable_states=applicable_states,
                agency=row.get("agency", ""),
                eligible_categories=row.get("eligible_categories") or [],
                max_loan=row.get("max_loan"),
                min_loan=row.get("min_loan"),
                interest_rate=float(row.get("interest_rate") or 0),
                interest_rate_note=row.get("interest_rate_note", ""),
                subsidy_percent=float(row.get("subsidy_percent") or 0),
                subsidy_margin_note=row.get("subsidy_margin_note", ""),
                finance_percent=float(row.get("finance_percent") or 90),
                tenure_months=int(row.get("tenure_months") or 60),
                moratorium_months=int(row.get("moratorium_months") or 0),
                max_income=max_income,
                income_ceiling=max_income,
                min_age=int(row.get("min_age") or 18),
                max_age=int(row.get("max_age") or 65),
                applicant_types=row.get("applicant_types") or ["individual"],
                states_supported=row.get("states_supported") or applicable_states,
                women_only=bool(row.get("women_only", False)),
                pwd_only=bool(row.get("pwd_only", False)),
                sectors=row.get("sectors") or [],
                overview=overview,
                description=row.get("description") or overview,
                key_highlights=row.get("key_highlights") or [],
                required_documents=required_documents,
                documents=row.get("documents") or required_documents,
                important_notes=row.get("important_notes") or [],
                available_channels=row.get("available_channels") or [],
                official_portal_url=official_portal_url,
                govt_portal_url=row.get("govt_portal_url") or official_portal_url,
                bank_portal_url=row.get("bank_portal_url", ""),
                is_demo=bool(row.get("is_demo", False)),
            )
        self.stdout.write(f"Loaded {len(schemes)} schemes")

        Branch.objects.all().delete()
        for row in branches:
            Branch.objects.create(**row)
        self.stdout.write(f"Loaded {len(branches)} branches")

        if options.get("reset"):
            deleted_count, _ = Application.objects.filter(ref_no__in=SEEDED_SAMPLE_REFS).delete()
            self.stdout.write(f"Removed {deleted_count} seeded sample applications")

        self.stdout.write(self.style.SUCCESS("Reference catalog ready (schemes and branches)."))
