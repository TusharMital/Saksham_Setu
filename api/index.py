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

    try:
        if LoanScheme.objects.exists():
            return
    except OperationalError:
        pass

    call_command("migrate", "--noinput")
    call_command("seed_data")


try:
    _ensure_vercel_db()
except Exception as exc:
    os.environ["_VERCEL_DB_INIT_ERROR"] = f"{type(exc).__name__}: {exc}"

application = get_wsgi_application()
app = application
