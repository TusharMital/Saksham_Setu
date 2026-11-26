"""Dynamic scheme, bank directory, and arbitrary text translation with persistent JSON caches."""

import json
import threading
import time
from functools import lru_cache
from pathlib import Path

import requests
from django.conf import settings

from core.languages import get_language_meta
from core.models import LoanScheme

_CACHE_LOCK = threading.Lock()
_TEXT_CACHE_LOCK = threading.Lock()
TRANSLATABLE_FIELDS = (
    "name",
    "agency",
    "govt_level",
    "state_name",
    "overview",
    "interest_rate_note",
    "subsidy_margin_note",
    "key_highlights",
    "required_documents",
    "important_notes",
    "sectors",
    "available_channels",
)


def _cache_path() -> Path:
    return Path(settings.BASE_DIR) / "data" / "scheme_translations_cache.json"


def _bank_cache_path() -> Path:
    return Path(settings.BASE_DIR) / "data" / "bank_translations_cache.json"


def _text_cache_path() -> Path:
    return Path(settings.BASE_DIR) / "data" / "text_translations_cache.json"


@lru_cache(maxsize=32)
def _load_ui_bundle(lang_code: str) -> dict:
    path = Path(settings.BASE_DIR) / "core" / "translations" / f"{lang_code}.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _load_json_dict(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_json_dict(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    tmp_path.replace(path)


def load_scheme_translation_cache() -> dict:
    return _load_json_dict(_cache_path())


def save_scheme_translation_cache(cache_data: dict) -> None:
    _save_json_dict(_cache_path(), cache_data)


def load_bank_translation_cache() -> dict:
    return _load_json_dict(_bank_cache_path())


def save_bank_translation_cache(cache_data: dict) -> None:
    _save_json_dict(_bank_cache_path(), cache_data)


def load_text_translation_cache() -> dict:
    return _load_json_dict(_text_cache_path())


def save_text_translation_cache(cache_data: dict) -> None:
    _save_json_dict(_text_cache_path(), cache_data)


def _extract_scheme_enum_labels(scheme: LoanScheme, lang_code: str) -> dict:
    bundle = _load_ui_bundle(lang_code)
    results_sec = bundle.get("results") or {}
    detail_sec = bundle.get("detail") or {}
    states_sec = bundle.get("states") or {}
    sectors_sec = bundle.get("sectors") or {}
    channels_sec = bundle.get("channels") or {}

    level = (getattr(scheme, "level", "central") or "central").lower()
    govt_level = (
        results_sec.get("stateBadge", "STATE GOVT")
        if level == "state"
        else results_sec.get("centralBadge", "CENTRAL GOVT")
    )
    raw_states = scheme.applicable_states or scheme.states_supported or ["ALL"]
    localized_states = []
    for st in raw_states:
        s = str(st).strip()
        if s.upper() == "ALL":
            localized_states.append(detail_sec.get("allIndia", "All India"))
        else:
            localized_states.append(states_sec.get(s, s))
    state_name = ", ".join(localized_states)

    localized_sectors = [
        sectors_sec.get(str(sec).strip().lower(), str(sec))
        for sec in (scheme.sectors or [])
    ]
    localized_channels = [
        channels_sec.get(str(ch).strip().lower(), str(ch))
        for ch in (scheme.available_channels or [])
    ]
    return {
        "govt_level": govt_level,
        "state_name": state_name,
        "sectors": localized_sectors,
        "available_channels": localized_channels,
    }


def _extract_english_payload(scheme: LoanScheme) -> dict:
    overview = scheme.overview or scheme.description or ""
    docs = scheme.required_documents or scheme.documents or []
    enums = _extract_scheme_enum_labels(scheme, "en")
    return {
        "name": scheme.name or "",
        "agency": scheme.agency or "",
        "overview": overview,
        "interest_rate_note": scheme.interest_rate_note or "",
        "subsidy_margin_note": scheme.subsidy_margin_note or "",
        "key_highlights": list(scheme.key_highlights or []),
        "required_documents": list(docs),
        "important_notes": list(scheme.important_notes or []),
        **enums,
    }


