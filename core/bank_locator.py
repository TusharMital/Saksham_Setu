"""Live bank & official portal search backed by Nominatim, Overpass API, and local catalog."""

import json
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

import requests
from django.conf import settings
from django.core.cache import cache

from core.geo import (
    BANK_BACKEND_DEFAULTS,
    INDIAN_PIN_RE,
    coords_from_pin,
    haversine_km,
    health_checks,
    lookup_pin_details,
    normalize_indian_state,
)
from core.i18n_templates import fmt_tpl, get_section_templates
from core.models import Branch, LoanScheme

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
OVERPASS_MIRRORS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)
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


def _normalize_india_coords(lat, lng):
    """Validate India bounding box [6..38, 68..98], auto-swap if reversed, discard invalid/0,0."""
    if lat is None or lng is None:
        return None, None
    try:
        f_lat = float(lat)
        f_lng = float(lng)
    except (TypeError, ValueError):
        return None, None
    if abs(f_lat) < 1e-6 and abs(f_lng) < 1e-6:
        return None, None
    if 6.0 <= f_lat <= 38.0 and 68.0 <= f_lng <= 98.0:
        return round(f_lat, 6), round(f_lng, 6)
    if 6.0 <= f_lng <= 38.0 and 68.0 <= f_lat <= 98.0:
        return round(f_lng, 6), round(f_lat, 6)
    return None, None


def _is_valid_coord_pair(lat, lng):
    n_lat, n_lng = _normalize_india_coords(lat, lng)
    return n_lat is not None and n_lng is not None


def build_google_maps_directions_url(
    source,
    name,
    address="",
    lat=None,
    lng=None,
    user_lat=None,
    user_lng=None,
):
    """Build a verified Google Maps Directions URL using validated branch coordinates."""
    b_lat, b_lng = _normalize_india_coords(lat, lng)
    if b_lat is not None and b_lng is not None:
        u_lat, u_lng = _normalize_india_coords(user_lat, user_lng)
        if u_lat is not None and u_lng is not None:
            return (
                f"https://www.google.com/maps/dir/?api=1"
                f"&origin={u_lat},{u_lng}&destination={b_lat},{b_lng}&travelmode=driving"
            )
        return f"https://www.google.com/maps/dir/?api=1&destination={b_lat},{b_lng}"
    query_text = ", ".join(part.strip() for part in (name or "", address or "") if part and part.strip())
    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(query_text or 'India')}"


