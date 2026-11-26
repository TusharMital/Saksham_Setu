import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
from django.core.management import call_command
from django.core.wsgi import get_wsgi_application
from django.db import OperationalError

django.setup()


def _ensure_vercel_db():
    if not (os.environ.get("VERCEL") and not os.environ.get("DATABASE_URL")):
        return
    from core.models import LoanScheme

    needs_init = False
    try:
        needs_init = not LoanScheme.objects.exists()
    except OperationalError:
        needs_init = True

    if needs_init:
        call_command("migrate", "--noinput")
        call_command("seed_data")


_ensure_vercel_db()

app = get_wsgi_application()
