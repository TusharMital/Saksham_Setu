"""Two-layer scheme recommender. All thresholds come from scheme records, not code."""

import json
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from core.i18n_validator import sanitize_bundle_with_fallback
from core.languages import SUPPORTED_LANGUAGES

TRANSLATIONS_DIR = Path(__file__).resolve().parent / "translations"

DEFAULT_REJECTION_TEMPLATES = {
    "stateMismatch": "State mismatch: {name} is applicable only in {states}, whereas your selected state is {userState}.",
    "supiRule": "Category/Women rule: Stand-Up India is exclusively for SC/ST entrepreneurs or Women entrepreneurs (of any category), whereas your profile is {category} without women-led status.",
    "ewsScOnly": "Category mismatch: {name} is exclusively for Scheduled Caste (SC) applicants (not eligible for EWS under DoPT OM 2019). Consider PM MUDRA Yojana or PMEGP instead.",
    "categoryMismatch": "Category mismatch: {name} is open only to {categories} applicants, whereas your profile category is {userCategory}.",
    "womenOnly": "Women-only scheme: {name} is exclusively reserved for women entrepreneurs or women-led units.",
    "incomeExceeded": "Income ceiling exceeded: your annual family income ({income}) is above the {ceiling} limit.",
    "loanTooLow": "Loan amount too low: requested {loan} is below the {minLoan} minimum.",
    "loanTooHigh": "Loan amount exceeds cap: requested {loan} is above the {maxLoan} maximum.",
    "ageOutside": "Age outside range: applicant age {age} years is outside the {minAge}–{maxAge} year range.",
    "applicantType": "Applicant type mismatch: this scheme is for {allowed}, not {userType}.",
    "pwdOnly": "PwD-only scheme: this scheme is reserved for persons with certified disability.",
    "notSpecified": "not specified",
    "matchedSummary": "Matched: score {score}/100 (interest {interest}, subsidy {subsidy}, loan fit {loanFit}, special {special}).",
    "rejectedPrefix": "Rejected: ",
    "acceptedSummary": "Accepted: you meet the state, category, income, age, loan, and applicant-type rules for {name}.",
    "unitCr": "Cr",
    "unitLakh": "lakh",
    "allIndia": "All India",
}


def _load_extra_section(section_name: str, lang: str) -> dict:
    code = str(lang or "en").strip().lower()
    if code not in SUPPORTED_LANGUAGES or code == "en":
        return {}
    en_path = TRANSLATIONS_DIR / "en.json"
    tgt_path = TRANSLATIONS_DIR / f"{code}.json"
    if not en_path.exists() or not tgt_path.exists():
        return {}
    try:
        en_sec = json.loads(en_path.read_text(encoding="utf-8")).get(section_name) or {}
        tgt_sec = json.loads(tgt_path.read_text(encoding="utf-8")).get(section_name) or {}
        repaired, _ = sanitize_bundle_with_fallback(en_sec, tgt_sec)
        return repaired
    except (OSError, ValueError):
        return {}


@lru_cache(maxsize=32)
def _rejection_templates(lang: str) -> dict[str, str]:
    code = str(lang or "en").strip().lower()
    if code not in SUPPORTED_LANGUAGES:
        code = "en"
    en_path = TRANSLATIONS_DIR / "en.json"
    en_src = dict(DEFAULT_REJECTION_TEMPLATES)
    if en_path.exists():
        try:
            en_data = json.loads(en_path.read_text(encoding="utf-8"))
            if isinstance(en_data.get("rejection"), dict):
                en_src = {**en_src, **en_data["rejection"]}
        except (OSError, ValueError):
            pass
    if code == "en":
        return en_src
    tgt_path = TRANSLATIONS_DIR / f"{code}.json"
    if not tgt_path.exists():
        return en_src
    try:
        tgt_data = json.loads(tgt_path.read_text(encoding="utf-8"))
        tgt_rej = tgt_data.get("rejection") if isinstance(tgt_data.get("rejection"), dict) else {}
        repaired, _ = sanitize_bundle_with_fallback(en_src, tgt_rej)
        return repaired
    except (OSError, ValueError):
        return en_src


def _fmt_tpl(tpl: str, **kwargs) -> str:
    out = str(tpl)
    for k, v in kwargs.items():
        out = out.replace(f"{{{k}}}", str(v))
    return out


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


def _fmt_inr(amount, tpl=None):
    cr = (tpl or DEFAULT_REJECTION_TEMPLATES).get("unitCr", "Cr")
    lakh = (tpl or DEFAULT_REJECTION_TEMPLATES).get("unitLakh", "lakh")
    n = float(amount)
    if n >= 10000000:
        return f"₹{n / 10000000:.2f}".rstrip("0").rstrip(".") + f" {cr}"
    if n >= 100000:
        return f"₹{n / 100000:.1f}".rstrip("0").rstrip(".") + f" {lakh}"
    return f"₹{int(n):,}"


