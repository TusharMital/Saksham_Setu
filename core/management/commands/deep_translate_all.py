"""Paced 23-language deep Groq translator for UI bundles, 66 schemes, and bank directory."""

import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from django.conf import settings
from django.core.management import BaseCommand, CommandError, call_command
from dotenv import load_dotenv

from core.dynamic_translator import (
    _extract_english_payload,
    _normalize_translated_item,
    load_bank_translation_cache,
    load_scheme_translation_cache,
    save_bank_translation_cache,
    save_scheme_translation_cache,
)
from core.i18n_validator import sanitize_bundle_with_fallback, validate_bundle
from core.languages import SUPPORTED_LANGUAGES, get_language_meta
from core.models import LoanScheme

PRIORITY_LANG_ORDER = [
    "hi",
    "bn",
    "ur",
    "ta",
    "te",
    "mr",
    "gu",
    "kn",
    "ml",
    "pa",
    "or",
    "as",
    "ne",
    "mai",
    "kok",
    "doi",
    "ks",
    "sd",
    "mni",
    "brx",
    "sa",
    "sat",
]

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

UNIVERSAL_ACRONYMS = {
    "EMI",
    "PIN",
    "IFSC",
    "NPA",
    "PSB",
    "RRB",
    "SCA",
    "NBFC-MFI",
    "PDF",
    "AI",
    "OTP",
    "URL",
    "ID",
    "SC",
    "ST",
    "OBC",
    "EWS",
    "PwD",
    "SHG",
    "JLG",
    "GPS",
    "SVG",
    "FAQ",
    "Saksham Setu",
    "साक्षम सेतु",
    "English",
    "हिन्दी",
    "हिंदी में उपलब्ध",
    "PM-SURAJ",
    "JanSamarth",
    "KVIC PMEGP",
    "Stand-Up Mitra",
    "PM Vishwakarma",
    "N/A",
    "₹0",
    "₹10,000",
    "65+",
    "28+",
    "35%",
    "92%",
    "8.15%",
    "Y{year}",
    "vs.",
}

LIST_KEY_RE = re.compile(r"^(.+)\[(\d+)\]$")


def _flatten_bundle(node, prefix=""):
    flat = {}
    if isinstance(node, dict):
        for k, v in node.items():
            path = f"{prefix}.{k}" if prefix else str(k)
            flat.update(_flatten_bundle(v, path))
    elif isinstance(node, list):
        for idx, item in enumerate(node):
            path = f"{prefix}[{idx}]"
            flat.update(_flatten_bundle(item, path))
    elif isinstance(node, str):
        flat[prefix] = node
    return flat


def _set_flat_path(root, flat_key, value):
    parts = flat_key.split(".")
    curr = root
    for idx, part in enumerate(parts):
        is_last = idx == len(parts) - 1
        m = LIST_KEY_RE.match(part)
        if m:
            key, arr_idx = m.group(1), int(m.group(2))
            if key not in curr or not isinstance(curr[key], list):
                curr[key] = []
            while len(curr[key]) <= arr_idx:
                curr[key].append({} if not is_last else "")
            if is_last:
                curr[key][arr_idx] = value
            else:
                if not isinstance(curr[key][arr_idx], dict):
                    curr[key][arr_idx] = {}
                curr = curr[key][arr_idx]
        else:
            if is_last:
                curr[part] = value
            else:
                if part not in curr or not isinstance(curr[part], dict):
                    curr[part] = {}
                curr = curr[part]


def _should_skip_key(en_val: str) -> bool:
    s = en_val.strip()
    if not s or s in UNIVERSAL_ACRONYMS:
        return True
    if not re.search(r"[A-Za-z]{2,}", s):
        return True
    return False


