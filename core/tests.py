from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from core.emi import calculate_emi
from core.geo import haversine_km, rank_branches
from core.recommender import recommend


SCHEMES = [
    {
        "code": "MSY",
        "name": "Mahila Samriddhi Yojana",
        "max_loan": 100000,
        "min_loan": 10000,
        "interest_rate": 4.0,
        "subsidy_percent": 10,
        "finance_percent": 90,
        "tenure_months": 36,
        "moratorium_months": 3,
        "income_ceiling": 500000,
        "min_age": 18,
        "max_age": 60,
        "applicant_types": ["individual", "shg"],
        "states_supported": ["all"],
        "women_only": True,
        "pwd_only": False,
        "sectors": ["trade", "service", "agriculture", "manufacturing"],
        "description": "Women micro-credit (demo)",
    },
    {
        "code": "TL",
        "name": "Term Loan",
        "max_loan": 3000000,
        "min_loan": 200000,
        "interest_rate": 6.0,
        "subsidy_percent": 0,
        "finance_percent": 90,
        "tenure_months": 60,
        "moratorium_months": 6,
        "income_ceiling": 500000,
        "min_age": 18,
        "max_age": 60,
        "applicant_types": ["individual"],
        "states_supported": ["all"],
        "women_only": False,
        "pwd_only": False,
        "sectors": ["manufacturing", "service", "trade"],
        "description": "Term loan (demo)",
    },
    {
        "code": "MCF",
        "name": "Micro Credit Finance",
        "max_loan": 60000,
        "min_loan": 5000,
        "interest_rate": 5.0,
        "subsidy_percent": 5,
        "finance_percent": 100,
        "tenure_months": 24,
        "moratorium_months": 1,
        "income_ceiling": 500000,
        "min_age": 18,
        "max_age": 60,
        "applicant_types": ["individual", "shg"],
        "states_supported": ["rajasthan", "uttar pradesh", "tamil nadu"],
        "women_only": False,
        "pwd_only": False,
        "sectors": ["trade", "service"],
        "description": "Micro credit (demo)",
    },
    {
        "code": "ELS",
        "name": "Education Loan Scheme",
        "max_loan": 2000000,
        "min_loan": 50000,
        "interest_rate": 4.0,
        "subsidy_percent": 0,
        "finance_percent": 90,
        "tenure_months": 84,
        "moratorium_months": 12,
        "income_ceiling": 500000,
        "min_age": 16,
        "max_age": 35,
        "applicant_types": ["individual"],
        "states_supported": ["all"],
        "women_only": False,
        "pwd_only": False,
        "sectors": ["education"],
        "description": "Education (demo)",
    },
]


def woman_rajasthan():
    return {
        "full_name": "Sunita",
        "mobile": "9876543210",
        "state": "Rajasthan",
        "district": "Jaipur",
        "pin": "302001",
        "caste_category": "SC",
        "age": 32,
        "annual_family_income": 300000,
        "applicant_type": "individual",
        "sector": "trade",
        "loan_amount": 80000,
        "project_cost": 100000,
        "woman_led": True,
        "disability": False,
        "jan_dhan": True,
        "existing_govt_loan": False,
    }


class RecommenderTests(SimpleTestCase):
    def test_msy_in_top3_for_woman_in_rajasthan(self):
        result = recommend(woman_rajasthan(), SCHEMES)
        top_codes = [s["code"] for s in result["top"]]
        self.assertIn("MSY", top_codes)

    def test_income_ceiling_rejection_reason(self):
        app = woman_rajasthan()
        app["annual_family_income"] = 600000
        app["loan_amount"] = 250000
        result = recommend(app, SCHEMES)
        income_rejects = [r for r in result["rejected"] if "income" in r["reason"].lower()]
        self.assertTrue(income_rejects)
        self.assertIn("5", income_rejects[0]["reason"])

    def test_women_only_rejects_male_applicant(self):
        app = woman_rajasthan()
        app["woman_led"] = False
        result = recommend(app, SCHEMES)
        msy = next(r for r in result["rejected"] if r["code"] == "MSY")
        self.assertIn("women", msy["reason"].lower())

    def test_state_filter_rejects_unsupported_state(self):
        app = woman_rajasthan()
        app["state"] = "Goa"
        app["loan_amount"] = 20000
        result = recommend(app, SCHEMES)
        mcf = next(x for x in result["accepted"] + result["rejected"] if x["code"] == "MCF")
        self.assertFalse(mcf["accepted"])
        self.assertIn("Goa", mcf["reason"])


