from pathlib import Path

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound
from django.views import View


class SpaFallbackView(View):
    """Serve the Vite index.html so React Router can handle client routes."""

    def get(self, request, *args, **kwargs):
        index = Path(settings.FRONTEND_DIST) / "index.html"
        if index.exists():
            return HttpResponse(index.read_text(encoding="utf-8"), content_type="text/html")
        return HttpResponseNotFound(
            "Frontend build not found. Run: cd frontend && npm install && npm run build"
        )
