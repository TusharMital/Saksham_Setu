import hashlib
import json
import os
from pathlib import Path

from django.conf import settings
from django.db import OperationalError, transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.bank_locator import (
    live_search_banks_and_portals,
    resolve_coordinates_for_pin,
    reverse_geocode_coords,
)
from core.category_verifier import VERIFY_DEFAULTS, verify_category_and_document
from core.chatbot import chat_completion, client_ip, resolve_language
from core.dynamic_translator import translate_schemes, translate_texts
from core.emi import calculate_emi
from core.geo import coords_from_pin, load_india_districts, lookup_pin_details, rank_branches
from core.i18n_templates import fmt_tpl, get_section_templates
from core.i18n_validator import sanitize_bundle_with_fallback
from core.languages import get_language_meta, list_supported_languages
from core.models import Application, Branch, LoanScheme
from core.pdf_generator import generate_application_pdf
from core.recommender import recommend
from core.serializers import ApplicationSerializer, LoanSchemeSerializer
from core.validation import validate_applicant, validate_emi_payload


STAGES = ["Submitted", "Document Verification", "Field/Police Verification", "Decision"]


def _matches_sector_purpose(scheme, sector_key):
    key = sector_key.strip().lower()
    if not key or key == "all":
        return True
    sectors = [str(s).lower() for s in (scheme.sectors or [])]
    text = " ".join(
        [
            scheme.code or "",
            scheme.name or "",
            scheme.overview or "",
            scheme.description or "",
        ]
    ).lower()
    channels = [str(c).lower() for c in (scheme.available_channels or [])]

    if key in ("business", "business_msme"):
        return any(s in sectors for s in ("manufacturing", "trade", "service", "transport")) and scheme.code != "PMAY_U_ISS"
    if key in ("microfinance", "micro_finance"):
        max_loan = float(scheme.max_loan) if scheme.max_loan is not None else float("inf")
        return (
            max_loan <= 300000
            or "mfi" in channels
            or any(k in text for k in ("micro", "svanidhi", "street vendor", "shg", "mahila samriddhi", "aajeevika"))
        )
    if key == "education":
        return "education" in sectors
    if key in ("agriculture", "agriculture_solar_rural"):
        return "agriculture" in sectors or any(
            k in text for k in ("solar", "surya", "kusum", "kisan", "livestock", "fisheries", "nrlm", "rural")
        )
    if key == "housing":
        return any(k in text for k in ("pmay", "housing", "awas", "home"))
    if key in ("sanitation", "sanitation_artisan"):
        return any(
            k in text for k in ("sanitation", "namaste", "nskfdc", "artisan", "vishwakarma", "shilpi", "weaver", "handloom", "virasat")
        )
    return key in sectors


def _matches_channel_filter(scheme, channel_key):
    key = channel_key.strip().lower()
    if not key or key == "all":
        return True
    channels = {str(c).lower() for c in (scheme.available_channels or [])}
    if key in ("direct_portal", "direct"):
        return bool(channels & {"state_portal", "kviconline", "standupmitra", "pmvishwakarma"})
    return key in channels