def _chunk_dict_by_budget(items: dict, max_items: int, max_chars: int) -> list[dict]:
    chunks = []
    curr = {}
    curr_chars = 2
    for k, v in items.items():
        sz = len(json.dumps({k: v}, ensure_ascii=False, separators=(",", ":")))
        if curr and (len(curr) >= max_items or curr_chars + sz > max_chars):
            chunks.append(curr)
            curr = {}
            curr_chars = 2
        curr[k] = v
        curr_chars += sz
    if curr:
        chunks.append(curr)
    return chunks


def _parse_duration_str(raw: str) -> float:
    m = re.match(r"^(?:(\d+)h)?(?:(\d+)m)?([\d.]+)s$", str(raw or "").strip())
    if not m:
        return 0.0
    hrs = int(m.group(1) or 0)
    mins = int(m.group(2) or 0)
    secs = float(m.group(3) or 0)
    return hrs * 3600 + mins * 60 + secs


def _parse_retry_wait(resp, attempt: int) -> float:
    retry_after = resp.headers.get("retry-after")
    if retry_after:
        try:
            return max(2.0, min(90.0, float(str(retry_after).strip().rstrip("s")) + 1.0))
        except ValueError:
            pass
    reset_tok = _parse_duration_str(resp.headers.get("x-ratelimit-reset-tokens") or "")
    if reset_tok > 0:
        return max(2.0, min(90.0, reset_tok + 1.0))
    return min(60.0, 2.0 * (1.8**attempt))


def _strip_json_fences(raw_text: str) -> str:
    content = raw_text.strip()
    if content.startswith("```"):
        content = content.strip("`").strip()
        if content.lower().startswith("json"):
            content = content[4:].strip()
    start = content.find("{")
    end = content.rfind("}")
    if start != -1 and end != -1 and end > start:
        return content[start : end + 1]
    return content


