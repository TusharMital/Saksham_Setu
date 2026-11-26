"""Dynamic scheme translation with persistent JSON cache and Groq fallback."""

import json
import threading
from pathlib import Path

import requests
from django.conf import settings

from core.languages import get_language_meta
from core.models import LoanScheme

_CACHE_LOCK = threading.Lock()
TRANSLATABLE_FIELDS = (
    "name",
    "agency",
    "overview",
    "interest_rate_note",
    "subsidy_margin_note",
    "key_highlights",
    "required_documents",
    "important_notes",
)


def _cache_path() -> Path:
    return Path(settings.BASE_DIR) / "data" / "scheme_translations_cache.json"


def load_scheme_translation_cache() -> dict:
    path = _cache_path()
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_scheme_translation_cache(cache_data: dict) -> None:
    path = _cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(
        json.dumps(cache_data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    tmp_path.replace(path)


def _extract_english_payload(scheme: LoanScheme) -> dict:
    overview = scheme.overview or scheme.description or ""
    docs = scheme.required_documents or scheme.documents or []
    return {
        "name": scheme.name or "",
        "agency": scheme.agency or "",
        "overview": overview,
        "interest_rate_note": scheme.interest_rate_note or "",
        "subsidy_margin_note": scheme.subsidy_margin_note or "",
        "key_highlights": list(scheme.key_highlights or []),
        "required_documents": list(docs),
        "important_notes": list(scheme.important_notes or []),
    }


def _normalize_translated_item(src: dict, raw: dict) -> dict:
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
    primary_model = getattr(settings, "GROQ_MODEL", "llama-3.1-8b-instant")
    fallback_models = [primary_model, "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
    timeout = max(30, int(getattr(settings, "GROQ_TIMEOUT_SECONDS", 10)))
    for attempt in range(6):
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
            if resp.status_code == 429:
                if (attempt + 1) % len(fallback_models) == 0:
                    wait_s = min(30.0, float(resp.headers.get("retry-after") or 6.0) + 1.0)
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
            if attempt < 4:
                time.sleep(1.0)
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

    for scheme in schemes:
        eng = _extract_english_payload(scheme)
        cache_key = f"{target_lang}:{scheme.code}"
        if cache_key in cache_data and isinstance(cache_data[cache_key], dict):
            translations[scheme.code] = _normalize_translated_item(eng, cache_data[cache_key])
            cached_count += 1
        else:
            misses[scheme.code] = eng

    translated_count = 0
    fallback_count = 0
    new_cache_entries: dict[str, dict] = {}

    if misses:
        miss_codes = list(misses.keys())
        for idx in range(0, len(miss_codes), max(1, batch_size)):
            chunk_codes = miss_codes[idx : idx + max(1, batch_size)]
            chunk_payload = {code: misses[code] for code in chunk_codes}
            translated_chunk = _translate_batch_via_groq(chunk_payload, lang_meta)
            for code in chunk_codes:
                eng = misses[code]
                raw_item = translated_chunk.get(code)
                if isinstance(raw_item, dict) and raw_item:
                    normalized = _normalize_translated_item(eng, raw_item)
                    translations[code] = normalized
                    new_cache_entries[f"{target_lang}:{code}"] = normalized
                    translated_count += 1
                else:
                    translations[code] = eng
                    fallback_count += 1

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
