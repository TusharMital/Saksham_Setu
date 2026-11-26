from django.urls import path

from core import views

urlpatterns = [
    path("recommend/", views.RecommendView.as_view()),
    path("schemes/", views.SchemeListView.as_view()),
    path("schemes/<str:code>/", views.SchemeDetailView.as_view()),
    path("branches/", views.BranchListView.as_view()),
    path("banks/live-search/", views.LiveBankSearchView.as_view()),
    path("emi/", views.EmiView.as_view()),
    path("applications/<str:ref>/", views.ApplicationDetailView.as_view()),
    path("applications/<str:ref>/pdf/", views.ApplicationPdfView.as_view()),
    path("applications/", views.ApplicationCreateView.as_view()),
    path("chat/", views.ChatView.as_view()),
    path("pin-lookup/<str:pin>/", views.PinLookupDetailView.as_view()),
    path("pin-lookup/", views.PinLookupView.as_view()),
    path("locations/districts/", views.DistrictsListView.as_view()),
    path("verify-category/", views.VerifyCategoryView.as_view()),
    path("i18n/languages/", views.I18nLanguagesView.as_view()),
    path("i18n/<str:lang_code>/", views.I18nBundleView.as_view()),
]