def reverse_geocode_coords(lat, lng, pin=""):
    """Reverse-geocode live GPS coordinates via Nominatim so UI shows the real locality/city."""
    r_lat = round(float(lat), 6)
    r_lng = round(float(lng), 6)
    cache_key = f"live-search-revgeo:{round(r_lat, 3)}:{round(r_lng, 3)}"
    cached = cache.get(cache_key)
    if cached:
        return {**cached, "lat": r_lat, "lng": r_lng, "pin": pin or cached.get("pin", "")}

    state = ""
    district = ""
    place = ""
    detected_pin = str(pin or "").strip()

    try:
        resp = requests.get(
            NOMINATIM_REVERSE_URL,
            params={
                "format": "json",
                "lat": r_lat,
                "lon": r_lng,
                "zoom": 14,
                "addressdetails": 1,
            },
            headers=OSM_HEADERS,
            timeout=5,
        )
        if resp.status_code == 200:
            payload = resp.json() or {}
            addr = payload.get("address") or {}
            raw_state = addr.get("state") or ""
            state = normalize_indian_state(raw_state) if raw_state else ""
            district = str(
                addr.get("city")
                or addr.get("town")
                or addr.get("state_district")
                or addr.get("county")
                or addr.get("district")
                or ""
            ).strip()
            locality = str(
                addr.get("suburb")
                or addr.get("neighbourhood")
                or addr.get("village")
                or addr.get("hamlet")
                or addr.get("city_district")
                or ""
            ).strip()
            place = ", ".join(p for p in (locality, district) if p and p != locality or p == locality)
            if locality and district and locality.lower() != district.lower():
                place = f"{locality}, {district}"
            else:
                place = locality or district or state
            if not detected_pin and addr.get("postcode"):
                cand_pin = re.sub(r"\s+", "", str(addr.get("postcode")))
                if INDIAN_PIN_RE.match(cand_pin):
                    detected_pin = cand_pin
    except (requests.RequestException, ValueError, KeyError, TypeError):
        pass

    label_parts = [p for p in (place or district, state) if p]
    location_label = (
        ", ".join(dict.fromkeys(label_parts))
        if label_parts
        else "Your Live GPS Location"
    )
    if detected_pin:
        location_label = f"{location_label} (PIN {detected_pin})"

    resolved = {
        "lat": r_lat,
        "lng": r_lng,
        "state": state,
        "district": district,
        "place": place or "Live GPS Location",
        "pin": detected_pin,
        "location_label": location_label,
        "source": "gps",
    }
    cache.set(cache_key, resolved, 1800)
    return resolved


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
    post_offices = (pin_details or {}).get("post_offices") or []
    post_office = str(post_offices[0]).strip() if post_offices else ""
    place = (pin_details or {}).get("place") or post_office or district or state or f"PIN {code}"

    lat = None
    lng = None
    source = "fallback"

    # Attempt Nominatim geocoding: post office -> district/state -> postalcode
    nominatim_attempts = []
    if post_office and district and state:
        nominatim_attempts.append({"q": f"{post_office}, {district}, {state}, India", "format": "json", "limit": 1})
    if district and state:
        nominatim_attempts.append({"q": f"{district}, {state}, India", "format": "json", "limit": 1})
    nominatim_attempts.append({"postalcode": code, "country": "India", "format": "json", "limit": 1})

    for params in nominatim_attempts:
        try:
            resp = requests.get(
                NOMINATIM_URL,
                params=params,
                headers=OSM_HEADERS,
                timeout=5,
            )
            if resp.status_code == 200:
                payload = resp.json()
                if isinstance(payload, list) and payload:
                    cand_lat, cand_lng = _normalize_india_coords(payload[0].get("lat"), payload[0].get("lon"))
                    if cand_lat is not None and cand_lng is not None:
                        lat, lng = cand_lat, cand_lng
                        source = "nominatim"
                        break
        except (requests.RequestException, ValueError, KeyError, TypeError):
            continue

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

    primary_place = post_office or district or place
    area_parts = [p for p in (primary_place, state) if p]
    location_label = f"{', '.join(dict.fromkeys(area_parts))} (PIN {code})" if area_parts else f"PIN {code}"

    resolved = {
        "pin": code,
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "state": state,
        "district": district,
        "post_office": post_office,
        "place": place,
        "location_label": location_label,
        "source": source,
    }
    cache.set(cache_key, resolved, 3600)
    return resolved


def fetch_overpass_banks(lat, lng, radius_km=10):
    """Fetch real bank nodes/ways/relations from OpenStreetMap Overpass API mirrors with cache."""
    r_km = max(1, min(50, int(radius_km or 10)))
    cache_key = f"overpass-banks:{round(float(lat), 3)}:{round(float(lng), 3)}:{r_km}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached, True

    radius_m = r_km * 1000
    query = (
        f"[out:json][timeout:7];"
        f"("
        f'node["amenity"="bank"](around:{radius_m},{lat},{lng});'
        f'way["amenity"="bank"](around:{radius_m},{lat},{lng});'
        f'relation["amenity"="bank"](around:{radius_m},{lat},{lng});'
        f");"
        f"out center body;"
    )

    elements = None
    for endpoint in OVERPASS_MIRRORS:
        try:
            resp = requests.post(
                endpoint,
                data={"data": query},
                headers=OSM_HEADERS,
                timeout=7,
            )
            if resp.status_code == 200:
                payload = resp.json()
                elements = payload.get("elements") or []
                break
        except (requests.RequestException, ValueError, KeyError, TypeError):
            continue

    if elements is None:
        return [], False

    parsed = []
    seen = set()
    for el in elements:
        tags = el.get("tags") or {}
        base_name = str(
            tags.get("name") or tags.get("brand") or tags.get("operator") or ""
        ).strip()
        if not base_name:
            continue
        branch_tag = str(tags.get("branch") or "").strip()
        name = (
            f"{base_name} ({branch_tag})"
            if branch_tag and branch_tag.lower() not in base_name.lower()
            else base_name
        )
        el_lat = el.get("lat") if el.get("lat") is not None else (el.get("center") or {}).get("lat")
        el_lng = el.get("lon") if el.get("lon") is not None else (el.get("center") or {}).get("lon")
        b_lat, b_lng = _normalize_india_coords(el_lat, el_lng)
        if b_lat is None or b_lng is None:
            continue

        dedup_key = (name.lower(), round(b_lat, 4), round(b_lng, 4))
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        addr_full = str(tags.get("addr:full") or "").strip()
        if addr_full:
            address = addr_full
        else:
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
                "district": str(tags.get("addr:city") or tags.get("addr:town") or tags.get("addr:district") or "").strip(),
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


