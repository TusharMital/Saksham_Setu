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

        if options.get("reset"):
            deleted_count, _ = Application.objects.filter(ref_no__in=SEEDED_SAMPLE_REFS).delete()
            self.stdout.write(f"Removed {deleted_count} seeded sample applications")

        self.stdout.write(self.style.SUCCESS("Reference catalog ready (schemes and branches)."))
