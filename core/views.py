from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.chatbot import chat_completion
from core.emi import calculate_emi
from core.geo import coords_from_pin, rank_branches
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
        language = request.data.get("language") or request.data.get("lang") or "en"
        ip = request.META.get("REMOTE_ADDR", "unknown")
        body, code = chat_completion(message, history, language, client_ip=ip)
        return Response(body, status=code)


class PinLookupView(APIView):
    def get(self, request):
        pin = request.query_params.get("pin", "")
        lat, lng, place = coords_from_pin(pin)
        if lat is None:
            return Response(
                {"detail": "This PIN is not in our demo table. Allow location or pick a nearby city."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"lat": lat, "lng": lng, "place": place, "demo": True})


def _next_ref():
    existing_nums = []
    for ref in Application.objects.values_list("ref_no", flat=True):
        if ref.startswith("SS-2026-"):
            tail = ref[len("SS-2026-"):]
            if tail.isdigit():
                existing_nums.append(int(tail))
    next_num = max(existing_nums, default=10000) + 1
    return f"SS-2026-{next_num}"
