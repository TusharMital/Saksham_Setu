"""Live bank & official portal search backed by Nominatim, Overpass API, and local catalog."""

import json
import re
from functools import lru_cache
from pathlib import Path

import requests
from django.conf import settings
from django.core.cache import cache

from core.geo import (
    coords_from_pin,
    haversine_km,
    health_checks,
    lookup_pin_details,
)
from core.models import Branch, LoanScheme

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OSM_HEADERS = {"User-Agent": "SakshamSetu/1.0 (https://sakshamsetu.gov.in)"}

# Approximate state/UT capital fallback coordinates so PIN resolution never fails offline
STATE_FALLBACK_COORDS = {
    "Andhra Pradesh": (16.5062, 80.6480),
    "Arunachal Pradesh": (27.0844, 93.6053),
    "Assam": (26.1445, 91.7362),
    "Bihar": (25.5941, 85.1376),
    "Chhattisgarh": (21.2514, 81.6296),
    "Goa": (15.4909, 73.8278),
    "Gujarat": (23.0225, 72.5714),
    "Haryana": (30.7333, 76.7794),
    "Himachal Pradesh": (31.1048, 77.1734),
    "Jharkhand": (23.3441, 85.3096),
    "Karnataka": (12.9716, 77.5946),
    "Kerala": (8.5241, 76.9366),
    "Madhya Pradesh": (23.2599, 77.4126),
    "Maharashtra": (19.0760, 72.8777),
    "Manipur": (24.8170, 93.9368),
    "Meghalaya": (25.5788, 91.8933),
    "Mizoram": (23.7271, 92.7176),
    "Nagaland": (25.6751, 94.1086),
    "Odisha": (20.2961, 85.8245),
    "Punjab": (30.7333, 76.7794),
    "Rajasthan": (26.9124, 75.7873),
    "Sikkim": (27.3389, 88.6065),
    "Tamil Nadu": (13.0827, 80.2707),
    "Telangana": (17.3850, 78.4867),
    "Tripura": (23.8315, 91.2868),
    "Uttar Pradesh": (26.8467, 80.9462),
    "Uttarakhand": (30.3165, 78.0322),
    "West Bengal": (22.5726, 88.3639),
    "Delhi": (28.6139, 77.2090),
    "Chandigarh": (30.7333, 76.7794),
    "Puducherry": (11.9416, 79.8083),
    "Jammu and Kashmir": (34.0837, 74.7973),
    "Ladakh": (34.1526, 77.5771),
    "Andaman and Nicobar Islands": (11.6234, 92.7265),
    "Dadra and Nagar Haveli and Daman and Diu": (20.3974, 72.8328),
    "Lakshadweep": (10.5667, 72.6417),
}


@lru_cache(maxsize=1)
def load_bank_portals_directory():
    path = Path(settings.BASE_DIR) / "data" / "bank_portals_directory.json"
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def _format_tel_href(raw_phone):
    cleaned = re.sub(r"[^\d+]", "", str(raw_phone or "").strip())
    if not cleaned:
        return ""
    if cleaned.startswith("+"):
        return f"tel:{cleaned}"
    if cleaned.startswith("1800"):
        return f"tel:+91{cleaned}" if len(cleaned) >= 10 else f"tel:{cleaned}"
    if cleaned.startswith("0") and len(cleaned) >= 10:
        return f"tel:+91{cleaned[1:]}"
    if len(cleaned) == 10:
        return f"tel:+91{cleaned}"
    return f"tel:{cleaned}"


