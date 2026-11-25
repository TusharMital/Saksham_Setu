"""Two-layer scheme recommender. All thresholds come from scheme records, not code."""

from decimal import Decimal


DEFAULT_INCOME_CEILING = Decimal("500000")


def _dec(value, default="0"):
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


def _list(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return list(value)
    return [value]


def scheme_to_dict(scheme):
    if isinstance(scheme, dict):
        return scheme
    return {
        "code": scheme.code,
        "name": scheme.name,
        "max_loan": float(scheme.max_loan),
        "min_loan": float(scheme.min_loan),
        "interest_rate": float(scheme.interest_rate),
        "subsidy_percent": float(scheme.subsidy_percent),
        "finance_percent": float(scheme.finance_percent),
        "tenure_months": scheme.tenure_months,
        "moratorium_months": scheme.moratorium_months,
        "income_ceiling": float(scheme.income_ceiling),
        "min_age": scheme.min_age,
        "max_age": scheme.max_age,
        "applicant_types": scheme.applicant_types,
        "states_supported": scheme.states_supported,
        "women_only": scheme.women_only,
        "pwd_only": scheme.pwd_only,
        "sectors": scheme.sectors,
        "description": scheme.description,
        "documents": getattr(scheme, "documents", []),
        "govt_portal_url": getattr(scheme, "govt_portal_url", ""),
        "bank_portal_url": getattr(scheme, "bank_portal_url", ""),
    }


def _fmt_inr(amount):
    n = float(amount)
    if n >= 100000:
        return f"Rs {n / 100000:.1f} lakh".replace(".0 lakh", " lakh")
    return f"Rs {int(n):,}"


def layer1_reason(applicant, scheme):
    """Return (accepted: bool, one-line reason)."""
    caste_cat = str(applicant.get("caste_category") or "").strip().upper()
    if caste_cat == "EWS":
        return (
            False,
            f"Rejected: {scheme['name']} is an NSFDC scheme exclusively for Scheduled Caste (SC) applicants. "
            "As an EWS applicant (DoPT OM 2019), consider PM MUDRA Yojana or PMEGP.",
        )

    states = [str(s).strip().lower() for s in _list(scheme.get("states_supported"))]
    app_state = str(applicant.get("state") or "").strip().lower()
    if states and "all" not in states and app_state not in states:
        return False, f"Rejected: {scheme['name']} is not listed for {applicant.get('state') or 'your state'}."

    income = _dec(applicant.get("annual_family_income"))
    ceiling = _dec(scheme.get("income_ceiling"), str(DEFAULT_INCOME_CEILING))
    if ceiling <= 0:
        ceiling = DEFAULT_INCOME_CEILING
    if income > ceiling:
        return (
            False,
            f"Rejected: your income {_fmt_inr(income)} is above the {_fmt_inr(ceiling)} limit.",
        )

    age = int(applicant.get("age") or 0)
    min_age = int(scheme.get("min_age") or 18)
    max_age = int(scheme.get("max_age") or 60)
    if age and (age < min_age or age > max_age):
        return False, f"Rejected: age {age} is outside the {min_age}–{max_age} year range."

    loan = _dec(applicant.get("loan_amount"))
    min_loan = _dec(scheme.get("min_loan"))
    max_loan = _dec(scheme.get("max_loan"), "999999999")
    if loan < min_loan:
        return False, f"Rejected: requested {_fmt_inr(loan)} is below the {_fmt_inr(min_loan)} minimum."
    if loan > max_loan:
        return False, f"Rejected: requested {_fmt_inr(loan)} is above the {_fmt_inr(max_loan)} maximum."

    allowed_types = [str(t).lower() for t in _list(scheme.get("applicant_types"))]
    app_type = str(applicant.get("applicant_type") or "individual").lower()
    if allowed_types and app_type not in allowed_types:
        return False, f"Rejected: this scheme is for {', '.join(allowed_types)}, not {app_type}."

    if scheme.get("women_only") and not applicant.get("woman_led"):
        return False, "Rejected: this scheme is only for women-led applicants."

    if scheme.get("pwd_only") and not applicant.get("disability"):
        return False, "Rejected: this scheme is only for persons with disability."

    return True, f"Accepted: you meet the state, income, age, loan and applicant-type rules for {scheme['name']}."


def _special_bonus(applicant, scheme):
    """Up to 20 points for matching optional eligibility flags."""
    points = 0.0
    if applicant.get("woman_led") and scheme.get("women_only"):
        points += 12
    elif applicant.get("woman_led") and "women" in " ".join(_list(scheme.get("sectors"))).lower():
        points += 6
    if applicant.get("disability") and scheme.get("pwd_only"):
        points += 12
    if applicant.get("sanitation_worker"):
        points += 4
    if applicant.get("skill_certificate"):
        points += 3
    if applicant.get("shg_jlg_member") or applicant.get("applicant_type") == "shg":
        points += 3
    if applicant.get("jan_dhan"):
        points += 2
    if not applicant.get("existing_govt_loan"):
        points += 1
    return min(20.0, points)


def _minmax_score(value, values, weight, invert=False):
    lo, hi = min(values), max(values)
    if hi == lo:
        return weight
    ratio = (value - lo) / (hi - lo)
    if invert:
        ratio = 1.0 - ratio
    return weight * ratio


def layer2_score(applicant, scheme, cohort):
    loan = float(applicant.get("loan_amount") or 0)
    rates = [float(s["interest_rate"]) for s in cohort]
    shares = [float(s.get("subsidy_percent") or 0) + float(s.get("finance_percent") or 0) for s in cohort]

    interest_pts = _minmax_score(float(scheme["interest_rate"]), rates, 35, invert=True)
    share_value = float(scheme.get("subsidy_percent") or 0) + float(scheme.get("finance_percent") or 0)
    subsidy_pts = _minmax_score(share_value, shares, 25, invert=False)

    min_loan = float(scheme.get("min_loan") or 0)
    max_loan = float(scheme.get("max_loan") or 1)
    span = max(max_loan - min_loan, 1)
    mid = (min_loan + max_loan) / 2
    fit = 1.0 - min(1.0, abs(loan - mid) / (span / 2))
    loan_pts = 20.0 * max(0.4, fit)

    bonus = _special_bonus(applicant, scheme)
    total = round(interest_pts + subsidy_pts + loan_pts + bonus, 1)
    return {
        "score": min(100.0, total),
        "breakdown": {
            "interest": round(interest_pts, 1),
            "subsidy_finance": round(subsidy_pts, 1),
            "loan_fit": round(loan_pts, 1),
            "special_bonus": round(bonus, 1),
        },
    }


def recommend(applicant, schemes):
    """Return accepted (scored) and rejected schemes with one-line reasons."""
    rows = [scheme_to_dict(s) for s in schemes]
    accepted, rejected = [], []
    for scheme in rows:
        ok, reason = layer1_reason(applicant, scheme)
        item = {**scheme, "reason": reason, "accepted": ok}
        if ok:
            accepted.append(item)
        else:
            rejected.append(item)

    if accepted:
        scored = []
        for scheme in accepted:
            extra = layer2_score(applicant, scheme, accepted)
            scored.append({**scheme, **extra})
        scored.sort(key=lambda x: x["score"], reverse=True)
        accepted = scored
        for i, item in enumerate(accepted):
            item["rank"] = i + 1
            item["best"] = i == 0
            item["reason"] = (
                f"Accepted: score {item['score']}/100 "
                f"(interest {item['breakdown']['interest']}, "
                f"subsidy {item['breakdown']['subsidy_finance']}, "
                f"loan fit {item['breakdown']['loan_fit']}, "
                f"special {item['breakdown']['special_bonus']})."
            )

    return {"accepted": accepted, "rejected": rejected, "top": accepted[:3]}