class PacedGroqClient:
    """Rate-limit-safe Groq client with 1.5s pacing, exponential backoff, and model rotation."""

    def __init__(self, api_key: str, stdout):
        self.api_key = api_key
        self.stdout = stdout
        primary = (getattr(settings, "GROQ_MODEL", "") or os.getenv("GROQ_MODEL") or "llama-3.3-70b-versatile").strip()
        candidates = [
            "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b",
            primary,
            "openai/gpt-oss-20b",
        ]
        self.models = list(dict.fromkeys(m for m in candidates if m))
        self.cooldown_until: dict[str, float] = {m: 0.0 for m in self.models}
        self.disabled: set[str] = set()
        self.idx = 0
        self.last_call_ts = 0.0

    def _log(self, msg: str):
        self.stdout.write(msg)
        sys.stdout.flush()

    def _pick_model(self) -> str:
        active = [m for m in self.models if m not in self.disabled]
        if not active:
            raise CommandError("All configured Groq models are disabled/unavailable.")

        now = time.time()
        for offset in range(len(active)):
            cand = active[(self.idx + offset) % len(active)]
            if self.cooldown_until.get(cand, 0.0) <= now:
                self.idx = (self.idx + offset + 1) % len(active)
                return cand

        soonest = min(active, key=lambda m: self.cooldown_until.get(m, 0.0))
        wait_s = max(1.5, self.cooldown_until[soonest] - now)
        self._log(f"  [Groq] waiting {wait_s:.1f}s for {soonest} quota reset...")
        time.sleep(wait_s)
        return soonest

    def call_json(self, system_prompt: str, user_payload: dict, max_tokens: int, label: str) -> dict:
        body_json = json.dumps(user_payload, ensure_ascii=False, separators=(",", ":"))
        for attempt in range(12):
            elapsed = time.time() - self.last_call_ts
            if elapsed < 1.5:
                time.sleep(1.5 - elapsed)

            model = self._pick_model()
            eff_max = min(max_tokens, 1100) if "qwen" in model else max_tokens
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": body_json},
                ],
                "temperature": 0.1,
                "max_tokens": eff_max,
                "response_format": {"type": "json_object"},
            }
            if "gpt-oss" in model:
                payload["reasoning_effort"] = "low"

            self.last_call_ts = time.time()
            try:
                resp = requests.post(
                    GROQ_API_URL,
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json=payload,
                    timeout=65,
                )
            except requests.RequestException as exc:
                self._log(f"  [{label}] {model} network error ({type(exc).__name__}), sleeping 3s...")
                self.cooldown_until[model] = time.time() + 3.0
                continue

            if resp.status_code == 404:
                self._log(f"  [{label}] {model} unavailable (404), disabling for run.")
                self.disabled.add(model)
                continue

            if resp.status_code == 400 and "response_format" in payload:
                payload.pop("response_format", None)
                try:
                    resp = requests.post(
                        GROQ_API_URL,
                        headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                        json=payload,
                        timeout=65,
                    )
                except requests.RequestException:
                    self.cooldown_until[model] = time.time() + 3.0
                    continue

            if resp.status_code == 429:
                wait_s = _parse_retry_wait(resp, attempt)
                try:
                    err_msg = resp.json().get("error", {}).get("message", resp.text)
                except ValueError:
                    err_msg = resp.text
                low = err_msg.lower()
                if "tokens per day" in low or "tpd" in low or "requests per day" in low or "rpd" in low:
                    if wait_s > 90.0:
                        self._log(f"  [{label}] {model} daily TPD/RPD exhausted ({err_msg[:95]}) -> disabling model for run.")
                        self.disabled.add(model)
                        continue
                    self._log(f"  [{label}] {model} rolling TPD wait ({wait_s:.1f}s)...")
                    self.cooldown_until[model] = time.time() + max(5.0, wait_s)
                    continue
                if "request too large" in low:
                    self._log(f"  [{label}] {model} 429 (too large: {err_msg[:130]}) -> cooldown 15s")
                    self.cooldown_until[model] = time.time() + 15.0
                else:
                    self.cooldown_until[model] = time.time() + wait_s
                    self._log(f"  [{label}] {model} 429 ({err_msg[:95]}) -> cooldown {wait_s:.1f}s")
                continue

            if resp.status_code >= 500:
                self.cooldown_until[model] = time.time() + 5.0
                continue

            if resp.status_code != 200:
                self._log(f"  [{label}] {model} HTTP {resp.status_code}")
                self.cooldown_until[model] = time.time() + 5.0
                continue

            # Proactively pace using remaining TPM + reset duration
            rem_tok = resp.headers.get("x-ratelimit-remaining-tokens")
            if rem_tok and rem_tok.isdigit() and int(rem_tok) < 2800:
                reset_s = _parse_duration_str(resp.headers.get("x-ratelimit-reset-tokens") or "")
                self.cooldown_until[model] = time.time() + max(2.0, min(60.0, reset_s + 0.5))

            try:
                raw = resp.json()["choices"][0]["message"]["content"]
                parsed = json.loads(_strip_json_fences(raw))
                if isinstance(parsed, dict):
                    return parsed
            except (ValueError, KeyError, IndexError, TypeError):
                time.sleep(1.5)
                continue

        return {}