class EmiTests(SimpleTestCase):
    def test_five_lakh_six_percent_sixty_months(self):
        out = calculate_emi(500000, 6, 60, 0)
        self.assertAlmostEqual(out["monthly_emi"], 9666, delta=2)

    def test_zero_rate_splits_principal(self):
        out = calculate_emi(120000, 0, 12, 0)
        self.assertAlmostEqual(out["monthly_emi"], 10000, delta=0.01)
        self.assertEqual(out["total_interest"], 0)


class BranchScoreTests(SimpleTestCase):
    def test_zero_funds_next_door_ranks_below_funded_farther(self):
        branches = [
            {
                "name": "Next door empty desk",
                "partner_type": "SCA",
                "state": "Rajasthan",
                "city": "Jaipur",
                "address": "Near user",
                "phone": "0141-000000",
                "lat": 26.9124,
                "lng": 75.7873,
                "schemes_supported": ["MSY"],
                "fund_quota_crore": 0,
                "npa_percent": 2,
                "status": "Active",
                "notes": "demo",
                "is_demo": True,
            },
            {
                "name": "Farther funded SCA",
                "partner_type": "SCA",
                "state": "Rajasthan",
                "city": "Jaipur",
                "address": "Tonk Road",
                "phone": "0141-111111",
                "lat": 26.8500,
                "lng": 75.8200,
                "schemes_supported": ["MSY"],
                "fund_quota_crore": 50,
                "npa_percent": 3,
                "status": "Active",
                "notes": "demo",
                "is_demo": True,
            },
        ]
        ranked = rank_branches(branches, 26.9124, 75.7873, "MSY")
        self.assertEqual(ranked[0]["name"], "Farther funded SCA")
        self.assertEqual(ranked[1]["name"], "Next door empty desk")

    def test_haversine_same_point_is_zero(self):
        self.assertEqual(haversine_km(26.9, 75.8, 26.9, 75.8), 0)