def _normalize_translated_item(src: dict, raw: dict, scheme: LoanScheme | None = None, lang_code: str = "en") -> dict:
    if not isinstance(raw, dict):
        return dict(src)
    out = {}
    for field in ("name", "agency", "overview", "interest_rate_note", "subsidy_margin_note"):
        val = raw.get(field)
        out[field] = str(val).strip() if isinstance(val, str) and val.strip() else src[field]
    for list_field in ("key_highlights", "required_documents", "important_notes"):
        val = raw.get(list_field)
        if isinstance(val, list) and len(val) == len(src[list_field]) and all(
            isinstance(x, str) and x.strip() for x in val
        ):
            out[list_field] = [x.strip() for x in val]
        elif isinstance(val, list) and val and all(isinstance(x, str) and x.strip() for x in val):
            out[list_field] = [x.strip() for x in val]
        else:
            out[list_field] = list(src[list_field])
    if scheme is not None and lang_code != "en":
        enums = _extract_scheme_enum_labels(scheme, lang_code)
    else:
        enums = {
            "govt_level": raw.get("govt_level") or src.get("govt_level", ""),
            "state_name": raw.get("state_name") or src.get("state_name", ""),
            "sectors": raw.get("sectors") or list(src.get("sectors") or []),
            "available_channels": raw.get("available_channels") or list(src.get("available_channels") or []),
        }
    out.update(enums)
    if out.get("subsidy_margin_note"):
        out["subsidy_note"] = out["subsidy_margin_note"]
    return out


def _translate_batch_via_groq(batch: dict[str, dict], lang_meta: dict) -> dict[str, dict]:
    api_key = getattr(settings, "GROQ_API_KEY", "")
    if not api_key or not batch:
        return {}

    import time

    system_prompt = (
        f"You are a precise Indian government financial translator.\n"
        f"Translate all values in the given JSON object from English into {lang_meta['name']} "
        f"({lang_meta['native_name']}) using its authentic native {lang_meta['script']} script.\n"
        f"Rules:\n"
        f"1. Keep JSON top-level keys (scheme codes) and field names IDENTICAL.\n"
        f"2. Preserve exact numbers, ₹ amounts, percentages (e.g. 4.0%, 15%–35%), and short codes (SC, ST, OBC, EWS, RBI, MSME, Aadhaar, PAN).\n"
        f"3. Keep list lengths identical for key_highlights, required_documents, and important_notes.\n"
        f"4. Return ONLY valid JSON — no markdown fences, no commentary."
    )
    primary_model = getattr(settings, "GROQ_MODEL", "llama-3.3-70b-versatile")
    fallback_models = list(
        dict.fromkeys(
            [
                primary_model,
                "llama-3.3-70b-versatile",
                "llama-3.1-8b-instant",
                "openai/gpt-oss-120b",
                "openai/gpt-oss-20b",
                "qwen/qwen3.8-27b",
            ]
        )
    )
    timeout = max(35, int(getattr(settings, "GROQ_TIMEOUT_SECONDS", 10)))
    for attempt in range(9):
        model_name = fallback_models[attempt % len(fallback_models)]
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(batch, ensure_ascii=False)},
            ],
            "temperature": 0.1,
            "max_tokens": 4096,
            "response_format": {"type": "json_object"},
        }
        if "gpt-oss" in model_name:
            payload["reasoning_effort"] = "low"
        try:
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=timeout,
            )
            if resp.status_code == 400:
                payload.pop("response_format", None)
                resp = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=timeout,
                )
            if resp.status_code == 429:
                if (attempt + 1) % len(fallback_models) == 0:
                    retry_hdr = resp.headers.get("retry-after") or "12"
                    try:
                        wait_s = max(6.0, min(45.0, float(str(retry_hdr).rstrip("s")) + 2.0))
                    except ValueError:
                        wait_s = 12.0
                    time.sleep(wait_s)
                continue
            if resp.status_code != 200:
                continue
            content = resp.json()["choices"][0]["message"]["content"].strip()
            if content.startswith("```"):
                content = content.strip("`")
                if content.lower().startswith("json"):
                    content = content[4:].strip()
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1 and end > start:
                content = content[start : end + 1]
            parsed = json.loads(content)
            return parsed if isinstance(parsed, dict) else {}
        except (requests.RequestException, ValueError, KeyError, IndexError, TypeError):
            if attempt < 7:
                time.sleep(1.5)
                continue
            return {}
    return {}