def layer1_evaluate(applicant, scheme, lang="en"):
    """Evaluate all Layer-1 eligibility rules and return (accepted, summary_reason, rejection_reasons)."""
    tpl = _rejection_templates(lang)
    states_map = _load_extra_section("states", lang)
    form_map = _load_extra_section("form", lang)
    rejection_reasons = []

    def _tr_state(name_str):
        key = str(name_str or "").strip()
        if not key:
            return tpl["notSpecified"]
        if key.upper() == "ALL":
            return tpl.get("allIndia", "All India")
        return states_map.get(key, key)

    def _tr_app_type(t_str):
        key = str(t_str or "").strip().lower()
        return form_map.get(key, key)

    # 1. State applicability check
    raw_states = _list(scheme.get("applicable_states") or scheme.get("states_supported"))
    states = [str(s).strip().lower() for s in raw_states]
    app_state = str(applicant.get("state") or "").strip().lower()
    if states and "all" not in states and app_state not in states:
        rejection_reasons.append(
            _fmt_tpl(
                tpl["stateMismatch"],
                name=scheme["name"],
                states=", ".join(_tr_state(s) for s in raw_states),
                userState=_tr_state(applicant.get("state")),
            )
        )

    # 2. Category eligibility check
    raw_cats = _list(scheme.get("eligible_categories"))
    cats_upper = [str(c).strip().upper() for c in raw_cats] if raw_cats else ["SC"]
    caste_cat = str(applicant.get("caste_category") or "").strip().upper()
    is_woman = bool(applicant.get("woman_led"))

    if scheme.get("code") == "SUPI":
        if not is_woman and caste_cat not in ("SC", "ST"):
            rejection_reasons.append(
                _fmt_tpl(
                    tpl["supiRule"],
                    category=applicant.get("caste_category") or tpl["notSpecified"],
                )
            )
    elif caste_cat and caste_cat not in cats_upper:
        if caste_cat == "EWS" and cats_upper == ["SC"]:
            rejection_reasons.append(
                _fmt_tpl(tpl["ewsScOnly"], name=scheme["name"])
            )
        else:
            rejection_reasons.append(
                _fmt_tpl(
                    tpl["categoryMismatch"],
                    name=scheme["name"],
                    categories=", ".join(raw_cats or ["SC"]),
                    userCategory=applicant.get("caste_category"),
                )
            )

    # 3. Women-only check
    if scheme.get("women_only") and not is_woman:
        rejection_reasons.append(_fmt_tpl(tpl["womenOnly"], name=scheme["name"]))

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
                _fmt_tpl(
                    tpl["incomeExceeded"],
                    income=_fmt_inr(income, tpl),
                    ceiling=_fmt_inr(ceiling, tpl),
                )
            )

    # 5. Loan amount range check (ignore max_loan / min_loan if null)
    loan = _dec(applicant.get("loan_amount"))
    min_raw = scheme.get("min_loan")
    max_raw = scheme.get("max_loan")
    if min_raw is not None:
        min_loan = _dec(min_raw)
        if loan < min_loan:
            rejection_reasons.append(
                _fmt_tpl(
                    tpl["loanTooLow"],
                    loan=_fmt_inr(loan, tpl),
                    minLoan=_fmt_inr(min_loan, tpl),
                )
            )
    if max_raw is not None:
        max_loan = _dec(max_raw)
        if max_loan > 0 and loan > max_loan:
            rejection_reasons.append(
                _fmt_tpl(
                    tpl["loanTooHigh"],
                    loan=_fmt_inr(loan, tpl),
                    maxLoan=_fmt_inr(max_loan, tpl),
                )
            )

    # 6. Age range check
    age = int(applicant.get("age") or 0)
    min_age = int(scheme.get("min_age") or 18)
    max_age = int(scheme.get("max_age") or 75)
    if age and (age < min_age or age > max_age):
        rejection_reasons.append(
            _fmt_tpl(
                tpl["ageOutside"],
                age=age,
                minAge=min_age,
                maxAge=max_age,
            )
        )

    # 7. Applicant type check
    allowed_types = [str(t).lower() for t in _list(scheme.get("applicant_types"))]
    app_type = str(applicant.get("applicant_type") or "individual").lower()
    if allowed_types and app_type not in allowed_types:
        rejection_reasons.append(
            _fmt_tpl(
                tpl["applicantType"],
                allowed=", ".join(_tr_app_type(t) for t in allowed_types),
                userType=_tr_app_type(app_type),
            )
        )

    # 8. PwD-only check
    if scheme.get("pwd_only") and not applicant.get("disability"):
        rejection_reasons.append(tpl["pwdOnly"])

    if rejection_reasons:
        return False, tpl["rejectedPrefix"] + " ".join(rejection_reasons), rejection_reasons

    return (
        True,
        _fmt_tpl(tpl["acceptedSummary"], name=scheme["name"]),
        [],
    )


def layer1_reason(applicant, scheme, lang="en"):
    """Backward-compatible wrapper returning (accepted: bool, one-line reason)."""
    ok, reason, _ = layer1_evaluate(applicant, scheme, lang=lang)
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


def recommend(applicant, schemes, lang="en"):
    """Return matched/accepted (scored) and rejected schemes with detailed rejection_reasons."""
    rows = [scheme_to_dict(s) for s in schemes]
    accepted, rejected = [], []
    for scheme in rows:
        ok, reason, rejection_reasons = layer1_evaluate(applicant, scheme, lang=lang)
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
        tpl = _rejection_templates(lang)
        scored = []
        for scheme in accepted:
            extra = layer2_score(applicant, scheme, accepted)
            scored.append({**scheme, **extra})
        scored.sort(key=lambda x: x["score"], reverse=True)
        accepted = scored
        for i, item in enumerate(accepted):
            item["rank"] = i + 1
            item["best"] = i == 0
            item["reason"] = _fmt_tpl(
                tpl["matchedSummary"],
                score=item["score"],
                interest=item["breakdown"]["interest"],
                subsidy=item["breakdown"]["subsidy_finance"],
                loanFit=item["breakdown"]["loan_fit"],
                special=item["breakdown"]["special_bonus"],
            )

    return {
        "matched": accepted,
        "accepted": accepted,
        "rejected": rejected,
        "top": accepted[:3],
    }