def _filter_and_sort_schemes(schemes, params):
    items = list(schemes)

    q = (params.get("q") or params.get("search") or "").strip().lower()
    if q:
        items = [
            s
            for s in items
            if q in " ".join(
                [
                    s.code or "",
                    s.name or "",
                    s.agency or "",
                    s.overview or "",
                    s.description or "",
                    s.subsidy_margin_note or "",
                    s.interest_rate_note or "",
                    " ".join(s.applicable_states or []),
                ]
            ).lower()
        ]

    level = (params.get("level") or "").strip().lower()
    if level in ("central", "state"):
        items = [s for s in items if (s.level or "central").lower() == level]

    state = (params.get("state") or "").strip()
    state_exclusive = str(params.get("state_exclusive") or "").strip().lower() in ("1", "true", "yes")
    if state and state.upper() != "ALL":
        state_low = state.lower()
        if state_exclusive:
            items = [
                s
                for s in items
                if any(st.lower() == state_low for st in (s.applicable_states or []))
                and not any(st.upper() == "ALL" for st in (s.applicable_states or []))
            ]
        else:
            items = [
                s
                for s in items
                if any(st.upper() == "ALL" or st.lower() == state_low for st in (s.applicable_states or []))
            ]

    category = (params.get("category") or "").strip()
    if category and category.lower() != "all":
        wanted = [c.strip().lower() for c in category.split(",") if c.strip()]
        expanded = set()
        for c in wanted:
            if c in ("ews_general", "ews / general", "ews/general"):
                expanded.update({"ews", "general"})
            else:
                expanded.add(c)
        items = [
            s
            for s in items
            if any(str(cat).lower() in expanded for cat in (s.eligible_categories or []))
        ]

    women_only = str(params.get("women_only") or "").strip().lower() in ("1", "true", "yes")
    if women_only:
        items = [s for s in items if s.women_only]

    sector = (params.get("sector") or "").strip()
    if sector and sector.lower() != "all":
        items = [s for s in items if _matches_sector_purpose(s, sector)]

    channel = (params.get("channel") or "").strip()
    if channel and channel.lower() != "all":
        items = [s for s in items if _matches_channel_filter(s, channel)]

    raw_loan = params.get("desired_loan")
    if raw_loan not in (None, ""):
        try:
            desired = float(raw_loan)
            if desired > 0:
                items = [
                    s
                    for s in items
                    if (s.min_loan is None or float(s.min_loan) <= desired)
                    and (s.max_loan is None or float(s.max_loan) >= desired)
                ]
        except (TypeError, ValueError):
            pass

    raw_rate = params.get("max_rate")
    if raw_rate not in (None, ""):
        try:
            max_rate = float(raw_rate)
            items = [s for s in items if float(s.interest_rate or 0) <= max_rate]
        except (TypeError, ValueError):
            pass

    raw_income = params.get("income")
    if raw_income not in (None, ""):
        try:
            income = float(raw_income)
            if income > 0:
                items = [
                    s
                    for s in items
                    if s.max_income is None or float(s.max_income) == 0 or float(s.max_income) >= income
                ]
        except (TypeError, ValueError):
            pass

    sort_key = (params.get("sort") or "default").strip().lower()
    if sort_key == "name_asc":
        items.sort(key=lambda s: (s.name or "").lower())
    elif sort_key == "name_desc":
        items.sort(key=lambda s: (s.name or "").lower(), reverse=True)
    elif sort_key == "rate_asc":
        items.sort(key=lambda s: (float(s.interest_rate or 0), (s.name or "").lower()))
    elif sort_key == "rate_desc":
        items.sort(key=lambda s: (-float(s.interest_rate or 0), (s.name or "").lower()))
    elif sort_key == "loan_desc":
        items.sort(
            key=lambda s: (float(s.max_loan) if s.max_loan is not None else float("inf")),
            reverse=True,
        )
    elif sort_key == "loan_asc":
        items.sort(key=lambda s: (float(s.max_loan) if s.max_loan is not None else float("inf")))
    elif sort_key == "tenure_desc":
        items.sort(key=lambda s: (-int(s.tenure_months or 0), (s.name or "").lower()))

    return items


class SchemeListView(APIView):
    def get(self, request):
        qs = LoanScheme.objects.all()
        filtered = _filter_and_sort_schemes(qs, request.query_params)
        data = LoanSchemeSerializer(filtered, many=True).data
        return Response({"demo": True, "count": len(data), "schemes": data})


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
        body = request.data if isinstance(request.data, dict) else {}
        data = validate_applicant(body)
        raw_lang = (
            body.get("lang")
            or body.get("language")
            or request.query_params.get("lang")
            or "en"
        )
        lang_meta = resolve_language(raw_lang)
        schemes = LoanScheme.objects.all()
        result = recommend(data, schemes, lang=lang_meta["code"])
        return Response({"demo": True, "language": lang_meta["code"], **result})


