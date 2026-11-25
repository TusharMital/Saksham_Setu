import hashlib
import json
from pathlib import Path

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.category_verifier import verify_category_and_document
from core.chatbot import chat_completion
from core.emi import calculate_emi
from core.geo import coords_from_pin, load_india_districts, lookup_pin_details, rank_branches
from core.i18n_validator import sanitize_bundle_with_fallback
from core.languages import get_language_meta, list_supported_languages
from core.models import Application, Branch, LoanScheme
from core.pdf_generator import generate_application_pdf
from core.recommender import recommend
from core.serializers import ApplicationSerializer, LoanSchemeSerializer
from core.validation import validate_applicant, validate_emi_payload


STAGES = ["Submitted", "Document Verification", "Field/Police Verification", "Decision"]


class SchemeListView(APIView):
    def get(self, request):
        qs = LoanScheme.objects.all()
        return Response({"demo": True, "schemes": LoanSchemeSerializer(qs, many=True).data})


def _default_scheme_amount(scheme):
    min_loan = float(scheme.min_loan) if scheme.min_loan is not None else 0.0
    max_loan = float(scheme.max_loan) if scheme.max_loan is not None else None
    base = 500000.0
    if max_loan is not None and max_loan > 0:
        base = min(base, max_loan)
    if min_loan > base:
        base = min_loan
    return max(10000.0, base)


def _build_yearly_schedule(monthly_schedule, moratorium_months):
    years = {}
    for row in monthly_schedule:
        yr = (row["month"] - 1) // 12 + 1
        if yr not in years:
            years[yr] = {
                "year": yr,
                "principal_paid": 0.0,
                "interest_paid": 0.0,
                "total_paid": 0.0,
                "ending_balance": float(row["balance"]),
                "moratorium_months": 0,
            }
        bucket = years[yr]
        bucket["principal_paid"] += float(row["principal"])
        bucket["interest_paid"] += float(row["interest"])
        bucket["total_paid"] += float(row["emi"])
        bucket["ending_balance"] = float(row["balance"])
        if row["month"] <= moratorium_months:
            bucket["moratorium_months"] += 1

    out = []
    for yr in sorted(years):
        b = years[yr]
        out.append(
            {
                "year": b["year"],
                "principal_paid": round(b["principal_paid"], 2),
                "interest_paid": round(b["interest_paid"], 2),
                "total_paid": round(b["total_paid"], 2),
                "ending_balance": round(b["ending_balance"], 2),
                "moratorium_months": b["moratorium_months"],
                "is_moratorium_year": b["moratorium_months"] > 0,
            }
        )
    return out


