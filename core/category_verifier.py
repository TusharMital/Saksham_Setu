"""Government-Rule State Category & EWS Document Verification Engine."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from django.conf import settings

from core.i18n_templates import fmt_tpl, get_section_templates

VERIFY_DEFAULTS = {
    "invalidCategoryMsg": "Please select a valid category (SC, ST, OBC, EWS, or General).",
    "invalidCategoryNext": "Choose your social category to check state and scheme eligibility.",
    "invalidCertMsg": "Please select a valid certificate type.",
    "invalidCertNext": "Select the certificate you hold or 'Not Available Yet'.",
    "generalCertMismatchMsg": "Certificate mismatch: a '{certificate_type}' cannot be paired with category 'General'. Select the category printed on your certificate.",
    "generalCertMismatchNext": "Update your category to match the certificate or select 'Not Available Yet'.",
    "docMismatchMsg": "Document-to-category mismatch: '{certificate_type}' does not legally match claimed category '{category}'.{extra_rule}",
    "docMismatchExtraEws": " Under DoPT OM No. 36039/1/2019-Estt(Res), SC/ST/OBC persons are excluded from EWS reservation.",
    "docMismatchNext": "Provide the matching official certificate for your claimed category, or correct your selected category.",
    "notNotifiedMsg": "'{caste}' is NOT notified as Scheduled Caste (SC) in {loan_state}; in {loan_state} it falls under {actual_cat} ({citation}).",
    "notNotifiedNext": "In {loan_state}, apply under the {actual_cat} category (e.g. NBCFDC/State OBC or central MSME schemes like PM MUDRA/PMEGP) rather than NSFDC.",
    "interstateMsg": "Inter-state SC certificate warning: certificate issued in {certificate_state}, but loan/business state is {loan_state}. {note}",
    "interstateNext": "Obtain local domicile / Tehsildar verification in {loan_state}, or apply through a central public sector bank / NSFDC direct routing where applicable.",
    "scCertMissingMsg": "SC category checks passed for {loan_state}, but an official SC Caste Certificate is required for NSFDC sanction.",
    "scCertMissingNext": "Obtain an SC Caste Certificate from your local Tehsildar / SDM before submitting to the partner bank.",
    "scVerifiedMsg": "SC status and document verified for {loan_state}. {income_note}",
    "scIncomeOk": "Income meets the NSFDC ceiling (<= ₹{cap}).",
    "scIncomeExceeded": "However, annual family income (₹{income}) exceeds the NSFDC ceiling of ₹{cap}.",
    "scVerifiedNextOk": "Proceed with NSFDC schemes via {sca_name} or a listed partner bank.",
    "scVerifiedNextAlt": "Explore non-income-capped central schemes such as Stand-Up India, PM MUDRA, or PMEGP.",
    "ewsIncomeMissing": "annual family income must be provided and below ₹8,00,000",
    "ewsIncomeHigh": "annual family income (₹{income}) must be strictly below ₹8,00,000",
    "ewsAssetsExceeded": "family assets exceed DoPT EWS limits (< 5 acres agri land, < 1,000 sq.ft flat, < 100/200 sq.yd plot)",
    "ewsIneligibleMsg": "EWS criteria not met: {reasons}.",
    "ewsIneligibleNext": "Check eligibility under General-category central schemes such as PM MUDRA Yojana or PMEGP.",
    "ewsVerifiedMsg": "EWS eligibility verified under DoPT OM 2019 (income < ₹8,00,000 and asset limits met). Note: NSFDC schemes are exclusively for Scheduled Castes (SC), so EWS applicants are routed to central MSME/credit schemes.",
    "ewsVerifiedNext": "Ensure your EWS Income & Asset Certificate (issued by Tehsildar/SDM for the valid FY) is attached, and apply under PM MUDRA Yojana (PMMY) or PMEGP.",
    "minorityCertMismatchMsg": "Certificate mismatch: '{certificate_type}' does not match Minority community selection. Select 'Not Available Yet' or the exact category printed on your certificate.",
    "minorityCertMismatchNext": "Choose 'Not Available Yet' or select the category matching your certificate.",
    "nonNsfdcMsg": "Category '{category}' acknowledged. NSFDC schemes on this portal are exclusively for Scheduled Caste (SC) applicants.",
    "nonNsfdcNext": "Consider applying through {alt_agency}.",
    "interstateMigrationNote": "Under Article 341, Scheduled Caste status is notified specifically in relation to a particular State or Union Territory. A certificate issued by another state requires domicile/Tehsildar verification in the loan state or central SCA routing.",
    "altAgencyST": "NSTFDC (National Scheduled Tribes Finance & Development Corp.)",
    "altAgencyOBC": "NBCFDC (National Backward Classes Finance & Development Corp.)",
    "altAgencyMinority": "NMDFC (National Minorities Development & Finance Corp.)",
    "altAgencyGeneral": "PM MUDRA Yojana (PMMY) or PMEGP",
    "indiaLabel": "India",
    "defaultScaName": "State Channelising Agency (SCA)",
}

CATEGORY_CERT_MAP = {
    "SC": "sc_cert",
    "ST": "st_cert",
    "OBC": "obc_cert",
    "EWS": "ews_cert",
    "GENERAL": "none",
    "MINORITY": "none",
}

VALID_CATEGORIES = {"SC", "ST", "OBC", "EWS", "GENERAL", "MINORITY"}
VALID_CERT_TYPES = {"sc_cert", "ews_cert", "st_cert", "obc_cert", "none"}


@lru_cache(maxsize=1)
def load_state_category_rules() -> dict[str, Any]:
    path = Path(settings.BASE_DIR) / "data" / "state_category_rules.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _normalize_category(value: Any) -> str:
    raw = str(value or "").strip().upper()
    if raw in ("OTHER", "GEN", "GENERAL", "UR"):
        return "GENERAL"
    return raw


def _normalize_cert(value: Any) -> str:
    raw = str(value or "").strip().lower()
    return raw or "none"


def _normalize_state(value: Any, states_dict: dict[str, Any]) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    for state_name in states_dict:
        if state_name.lower() == raw.lower():
            return state_name
    return raw


def _lookup_sub_caste(sub_caste: str, loan_state: str, rules: dict[str, Any]) -> dict[str, Any]:
    """Check whether `sub_caste` is SC, another category, or unknown in `loan_state`."""
    query = sub_caste.strip().lower()
    if not query:
        return {"found": False}

    states_dict = rules.get("states", {})
    state_entry = states_dict.get(loan_state, {})

    # 1. Direct state non-SC list (e.g. OBC / ST)
    for caste_name, cat in (state_entry.get("non_sc_notified") or {}).items():
        if caste_name.lower() == query:
            return {
                "found": True,
                "state_category": cat,
                "canonical_caste": caste_name,
                "note": "",
            }

    # 2. Direct state notified SC list
    for caste_name in state_entry.get("notified_sc") or []:
        if caste_name.lower() == query:
            return {
                "found": True,
                "state_category": "SC",
                "canonical_caste": caste_name,
                "note": "",
            }

    # 3. Regional variations table (handles aliases and cross-state distinctions)
    for canonical, info in (rules.get("regional_variations") or {}).items():
        aliases = [canonical.lower(), *[str(a).lower() for a in info.get("aliases") or []]]
        if query in aliases:
            state_map = info.get("states") or {}
            if loan_state in state_map:
                return {
                    "found": True,
                    "state_category": state_map[loan_state],
                    "canonical_caste": canonical.title(),
                    "note": info.get("note", ""),
                }
            # Caste is in regional_variations, check if explicitly SC or non-SC elsewhere
            return {
                "found": True,
                "state_category": None,
                "canonical_caste": canonical.title(),
                "note": info.get("note", ""),
            }

    return {"found": False}


def _parse_income(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def verify_category_and_document(payload: dict[str, Any], lang: str = "en") -> dict[str, Any]:
    """Verify claimed category, document type, state notification (Art. 341), and EWS rules (DoPT 2019)."""
    rules = load_state_category_rules()
    states_dict = rules.get("states", {})
    tpl = get_section_templates("verify", VERIFY_DEFAULTS, lang=lang or payload.get("lang") or "en")

    loan_state = _normalize_state(payload.get("loan_state"), states_dict)
    certificate_state = _normalize_state(payload.get("certificate_state"), states_dict)
    category = _normalize_category(payload.get("category"))
    certificate_type = _normalize_cert(payload.get("certificate_type"))
    sub_caste = str(payload.get("sub_caste") or "").strip()
    annual_income = _parse_income(payload.get("annual_income"))
    ews_assets_compliant = bool(
        True if payload.get("ews_assets_compliant") is None else payload.get("ews_assets_compliant")
    )

    nsfdc_cap = int(rules["nsfdc_rules"]["max_annual_income"])
    ews_cap = int(rules["ews_rules"]["max_annual_income"])
    art341_citation = rules["sc_constitutional_rule"]["citation"]
    dopt_citation = rules["ews_rules"]["citation"]
    nsfdc_citation = rules["nsfdc_rules"]["citation"]

    if category not in VALID_CATEGORIES:
        return {
            "status": "invalid_input",
            "valid": False,
            "in_claimed_category": False,
            "nsfdc_eligible": False,
            "ews_eligible": False,
            "category": category or "",
            "loan_state": loan_state,
            "certificate_type": certificate_type,
            "citation": art341_citation,
            "message": tpl["invalidCategoryMsg"],
            "next_step": tpl["invalidCategoryNext"],
        }

    if certificate_type not in VALID_CERT_TYPES:
        return {
            "status": "invalid_input",
            "valid": False,
            "in_claimed_category": False,
            "nsfdc_eligible": False,
            "ews_eligible": False,
            "category": category,
            "loan_state": loan_state,
            "certificate_type": certificate_type,
            "citation": art341_citation,
            "message": tpl["invalidCertMsg"],
            "next_step": tpl["invalidCertNext"],
        }

    # 1. Document-to-Category Match
    expected_cert = CATEGORY_CERT_MAP[category]
    if certificate_type != "none":
        if category == "GENERAL" and certificate_type in {"sc_cert", "st_cert", "obc_cert", "ews_cert"}:
            return {
                "status": "document_category_mismatch",
                "valid": False,
                "in_claimed_category": False,
                "nsfdc_eligible": False,
                "ews_eligible": False,
                "category": category,
                "loan_state": loan_state,
                "certificate_type": certificate_type,
                "citation": dopt_citation if certificate_type == "ews_cert" else art341_citation,
                "message": fmt_tpl(tpl["generalCertMismatchMsg"], certificate_type=certificate_type),
                "next_step": tpl["generalCertMismatchNext"],
            }
        if category != "GENERAL" and certificate_type != expected_cert:
            extra_rule = (
                tpl["docMismatchExtraEws"]
                if (category in {"SC", "ST", "OBC"} and certificate_type == "ews_cert")
                or (category == "EWS" and certificate_type in {"sc_cert", "st_cert", "obc_cert"})
                else ""
            )
            return {
                "status": "document_category_mismatch",
                "valid": False,
                "in_claimed_category": False,
                "nsfdc_eligible": False,
                "ews_eligible": False,
                "category": category,
                "loan_state": loan_state,
                "certificate_type": certificate_type,
                "citation": dopt_citation if "ews_cert" in (certificate_type, expected_cert) else art341_citation,
                "message": fmt_tpl(
                    tpl["docMismatchMsg"],
                    certificate_type=certificate_type,
                    category=category,
                    extra_rule=extra_rule,
                ),
                "next_step": tpl["docMismatchNext"],
            }

    # 2. Regional State Caste Notification Check (for SC)
    if category == "SC":
        if sub_caste and loan_state:
            lookup = _lookup_sub_caste(sub_caste, loan_state, rules)
            if lookup["found"] and lookup["state_category"] and lookup["state_category"] != "SC":
                actual_cat = lookup["state_category"]
                return {
                    "status": "not_notified_in_state",
                    "valid": False,
                    "in_claimed_category": False,
                    "nsfdc_eligible": False,
                    "ews_eligible": False,
                    "category": category,
                    "state_category": actual_cat,
                    "loan_state": loan_state,
                    "certificate_type": certificate_type,
                    "citation": art341_citation,
                    "message": fmt_tpl(
                        tpl["notNotifiedMsg"],
                        caste=lookup["canonical_caste"],
                        loan_state=loan_state,
                        actual_cat=actual_cat,
                        citation=art341_citation,
                    ),
                    "next_step": fmt_tpl(
                        tpl["notNotifiedNext"],
                        loan_state=loan_state,
                        actual_cat=actual_cat,
                    ),
                }

        if certificate_state and loan_state and certificate_state.lower() != loan_state.lower():
            return {
                "status": "state_mismatch_warning",
                "valid": False,
                "in_claimed_category": True,
                "nsfdc_eligible": False,
                "ews_eligible": False,
                "category": category,
                "loan_state": loan_state,
                "certificate_state": certificate_state,
                "certificate_type": certificate_type,
                "citation": art341_citation,
                "message": fmt_tpl(
                    tpl["interstateMsg"],
                    certificate_state=certificate_state,
                    loan_state=loan_state,
                    note=tpl.get("interstateMigrationNote") or rules["sc_constitutional_rule"]["interstate_migration_note"],
                ),
                "next_step": fmt_tpl(tpl["interstateNext"], loan_state=loan_state),
            }

        # 4. Verified SC + Document + State Match
        if certificate_type == "none":
            return {
                "status": "document_missing",
                "valid": False,
                "in_claimed_category": True,
                "nsfdc_eligible": False,
                "ews_eligible": False,
                "category": category,
                "loan_state": loan_state,
                "certificate_type": certificate_type,
                "citation": f"{art341_citation}; {nsfdc_citation}",
                "message": fmt_tpl(tpl["scCertMissingMsg"], loan_state=loan_state or tpl["indiaLabel"]),
                "next_step": tpl["scCertMissingNext"],
            }

        income_ok = True if annual_income is None else annual_income <= nsfdc_cap
        sca_name = states_dict.get(loan_state, {}).get("sca_name", tpl["defaultScaName"])
        income_note = (
            fmt_tpl(tpl["scIncomeOk"], cap=f"{nsfdc_cap:,}")
            if income_ok
            else fmt_tpl(tpl["scIncomeExceeded"], income=f"{int(annual_income):,}", cap=f"{nsfdc_cap:,}")
        )
        return {
            "status": "verified_sc",
            "valid": True,
            "in_claimed_category": True,
            "nsfdc_eligible": income_ok,
            "ews_eligible": False,
            "category": category,
            "loan_state": loan_state,
            "certificate_type": certificate_type,
            "citation": f"{art341_citation}; {nsfdc_citation}",
            "message": fmt_tpl(
                tpl["scVerifiedMsg"],
                loan_state=loan_state or tpl["indiaLabel"],
                income_note=income_note,
            ),
            "next_step": (
                fmt_tpl(tpl["scVerifiedNextOk"], sca_name=sca_name)
                if income_ok
                else tpl["scVerifiedNextAlt"]
            ),
        }

    # 3. EWS Official Rule Check (category == "EWS")
    if category == "EWS":
        income_ok = annual_income is not None and annual_income < ews_cap
        if not income_ok or not ews_assets_compliant:
            reasons = []
            if annual_income is None:
                reasons.append(tpl["ewsIncomeMissing"])
            elif annual_income >= ews_cap:
                reasons.append(fmt_tpl(tpl["ewsIncomeHigh"], income=f"{int(annual_income):,}"))
            if not ews_assets_compliant:
                reasons.append(tpl["ewsAssetsExceeded"])
            return {
                "status": "ews_ineligible",
                "valid": False,
                "in_claimed_category": False,
                "nsfdc_eligible": False,
                "ews_eligible": False,
                "category": category,
                "loan_state": loan_state,
                "certificate_type": certificate_type,
                "citation": dopt_citation,
                "message": fmt_tpl(tpl["ewsIneligibleMsg"], reasons="; ".join(reasons)),
                "next_step": tpl["ewsIneligibleNext"],
            }

        return {
            "status": "ews_verified_non_nsfdc",
            "valid": True,
            "in_claimed_category": True,
            "nsfdc_eligible": False,
            "ews_eligible": True,
            "category": category,
            "loan_state": loan_state,
            "certificate_type": certificate_type,
            "citation": dopt_citation,
            "alternative_schemes": rules["ews_rules"]["alternative_schemes"],
            "message": tpl["ewsVerifiedMsg"],
            "next_step": tpl["ewsVerifiedNext"],
        }

    if category == "MINORITY" and certificate_type in {"sc_cert", "st_cert", "obc_cert", "ews_cert"}:
        return {
            "status": "document_category_mismatch",
            "valid": False,
            "in_claimed_category": False,
            "nsfdc_eligible": False,
            "ews_eligible": False,
            "category": category,
            "loan_state": loan_state,
            "certificate_type": certificate_type,
            "citation": dopt_citation if certificate_type == "ews_cert" else art341_citation,
            "message": fmt_tpl(tpl["minorityCertMismatchMsg"], certificate_type=certificate_type),
            "next_step": tpl["minorityCertMismatchNext"],
        }

    # ST, OBC, Minority, or General
    alt_agency = (
        tpl["altAgencyST"]
        if category == "ST"
        else tpl["altAgencyOBC"]
        if category == "OBC"
        else tpl["altAgencyMinority"]
        if category == "MINORITY"
        else tpl["altAgencyGeneral"]
    )
    return {
        "status": "verified_non_nsfdc",
        "valid": True,
        "in_claimed_category": True,
        "nsfdc_eligible": False,
        "ews_eligible": False,
        "category": category,
        "loan_state": loan_state,
        "certificate_type": certificate_type,
        "citation": nsfdc_citation,
        "message": fmt_tpl(tpl["nonNsfdcMsg"], category=category),
        "next_step": fmt_tpl(tpl["nonNsfdcNext"], alt_agency=alt_agency),
    }
