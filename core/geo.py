"""Haversine distance, partner ranking, All-India PIN lookup, and districts catalog."""

import json
import math
import re
from functools import lru_cache
from pathlib import Path

import requests
from django.conf import settings
from django.core.cache import cache

from core.i18n_templates import fmt_tpl, get_section_templates

BANK_BACKEND_DEFAULTS = {
    "labelPSB": "Public Sector Bank",
    "labelRRB": "Regional Rural Bank",
    "labelSCA": "State Channelising Agency",
    "labelMFI": "NBFC-MFI",
    "labelPORTAL": "Official Govt Portal",
    "labelDefault": "Partner Bank",
    "healthFunds": "Funds Available",
    "healthNoFunds": "Limited Funds",
    "healthScheme": "Scheme Supported",
    "healthNoScheme": "Check Scheme Support",
    "healthLowNpa": "Low NPA",
    "healthHighNpa": "Elevated NPA",
    "whyLiveOsm": "Live branch {dist} km away; matched to {inst} supporting {channels}.",
    "whyDirectory": "Partner {instType} desk ({dist} km away) • Fund quota ₹{quota} Cr • NPA {npa}%.",
    "whyPortal": "Official online application portal for {code}.",
    "whyRankedPrefix": "Ranked here because it is ",
    "whyClose": "very close to you",
    "whyEasyTravel": "within easy travel",
    "whyKmAway": "{dist} km away",
    "whyNoQuota": "no remaining fund quota in this demo",
    "whyQuota": "quota ₹{quota} Cr",
    "whyNpa": "NPA {npa}%",
    "whySupportsScheme": "supports this scheme",
    "whyNoListScheme": "does not list this scheme",
    "empty25km": "No physical bank branches mapped within 25 km of this PIN/location — you can apply directly via the Official Government Portals tab above",
}

EARTH_KM = 6371.0
ZERO_FUND_PENALTY = 5.0  # so a next-door empty desk cannot beat a funded partner
INDIAN_PIN_RE = re.compile(r"^[1-9][0-9]{5}$")
INDIA_POST_URL = "https://api.postalpincode.in/pincode/{pin}"
INDIA_POST_HEADERS = {"User-Agent": "Mozilla/5.0 (SakshamSetu/1.0)"}

DISTRICT_ALIASES = {
    "ganganagar": "Sri Ganganagar",
    "sriganganagar": "Sri Ganganagar",
    "bangalore": "Bengaluru Urban",
    "bengaluru": "Bengaluru Urban",
    "belgaum": "Belagavi",
    "gulbarga": "Kalaburagi",
    "bijapur": "Vijayapura",
    "mysore": "Mysuru",
    "mangalore": "Dakshina Kannada",
    "shimoga": "Shivamogga",
    "tumkur": "Tumakuru",
    "bellary": "Ballari",
    "gurgaon": "Gurugram",
    "mewat": "Nuh",
    "allahabad": "Prayagraj",
    "faizabad": "Ayodhya",
    "sant ravidas nagar": "Bhadohi",
    "jyotiba phule nagar": "Amroha",
    "lakhimpur kheri": "Kheri",
    "osmanabad": "Dharashiv",
    "ahmednagar": "Ahilyanagar",
    "mumbai": "Mumbai City",
    "hoshangabad": "Narmadapuram",
    "pondicherry": "Puducherry",
    "ahmadabad": "Ahmedabad",
    "banas kantha": "Banaskantha",
    "sabar kantha": "Sabarkantha",
    "panch mahals": "Panchmahal",
    "kachchh": "Kutch",
    "mahesana": "Mehsana",
    "dohad": "Dahod",
    "cuddapah": "YSR Kadapa",
    "nellore": "Sri Potti Sriramulu Nellore",
    "anantapur": "Ananthapuramu",
    "madras": "Chennai",
    "tuticorin": "Thoothukudi",
    "trichy": "Tiruchirappalli",
    "calcutta": "Kolkata",
    "barddhaman": "Purba Bardhaman",
    "hugli": "Hooghly",
    "haora": "Howrah",
    "koch bihar": "Cooch Behar",
    "maldah": "Malda",
    "baleshwar": "Balasore",
    "khurda": "Khordha",
    "keonjhar": "Kendujhar",
    "s.a.s. nagar": "Sahibzada Ajit Singh Nagar",
    "mohali": "Sahibzada Ajit Singh Nagar",
    "nawanshahr": "Shahid Bhagat Singh Nagar",
    "muktsar": "Sri Muktsar Sahib",
    "firozpur": "Ferozepur",
    "dhaulpur": "Dholpur",
    "chittaurgarh": "Chittorgarh",
    "jalor": "Jalore",
    "jhunjhunun": "Jhunjhunu",
}