def translate_schemes(
    scheme_codes: list[str] | None,
    lang_code: str,
    batch_size: int = 2,
) -> dict:
    """Return translated fields for requested scheme_codes in lang_code, using persistent cache + Groq."""
    lang_meta = get_language_meta(lang_code)
    target_lang = lang_meta["code"]

    qs = LoanScheme.objects.all().order_by("code")
    if scheme_codes:
        wanted = [str(c).strip() for c in scheme_codes if str(c).strip()]
        schemes = [s for s in qs if s.code.upper() in {w.upper() for w in wanted}]
    else:
        schemes = list(qs)

    if target_lang == "en":
        translations = {s.code: _extract_english_payload(s) for s in schemes}
        return {
            "language": "en",
            "total_schemes": len(translations),
            "translations": translations,
            "cached_count": len(translations),
            "translated_count": 0,
            "fallback_count": 0,
        }

    with _CACHE_LOCK:
        cache_data = load_scheme_translation_cache()

    translations: dict[str, dict] = {}
    misses: dict[str, dict] = {}
    cached_count = 0

    scheme_by_code = {s.code: s for s in schemes}

    for scheme in schemes:
        eng = _extract_english_payload(scheme)
        cache_key = f"{target_lang}:{scheme.code}"
        if cache_key in cache_data and isinstance(cache_data[cache_key], dict):
            translations[scheme.code] = _normalize_translated_item(
                eng, cache_data[cache_key], scheme=scheme, lang_code=target_lang
            )
            cached_count += 1
        else:
            misses[scheme.code] = {
                k: eng[k]
                for k in (
                    "name",
                    "agency",
                    "overview",
                    "interest_rate_note",
                    "subsidy_margin_note",
                    "key_highlights",
                    "required_documents",
                    "important_notes",
                )
            }

    translated_count = 0
    fallback_count = 0
    new_cache_entries: dict[str, dict] = {}

    if misses:
        miss_codes = list(misses.keys())
        for idx in range(0, len(miss_codes), max(1, batch_size)):
            chunk_codes = miss_codes[idx : idx + max(1, batch_size)]
            chunk_payload = {code: misses[code] for code in chunk_codes}
            translated_chunk = _translate_batch_via_groq(chunk_payload, lang_meta)
            chunk_new: dict[str, dict] = {}
            for code in chunk_codes:
                scheme_obj = scheme_by_code.get(code)
                eng = _extract_english_payload(scheme_obj) if scheme_obj else misses[code]
                raw_item = translated_chunk.get(code)
                if isinstance(raw_item, dict) and raw_item:
                    normalized = _normalize_translated_item(
                        eng, raw_item, scheme=scheme_obj, lang_code=target_lang
                    )
                    translations[code] = normalized
                    chunk_new[f"{target_lang}:{code}"] = normalized
                    new_cache_entries[f"{target_lang}:{code}"] = normalized
                    translated_count += 1
                else:
                    translations[code] = eng
                    fallback_count += 1
            if chunk_new:
                with _CACHE_LOCK:
                    latest = load_scheme_translation_cache()
                    latest.update(chunk_new)
                    save_scheme_translation_cache(latest)

    if new_cache_entries:
        with _CACHE_LOCK:
            latest = load_scheme_translation_cache()
            latest.update(new_cache_entries)
            save_scheme_translation_cache(latest)

    return {
        "language": target_lang,
        "total_schemes": len(translations),
        "translations": translations,
        "cached_count": cached_count,
        "translated_count": translated_count,
        "fallback_count": fallback_count,
    }