class BranchListView(APIView):
    def get(self, request):
        scheme = request.query_params.get("scheme")
        lat = request.query_params.get("lat")
        lng = request.query_params.get("lng")
        pin = request.query_params.get("pin")
        lang_meta = resolve_language(request.query_params.get("lang") or "en")
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
        ranked = rank_branches(
            Branch.objects.all(),
            user_lat,
            user_lng,
            scheme_code=scheme,
            lang=lang_meta["code"],
        )
        return Response(
            {
                "demo": True,
                "language": lang_meta["code"],
                "user": {"lat": user_lat, "lng": user_lng},
                "branches": ranked,
            }
        )


class LiveBankSearchView(APIView):
    def get(self, request):
        scheme_code = (request.query_params.get("scheme") or "").strip()
        scheme = None
        if scheme_code:
            scheme = LoanScheme.objects.filter(code__iexact=scheme_code).first()
            if not scheme:
                return Response(
                    {"detail": f"Scheme '{scheme_code}' not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        raw_radius = request.query_params.get("radius_km", "10")
        try:
            radius_km = max(1, min(50, int(float(raw_radius))))
        except (TypeError, ValueError):
            radius_km = 10

        raw_lat = request.query_params.get("lat")
        raw_lng = request.query_params.get("lng")
        pin = (request.query_params.get("pin") or "").strip()

        resolved_location = None
        if raw_lat not in (None, "") and raw_lng not in (None, ""):
            try:
                user_lat = float(raw_lat)
                user_lng = float(raw_lng)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Invalid 'lat' or 'lng' coordinates."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not (-90.0 <= user_lat <= 90.0 and -180.0 <= user_lng <= 180.0) or (
                abs(user_lat) < 1e-6 and abs(user_lng) < 1e-6
            ):
                return Response(
                    {"detail": "Coordinates out of valid range."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            resolved_location = reverse_geocode_coords(user_lat, user_lng, pin=pin)
        elif pin:
            try:
                resolved_location = resolve_coordinates_for_pin(pin)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            user_lat = resolved_location["lat"]
            user_lng = resolved_location["lng"]
        else:
            return Response(
                {"detail": "Please provide live GPS coordinates (lat, lng) or a 6-digit Indian PIN code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lang_meta = resolve_language(
            request.query_params.get("lang") or request.query_params.get("language") or "en"
        )
        payload = live_search_banks_and_portals(
            user_lat=user_lat,
            user_lng=user_lng,
            scheme=scheme,
            radius_km=radius_km,
            resolved_location=resolved_location,
            lang=lang_meta["code"],
        )
        return Response(
            {
                "scheme": LoanSchemeSerializer(scheme).data if scheme else None,
                "language": lang_meta["code"],
                "location": resolved_location,
                "location_label": resolved_location.get("location_label", ""),
                "center": {"lat": resolved_location["lat"], "lng": resolved_location["lng"]},
                "radius_km": radius_km,
                **payload,
            },
            status=status.HTTP_200_OK,
        )


class EmiView(APIView):
    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        amount, rate, tenure, moratorium = validate_emi_payload(body)
        return Response({"demo": True, **calculate_emi(amount, rate, tenure, moratorium)})


class ApplicationCreateView(APIView):
    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
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


@method_decorator(csrf_exempt, name="dispatch")
class ChatView(APIView):
    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        message = body.get("message") or body.get("query") or ""
        history = body.get("history") or []
        language = body.get("lang") or body.get("language") or "en"
        resp_body, code = chat_completion(message, history, language, client_ip=client_ip(request))
        return Response(resp_body, status=code)


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


class TranslateSchemesView(APIView):
    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        raw_lang = body.get("lang") or body.get("language") or ""
        try:
            get_language_meta(raw_lang)
        except ValueError:
            return Response(
                {"detail": f"Unsupported or missing language code: {raw_lang!r}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        scheme_codes = body.get("scheme_codes")
        if scheme_codes is not None and not isinstance(scheme_codes, list):
            return Response(
                {"detail": "'scheme_codes' must be a list of scheme codes."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        res = translate_schemes(scheme_codes, raw_lang)
        return Response(res, status=status.HTTP_200_OK)


class TranslateTextsView(APIView):
    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        raw_lang = body.get("lang") or body.get("language") or ""
        try:
            get_language_meta(raw_lang)
        except ValueError:
            return Response(
                {"detail": f"Unsupported or missing language code: {raw_lang!r}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        texts = body.get("texts")
        if not isinstance(texts, list):
            return Response(
                {"detail": "'texts' must be a list of strings."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        res = translate_texts(texts, raw_lang)
        return Response(res, status=status.HTTP_200_OK)


class VerifyCategoryView(APIView):
    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        lang_meta = resolve_language(
            body.get("lang")
            or body.get("language")
            or request.query_params.get("lang")
            or "en"
        )
        result = verify_category_and_document(body, lang=lang_meta["code"])
        return Response(result, status=status.HTTP_200_OK)


class PinLookupView(APIView):
    def get(self, request):
        pin = request.query_params.get("pin", "")
        lang_meta = resolve_language(request.query_params.get("lang") or "en")
        tpl = get_section_templates("verify", VERIFY_DEFAULTS, lang=lang_meta["code"])
        lat, lng, place = coords_from_pin(pin)
        if lat is None:
            return Response(
                {"detail": tpl.get("pinLookupMissingError") or "This PIN is not in our lookup table. Allow location or pick a nearby city."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"lat": lat, "lng": lng, "place": place, "demo": True})


class PinLookupDetailView(APIView):
    def get(self, request, pin):
        lang_meta = resolve_language(request.query_params.get("lang") or "en")
        tpl = get_section_templates("verify", VERIFY_DEFAULTS, lang=lang_meta["code"])
        try:
            details = lookup_pin_details(pin)
        except ValueError:
            return Response(
                {"detail": tpl.get("pinInvalidError") or "PIN code must be a valid 6-digit Indian postal code."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not details:
            return Response(
                {"detail": fmt_tpl(tpl.get("pinNotFoundError") or "No post office details found for PIN {pin}.", pin=pin)},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(details, status=status.HTTP_200_OK)


class DistrictsListView(APIView):
    def get(self, request):
        data = load_india_districts()
        resp = Response(data, status=status.HTTP_200_OK)
        resp["Cache-Control"] = "public, max-age=86400"
        return resp


class HealthView(APIView):
    def get(self, request):
        db_error = os.environ.get("_VERCEL_DB_INIT_ERROR") or None
        try:
            schemes_count = LoanScheme.objects.count()
        except Exception as exc:
            schemes_count = 0
            db_error = db_error or f"{type(exc).__name__}: {exc}"
        groq_key = (os.getenv("GROQ_API_KEY") or getattr(settings, "GROQ_API_KEY", "") or "").strip()
        groq_model = (os.getenv("GROQ_MODEL") or getattr(settings, "GROQ_MODEL", "") or "openai/gpt-oss-120b").strip()
        return Response(
            {
                "status": "ok",
                "schemes": schemes_count,
                "db_error": db_error,
                "groq_configured": bool(groq_key),
                "groq_model": groq_model,
            },
            status=status.HTTP_200_OK,
        )


def _next_ref():
    existing_nums = []
    for ref in Application.objects.values_list("ref_no", flat=True):
        if ref.startswith("SS-2026-"):
            tail = ref[len("SS-2026-"):]
            if tail.isdigit():
                existing_nums.append(int(tail))
    next_num = max(existing_nums, default=10000) + 1
    return f"SS-2026-{next_num}"
