import re

from rest_framework.exceptions import ValidationError

MOBILE_RE = re.compile(r"^[6-9]\d{9}$")
PIN_RE = re.compile(r"^\d{6}$")
ALLOWED_SECTORS = {
    "agriculture",
    "manufacturing",
    "trade",
    "service",
    "transport",
    "education",
}
ALLOWED_TYPES = {"individual", "shg"}


def require_fields(data, fields):
    missing = [f for f in fields if data.get(f) in (None, "")]
    if missing:
        raise ValidationError({"detail": f"Please fill: {', '.join(missing)}."})


def validate_applicant(data):
    require_fields(
        data,
        ["full_name", "mobile", "state", "district", "pin", "caste_category", "age", "annual_family_income",
         "applicant_type", "sector", "loan_amount"],
    )
    if not MOBILE_RE.match(str(data.get("mobile", ""))):
        raise ValidationError({"mobile": "Mobile number must be 10 digits."})
    if not PIN_RE.match(str(data.get("pin", ""))):
        raise ValidationError({"pin": "PIN code must be 6 digits."})
    try:
        age = int(data["age"])
    except (TypeError, ValueError):
        raise ValidationError({"age": "Please enter age in years, as a number."})
    if age < 18 or age > 75:
        raise ValidationError({"age": "Age should be between 18 and 75 years."})
    try:
        income = float(data["annual_family_income"])
        loan = float(data["loan_amount"])
    except (TypeError, ValueError):
        raise ValidationError({"detail": "Income and loan amount must be numbers."})
    if income < 0 or loan <= 0:
        raise ValidationError({"detail": "Income cannot be negative and loan amount must be more than zero."})
    if str(data.get("applicant_type", "")).lower() not in ALLOWED_TYPES:
        raise ValidationError({"applicant_type": "Choose Individual or SHG."})
    if str(data.get("sector", "")).lower() not in ALLOWED_SECTORS:
        raise ValidationError({"sector": "Please choose a sector from the list."})
    return data


def validate_emi_payload(data):
    try:
        amount = float(data.get("amount"))
        rate = float(data.get("annual_rate"))
        tenure = int(data.get("tenure_months"))
        moratorium = int(data.get("moratorium_months") or 0)
    except (TypeError, ValueError):
        raise ValidationError({"detail": "Amount, rate and tenure must be numbers."})
    if amount <= 0:
        raise ValidationError({"amount": "Loan amount must be more than zero."})
    if rate < 0 or rate > 36:
        raise ValidationError({"annual_rate": "Interest rate should be between 0 and 36 percent."})
    if tenure < 1 or tenure > 360:
        raise ValidationError({"tenure_months": "Tenure should be between 1 and 360 months."})
    if moratorium < 0 or moratorium >= tenure:
        raise ValidationError({"moratorium_months": "Moratorium must be less than the full tenure."})
    return amount, rate, tenure, moratorium
