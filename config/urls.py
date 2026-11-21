from django.contrib import admin
from django.urls import include, path, re_path

from core.spa import SpaFallbackView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("", SpaFallbackView.as_view(), name="home"),
    re_path(r"^(?!api/|admin/|static/).*$", SpaFallbackView.as_view()),
]