def match_institution(raw_name, directory=None, partner_type=None, state_hint=None):
    """Match a branch name or partner type to its parent institution in bank_portals_directory.json."""
    entries = directory if directory is not None else load_bank_portals_directory()
    text = re.sub(r"\s+", " ", str(raw_name or "").strip())
    text_low = text.lower()

    best_entry = None
    best_score = 0

    if text_low:
        for entry in entries:
            if entry.get("institution_type") == "PORTAL":
                continue
            for alias in entry.get("aliases") or []:
                al = str(alias).strip().lower()
                if not al:
                    continue
                matched = False
                if len(al) <= 5:
                    if re.search(rf"(?<![a-z0-9]){re.escape(al)}(?![a-z0-9])", text_low):
                        matched = True
                elif al in text_low:
                    matched = True
                if matched and len(al) > best_score:
                    best_score = len(al)
                    best_entry = entry

    if best_entry:
        return best_entry

    # Fallback match by partner_type / state
    ptype = str(partner_type or "").upper()
    if ptype == "RRB":
        return next((e for e in entries if e["id"] == "rrb"), None)
    if ptype in ("NBFC", "MFI"):
        return next((e for e in entries if e["id"] == "mfi"), None)
    if ptype == "SCA":
        st = str(state_hint or "").lower()
        if "rajasthan" in st:
            return next((e for e in entries if e["id"] == "sca_rajasthan"), None)
        if "uttar pradesh" in st:
            return next((e for e in entries if e["id"] == "sca_up"), None)
        if "punjab" in st:
            return next((e for e in entries if e["id"] == "sca_punjab"), None)
        if "delhi" in st:
            return next((e for e in entries if e["id"] == "sca_delhi"), None)
        return next((e for e in entries if e["id"] == "sca_national"), None)

    return None


def resolve_coordinates_for_pin(pin):
    """Resolve 6-digit PIN -> district/state -> Nominatim lat/lng with local fallbacks."""
    code = str(pin or "").strip()
    cache_key = f"live-search-pin-coords:{code}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    pin_details = lookup_pin_details(code)
    state = (pin_details or {}).get("state", "")
    district = (pin_details or {}).get("district", "")
    place = (pin_details or {}).get("place") or district or state or f"PIN {code}"

    lat = None
    lng = None
    source = "fallback"

    # Attempt Nominatim geocoding for "<district>, <state>, India"
    query_parts = [p for p in (district, state, "India") if p]
    if query_parts:
        query = ", ".join(query_parts)
        try:
            resp = requests.get(
                NOMINATIM_URL,
                params={"q": query, "format": "json", "limit": 1},
                headers=OSM_HEADERS,
                timeout=5,
            )
            if resp.status_code == 200:
                payload = resp.json()
                if isinstance(payload, list) and payload:
                    lat = float(payload[0]["lat"])
                    lng = float(payload[0]["lon"])
                    source = "nominatim"
        except (requests.RequestException, ValueError, KeyError, TypeError):
            pass

    # Fallback 1: exact local pin_lookup coordinates
    if (lat is None or lng is None) and pin_details:
        if pin_details.get("lat") is not None and pin_details.get("lng") is not None:
            lat = float(pin_details["lat"])
            lng = float(pin_details["lng"])
            source = "pin_lookup"

    # Fallback 2: prefix match in pin_lookup
    if lat is None or lng is None:
        p_lat, p_lng, p_place = coords_from_pin(code)
        if p_lat is not None and p_lng is not None:
            lat, lng = float(p_lat), float(p_lng)
            if p_place and not district:
                place = p_place
            source = "pin_prefix_lookup"

    # Fallback 3: State/UT coordinate center
    if lat is None or lng is None:
        if state in STATE_FALLBACK_COORDS:
            lat, lng = STATE_FALLBACK_COORDS[state]
            source = "state_fallback"
        else:
            lat, lng = 28.6139, 77.2090
            source = "india_default"

    resolved = {
        "pin": code,
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "state": state,
        "district": district,
        "place": place,
        "source": source,
    }
    cache.set(cache_key, resolved, 3600)
    return resolved