def _translate_texts_batch_via_groq(batch: dict[str, str], lang_meta: dict) -> dict[str, str]:
    api_key = getattr(settings, "GROQ_API_KEY", "")
    if not api_key or not batch:
        return {}

    system_prompt = (
        f"You are a precise Indian government & banking localization translator.\n"
        f"Translate or transliterate every JSON string value (such as bank branch names, "
        f"addresses, Indian districts, post offices, and institutional terms) into "
        f"{lang_meta['name']} ({lang_meta['native_name']}) using its authentic native "
        f"{lang_meta['script']} script.\n"
        f"Rules:\n"
        f"1. Keep ALL JSON keys IDENTICAL.\n"
        f"2. Preserve numbers, PIN codes, and acronyms (SBI, PNB, BOB, RBI, PIN, IFSC, SC, ST, OBC, EWS).\n"
        f"3. Return ONLY valid JSON mapping each key to its translated string."
    )
    primary_model = getattr(settings, "GROQ_MODEL", "llama-3.3-70b-versatile")
    fallback_models = list(
        dict.fromkeys(
            [
                primary_model,
                "llama-3.3-70b-versatile",
                "llama-3.1-8b-instant",
                "openai/gpt-oss-120b",
                "openai/gpt-oss-20b",
                "qwen/qwen3.8-27b",
            ]
        )
    )
    timeout = max(20, int(getattr(settings, "GROQ_TIMEOUT_SECONDS", 12)))
    for attempt in range(6):
        model_name = fallback_models[attempt % len(fallback_models)]
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(batch, ensure_ascii=False)},
            ],
            "temperature": 0.1,
            "max_tokens": 2048,
            "response_format": {"type": "json_object"},
        }
        if "gpt-oss" in model_name:
            payload["reasoning_effort"] = "low"
        try:
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=timeout,
            )
            if resp.status_code == 400:
                payload.pop("response_format", None)
                resp = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload,
                    timeout=timeout,
                )
            if resp.status_code == 429:
                time.sleep(1.5)
                continue
            if resp.status_code != 200:
                continue
            content = resp.json()["choices"][0]["message"]["content"].strip()
            if content.startswith("```"):
                content = content.strip("`")
                if content.lower().startswith("json"):
                    content = content[4:].strip()
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1 and end > start:
                content = content[start : end + 1]
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                return {str(k): str(v).strip() for k, v in parsed.items() if isinstance(v, str) and v.strip()}
        except (requests.RequestException, ValueError, KeyError, IndexError, TypeError):
            time.sleep(1.0)
            continue
    return {}


def translate_texts(texts: list[str], lang_code: str, batch_size: int = 30) -> dict:
    """Translate arbitrary dynamic strings into `lang_code` with persistent caching."""
    lang_meta = get_language_meta(lang_code)
    target_lang = lang_meta["code"]

    clean_texts: list[str] = []
    seen = set()
    for raw in texts or []:
        s = str(raw or "").strip() if isinstance(raw, str) else ""
        if s and s not in seen:
            seen.add(s)
            clean_texts.append(s)

    if target_lang == "en" or not clean_texts:
        translations = {s: s for s in clean_texts}
        return {
            "language": target_lang,
            "translations": translations,
            "cached_count": len(translations),
            "translated_count": 0,
            "fallback_count": 0,
        }

    with _TEXT_CACHE_LOCK:
        cache_data = load_text_translation_cache()

    translations: dict[str, str] = {}
    misses: list[str] = []
    cached_count = 0
    for s in clean_texts:
        c_key = f"{target_lang}:{s}"
        val = cache_data.get(c_key)
        if isinstance(val, str) and val.strip():
            translations[s] = val.strip()
            cached_count += 1
        else:
            misses.append(s)

    translated_count = 0
    fallback_count = 0
    new_entries: dict[str, str] = {}

    if misses:
        for idx in range(0, len(misses), max(1, batch_size)):
            chunk = misses[idx : idx + max(1, batch_size)]
            payload = {str(i): txt for i, txt in enumerate(chunk)}
            out = _translate_texts_batch_via_groq(payload, lang_meta)
            for i, txt in enumerate(chunk):
                tr_val = out.get(str(i))
                if tr_val:
                    translations[txt] = tr_val
                    new_entries[f"{target_lang}:{txt}"] = tr_val
                    translated_count += 1
                else:
                    translations[txt] = txt
                    fallback_count += 1

    if new_entries:
        with _TEXT_CACHE_LOCK:
            latest = load_text_translation_cache()
            latest.update(new_entries)
            save_text_translation_cache(latest)

    return {
        "language": target_lang,
        "translations": translations,
        "cached_count": cached_count,
        "translated_count": translated_count,
        "fallback_count": fallback_count,
    }