class SchemeDetailView(APIView):
    def get(self, request, code):
        scheme = LoanScheme.objects.filter(code__iexact=code.strip()).first()
        if not scheme:
            return Response(
                {"detail": f"Scheme '{code}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        raw_amount = request.query_params.get("amount")
        amount = None
        if raw_amount not in (None, ""):
            try:
                parsed = float(raw_amount)
                if parsed > 0:
                    amount = parsed
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Query parameter 'amount' must be a positive number."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if amount is None:
            amount = _default_scheme_amount(scheme)

        tenure = int(scheme.tenure_months or 60)
        moratorium = min(int(scheme.moratorium_months or 0), max(0, tenure - 1))
        emi_out = calculate_emi(amount, float(scheme.interest_rate or 0), tenure, moratorium)
        yearly_schedule = _build_yearly_schedule(emi_out["schedule"], moratorium)

        data = LoanSchemeSerializer(scheme).data
        return Response(
            {
                **data,
                "emi_amount": emi_out["principal"],
                "monthly_emi": emi_out["monthly_emi"],
                "total_interest": emi_out["total_interest"],
                "total_payable": emi_out["total_payable"],
                "yearly_schedule": yearly_schedule,
                "emi": {
                    "principal": emi_out["principal"],
                    "annual_rate": emi_out["annual_rate"],
                    "tenure_months": emi_out["tenure_months"],
                    "moratorium_months": emi_out["moratorium_months"],
                    "monthly_emi": emi_out["monthly_emi"],
                    "total_interest": emi_out["total_interest"],
                    "total_payable": emi_out["total_payable"],
                    "yearly_schedule": yearly_schedule,
                },
            }
        )


class RecommendView(APIView):
    def post(self, request):
        data = validate_applicant(request.data)
        schemes = LoanScheme.objects.all()
        result = recommend(data, schemes)
        return Response({"demo": True, **result})


class BranchListView(APIView):
    def get(self, request):
        scheme = request.query_params.get("scheme")
        lat = request.query_params.get("lat")
        lng = request.query_params.get("lng")
        pin = request.query_params.get("pin")
        if (lat in (None, "") or lng in (None, "")) and pin:
            plat, plng, _ = coords_from_pin(pin)
            lat, lng = plat, plng
        try:
            user_lat = float(lat)
            user_lng = float(lng)
        except (TypeError, ValueError):
            return Response(
                {"detail": "Please share location or a 6-digit PIN so we can find nearby partners."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ranked = rank_branches(Branch.objects.all(), user_lat, user_lng, scheme_code=scheme)
        return Response(
            {
                "demo": True,
                "user": {"lat": user_lat, "lng": user_lng},
                "branches": ranked,
            }
        )


class EmiView(APIView):
    def post(self, request):
        amount, rate, tenure, moratorium = validate_emi_payload(request.data)
        return Response({"demo": True, **calculate_emi(amount, rate, tenure, moratorium)})


class ApplicationCreateView(APIView):
    def post(self, request):
        data = request.data
        name = str(data.get("applicant_name") or data.get("full_name") or "").strip()
        scheme_code = str(data.get("scheme_code") or "").strip()
        partner = str(data.get("partner") or "").strip() or "To be chosen"
        if not name or not scheme_code:
            return Response(
                {"detail": "Applicant name and scheme code are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            ref = str(data.get("ref_no") or "").strip() or _next_ref()
            app = Application.objects.create(
                ref_no=ref,
                applicant_name=name,
                scheme_code=scheme_code,
                partner=partner,
                stage="Submitted",
                status="in_progress",
                pending_document="Identity and caste certificate",
                payload=data,
            )
        return Response(ApplicationSerializer(app).data, status=status.HTTP_201_CREATED)


class ApplicationDetailView(APIView):
    def get(self, request, ref):
        app = Application.objects.filter(ref_no__iexact=ref.strip()).first()
        if not app:
            return Response(
                {"detail": f"No application found for {ref}. Check the number and try again."},
                status=status.HTTP_404_NOT_FOUND,
            )
        idx = STAGES.index(app.stage) if app.stage in STAGES else 0
        timeline = []
        for i, name in enumerate(STAGES):
            if app.status == "rejected" and name == "Decision":
                state = "rejected"
            elif app.status == "approved" and name == "Decision":
                state = "done"
            elif i < idx:
                state = "done"
            elif i == idx:
                state = "current"
            else:
                state = "pending"
            timeline.append({"name": name, "state": state})
        return Response(
            {
                "demo": True,
                "application": ApplicationSerializer(app).data,
                "timeline": timeline,
                "pending_document": app.pending_document,
                "rejection_reason": app.rejection_reason,
                "fix_suggestion": app.fix_suggestion,
            }
        )


class ApplicationPdfView(APIView):
    def get(self, request, ref):
        app = get_object_or_404(Application, ref_no__iexact=ref.strip())
        pdf = generate_application_pdf(app)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{app.ref_no}.pdf"'
        return response


class ChatView(APIView):
    def post(self, request):
        message = request.data.get("message") or request.data.get("query") or ""
        history = request.data.get("history") or []
        language = request.data.get("lang") or request.data.get("language") or "en"
        ip = request.META.get("REMOTE_ADDR", "unknown")
        body, code = chat_completion(message, history, language, client_ip=ip)
        return Response(body, status=code)


TRANSLATIONS_DIR = Path(__file__).resolve().parent / "translations"
I18N_VERSION = "1.0.0"


class I18nLanguagesView(APIView):
    def get(self, request):
        languages = list_supported_languages()
        return Response({"version": I18N_VERSION, "count": len(languages), "languages": languages})


class I18nBundleView(APIView):
    def get(self, request, lang_code):
        try:
            meta = get_language_meta(lang_code)
        except ValueError:
            return Response(
                {"detail": f"Unsupported language code: {lang_code}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        en_path = TRANSLATIONS_DIR / "en.json"
        target_path = TRANSLATIONS_DIR / f"{meta['code']}.json"
        if not target_path.exists():
            return Response(
                {"detail": f"Translation bundle not found for: {meta['code']}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        en_bundle = json.loads(en_path.read_text(encoding="utf-8"))
        target_bundle = json.loads(target_path.read_text(encoding="utf-8"))
        translations, _ = sanitize_bundle_with_fallback(en_bundle, target_bundle)

        payload = {
            "language": meta["code"],
            "name": meta["name"],
            "native_name": meta["native_name"],
            "script": meta["script"],
            "direction": meta["direction"],
            "speech_locale": meta["speech_locale"],
            "version": I18N_VERSION,
            "translations": translations,
        }
        canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
        etag = f'"{hashlib.sha256(canonical).hexdigest()[:16]}"'

        if request.META.get("HTTP_IF_NONE_MATCH") == etag:
            resp = HttpResponse(status=status.HTTP_304_NOT_MODIFIED)
            resp["Cache-Control"] = "public, max-age=86400"
            resp["ETag"] = etag
            return resp

        resp = Response(payload, status=status.HTTP_200_OK)
        resp["Cache-Control"] = "public, max-age=86400"
        resp["ETag"] = etag
        return resp


class VerifyCategoryView(APIView):
    def post(self, request):
        result = verify_category_and_document(request.data or {})
        return Response(result, status=status.HTTP_200_OK)


class PinLookupView(APIView):
    def get(self, request):
        pin = request.query_params.get("pin", "")
        lat, lng, place = coords_from_pin(pin)
        if lat is None:
            return Response(
                {"detail": "This PIN is not in our lookup table. Allow location or pick a nearby city."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"lat": lat, "lng": lng, "place": place, "demo": True})


class PinLookupDetailView(APIView):
    def get(self, request, pin):
        try:
            details = lookup_pin_details(pin)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if not details:
            return Response(
                {"detail": f"No post office details found for PIN {pin}."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(details, status=status.HTTP_200_OK)


class DistrictsListView(APIView):
    def get(self, request):
        data = load_india_districts()
        resp = Response(data, status=status.HTTP_200_OK)
        resp["Cache-Control"] = "public, max-age=86400"
        return resp


def _next_ref():
    existing_nums = []
    for ref in Application.objects.values_list("ref_no", flat=True):
        if ref.startswith("SS-2026-"):
            tail = ref[len("SS-2026-"):]
            if tail.isdigit():
                existing_nums.append(int(tail))
    next_num = max(existing_nums, default=10000) + 1
    return f"SS-2026-{next_num}"