STATE_ALIASES = {
    "nct of delhi": "Delhi",
    "delhi": "Delhi",
    "orissa": "Odisha",
    "odisha": "Odisha",
    "pondicherry": "Puducherry",
    "puducherry": "Puducherry",
    "andaman & nicobar islands": "Andaman and Nicobar Islands",
    "andaman and nicobar islands": "Andaman and Nicobar Islands",
    "andaman & nicobar": "Andaman and Nicobar Islands",
    "dadra & nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
    "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
    "daman & diu": "Dadra and Nagar Haveli and Daman and Diu",
    "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
    "dadra & nagar haveli and daman & diu": "Dadra and Nagar Haveli and Daman and Diu",
    "jammu & kashmir": "Jammu and Kashmir",
    "jammu and kashmir": "Jammu and Kashmir",
    "chhatisgarh": "Chhattisgarh",
    "chhattisgarh": "Chhattisgarh",
    "uttaranchal": "Uttarakhand",
    "uttarakhand": "Uttarakhand",
    "telangana": "Telangana",
}


def haversine_km(lat1, lng1, lat2, lng2):
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_KM * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def load_pin_lookup():
    data_path = Path(settings.BASE_DIR) / "data" / "pin_lookup.json"
    root_path = Path(settings.BASE_DIR) / "pin_lookup.json"
    path = data_path if data_path.exists() else root_path
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def load_india_districts():
    path = Path(settings.BASE_DIR) / "data" / "india_districts.json"
    if not path.exists():
        return {"states": {}}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def load_pin_prefix_map():
    path = Path(settings.BASE_DIR) / "data" / "pin_prefix_map.json"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def normalize_indian_state(raw_state):
    cleaned = re.sub(r"\s+", " ", str(raw_state or "").strip())
    if not cleaned:
        return ""
    low = cleaned.lower()
    if low in STATE_ALIASES:
        return STATE_ALIASES[low]
    states = load_india_districts().get("states", {})
    for canonical in states:
        if canonical.lower() == low:
            return canonical
    return cleaned.title()


def _match_canonical_district(state_name, raw_district):
    cleaned = re.sub(r"\s+", " ", str(raw_district or "").strip())
    if not cleaned:
        return ""
    districts = load_india_districts().get("states", {}).get(state_name, [])
    low = cleaned.lower()
    if state_name == "Maharashtra" and low == "aurangabad":
        return "Chhatrapati Sambhajinagar"
    if low in DISTRICT_ALIASES:
        aliased = DISTRICT_ALIASES[low]
        if not districts or aliased in districts:
            return aliased
    for d in districts:
        if d.lower() == low:
            return d
    return cleaned


