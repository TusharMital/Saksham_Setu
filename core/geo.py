"""Haversine distance and partner ranking with normalized quota/NPA."""

import json
import math
from pathlib import Path

from django.conf import settings


EARTH_KM = 6371.0
ZERO_FUND_PENALTY = 5.0  # so a next-door empty desk cannot beat a funded partner


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
    path = Path(settings.BASE_DIR) / "pin_lookup.json"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


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


def health_checks(branch):
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
    }


def rank_branches(branches, user_lat, user_lng, scheme_code=None):
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
        c["health"] = health_checks(c)
        why = []
        if dist < 5:
            why.append("very close to you")
        elif dist < 25:
            why.append("within easy travel")
        else:
            why.append(f"{dist:.0f} km away")
        if float(c["fund_quota_crore"] or 0) <= 0:
            why.append("no remaining fund quota in this demo")
        else:
            why.append(f"quota Rs {c['fund_quota_crore']} Cr")
        why.append(f"NPA {c['npa_percent']}%")
        if scheme_code:
            why.append("supports this scheme" if c["scheme_supported"] else "does not list this scheme")
        c["why"] = "Ranked here because it is " + "; ".join(why) + "."
        ranked.append(c)

    ranked.sort(key=lambda x: x["branch_score"], reverse=True)
    return ranked