class Command(BaseCommand):
    help = "Deep paced 23-language translation of UI bundles, all 66 schemes, bank directory, and English-leakage audit."

    def add_arguments(self, parser):
        parser.add_argument(
            "--pass",
            dest="which_pass",
            choices=["all", "ui", "schemes", "banks", "audit"],
            default="all",
        )
        parser.add_argument("--lang", default="all")
        parser.add_argument("--ui-batch-size", type=int, default=35)
        parser.add_argument("--scheme-batch-size", type=int, default=4)
        parser.add_argument("--bank-batch-size", type=int, default=4)

    def _log(self, msg: str):
        self.stdout.write(msg)
        sys.stdout.flush()

    def _get_api_key(self) -> str:
        load_dotenv(Path(settings.BASE_DIR) / ".env", override=False)
        api_key = (os.getenv("GROQ_API_KEY") or getattr(settings, "GROQ_API_KEY", "") or "").strip()
        if not api_key:
            raise CommandError("GROQ_API_KEY is not configured in .env.")
        return api_key

    def _save_ui_bundle(self, lang_code: str, en_bundle: dict, en_flat: dict, tgt_flat: dict):
        translations_dir = Path(settings.BASE_DIR) / "core" / "translations"
        rebuilt = {}
        for key, en_val in en_flat.items():
            val = tgt_flat.get(key)
            if not isinstance(val, str) or not val.strip():
                val = en_val
            _set_flat_path(rebuilt, key, val)

        repaired, fallbacks = sanitize_bundle_with_fallback(en_bundle, rebuilt)
        errors = validate_bundle(en_bundle, repaired)
        if errors:
            raise CommandError(f"Bundle validation failed for {lang_code}: {errors[:5]}")

        formatted = json.dumps(repaired, ensure_ascii=False, indent=2) + "\n"
        (translations_dir / f"{lang_code}.json").write_text(formatted, encoding="utf-8")
        if lang_code == "hi":
            fe_hi = Path(settings.BASE_DIR) / "frontend" / "src" / "locales" / "hi.json"
            fe_hi.write_text(formatted, encoding="utf-8")
        return len(fallbacks)

    def _run_pass1_ui(self, client: PacedGroqClient, target_langs: list[str], batch_size: int):
        translations_dir = Path(settings.BASE_DIR) / "core" / "translations"
        en_bundle = json.loads((translations_dir / "en.json").read_text(encoding="utf-8"))
        en_flat = _flatten_bundle(en_bundle)

        # Ensure all target bundles immediately pass schema/placeholder validation before incremental Groq batches
        for lang_code in target_langs:
            tgt_path = translations_dir / f"{lang_code}.json"
            tgt_bundle = json.loads(tgt_path.read_text(encoding="utf-8")) if tgt_path.exists() else {}
            tgt_flat = _flatten_bundle(tgt_bundle)
            self._save_ui_bundle(lang_code, en_bundle, en_flat, tgt_flat)

        self._log(f"=== PASS 1: UI Bundles ({len(en_flat)} keys x {len(target_langs)} languages) ===")
        for lang_code in target_langs:
            meta = get_language_meta(lang_code)
            tgt_path = translations_dir / f"{lang_code}.json"
            tgt_bundle = json.loads(tgt_path.read_text(encoding="utf-8")) if tgt_path.exists() else {}
            tgt_flat = _flatten_bundle(tgt_bundle)

            pending = {}
            for key, en_val in en_flat.items():
                if _should_skip_key(en_val):
                    continue
                cur = tgt_flat.get(key)
                if not isinstance(cur, str) or not cur.strip() or cur.strip() == en_val.strip():
                    pending[key] = en_val

            if not pending:
                fb = self._save_ui_bundle(lang_code, en_bundle, en_flat, tgt_flat)
                self._log(f"[{lang_code}] {meta['name']}: 0 pending (fallbacks={fb})")
                continue

            chunks = _chunk_dict_by_budget(pending, max_items=min(batch_size, 18), max_chars=950)
            self._log(f"[{lang_code}] {meta['name']}: {len(pending)} keys in {len(chunks)} batches...")
            sys_prompt = (
                f"Translate all JSON values from English into {meta['name']} ({meta['native_name']}) in {meta['script']} script. "
                f"Keep ALL keys, {{placeholders}} ({{name}}, {{count}}, {{state}}, {{year}}, {{rate}}, {{months}}, {{code}}, {{dist}}, {{pin}}), "
                f"₹ amounts, digits, and acronyms (SC, ST, OBC, EWS, RBI, MSME, EMI, PIN, IFSC, NPA, PSB, RRB, SCA, NBFC-MFI, PM-SURAJ, JanSamarth, PMEGP, Aadhaar, PAN) unchanged. "
                f"Return ONLY valid JSON."
            )
            for b_idx, chunk_payload in enumerate(chunks, start=1):
                chunk_keys = list(chunk_payload.keys())
                label = f"P1:{lang_code}:{b_idx}/{len(chunks)}"
                translated = client.call_json(sys_prompt, chunk_payload, max_tokens=700, label=label)

                missing = [k for k in chunk_keys if not isinstance(translated.get(k), str) or not translated.get(k).strip()]
                if missing:
                    for sub_chunk in _chunk_dict_by_budget({k: pending[k] for k in missing}, max_items=12, max_chars=900):
                        sub_out = client.call_json(sys_prompt, sub_chunk, max_tokens=900, label=f"{label}-sub")
                        if isinstance(sub_out, dict):
                            translated.update(sub_out)

                updated = 0
                for k in chunk_keys:
                    val = translated.get(k)
                    if isinstance(val, str) and val.strip():
                        tgt_flat[k] = val.strip()
                        updated += 1
                self._save_ui_bundle(lang_code, en_bundle, en_flat, tgt_flat)
                self._log(f"  [{label}] saved {updated}/{len(chunk_keys)} keys")

    def _run_pass2_schemes(self, client: PacedGroqClient, target_langs: list[str], batch_size: int):
        if LoanScheme.objects.count() < 66:
            call_command("seed_data")

        schemes = list(LoanScheme.objects.all().order_by("code"))
        cache_data = load_scheme_translation_cache()
        self._log(f"=== PASS 2: {len(schemes)} Schemes x {len(target_langs)} languages ===")

        for lang_code in target_langs:
            meta = get_language_meta(lang_code)
            misses = {}
            cached_now = 0
            enum_upgraded = False

            for scheme in schemes:
                eng = _extract_english_payload(scheme)
                ckey = f"{lang_code}:{scheme.code}"
                existing = cache_data.get(ckey)
                if (
                    isinstance(existing, dict)
                    and isinstance(existing.get("name"), str)
                    and existing["name"].strip()
                    and isinstance(existing.get("overview"), str)
                    and existing["overview"].strip()
                ):
                    norm = _normalize_translated_item(eng, existing, scheme=scheme, lang_code=lang_code)
                    if norm != existing:
                        cache_data[ckey] = norm
                        enum_upgraded = True
                    cached_now += 1
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

            if enum_upgraded:
                save_scheme_translation_cache(cache_data)

            if not misses:
                self._log(f"[{lang_code}] {meta['name']}: {cached_now}/{len(schemes)} schemes complete.")
                continue

            chunks = _chunk_dict_by_budget(misses, max_items=batch_size, max_chars=2600)
            self._log(f"[{lang_code}] {meta['name']}: {cached_now}/{len(schemes)} cached, translating {len(misses)} in {len(chunks)} batches...")
            sys_prompt = (
                f"Translate all JSON text values and lists from English into {meta['name']} ({meta['native_name']}) in {meta['script']} script. "
                f"Keep scheme codes, field names, numbers, ₹ amounts, percentages, list lengths, and codes (SC, ST, OBC, EWS, RBI, MSME, Aadhaar, PAN) unchanged. "
                f"Return ONLY valid JSON."
            )

            scheme_by_code = {s.code: s for s in schemes}
            for batch_no, chunk_payload in enumerate(chunks, start=1):
                chunk_codes = list(chunk_payload.keys())
                label = f"P2:{lang_code}:{batch_no}/{len(chunks)}"

                out = client.call_json(sys_prompt, chunk_payload, max_tokens=2200, label=label)
                rem = [c for c in chunk_codes if not isinstance(out.get(c), dict) or not out.get(c)]
                if rem:
                    for sub_code in rem:
                        sub_out = client.call_json(
                            sys_prompt,
                            {sub_code: misses[sub_code]},
                            max_tokens=1400,
                            label=f"{label}-sub",
                        )
                        if isinstance(sub_out, dict):
                            out.update(sub_out)

                saved = 0
                for c in chunk_codes:
                    raw_item = out.get(c)
                    if isinstance(raw_item, dict) and raw_item:
                        s_obj = scheme_by_code[c]
                        eng = _extract_english_payload(s_obj)
                        cache_data[f"{lang_code}:{c}"] = _normalize_translated_item(
                            eng, raw_item, scheme=s_obj, lang_code=lang_code
                        )
                        saved += 1
                        cached_now += 1
                if saved > 0:
                    save_scheme_translation_cache(cache_data)
                self._log(f"  [{label}] saved {saved}/{len(chunk_codes)} ({cached_now}/{len(schemes)})")

    def _run_pass3_banks(self, client: PacedGroqClient, target_langs: list[str], batch_size: int):
        dir_path = Path(settings.BASE_DIR) / "data" / "bank_portals_directory.json"
        directory = json.loads(dir_path.read_text(encoding="utf-8"))
        cache_data = load_bank_translation_cache()
        fields = (
            "name",
            "headquarters",
            "overview",
            "processing_time",
            "collateral_policy",
            "bank_required_documents",
            "helpline_hours",
        )
        self._log(f"=== PASS 3: {len(directory)} Bank/Portal Profiles x {len(target_langs)} languages ===")

        for lang_code in target_langs:
            meta = get_language_meta(lang_code)
            misses = {}
            cached_now = 0
            for entry in directory:
                eid = entry["id"]
                ckey = f"{lang_code}:{eid}"
                existing = cache_data.get(ckey)
                if (
                    isinstance(existing, dict)
                    and isinstance(existing.get("overview"), str)
                    and existing["overview"].strip()
                    and existing.get("overview") != entry.get("overview")
                ):
                    cached_now += 1
                else:
                    misses[eid] = {f: entry.get(f, "" if f != "bank_required_documents" else []) for f in fields}

            if not misses:
                self._log(f"[{lang_code}] {meta['name']}: {cached_now}/{len(directory)} bank profiles cached.")
                continue

            chunks = _chunk_dict_by_budget(misses, max_items=batch_size, max_chars=2300)
            sys_prompt = (
                f"Translate bank/portal JSON fields from English into {meta['name']} ({meta['native_name']}) in {meta['script']} script. "
                f"Keep institution IDs, field names, numbers, ₹ amounts, timings, and codes (SBI, PNB, BOB, RBI, PMMY, CGTMSE, SC, ST, OBC, EWS, Aadhaar, PAN) unchanged. "
                f"Keep bank_required_documents list length identical. Return ONLY valid JSON."
            )
            entry_by_id = {e["id"]: e for e in directory}
            for batch_no, chunk_payload in enumerate(chunks, start=1):
                chunk_ids = list(chunk_payload.keys())
                label = f"P3:{lang_code}:{batch_no}/{len(chunks)}"
                out = client.call_json(sys_prompt, chunk_payload, max_tokens=2000, label=label)
                rem = [i for i in chunk_ids if not isinstance(out.get(i), dict) or not out.get(i)]
                if rem:
                    for sub_id in rem:
                        sub_out = client.call_json(sys_prompt, {sub_id: misses[sub_id]}, max_tokens=1100, label=f"{label}-sub")
                        if isinstance(sub_out, dict):
                            out.update(sub_out)

                saved = 0
                for eid in chunk_ids:
                    raw_item = out.get(eid)
                    if isinstance(raw_item, dict) and raw_item:
                        src = entry_by_id[eid]
                        clean = {}
                        for sf in ("name", "headquarters", "overview", "processing_time", "collateral_policy", "helpline_hours"):
                            v = raw_item.get(sf)
                            clean[sf] = str(v).strip() if isinstance(v, str) and v.strip() else src.get(sf, "")
                        docs = raw_item.get("bank_required_documents")
                        if isinstance(docs, list) and docs and all(isinstance(x, str) and x.strip() for x in docs):
                            clean["bank_required_documents"] = [x.strip() for x in docs]
                        else:
                            clean["bank_required_documents"] = list(src.get("bank_required_documents") or [])
                        cache_data[f"{lang_code}:{eid}"] = clean
                        saved += 1
                        cached_now += 1
                if saved > 0:
                    save_bank_translation_cache(cache_data)
                self._log(f"  [{label}] saved {saved}/{len(chunk_ids)} ({cached_now}/{len(directory)})")

    def _run_pass4_audit(self, target_langs: list[str]):
        translations_dir = Path(settings.BASE_DIR) / "core" / "translations"
        en_bundle = json.loads((translations_dir / "en.json").read_text(encoding="utf-8"))
        en_flat = _flatten_bundle(en_bundle)
        scheme_cache = load_scheme_translation_cache()
        bank_cache = load_bank_translation_cache()
        schemes = list(LoanScheme.objects.all().order_by("code"))
        dir_count = len(json.loads((Path(settings.BASE_DIR) / "data" / "bank_portals_directory.json").read_text(encoding="utf-8")))

        self._log("=== PASS 4: Automated English-Leakage & Integrity Audit ===")
        total_errors = 0
        for code in ["en", *target_langs]:
            tgt_path = translations_dir / f"{code}.json"
            tgt = json.loads(tgt_path.read_text(encoding="utf-8"))
            errs = validate_bundle(en_bundle, tgt)
            if errs:
                total_errors += len(errs)
            if code == "en":
                self._log(f"  [en] keys={len(en_flat)} validate_errors={len(errs)}")
                continue
            tf = _flatten_bundle(tgt)
            leaks = [
                k
                for k, v in en_flat.items()
                if not _should_skip_key(v) and len(v.split()) >= 2 and tf.get(k) == v
            ]
            sc_ok = sum(1 for s in schemes if isinstance(scheme_cache.get(f"{code}:{s.code}"), dict) and scheme_cache[f"{code}:{s.code}"].get("overview"))
            bk_ok = sum(1 for k in bank_cache if k.startswith(f"{code}:"))
            self._log(
                f"  [{code}] ui_errors={len(errs)} sentence_leaks={len(leaks)} "
                f"schemes={sc_ok}/{len(schemes)} banks={bk_ok}/{dir_count}"
                + (f" leak_sample={leaks[:4]}" if leaks else "")
            )
        if total_errors:
            raise CommandError(f"Audit failed with {total_errors} bundle validation errors!")

    def handle(self, *args, **options):
        which = options["which_pass"]
        raw_lang = str(options["lang"] or "all").strip().lower()
        ui_bs = max(5, min(50, int(options["ui_batch_size"] or 35)))
        sc_bs = max(1, min(8, int(options["scheme_batch_size"] or 4)))
        bk_bs = max(1, min(8, int(options["bank_batch_size"] or 4)))

        if raw_lang == "all":
            target_langs = [c for c in PRIORITY_LANG_ORDER if c in SUPPORTED_LANGUAGES and c != "en"]
            for c in SUPPORTED_LANGUAGES:
                if c != "en" and c not in target_langs:
                    target_langs.append(c)
        else:
            target_langs = []
            for p in raw_lang.split(","):
                c = p.strip().lower()
                if c and c != "en":
                    get_language_meta(c)
                    if c not in target_langs:
                        target_langs.append(c)

        if which == "audit":
            self._run_pass4_audit(target_langs)
            return

        api_key = self._get_api_key()
        client = PacedGroqClient(api_key=api_key, stdout=self.stdout)

        if which in ("all", "ui"):
            self._run_pass1_ui(client, target_langs, ui_bs)
        if which in ("all", "schemes"):
            self._run_pass2_schemes(client, target_langs, sc_bs)
        if which in ("all", "banks"):
            self._run_pass3_banks(client, target_langs, bk_bs)
        if which in ("all", "audit"):
            self._run_pass4_audit(target_langs)
