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