def lookup_pin_details(pin):
    """Look up state, district, block, and post offices for a 6-digit Indian PIN.

    Checks Django in-memory cache, then India Post API (6s timeout + User-Agent),
    and falls back gracefully to data/pin_lookup.json and data/pin_prefix_map.json.
    """
    code = str(pin or "").strip()
    if not INDIAN_PIN_RE.match(code):
        raise ValueError("PIN code must be a valid 6-digit Indian postal code.")

    cache_key = f"pin-details:{code}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    local_table = load_pin_lookup()
    local_row = local_table.get(code)

    try:
        resp = requests.get(
            INDIA_POST_URL.format(pin=code),
            headers=INDIA_POST_HEADERS,
            timeout=6,
        )
        if resp.status_code == 200:
            payload = resp.json()
            if isinstance(payload, list) and payload and payload[0].get("Status") == "Success":
                offices = payload[0].get("PostOffice") or []
                if offices:
                    first = offices[0]
                    state = normalize_indian_state(first.get("State", ""))
                    district = _match_canonical_district(state, first.get("District", ""))
                    block = ""
                    for po in offices:
                        cand = str(po.get("Block") or "").strip()
                        if cand and cand.upper() != "NA":
                            block = cand
                            break
                    if not block:
                        for po in offices:
                            cand = str(po.get("Taluk") or po.get("Division") or "").strip()
                            if cand and cand.upper() != "NA":
                                block = cand
                                break
                    post_offices = []
                    seen = set()
                    for po in offices:
                        name = str(po.get("Name") or "").strip()
                        if name and name not in seen:
                            seen.add(name)
                            post_offices.append(name)

                    result = {
                        "pin": code,
                        "state": state,
                        "district": district,
                        "block": block or district,
                        "post_offices": post_offices,
                        "source": "india_post",
                    }
                    if local_row:
                        result["lat"] = local_row.get("lat")
                        result["lng"] = local_row.get("lng")
                    cache.set(cache_key, result, 86400)
                    return result
    except (requests.RequestException, ValueError, KeyError, TypeError):
        pass

    if local_row:
        state = normalize_indian_state(local_row.get("state", ""))
        district = _match_canonical_district(state, local_row.get("district") or local_row.get("place", ""))
        post_offices = list(local_row.get("post_offices") or [])
        if not post_offices and local_row.get("place"):
            post_offices = [local_row["place"]]
        result = {
            "pin": code,
            "state": state,
            "district": district,
            "block": local_row.get("block") or district,
            "post_offices": post_offices,
            "source": "local_cache",
            "lat": local_row.get("lat"),
            "lng": local_row.get("lng"),
            "place": local_row.get("place", ""),
        }
        cache.set(cache_key, result, 3600)
        return result

    prefix_row = load_pin_prefix_map().get(code[:3])
    if prefix_row:
        state = normalize_indian_state(prefix_row.get("state", ""))
        district = _match_canonical_district(state, prefix_row.get("district", ""))
        result = {
            "pin": code,
            "state": state,
            "district": district,
            "block": district,
            "post_offices": [f"{district} Postal Region ({code})"] if district else [f"PIN {code}"],
            "source": "prefix_fallback",
        }
        cache.set(cache_key, result, 3600)
        return result

    return None


def coords_from_pin(pin):
    table = load_pin_lookup()
    key = str(pin or "").strip()
    if key in table:
        row = table[key]
        return row["lat"], row["lng"], row.get("place", "")
    prefix = key[:3]
    for stored, row in table.items():
        if stored.startswith(prefix):
            return row["lat"], row["lng"], row.get("place", "")
    return None, None, ""


def _minmax(values):
    if not values:
        return 0.0, 1.0
    lo, hi = min(values), max(values)
    if hi == lo:
        return lo, lo + 1.0
    return lo, hi


def _norm(value, lo, hi):
    return (value - lo) / (hi - lo)


