import os
from django.core.management import call_command
from django.core.wsgi import get_wsgi_application
from django.db import OperationalError

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
application = get_wsgi_application()


def _ensure_vercel_db():
    if not ((os.environ.get("VERCEL") or os.environ.get("VERCEL_ENV")) and not (os.environ.get("DATABASE_URL") or "").strip()):
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
    os.environ["_VERCEL_BOOT_ERROR"] = f"{type(exc).__name__}: {exc}"