def _institution_label(inst_type, tpl=None):
    t = tpl or BANK_BACKEND_DEFAULTS
    labels = {
        "PSB": t["labelPSB"],
        "RRB": t["labelRRB"],
        "SCA": t["labelSCA"],
        "MFI": t["labelMFI"],
        "PORTAL": t["labelPORTAL"],
    }
    return labels.get(inst_type, t["labelDefault"])


def _collect_local_branches_for_radius(
    user_lat,
    user_lng,
    effective_radius,
    scheme,
    scheme_channels,
    scheme_code,
    directory,
    db_branches,
    loc_meta,
    lang="en",
):
    """Collect Overpass + directory branches strictly within effective_radius km."""
    tpl = get_section_templates("bankBackend", BANK_BACKEND_DEFAULTS, lang=lang)
    osm_branches, overpass_ok = fetch_overpass_banks(user_lat, user_lng, effective_radius)

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

    # Process Overpass branches (strictly distance_km <= effective_radius)
    for ob in osm_branches:
        b_lat, b_lng = _normalize_india_coords(ob["lat"], ob["lng"])
        if b_lat is None or b_lng is None:
            continue
        dist = round(haversine_km(user_lat, user_lng, b_lat, b_lng), 2)
        if dist > effective_radius:
            continue

        inst = match_institution(
            f"{ob['name']} {ob.get('brand', '')}".strip(),
            directory=directory,
        )
        inst_id = inst["id"] if inst else f"osm_{re.sub(r'[^a-z0-9]+', '_', ob['name'].lower()).strip('_')}"
        inst_type = inst["institution_type"] if inst else "PSB"
        supported_channels = inst["supported_channels"] if inst else ["bank"]

        address = ob["address"]
        if not address:
            fallback_parts = [loc_meta.get("district"), loc_meta.get("state"), loc_meta.get("pin")]
            address = ", ".join(p for p in fallback_parts if p) or tpl["osmDefaultAddress"]

        branch_phone = ob["phone"]
        toll_free = inst.get("toll_free_phone", "") if inst else ""
        toll_free_disp = inst.get("toll_free_display", toll_free) if inst else ""
        phone_display = branch_phone or toll_free_disp
        phone_source = "branch" if branch_phone else ("toll_free" if toll_free else "")
        tel_href = _format_tel_href(branch_phone or toll_free)

        dedup = (ob["name"].lower(), round(b_lat, 4), round(b_lng, 4))
        seen_coords.add(dedup)

        dir_url = build_google_maps_directions_url(
            "osm_overpass",
            ob["name"],
            address,
            b_lat,
            b_lng,
            user_lat,
            user_lng,
        )
        branch_summary = {
            "branch_name": ob["name"],
            "source": "osm_overpass",
            "address": address,
            "district": ob["district"] or loc_meta.get("district", ""),
            "state": ob["state"] or loc_meta.get("state", ""),
            "pin_code": ob["pin_code"] or loc_meta.get("pin", ""),
            "distance_km": dist,
            "phone": phone_display,
            "tel_href": tel_href,
            "lat": b_lat,
            "lng": b_lng,
            "directions_url": dir_url,
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
                "institution_label": _institution_label(inst_type, tpl),
                "out_of_local_radius": False,
                "address": address,
                "district": branch_summary["district"],
                "state": branch_summary["state"],
                "pin_code": branch_summary["pin_code"],
                "lat": b_lat,
                "lng": b_lng,
                "distance_km": dist,
                "directions_url": dir_url,
                "branch_phone": branch_phone,
                "toll_free_phone": toll_free,
                "toll_free_display": toll_free_disp,
                "phone": phone_display,
                "phone_source": phone_source,
                "tel_href": tel_href,
                "official_url": inst.get("official_url", "") if inst else "",
                "headquarters": inst.get("headquarters", "") if inst else "India",
                "overview": inst.get("overview", "") if inst else tpl["osmDefaultOverview"],
                "processing_time": inst.get("processing_time", tpl["defaultProcTime"]) if inst else tpl["defaultProcTime"],
                "collateral_policy": inst.get("collateral_policy", tpl["defaultCollateral"]) if inst else tpl["defaultCollateral"],
                "bank_required_documents": inst.get("bank_required_documents", []) if inst else [
                    "Aadhaar Card & PAN Card",
                    "Category / Income Certificate",
                    "Project Report & Bank Passbook",
                ],
                "helpline_hours": inst.get("helpline_hours", tpl["defaultHelpline"]) if inst else tpl["defaultHelpline"],
                "supported_channels": supported_channels,
                "health": {
                    "funds_available": True,
                    "scheme_supported": not scheme_channels or bool(set(supported_channels) & scheme_channels),
                    "npa_low": True,
                    "color": "green",
                    "labels": {
                        "funds": tpl["healthFunds"],
                        "scheme": (
                            tpl["healthScheme"]
                            if (not scheme_channels or bool(set(supported_channels) & scheme_channels))
                            else tpl["healthNoScheme"]
                        ),
                        "npa": tpl["healthLowNpa"],
                    },
                },
                "why": fmt_tpl(
                    tpl["whyLiveOsm"],
                    dist=dist,
                    inst=inst["name"] if inst else tpl["labelDefault"],
                    channels=", ".join(supported_channels[:3]),
                ),
            }
        )

    # Process DB Branch records — STRICTLY filtered to distance_km <= effective_radius
    for db_b in db_branches:
        b_lat, b_lng = _normalize_india_coords(db_b.lat, db_b.lng)
        if b_lat is None or b_lng is None:
            continue
        dist = round(haversine_km(user_lat, user_lng, b_lat, b_lng), 2)

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

        branch_phone = str(db_b.phone or "").strip()
        toll_free = inst.get("toll_free_phone", "") if inst else ""
        toll_free_disp = inst.get("toll_free_display", toll_free) if inst else ""
        phone_display = branch_phone or toll_free_disp
        phone_source = "branch" if branch_phone else ("toll_free" if toll_free else "")
        tel_href = _format_tel_href(branch_phone or toll_free)
        db_dir_url = build_google_maps_directions_url(
            "directory_branch",
            db_b.name,
            db_b.address,
            b_lat,
            b_lng,
            user_lat,
            user_lng,
        )

        branch_summary = {
            "branch_name": db_b.name,
            "source": "directory_branch",
            "address": db_b.address,
            "district": db_b.city,
            "state": db_b.state,
            "pin_code": "",
            "distance_km": dist,
            "phone": phone_display,
            "tel_href": tel_href,
            "lat": b_lat,
            "lng": b_lng,
            "directions_url": db_dir_url,
        }
        # Only register local or same-institution branches in all_branches when within 50 km
        if dist <= 50:
            _register_inst_branch(inst_id, branch_summary)

        # NEVER include faraway branches (dist > effective_radius) in local search results
        if dist > effective_radius:
            continue

        dedup = (db_b.name.lower(), round(b_lat, 4), round(b_lng, 4))
        if dedup in seen_coords:
            continue

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
            },
            lang=lang,
        )

        inst_type_label = _institution_label(inst_type, tpl)
        all_branch_records.append(
            {
                "id": f"db-{db_b.id}",
                "source": "directory_branch",
                "name": db_b.name,
                "institution_id": inst_id,
                "institution_name": inst["name"] if inst else db_b.name,
                "short_code": inst["short_code"] if inst else db_b.partner_type,
                "institution_type": inst_type,
                "institution_label": inst_type_label,
                "out_of_local_radius": False,
                "address": db_b.address,
                "district": db_b.city,
                "state": db_b.state,
                "pin_code": "",
                "lat": b_lat,
                "lng": b_lng,
                "distance_km": dist,
                "directions_url": db_dir_url,
                "branch_phone": branch_phone,
                "toll_free_phone": toll_free,
                "toll_free_display": toll_free_disp,
                "phone": phone_display,
                "phone_source": phone_source,
                "tel_href": tel_href,
                "official_url": inst.get("official_url", "") if inst else "",
                "headquarters": inst.get("headquarters", "") if inst else db_b.state,
                "overview": inst.get("overview", "") if inst else (db_b.notes or tpl["labelDefault"]),
                "processing_time": inst.get("processing_time", tpl["defaultProcTime"]) if inst else tpl["defaultProcTime"],
                "collateral_policy": inst.get("collateral_policy", tpl["defaultCollateral"]) if inst else tpl["defaultCollateral"],
                "bank_required_documents": inst.get("bank_required_documents", []) if inst else [],
                "helpline_hours": inst.get("helpline_hours", tpl["defaultHelpline"]) if inst else tpl["defaultHelpline"],
                "supported_channels": supported_channels,
                "fund_quota_crore": db_b.fund_quota_crore,
                "npa_percent": db_b.npa_percent,
                "health": health,
                "why": fmt_tpl(
                    tpl["whyDirectory"],
                    instType=inst_type_label,
                    dist=dist,
                    quota=db_b.fund_quota_crore,
                    npa=db_b.npa_percent,
                ),
            }
        )

    if scheme_channels:
        filtered_branches = [
            b
            for b in all_branch_records
            if set(b.get("supported_channels") or []) & scheme_channels
        ]
    else:
        filtered_branches = all_branch_records

    filtered_branches.sort(key=lambda x: x["distance_km"])
    return filtered_branches, overpass_ok, len(osm_branches), branches_by_inst