def fetch_overpass_banks(lat, lng, radius_km=10):
    """Fetch real bank nodes/ways from OpenStreetMap Overpass API with memory cache."""
    r_km = max(1, min(50, int(radius_km or 10)))
    cache_key = f"overpass-banks:{round(float(lat), 3)}:{round(float(lng), 3)}:{r_km}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached, True

    radius_m = r_km * 1000
    query = (
        f"[out:json][timeout:8];"
        f"("
        f'node["amenity"="bank"](around:{radius_m},{lat},{lng});'
        f'way["amenity"="bank"](around:{radius_m},{lat},{lng});'
        f");"
        f"out center tags;"
    )

    try:
        resp = requests.post(
            OVERPASS_URL,
            data={"data": query},
            headers=OSM_HEADERS,
            timeout=8,
        )
        if resp.status_code != 200:
            return [], False
        payload = resp.json()
        elements = payload.get("elements") or []
    except (requests.RequestException, ValueError, KeyError, TypeError):
        return [], False

    parsed = []
    seen = set()
    for el in elements:
        tags = el.get("tags") or {}
        name = str(
            tags.get("name") or tags.get("brand") or tags.get("operator") or ""
        ).strip()
        if not name:
            continue
        el_lat = el.get("lat") if el.get("lat") is not None else (el.get("center") or {}).get("lat")
        el_lng = el.get("lon") if el.get("lon") is not None else (el.get("center") or {}).get("lon")
        if el_lat is None or el_lng is None:
            continue
        try:
            b_lat = float(el_lat)
            b_lng = float(el_lng)
        except (TypeError, ValueError):
            continue

        dedup_key = (name.lower(), round(b_lat, 4), round(b_lng, 4))
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        addr_parts = [
            tags.get("addr:housenumber"),
            tags.get("addr:street"),
            tags.get("addr:suburb") or tags.get("addr:neighbourhood"),
            tags.get("addr:city") or tags.get("addr:town") or tags.get("addr:district"),
            tags.get("addr:state"),
            tags.get("addr:postcode"),
        ]
        address = ", ".join(str(p).strip() for p in addr_parts if p and str(p).strip())
        phone = str(tags.get("phone") or tags.get("contact:phone") or "").strip()

        parsed.append(
            {
                "osm_id": f"{el.get('type', 'node')}-{el.get('id', '')}",
                "name": name,
                "brand": str(tags.get("brand") or tags.get("operator") or "").strip(),
                "address": address,
                "district": str(tags.get("addr:city") or tags.get("addr:district") or "").strip(),
                "state": str(tags.get("addr:state") or "").strip(),
                "pin_code": str(tags.get("addr:postcode") or "").strip(),
                "phone": phone,
                "lat": b_lat,
                "lng": b_lng,
            }
        )

    cache.set(cache_key, parsed, 1800)
    return parsed, True


def _provided_schemes_for_channels(channels, all_schemes):
    ch_set = {str(c).lower() for c in (channels or []) if c}
    if not ch_set:
        return []
    out = []
    for s in all_schemes:
        s_channels = {str(c).lower() for c in (s.available_channels or [])}
        if s_channels & ch_set:
            out.append(
                {
                    "code": s.code,
                    "name": s.name,
                    "level": s.level,
                    "interest_rate": float(s.interest_rate),
                    "max_loan": float(s.max_loan) if s.max_loan is not None else None,
                }
            )
    return out


def _institution_label(inst_type):
    labels = {
        "PSB": "Public Sector Bank",
        "RRB": "Regional Rural Bank",
        "SCA": "State Channelising Agency",
        "MFI": "NBFC-MFI",
        "PORTAL": "Official Govt Portal",
    }
    return labels.get(inst_type, "Partner Bank")


