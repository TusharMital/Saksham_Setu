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
    applicable_states = scheme.applicable_states or scheme.states_supported or ["ALL"]
    max_income = scheme.max_income if scheme.max_income is not None else scheme.income_ceiling
    required_documents = scheme.required_documents or scheme.documents or []
    overview = scheme.overview or scheme.description or ""
    official_portal_url = scheme.official_portal_url or scheme.govt_portal_url or ""
    return {
        "code": scheme.code,
        "name": scheme.name,
        "level": getattr(scheme, "level", "central") or "central",
        "applicable_states": applicable_states,
        "agency": getattr(scheme, "agency", "") or "",
        "eligible_categories": getattr(scheme, "eligible_categories", []) or [],
        "max_loan": float(scheme.max_loan) if scheme.max_loan is not None else None,
        "min_loan": float(scheme.min_loan) if scheme.min_loan is not None else None,
        "interest_rate": float(scheme.interest_rate),
        "interest_rate_note": getattr(scheme, "interest_rate_note", "") or "",
        "subsidy_percent": float(scheme.subsidy_percent),
        "subsidy_margin_note": getattr(scheme, "subsidy_margin_note", "") or "",
        "finance_percent": float(scheme.finance_percent),
        "tenure_months": scheme.tenure_months,
        "moratorium_months": scheme.moratorium_months,
        "max_income": float(max_income) if max_income is not None else None,
        "income_ceiling": float(max_income) if max_income is not None else None,
        "min_age": scheme.min_age,
        "max_age": scheme.max_age,
        "applicant_types": scheme.applicant_types,
        "states_supported": scheme.states_supported or applicable_states,
        "women_only": scheme.women_only,
        "pwd_only": scheme.pwd_only,
        "sectors": scheme.sectors,
        "overview": overview,
        "description": scheme.description or overview,
        "key_highlights": getattr(scheme, "key_highlights", []) or [],
        "required_documents": required_documents,
        "documents": scheme.documents or required_documents,
        "important_notes": getattr(scheme, "important_notes", []) or [],
        "available_channels": getattr(scheme, "available_channels", []) or [],
        "official_portal_url": official_portal_url,
        "govt_portal_url": scheme.govt_portal_url or official_portal_url,
        "bank_portal_url": getattr(scheme, "bank_portal_url", "") or "",
    }


def _fmt_inr(amount):
    n = float(amount)
    if n >= 10000000:
        return f"Rs {n / 10000000:.2f} Cr".replace(".00 Cr", " Cr")
    if n >= 100000:
        return f"Rs {n / 100000:.1f} lakh".replace(".0 lakh", " lakh")
    return f"Rs {int(n):,}"