def live_search_banks_and_portals(
    user_lat,
    user_lng,
    scheme=None,
    radius_km=10,
    resolved_location=None,
    lang="en",
):
    """Combine Overpass live branches, local DB branches, and official portals strictly within radius."""
    tpl = get_section_templates("bankBackend", BANK_BACKEND_DEFAULTS, lang=lang)
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
    db_branches = list(Branch.objects.all())

    effective_radius = r_km
    expanded_radius = False
    filtered_branches, overpass_ok, osm_count, branches_by_inst = _collect_local_branches_for_radius(
        user_lat,
        user_lng,
        effective_radius,
        scheme,
        scheme_channels,
        scheme_code,
        directory,
        db_branches,
        loc_meta,
        lang=lang,
    )

    # Auto-expand once to 25 km if 0 branches were found within 5 km or 10 km
    if len(filtered_branches) == 0 and r_km < 25:
        effective_radius = 25
        expanded_radius = True
        filtered_branches, overpass_ok, osm_count, branches_by_inst = _collect_local_branches_for_radius(
            user_lat,
            user_lng,
            effective_radius,
            scheme,
            scheme_channels,
            scheme_code,
            directory,
            db_branches,
            loc_meta,
            lang=lang,
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
                "source": b["source"],
                "address": b["address"],
                "district": b["district"],
                "state": b["state"],
                "pin_code": b["pin_code"],
                "distance_km": b["distance_km"],
                "phone": b["phone"],
                "tel_href": b["tel_href"],
                "lat": b["lat"],
                "lng": b["lng"],
                "directions_url": b["directions_url"],
            }
        ])

    empty_message = (
        tpl["empty25km"]
        if len(filtered_branches) == 0
        else ""
    )

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
                "institution_label": _institution_label("PORTAL", tpl),
                "address": entry.get("headquarters", tpl["onlineNationalPortal"]),
                "district": "",
                "state": (scheme.applicable_states[0] if scheme and scheme.applicable_states else tpl["allIndiaLabel"]),
                "pin_code": "",
                "lat": None,
                "lng": None,
                "distance_km": None,
                "directions_url": build_google_maps_directions_url(
                    "official_portal",
                    entry["name"],
                    entry.get("headquarters", ""),
                ),
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
                    "labels": {
                        "funds": tpl["healthFunds"],
                        "scheme": tpl["healthScheme"],
                        "npa": tpl["healthLowNpa"],
                    },
                },
                "why": fmt_tpl(
                    tpl["whyPortal"],
                    code=scheme_code or tpl["eligibleSchemesLabel"],
                ),
            }
        )

    return {
        "overpass_live": overpass_ok,
        "overpass_count": osm_count,
        "effective_radius_km": effective_radius,
        "expanded_radius": expanded_radius,
        "empty_message": empty_message,
        "branches": filtered_branches,
        "portals": portals,
    }