def live_search_banks_and_portals(
    user_lat,
    user_lng,
    scheme=None,
    radius_km=10,
    resolved_location=None,
):
    """Combine Overpass live branches, DB Branch catalog, and official portals with full cross-refs."""
    r_km = max(1, min(50, int(radius_km or 10)))
    directory = load_bank_portals_directory()
    all_schemes = list(LoanScheme.objects.all())
    scheme_channels = (
        {str(c).lower() for c in (scheme.available_channels or [])}
        if scheme is not None
        else set()
    )
    scheme_code = scheme.code if scheme is not None else ""
    loc_meta = resolved_location or {}

    # 1. Fetch Overpass live branches
    osm_branches, overpass_ok = fetch_overpass_banks(user_lat, user_lng, r_km)

    # 2. Load local DB Branch records
    db_branches = list(Branch.objects.all())

    # 3. Build unified candidate branch entries + per-institution branch catalog
    branches_by_inst = {}
    all_branch_records = []
    seen_coords = set()

    def _register_inst_branch(inst_id, item_dict):
        bucket = branches_by_inst.setdefault(inst_id, [])
        key = (
            item_dict["branch_name"].lower(),
            round(float(item_dict["lat"]), 4),
            round(float(item_dict["lng"]), 4),
        )
        if not any(
            (b["branch_name"].lower(), round(float(b["lat"]), 4), round(float(b["lng"]), 4)) == key
            for b in bucket
        ):
            bucket.append(item_dict)

    # Process Overpass branches
    for ob in osm_branches:
        inst = match_institution(
            f"{ob['name']} {ob.get('brand', '')}".strip(),
            directory=directory,
        )
        inst_id = inst["id"] if inst else f"osm_{re.sub(r'[^a-z0-9]+', '_', ob['name'].lower()).strip('_')}"
        inst_type = inst["institution_type"] if inst else "PSB"
        supported_channels = inst["supported_channels"] if inst else ["bank"]
        dist = round(haversine_km(user_lat, user_lng, ob["lat"], ob["lng"]), 2)

        address = ob["address"]
        if not address:
            fallback_parts = [loc_meta.get("district"), loc_meta.get("state"), loc_meta.get("pin")]
            address = ", ".join(p for p in fallback_parts if p) or "Branch location from OpenStreetMap"

        branch_phone = ob["phone"]
        toll_free = inst.get("toll_free_phone", "") if inst else ""
        toll_free_disp = inst.get("toll_free_display", toll_free) if inst else ""
        phone_display = branch_phone or toll_free_disp
        phone_source = "branch" if branch_phone else ("toll_free" if toll_free else "")
        tel_href = _format_tel_href(branch_phone or toll_free)

        dedup = (ob["name"].lower(), round(ob["lat"], 4), round(ob["lng"], 4))
        seen_coords.add(dedup)

        branch_summary = {
            "branch_name": ob["name"],
            "address": address,
            "district": ob["district"] or loc_meta.get("district", ""),
            "state": ob["state"] or loc_meta.get("state", ""),
            "pin_code": ob["pin_code"] or loc_meta.get("pin", ""),
            "distance_km": dist,
            "phone": phone_display,
            "tel_href": tel_href,
            "lat": ob["lat"],
            "lng": ob["lng"],
        }
        _register_inst_branch(inst_id, branch_summary)

        all_branch_records.append(
            {
                "id": ob["osm_id"],
                "source": "osm_overpass",
                "name": ob["name"],
                "institution_id": inst_id,
                "institution_name": inst["name"] if inst else ob["name"],
                "short_code": inst["short_code"] if inst else "BANK",
                "institution_type": inst_type,
                "institution_label": _institution_label(inst_type),
                "address": address,
                "district": branch_summary["district"],
                "state": branch_summary["state"],
                "pin_code": branch_summary["pin_code"],
                "lat": ob["lat"],
                "lng": ob["lng"],
                "distance_km": dist,
                "branch_phone": branch_phone,
                "toll_free_phone": toll_free,
                "toll_free_display": toll_free_disp,
                "phone": phone_display,
                "phone_source": phone_source,
                "tel_href": tel_href,
                "official_url": inst.get("official_url", "") if inst else "",
                "headquarters": inst.get("headquarters", "") if inst else "India",
                "overview": inst.get("overview", "") if inst else "Scheduled bank branch discovered via OpenStreetMap.",
                "processing_time": inst.get("processing_time", "10–15 working days") if inst else "10–15 working days",
                "collateral_policy": inst.get("collateral_policy", "As per RBI / scheme norms.") if inst else "As per RBI / scheme norms.",
                "bank_required_documents": inst.get("bank_required_documents", []) if inst else [
                    "Aadhaar Card & PAN Card",
                    "Category / Income Certificate",
                    "Project Report & Bank Passbook",
                ],
                "helpline_hours": inst.get("helpline_hours", "Mon–Sat 10:00 AM – 4:00 PM") if inst else "Mon–Sat 10:00 AM – 4:00 PM",
                "supported_channels": supported_channels,
                "health": {
                    "funds_available": True,
                    "scheme_supported": not scheme_channels or bool(set(supported_channels) & scheme_channels),
                    "npa_low": True,
                    "color": "green",
                },
                "why": f"Live branch {dist} km away; matched to {inst['name'] if inst else 'partner bank'} supporting {', '.join(supported_channels[:3])}.",
            }
        )

    # Process DB Branch records (always populate all_branches; include in results if within radius or fallback)
    db_candidates = []
    for db_b in db_branches:
        inst = match_institution(
            db_b.name,
            directory=directory,
            partner_type=db_b.partner_type,
            state_hint=db_b.state,
        )
        inst_id = inst["id"] if inst else f"db_{db_b.id}"
        inst_type = inst["institution_type"] if inst else (
            "MFI" if db_b.partner_type == "NBFC" else db_b.partner_type
        )
        supported_channels = inst["supported_channels"] if inst else ["bank"]
        dist = round(haversine_km(user_lat, user_lng, float(db_b.lat), float(db_b.lng)), 2)

        branch_phone = str(db_b.phone or "").strip()
        toll_free = inst.get("toll_free_phone", "") if inst else ""
        toll_free_disp = inst.get("toll_free_display", toll_free) if inst else ""
        phone_display = branch_phone or toll_free_disp
        phone_source = "branch" if branch_phone else ("toll_free" if toll_free else "")
        tel_href = _format_tel_href(branch_phone or toll_free)

        branch_summary = {
            "branch_name": db_b.name,
            "address": db_b.address,
            "district": db_b.city,
            "state": db_b.state,
            "pin_code": "",
            "distance_km": dist,
            "phone": phone_display,
            "tel_href": tel_href,
            "lat": float(db_b.lat),
            "lng": float(db_b.lng),
        }
        _register_inst_branch(inst_id, branch_summary)

        supported_codes = [str(s).upper() for s in (db_b.schemes_supported or [])]
        scheme_supported = (
            not scheme_channels
            or bool(set(supported_channels) & scheme_channels)
            or (scheme_code.upper() in supported_codes)
        )
        health = health_checks(
            {
                "fund_quota_crore": db_b.fund_quota_crore,
                "scheme_supported": scheme_supported,
                "npa_percent": db_b.npa_percent,
            }
        )

        dedup = (db_b.name.lower(), round(float(db_b.lat), 4), round(float(db_b.lng), 4))
        if dedup in seen_coords:
            continue

        item = {
            "id": f"db-{db_b.id}",
            "source": "directory_branch",
            "name": db_b.name,
            "institution_id": inst_id,
            "institution_name": inst["name"] if inst else db_b.name,
            "short_code": inst["short_code"] if inst else db_b.partner_type,
            "institution_type": inst_type,
            "institution_label": _institution_label(inst_type),
            "address": db_b.address,
            "district": db_b.city,
            "state": db_b.state,
            "pin_code": "",
            "lat": float(db_b.lat),
            "lng": float(db_b.lng),
            "distance_km": dist,
            "branch_phone": branch_phone,
            "toll_free_phone": toll_free,
            "toll_free_display": toll_free_disp,
            "phone": phone_display,
            "phone_source": phone_source,
            "tel_href": tel_href,
            "official_url": inst.get("official_url", "") if inst else "",
            "headquarters": inst.get("headquarters", "") if inst else db_b.state,
            "overview": inst.get("overview", "") if inst else (db_b.notes or "Partner bank / SCA desk."),
            "processing_time": inst.get("processing_time", "10–15 working days") if inst else "10–15 working days",
            "collateral_policy": inst.get("collateral_policy", "As per scheme rules.") if inst else "As per scheme rules.",
            "bank_required_documents": inst.get("bank_required_documents", []) if inst else [],
            "helpline_hours": inst.get("helpline_hours", "Mon–Fri 10:00 AM – 5:00 PM") if inst else "Mon–Fri 10:00 AM – 5:00 PM",
            "supported_channels": supported_channels,
            "fund_quota_crore": db_b.fund_quota_crore,
            "npa_percent": db_b.npa_percent,
            "health": health,
            "why": f"Partner {inst_type} desk ({dist} km away) • Fund quota ₹{db_b.fund_quota_crore} Cr • NPA {db_b.npa_percent}%.",
        }
        db_candidates.append(item)

    # Include DB branches within radius_km, plus same-state SCA / nearest fallback desks if Overpass has < 5 branches
    user_state_low = str(loc_meta.get("state") or "").strip().lower()
    for item in sorted(db_candidates, key=lambda x: x["distance_km"]):
        within_radius = item["distance_km"] <= r_km
        is_state_sca = (
            item["institution_type"] == "SCA"
            and user_state_low
            and item["state"].lower() == user_state_low
            and (not scheme_channels or bool(set(item["supported_channels"]) & scheme_channels))
        )
        if within_radius or is_state_sca:
            all_branch_records.append(item)

    # Offline / sparse area fallback: ensure scheme-compatible banks & SCAs appear even if Overpass returns 0
    if len(all_branch_records) < 3:
        existing_ids = {b["id"] for b in all_branch_records}
        compatible_fallback = [
            item
            for item in sorted(db_candidates, key=lambda x: x["distance_km"])
            if item["id"] not in existing_ids
            and item["health"]["funds_available"]
            and (not scheme_channels or bool(set(item["supported_channels"]) & scheme_channels))
        ]
        all_branch_records.extend(compatible_fallback[:8])

    # Filter branches strictly to scheme's available_channels if a scheme is selected
    if scheme_channels:
        filtered_branches = [
            b
            for b in all_branch_records
            if (set(b.get("supported_channels") or []) & scheme_channels)
            or b["health"].get("scheme_supported")
        ]
        # Keep only branches whose channels match scheme_channels
        filtered_branches = [
            b
            for b in filtered_branches
            if set(b.get("supported_channels") or []) & scheme_channels
        ]
    else:
        filtered_branches = all_branch_records

    # Sort branches: within radius / compatible first by distance
    filtered_branches.sort(
        key=lambda x: (
            0 if x["health"]["funds_available"] else 1,
            x["distance_km"],
        )
    )

    # Sort each institution's all_branches by distance
    for inst_id, blist in branches_by_inst.items():
        blist.sort(key=lambda b: b["distance_km"])

    # Attach provided_schemes & all_branches to every branch item
    schemes_cache = {}
    for b in filtered_branches:
        ch_key = tuple(sorted(b.get("supported_channels") or []))
        if ch_key not in schemes_cache:
            schemes_cache[ch_key] = _provided_schemes_for_channels(ch_key, all_schemes)
        b["provided_schemes"] = schemes_cache[ch_key]
        b["all_branches"] = branches_by_inst.get(b["institution_id"], [
            {
                "branch_name": b["name"],
                "address": b["address"],
                "district": b["district"],
                "state": b["state"],
                "pin_code": b["pin_code"],
                "distance_km": b["distance_km"],
                "phone": b["phone"],
                "tel_href": b["tel_href"],
                "lat": b["lat"],
                "lng": b["lng"],
            }
        ])

    # 4. Build Official Application Portals strictly filtered to scheme's available_channels
    portals = []
    for entry in directory:
        if entry.get("institution_type") != "PORTAL":
            continue
        ch = entry.get("supported_channels") or []
        if scheme_channels and not (set(ch) & scheme_channels):
            continue

        ch_key = tuple(sorted(ch))
        if ch_key not in schemes_cache:
            schemes_cache[ch_key] = _provided_schemes_for_channels(ch_key, all_schemes)

        portal_url = entry["official_url"]
        if (
            entry["id"] == "portal_state"
            and scheme is not None
            and (scheme.official_portal_url or scheme.govt_portal_url)
        ):
            portal_url = scheme.official_portal_url or scheme.govt_portal_url

        toll_free = entry.get("toll_free_phone", "")
        toll_free_disp = entry.get("toll_free_display", toll_free)
        portals.append(
            {
                "id": entry["id"],
                "source": "official_portal",
                "name": entry["name"],
                "institution_id": entry["id"],
                "institution_name": entry["name"],
                "short_code": entry["short_code"],
                "institution_type": "PORTAL",
                "institution_label": "Official Govt Portal",
                "address": entry.get("headquarters", "Online National Portal"),
                "district": "",
                "state": (scheme.applicable_states[0] if scheme and scheme.applicable_states else "All India"),
                "pin_code": "",
                "lat": None,
                "lng": None,
                "distance_km": None,
                "branch_phone": "",
                "toll_free_phone": toll_free,
                "toll_free_display": toll_free_disp,
                "phone": toll_free_disp,
                "phone_source": "toll_free",
                "tel_href": _format_tel_href(toll_free),
                "official_url": portal_url,
                "headquarters": entry.get("headquarters", ""),
                "overview": entry.get("overview", ""),
                "processing_time": entry.get("processing_time", ""),
                "collateral_policy": entry.get("collateral_policy", ""),
                "bank_required_documents": entry.get("bank_required_documents", []),
                "helpline_hours": entry.get("helpline_hours", ""),
                "supported_channels": ch,
                "provided_schemes": schemes_cache[ch_key],
                "all_branches": [],
                "health": {
                    "funds_available": True,
                    "scheme_supported": True,
                    "npa_low": True,
                    "color": "green",
                },
                "why": f"Official online application portal for {scheme_code or 'eligible government schemes'}.",
            }
        )

    return {
        "overpass_live": overpass_ok,
        "overpass_count": len(osm_branches),
        "branches": filtered_branches,
        "portals": portals,
    }