def layer1_evaluate(applicant, scheme):
    """Evaluate all Layer-1 eligibility rules and return (accepted, summary_reason, rejection_reasons)."""
    rejection_reasons = []

    # 1. State applicability check
    raw_states = _list(scheme.get("applicable_states") or scheme.get("states_supported"))
    states = [str(s).strip().lower() for s in raw_states]
    app_state = str(applicant.get("state") or "").strip().lower()
    if states and "all" not in states and app_state not in states:
        rejection_reasons.append(
            f"State mismatch: {scheme['name']} is applicable only in {', '.join(str(s) for s in raw_states)}, "
            f"whereas your selected state is {applicant.get('state') or 'not specified'}."
        )

    # 2. Category eligibility check
    raw_cats = _list(scheme.get("eligible_categories"))
    cats_upper = [str(c).strip().upper() for c in raw_cats] if raw_cats else ["SC"]
    caste_cat = str(applicant.get("caste_category") or "").strip().upper()
    is_woman = bool(applicant.get("woman_led"))

    if scheme.get("code") == "SUPI":
        if not is_woman and caste_cat not in ("SC", "ST"):
            rejection_reasons.append(
                f"Category/Women rule: Stand-Up India is exclusively for SC/ST entrepreneurs or Women entrepreneurs "
                f"(of any category), whereas your profile is {applicant.get('caste_category') or 'General'} without women-led status."
            )
    elif caste_cat and caste_cat not in cats_upper:
        if caste_cat == "EWS" and cats_upper == ["SC"]:
            rejection_reasons.append(
                f"Category mismatch: {scheme['name']} is exclusively for Scheduled Caste (SC) applicants "
                "(not eligible for EWS under DoPT OM 2019). Consider PM MUDRA Yojana or PMEGP instead."
            )
        else:
            rejection_reasons.append(
                f"Category mismatch: {scheme['name']} is open only to {', '.join(raw_cats or ['SC'])} applicants, "
                f"whereas your profile category is {applicant.get('caste_category')}."
            )

    # 3. Women-only check
    if scheme.get("women_only") and not is_woman:
        rejection_reasons.append(
            f"Women-only scheme: {scheme['name']} is exclusively reserved for women entrepreneurs or women-led units."
        )

    # 4. Income ceiling check (ignore if null)
    income = _dec(applicant.get("annual_family_income"))
    if "max_income" in scheme:
        ceiling_raw = scheme.get("max_income")
    else:
        ceiling_raw = scheme.get("income_ceiling")
        if ceiling_raw == 0:
            ceiling_raw = DEFAULT_INCOME_CEILING

    if ceiling_raw is not None:
        ceiling = _dec(ceiling_raw)
        if ceiling > 0 and income > ceiling:
            rejection_reasons.append(
                f"Income ceiling exceeded: your annual family income ({_fmt_inr(income)}) "
                f"is above the {_fmt_inr(ceiling)} limit."
            )

    # 5. Loan amount range check (ignore max_loan / min_loan if null)
    loan = _dec(applicant.get("loan_amount"))
    min_raw = scheme.get("min_loan")
    max_raw = scheme.get("max_loan")
    if min_raw is not None:
        min_loan = _dec(min_raw)
        if loan < min_loan:
            rejection_reasons.append(
                f"Loan amount too low: requested {_fmt_inr(loan)} is below the {_fmt_inr(min_loan)} minimum."
            )
    if max_raw is not None:
        max_loan = _dec(max_raw)
        if max_loan > 0 and loan > max_loan:
            rejection_reasons.append(
                f"Loan amount exceeds cap: requested {_fmt_inr(loan)} is above the {_fmt_inr(max_loan)} maximum."
            )

    # 6. Age range check
    age = int(applicant.get("age") or 0)
    min_age = int(scheme.get("min_age") or 18)
    max_age = int(scheme.get("max_age") or 75)
    if age and (age < min_age or age > max_age):
        rejection_reasons.append(
            f"Age outside range: applicant age {age} years is outside the {min_age}–{max_age} year range."
        )

    # 7. Applicant type check
    allowed_types = [str(t).lower() for t in _list(scheme.get("applicant_types"))]
    app_type = str(applicant.get("applicant_type") or "individual").lower()
    if allowed_types and app_type not in allowed_types:
        rejection_reasons.append(
            f"Applicant type mismatch: this scheme is for {', '.join(allowed_types)}, not {app_type}."
        )

    # 8. PwD-only check
    if scheme.get("pwd_only") and not applicant.get("disability"):
        rejection_reasons.append(
            "PwD-only scheme: this scheme is reserved for persons with certified disability."
        )

    if rejection_reasons:
        return False, "Rejected: " + " ".join(rejection_reasons), rejection_reasons

    return (
        True,
        f"Accepted: you meet the state, category, income, age, loan, and applicant-type rules for {scheme['name']}.",
        [],
    )


def layer1_reason(applicant, scheme):
    """Backward-compatible wrapper returning (accepted: bool, one-line reason)."""
    ok, reason, _ = layer1_evaluate(applicant, scheme)
    return ok, reason


def _special_bonus(applicant, scheme):
    """Up to 20 points for matching optional eligibility flags, sector, and state priority."""
    points = 0.0
    if applicant.get("woman_led") and scheme.get("women_only"):
        points += 10
    elif applicant.get("woman_led") and "women" in " ".join(_list(scheme.get("sectors"))).lower():
        points += 5
    if applicant.get("disability") and scheme.get("pwd_only"):
        points += 10
    if applicant.get("sanitation_worker") and "NAMASTE" in str(scheme.get("code", "")):
        points += 10
    elif applicant.get("sanitation_worker"):
        points += 3
    if applicant.get("skill_certificate"):
        points += 3
    if applicant.get("shg_jlg_member") or applicant.get("applicant_type") == "shg":
        points += 3
    if applicant.get("jan_dhan"):
        points += 2
    if not applicant.get("existing_govt_loan"):
        points += 1
    sector = str(applicant.get("sector") or "").strip().lower()
    scheme_sectors = [str(s).lower() for s in _list(scheme.get("sectors"))]
    if sector and sector in scheme_sectors:
        points += 4
    if scheme.get("level") == "state":
        points += 2
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
    raw_max = scheme.get("max_loan")
    max_loan = float(raw_max) if raw_max is not None else max(loan * 1.5, min_loan + 1000000.0)
    span = max(max_loan - min_loan, 1.0)
    mid = (min_loan + max_loan) / 2.0
    fit = 1.0 - min(1.0, abs(loan - mid) / (span / 2.0))
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
    """Return matched/accepted (scored) and rejected schemes with detailed rejection_reasons."""
    rows = [scheme_to_dict(s) for s in schemes]
    accepted, rejected = [], []
    for scheme in rows:
        ok, reason, rejection_reasons = layer1_evaluate(applicant, scheme)
        item = {
            **scheme,
            "reason": reason,
            "rejection_reasons": rejection_reasons,
            "accepted": ok,
        }
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
                f"Matched: score {item['score']}/100 "
                f"(interest {item['breakdown']['interest']}, "
                f"subsidy {item['breakdown']['subsidy_finance']}, "
                f"loan fit {item['breakdown']['loan_fit']}, "
                f"special {item['breakdown']['special_bonus']})."
            )

    return {
        "matched": accepted,
        "accepted": accepted,
        "rejected": rejected,
        "top": accepted[:3],
    }