class ChatApiTests(TestCase):
    def test_empty_message_returns_400(self):
        client = APIClient()
        res = client.post("/api/chat/", {"message": "", "language": "en"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("message", res.data)
        self.assertTrue(res.data.get("error"))

    def test_message_too_long_returns_400(self):
        client = APIClient()
        res = client.post("/api/chat/", {"message": "x" * 501, "language": "en"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data.get("code"), "too_long")


class ApiIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        from core.models import Application, Branch, LoanScheme
        self.scheme = LoanScheme.objects.create(
            code="MSY",
            name="Mahila Samriddhi Yojana",
            max_loan=100000,
            min_loan=10000,
            interest_rate=4.0,
            subsidy_percent=15,
            finance_percent=95,
            tenure_months=36,
            moratorium_months=3,
            income_ceiling=500000,
            min_age=18,
            max_age=60,
            applicant_types=["individual", "shg"],
            states_supported=["all"],
            women_only=True,
            pwd_only=False,
            sectors=["trade", "service"],
            description="Women micro-credit demo",
            documents=["Caste certificate", "Aadhaar"],
        )
        self.branch = Branch.objects.create(
            name="ANUPEKSHA (Rajasthan SCA)",
            partner_type="SCA",
            state="Rajasthan",
            city="Jaipur",
            address="Demo office, C-Scheme, Jaipur",
            phone="0141-2220001",
            lat=26.892,
            lng=75.8038,
            schemes_supported=["MSY"],
            fund_quota_crore=50,
            npa_percent=3.2,
            status="Active",
        )

    def test_schemes_list(self):
        res = self.client.get("/api/schemes/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data.get("demo"))
        self.assertTrue(any(s["code"] == "MSY" for s in res.data["schemes"]))

    def test_recommend_endpoint_success(self):
        res = self.client.post("/api/recommend/", woman_rajasthan(), format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data.get("demo"))
        self.assertIn("accepted", res.data)
        self.assertIn("rejected", res.data)

    def test_recommend_endpoint_validation_error(self):
        bad_data = woman_rajasthan()
        bad_data["mobile"] = "123"  # invalid mobile
        res = self.client.post("/api/recommend/", bad_data, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("mobile", res.data)

    def test_branches_endpoint_with_lat_lng(self):
        res = self.client.get("/api/branches/?lat=26.9124&lng=75.7873&scheme=MSY")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data.get("demo"))
        self.assertTrue(len(res.data["branches"]) > 0)
        first = res.data["branches"][0]
        self.assertIn("branch_score", first)
        self.assertIn("health", first)

    def test_branches_endpoint_with_pin(self):
        res = self.client.get("/api/branches/?pin=302001&scheme=MSY")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(len(res.data["branches"]) > 0)

    def test_branches_endpoint_missing_location(self):
        res = self.client.get("/api/branches/")
        self.assertEqual(res.status_code, 400)
        self.assertIn("detail", res.data)

    def test_emi_endpoint_success(self):
        payload = {"amount": 500000, "annual_rate": 6, "tenure_months": 60, "moratorium_months": 0}
        res = self.client.post("/api/emi/", payload, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertAlmostEqual(res.data["monthly_emi"], 9666, delta=2)
        self.assertEqual(len(res.data["schedule"]), 60)

    def test_emi_endpoint_validation_error(self):
        bad_payload = {"amount": -500, "annual_rate": 6, "tenure_months": 60}
        res = self.client.post("/api/emi/", bad_payload, format="json")
        self.assertEqual(res.status_code, 400)

    def test_application_create_and_immediate_track(self):
        payload = {
            "applicant_name": "Radha Rani",
            "scheme_code": "MSY",
            "partner": "ANUPEKSHA (Rajasthan SCA)",
            "mobile": "9876543210",
            "loan_amount": 75000,
        }
        res = self.client.post("/api/applications/", payload, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertIn("ref_no", res.data)
        ref_no = res.data["ref_no"]
        self.assertTrue(ref_no.startswith("SS-2026-"))
        self.assertEqual(res.data["applicant_name"], "Radha Rani")

        track_res = self.client.get(f"/api/applications/{ref_no}/")
        self.assertEqual(track_res.status_code, 200)
        self.assertEqual(track_res.data["application"]["ref_no"], ref_no)
        self.assertEqual(track_res.data["application"]["applicant_name"], "Radha Rani")
        self.assertEqual(len(track_res.data["timeline"]), 4)
        self.assertEqual(track_res.data["timeline"][0]["state"], "current")

    def test_application_create_missing_fields_returns_400(self):
        res = self.client.post("/api/applications/", {"applicant_name": "   "}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_application_detail_found(self):
        from core.models import Application

        app = Application.objects.create(
            ref_no="SS-2026-90001",
            applicant_name="Meena Kumari",
            scheme_code="MSY",
            partner="ANUPEKSHA (Rajasthan SCA)",
            stage="Decision",
            status="approved",
            pending_document="",
            rejection_reason="",
            fix_suggestion="",
            payload={"loan_amount": 80000, "state": "Rajasthan", "mobile": "9876543210"},
        )
        res = self.client.get(f"/api/applications/{app.ref_no}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["application"]["applicant_name"], "Meena Kumari")
        self.assertEqual(len(res.data["timeline"]), 4)

    def test_application_detail_not_found(self):
        res = self.client.get("/api/applications/NONEXISTENT/")
        self.assertEqual(res.status_code, 404)

    def test_application_pdf_download(self):
        from core.models import Application

        app = Application.objects.create(
            ref_no="SS-2026-90002",
            applicant_name="Meena Kumari",
            scheme_code="MSY",
            partner="ANUPEKSHA (Rajasthan SCA)",
            stage="Submitted",
            status="in_progress",
            payload={"loan_amount": 80000, "state": "Rajasthan", "mobile": "9876543210"},
        )
        res = self.client.get(f"/api/applications/{app.ref_no}/pdf/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "application/pdf")
        self.assertTrue(res.content.startswith(b"%PDF"))

    def test_seed_data_seeds_catalog_only_and_reset_clears_samples(self):
        from core.models import Application, Branch, LoanScheme

        Application.objects.create(
            ref_no="SS-2026-10001",
            applicant_name="Seeded Sample",
            scheme_code="MSY",
            partner="Test Partner",
        )
        user_app = Application.objects.create(
            ref_no="SS-2026-90123",
            applicant_name="Real User",
            scheme_code="MSY",
            partner="Test Partner",
        )

        call_command("seed_data")
        self.assertGreater(LoanScheme.objects.count(), 0)
        self.assertGreater(Branch.objects.count(), 0)
        self.assertFalse(Application.objects.filter(ref_no="SS-2026-10002").exists())

        call_command("seed_data", reset=True)
        self.assertFalse(Application.objects.filter(ref_no="SS-2026-10001").exists())
        self.assertTrue(Application.objects.filter(ref_no=user_app.ref_no).exists())

    def test_pin_lookup_found(self):
        res = self.client.get("/api/pin-lookup/?pin=302001")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["place"], "Jaipur")

    def test_pin_lookup_not_found(self):
        res = self.client.get("/api/pin-lookup/?pin=999999")
        self.assertEqual(res.status_code, 404)

    def test_spa_fallback_serves_index(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"id=\"root\"", res.content)
        # Also verify client-side route fallback works
        res_route = self.client.get("/locator")
        self.assertEqual(res_route.status_code, 200)
        self.assertIn(b"id=\"root\"", res_route.content)