def health_checks(branch, lang="en"):
    tpl = get_section_templates("bankBackend", BANK_BACKEND_DEFAULTS, lang=lang)
    funds_ok = float(branch.get("fund_quota_crore") or 0) > 0
    scheme_ok = bool(branch.get("scheme_supported", True))
    npa_ok = float(branch.get("npa_percent") or 0) <= 6.0
    if funds_ok and scheme_ok and npa_ok:
        color = "green"
    elif (funds_ok and scheme_ok) or (scheme_ok and npa_ok):
        color = "amber"
    else:
        color = "red"
    return {
        "funds_available": funds_ok,
        "scheme_supported": scheme_ok,
        "npa_low": npa_ok,
        "color": color,
        "labels": {
            "funds": tpl["healthFunds"] if funds_ok else tpl["healthNoFunds"],
            "scheme": tpl["healthScheme"] if scheme_ok else tpl["healthNoScheme"],
            "npa": tpl["healthLowNpa"] if npa_ok else tpl["healthHighNpa"],
        },
    }


def rank_branches(branches, user_lat, user_lng, scheme_code=None, lang="en"):
    tpl = get_section_templates("bankBackend", BANK_BACKEND_DEFAULTS, lang=lang)
    candidates = []
    for raw in branches:
        b = raw if isinstance(raw, dict) else {
            "id": raw.id,
            "name": raw.name,
            "partner_type": raw.partner_type,
            "state": raw.state,
            "city": raw.city,
            "address": raw.address,
            "phone": raw.phone,
            "lat": raw.lat,
            "lng": raw.lng,
            "schemes_supported": raw.schemes_supported,
            "fund_quota_crore": raw.fund_quota_crore,
            "npa_percent": raw.npa_percent,
            "status": raw.status,
            "notes": raw.notes,
            "is_demo": raw.is_demo,
        }
        supported = [str(s).upper() for s in (b.get("schemes_supported") or [])]
        scheme_ok = True
        if scheme_code:
            scheme_ok = scheme_code.upper() in supported or "ALL" in supported
        dist = haversine_km(user_lat, user_lng, float(b["lat"]), float(b["lng"]))
        candidates.append({**b, "distance_km": round(dist, 2), "scheme_supported": scheme_ok})

    quotas = [float(c["fund_quota_crore"] or 0) for c in candidates] or [0]
    npas = [float(c["npa_percent"] or 0) for c in candidates] or [0]
    q_lo, q_hi = _minmax(quotas)
    n_lo, n_hi = _minmax(npas)

    ranked = []
    for c in candidates:
        dist = c["distance_km"]
        norm_q = _norm(float(c["fund_quota_crore"] or 0), q_lo, q_hi)
        norm_n = _norm(float(c["npa_percent"] or 0), n_lo, n_hi)
        # Inverse-distance term plus normalized quota, minus normalized NPA.
        score = 0.5 * (1.0 / (dist + 0.1)) + 0.3 * norm_q - 0.2 * norm_n
        if float(c["fund_quota_crore"] or 0) <= 0:
            score -= ZERO_FUND_PENALTY
        c["norm_fund_quota"] = round(norm_q, 3)
        c["norm_npa"] = round(norm_n, 3)
        c["branch_score"] = round(score, 4)
        c["health"] = health_checks(c, lang=lang)
        why = []
        if dist < 5:
            why.append(tpl["whyClose"])
        elif dist < 25:
            why.append(tpl["whyEasyTravel"])
        else:
            why.append(fmt_tpl(tpl["whyKmAway"], dist=f"{dist:.0f}"))
        if float(c["fund_quota_crore"] or 0) <= 0:
            why.append(tpl["whyNoQuota"])
        else:
            why.append(fmt_tpl(tpl["whyQuota"], quota=c["fund_quota_crore"]))
        why.append(fmt_tpl(tpl["whyNpa"], npa=c["npa_percent"]))
        if scheme_code:
            why.append(tpl["whySupportsScheme"] if c["scheme_supported"] else tpl["whyNoListScheme"])
        c["why"] = tpl["whyRankedPrefix"] + "; ".join(why) + "."
        ranked.append(c)

    ranked.sort(key=lambda x: x["branch_score"], reverse=True)
    return ranked
