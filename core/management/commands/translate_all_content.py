"""Automated Groq batch translator for all 22 non-English UI bundles and 66 schemes."""

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
    load_scheme_translation_cache,
    save_scheme_translation_cache,
)
from core.i18n_validator import sanitize_bundle_with_fallback, validate_bundle
from core.languages import SUPPORTED_LANGUAGES, get_language_meta
from core.models import LoanScheme

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

PASS_B_LANG_ORDER = [
    "bn",
    "te",
    "mr",
    "ta",
    "ur",
    "gu",
    "kn",
    "ml",
    "or",
    "pa",
    "as",
    "mai",
    "sat",
    "ks",
    "ne",
    "kok",
    "sd",
    "doi",
    "mni",
    "brx",
    "sa",
]

INTENTIONAL_CODES_OR_ACRONYMS = {
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
    "SC",
    "ST",
    "OBC",
    "EWS",
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


def _should_skip_translation(en_val: str) -> bool:
    s = en_val.strip()
    if not s:
        return True
    if s in INTENTIONAL_CODES_OR_ACRONYMS:
        return True
    if not re.search(r"[A-Za-z]{2,}", s):
        return True
    return False


def _parse_wait_seconds(resp, attempt: int) -> float:
    retry_after = resp.headers.get("retry-after")
    if retry_after:
        try:
            return max(2.0, min(90.0, float(str(retry_after).strip().rstrip("s")) + 1.0))
        except ValueError:
            pass
    reset_tok = resp.headers.get("x-ratelimit-reset-tokens") or ""
    m = re.match(r"^(?:(\d+)m)?([\d.]+)s$", reset_tok.strip())
    if m:
        mins = int(m.group(1) or 0)
        secs = float(m.group(2) or 0)
        return max(2.0, min(90.0, mins * 60 + secs + 1.0))
    return min(60.0, 4.0 * (1.5**attempt))


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


class GroqPool:
    """Manages available Groq models with per-model 429 cooldown rotation."""

    def __init__(self, api_key: str, primary_model: str, stdout):
        self.api_key = api_key
        self.stdout = stdout
        candidates = [
            "qwen/qwen3.8-27b",
            primary_model,
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
        ]
        self.models = list(dict.fromkeys(m for m in candidates if m))
        self.cooldown_until: dict[str, float] = {m: 0.0 for m in self.models}
        self.disabled: set[str] = set()
        self.idx = 0

    def _log(self, msg: str):
        self.stdout.write(msg)
        sys.stdout.flush()

    def _pick_model(self) -> str:
        active = [m for m in self.models if m not in self.disabled]
        if not active:
            raise CommandError("All Groq models returned 404/unavailable.")

        now = time.time()
        for offset in range(len(active)):
            cand = active[(self.idx + offset) % len(active)]
            if self.cooldown_until.get(cand, 0.0) <= now:
                self.idx = (self.idx + offset + 1) % len(active)
                return cand

        # All active models are cooling down: wait for earliest available
        soonest = min(active, key=lambda m: self.cooldown_until.get(m, 0.0))
        wait_s = max(1.0, self.cooldown_until[soonest] - now)
        self._log(f"  [GroqPool] all models cooling down; sleeping {wait_s:.1f}s for {soonest}...")
        time.sleep(wait_s)
        return soonest

    def call_json(self, system_prompt: str, user_payload: dict, max_tokens: int, label: str) -> dict:
        for attempt in range(16):
            model = self._pick_model()
            eff_max_tokens = min(max_tokens, 900) if "qwen" in model else max_tokens
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False, separators=(",", ":"))},
                ],
                "temperature": 0.1,
                "max_tokens": eff_max_tokens,
                "response_format": {"type": "json_object"},
            }
            if "gpt-oss" in model:
                payload["reasoning_effort"] = "low"

            try:
                resp = requests.post(
                    GROQ_API_URL,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=65,
                )
            except requests.RequestException as exc:
                self._log(f"  [{label}] {model} network error ({type(exc).__name__}), retrying...")
                self.cooldown_until[model] = time.time() + 3.0
                continue

            if resp.status_code == 404:
                self._log(f"  [{label}] {model} unavailable (404), disabling model for run.")
                self.disabled.add(model)
                continue

            if resp.status_code == 400 and "response_format" in payload:
                payload_no_rf = {k: v for k, v in payload.items() if k != "response_format"}
                try:
                    resp = requests.post(
                        GROQ_API_URL,
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                        },
                        json=payload_no_rf,
                        timeout=65,
                    )
                except requests.RequestException:
                    self.cooldown_until[model] = time.time() + 3.0
                    continue

            if resp.status_code == 429:
                wait_s = _parse_wait_seconds(resp, attempt)
                try:
                    err_msg = resp.json().get("error", {}).get("message", resp.text)
                except ValueError:
                    err_msg = resp.text
                body_low = err_msg.lower()
                if ("tokens per day" in body_low or "tpd" in body_low) and not resp.headers.get("retry-after"):
                    wait_s = max(wait_s, 60.0)
                self._log(
                    f"  [{label}] {model} 429 ({err_msg[:120]}) -> cooldown {wait_s:.1f}s, rotating..."
                )
                self.cooldown_until[model] = time.time() + wait_s
                continue

            if resp.status_code >= 500:
                self._log(f"  [{label}] {model} HTTP {resp.status_code}, rotating...")
                self.cooldown_until[model] = time.time() + 5.0
                continue

            if resp.status_code != 200:
                self._log(f"  [{label}] {model} HTTP {resp.status_code}: {resp.text[:180]}")
                self.cooldown_until[model] = time.time() + 5.0
                continue

            # Check remaining tokens header to proactively pace
            rem_tok = resp.headers.get("x-ratelimit-remaining-tokens")
            if rem_tok and rem_tok.isdigit() and int(rem_tok) < 1000:
                self.cooldown_until[model] = time.time() + 10.0

            try:
                choice = resp.json()["choices"][0]
                if choice.get("finish_reason") == "length":
                    self._log(f"  [{label}] {model} output truncated (max_tokens={eff_max_tokens}), will parse partial/retry")
                raw = choice["message"]["content"]
                parsed = json.loads(_strip_json_fences(raw))
                if isinstance(parsed, dict):
                    return parsed
            except (ValueError, KeyError, IndexError, TypeError):
                self._log(f"  [{label}] {model} malformed JSON, retrying...")
                time.sleep(1.5)
                continue

        return {}


class Command(BaseCommand):
    help = (
        "Translate all static UI bundles (22 languages) and all 66 schemes "
        "(data/scheme_translations_cache.json) using GROQ_API_KEY from .env."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--pass",
            dest="which_pass",
            choices=["all", "ui", "schemes"],
            default="all",
            help="Which translation pass to execute (default: all).",
        )
        parser.add_argument(
            "--lang",
            default="all",
            help="Comma-separated target language codes or 'all' (default: all 22 non-English).",
        )
        parser.add_argument(
            "--ui-chunk-size",
            type=int,
            default=40,
            help="Keys per Groq call for static UI translation (default: 40).",
        )
        parser.add_argument(
            "--scheme-batch-size",
            type=int,
            default=5,
            help="Schemes per Groq call for Pass B (default: 5).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-translate even keys/schemes that are already translated/cached.",
        )

    def _get_api_key(self) -> str:
        load_dotenv(Path(settings.BASE_DIR) / ".env")
        api_key = os.getenv("GROQ_API_KEY") or getattr(settings, "GROQ_API_KEY", "") or ""
        api_key = api_key.strip()
        if not api_key:
            raise CommandError(
                "GROQ_API_KEY is not configured in .env. Please set GROQ_API_KEY and re-run."
            )
        return api_key

    def _log(self, msg: str):
        self.stdout.write(msg)
        sys.stdout.flush()

    def _run_pass_a_ui(self, pool: GroqPool, target_langs: list[str], chunk_size: int, force: bool):
        translations_dir = Path(settings.BASE_DIR) / "core" / "translations"
        en_path = translations_dir / "en.json"
        en_bundle = json.loads(en_path.read_text(encoding="utf-8"))
        en_flat = _flatten_bundle(en_bundle)

        self._log(
            f"Pass A: Auditing {len(en_flat)} UI keys across {len(target_langs)} languages..."
        )

        for lang_code in target_langs:
            meta = get_language_meta(lang_code)
            tgt_path = translations_dir / f"{lang_code}.json"
            if tgt_path.exists():
                try:
                    tgt_bundle = json.loads(tgt_path.read_text(encoding="utf-8"))
                except ValueError:
                    tgt_bundle = {}
            else:
                tgt_bundle = {}

            tgt_flat = _flatten_bundle(tgt_bundle)
            pending: dict[str, str] = {}

            for key, en_val in en_flat.items():
                if _should_skip_translation(en_val):
                    continue
                cur_val = tgt_flat.get(key)
                if force or not isinstance(cur_val, str) or not cur_val.strip() or cur_val.strip() == en_val.strip():
                    pending[key] = en_val

            if pending:
                self._log(
                    f"[{lang_code}] ({meta['name']}): {len(pending)} keys to translate in chunks of {chunk_size}..."
                )
                keys = list(pending.keys())
                sys_prompt = (
                    f"You are an expert Indian government localization translator.\n"
                    f"Translate every JSON value from English into {meta['name']} ({meta['native_name']}) "
                    f"using its authentic native {meta['script']} script.\n"
                    f"Strict rules:\n"
                    f"1. Keep ALL JSON keys IDENTICAL.\n"
                    f"2. Keep EVERY {{placeholder}} variable (like {{name}}, {{count}}, {{state}}, {{year}}, {{rate}}, {{months}}, {{code}}, {{dist}}) EXACTLY unchanged in spelling and braces.\n"
                    f"3. Preserve the ₹ symbol, numbers, and acronyms (SC, ST, OBC, EWS, RBI, MSME, EMI, PIN, NPA, PSB, RRB, SCA, NBFC-MFI, PM-SURAJ, JanSamarth, PMEGP, Aadhaar, PAN).\n"
                    f"4. Return ONLY a valid JSON object mapping each key to its translated string."
                )

                for idx in range(0, len(keys), chunk_size):
                    chunk_keys = keys[idx : idx + chunk_size]
                    chunk_payload = {k: pending[k] for k in chunk_keys}
                    label = f"UI:{lang_code}:{idx // chunk_size + 1}/{(len(keys) + chunk_size - 1) // chunk_size}"
                    translated = pool.call_json(
                        system_prompt=sys_prompt,
                        user_payload=chunk_payload,
                        max_tokens=2048,
                        label=label,
                    )
                    missing_keys = [
                        k for k in chunk_keys if not isinstance(translated.get(k), str) or not translated.get(k).strip()
                    ]
                    if missing_keys and len(chunk_keys) > 10:
                        for sub_i in range(0, len(missing_keys), 15):
                            sub_keys = missing_keys[sub_i : sub_i + 15]
                            sub_out = pool.call_json(
                                system_prompt=sys_prompt,
                                user_payload={k: pending[k] for k in sub_keys},
                                max_tokens=900,
                                label=f"{label}-sub",
                            )
                            translated.update(sub_out)
                    updated_count = 0
                    for k in chunk_keys:
                        val = translated.get(k)
                        if isinstance(val, str) and val.strip():
                            tgt_flat[k] = val.strip()
                            updated_count += 1
                    self._log(f"  [{label}] translated {updated_count}/{len(chunk_keys)} keys")
            else:
                self._log(f"[{lang_code}] ({meta['name']}): 0 missing/untranslated keys.")

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
            tgt_path.write_text(formatted, encoding="utf-8")
            if lang_code == "hi":
                fe_hi = Path(settings.BASE_DIR) / "frontend" / "src" / "locales" / "hi.json"
                fe_hi.write_text(formatted, encoding="utf-8")

            self._log(f"  -> Saved {lang_code}.json (placeholder fallbacks={len(fallbacks)})")

    def _run_pass_b_schemes(
        self, pool: GroqPool, target_langs: list[str], batch_size: int, force: bool
    ):
        if LoanScheme.objects.count() < 66:
            call_command("seed_data")

        schemes = list(LoanScheme.objects.all().order_by("code"))
        total_schemes = len(schemes)
        cache_data = load_scheme_translation_cache()

        ordered_langs = []
        if "hi" in target_langs:
            ordered_langs.append("hi")
        for c in PASS_B_LANG_ORDER:
            if c in target_langs and c not in ordered_langs:
                ordered_langs.append(c)
        for c in target_langs:
            if c not in ordered_langs:
                ordered_langs.append(c)

        self._log(
            f"Pass B: Caching {total_schemes} schemes across {len(ordered_langs)} languages (batch_size={batch_size})..."
        )

        for lang_code in ordered_langs:
            meta = get_language_meta(lang_code)
            misses: dict[str, dict] = {}
            cached_count = 0

            for scheme in schemes:
                eng = _extract_english_payload(scheme)
                cache_key = f"{lang_code}:{scheme.code}"
                existing = cache_data.get(cache_key)
                if (
                    not force
                    and isinstance(existing, dict)
                    and isinstance(existing.get("name"), str)
                    and existing["name"].strip()
                    and isinstance(existing.get("overview"), str)
                    and existing["overview"].strip()
                ):
                    cached_count += 1
                else:
                    misses[scheme.code] = eng

            if not misses:
                self._log(
                    f"[{lang_code}] ({meta['name']}): {cached_count}/{total_schemes} schemes already cached."
                )
                continue

            self._log(
                f"[{lang_code}] ({meta['name']}): {cached_count}/{total_schemes} cached, translating {len(misses)} remaining..."
            )

            sys_prompt = (
                f"You are a precise Indian government financial translator.\n"
                f"Translate all values in the given JSON object from English into {meta['name']} "
                f"({meta['native_name']}) using its authentic native {meta['script']} script.\n"
                f"Rules:\n"
                f"1. Keep JSON top-level keys (scheme codes) and field names IDENTICAL.\n"
                f"2. Preserve exact numbers, ₹ amounts, percentages (e.g. 4.0%, 15%–35%), and short codes (SC, ST, OBC, EWS, RBI, MSME, Aadhaar, PAN).\n"
                f"3. Keep list lengths identical for key_highlights, required_documents, and important_notes.\n"
                f"4. Return ONLY valid JSON — no markdown fences, no commentary."
            )

            miss_codes = list(misses.keys())
            translated_now = 0
            failed_codes = []

            for idx in range(0, len(miss_codes), batch_size):
                chunk_codes = miss_codes[idx : idx + batch_size]
                chunk_payload = {code: misses[code] for code in chunk_codes}
                batch_no = idx // batch_size + 1
                total_batches = (len(miss_codes) + batch_size - 1) // batch_size
                label = f"Scheme:{lang_code}:{batch_no}/{total_batches}"

                raw_out = pool.call_json(
                    system_prompt=sys_prompt,
                    user_payload=chunk_payload,
                    max_tokens=3600,
                    label=label,
                )

                missing_in_batch = [
                    c for c in chunk_codes if not isinstance(raw_out.get(c), dict) or not raw_out.get(c)
                ]
                if missing_in_batch and len(chunk_codes) > 1:
                    for sub_idx in range(0, len(missing_in_batch), 2):
                        sub_codes = missing_in_batch[sub_idx : sub_idx + 2]
                        sub_payload = {c: misses[c] for c in sub_codes}
                        sub_out = pool.call_json(
                            system_prompt=sys_prompt,
                            user_payload=sub_payload,
                            max_tokens=2048,
                            label=f"{label}-retry",
                        )
                        raw_out.update(sub_out)

                batch_saved = 0
                for code in chunk_codes:
                    eng = misses[code]
                    raw_item = raw_out.get(code)
                    if isinstance(raw_item, dict) and raw_item:
                        normalized = _normalize_translated_item(eng, raw_item)
                        cache_data[f"{lang_code}:{code}"] = normalized
                        translated_now += 1
                        batch_saved += 1
                    else:
                        failed_codes.append(code)

                if batch_saved > 0:
                    save_scheme_translation_cache(cache_data)
                self._log(
                    f"  [{lang_code}] batch {batch_no}/{total_batches}: saved {batch_saved}/{len(chunk_codes)} "
                    f"(total cached: {cached_count + translated_now}/{total_schemes})"
                )

            if failed_codes:
                self._log(
                    f"  [{lang_code}] Warning: {len(failed_codes)} schemes failed to translate: {failed_codes}"
                )
            else:
                self._log(
                    f"  -> [{lang_code}] Complete: {cached_count + translated_now}/{total_schemes} cached!"
                )

    def handle(self, *args, **options):
        api_key = self._get_api_key()
        which_pass = options["which_pass"]
        raw_lang = str(options["lang"] or "all").strip().lower()
        ui_chunk_size = max(5, min(60, int(options["ui_chunk_size"] or 40)))
        scheme_batch_size = max(1, min(10, int(options["scheme_batch_size"] or 5)))
        force = bool(options["force"])

        if raw_lang == "all":
            target_langs = [c for c in SUPPORTED_LANGUAGES if c != "en"]
        else:
            target_langs = []
            for part in raw_lang.split(","):
                c = part.strip().lower()
                if not c or c == "en":
                    continue
                get_language_meta(c)
                if c not in target_langs:
                    target_langs.append(c)

        if not target_langs:
            raise CommandError("No valid non-English target languages specified.")

        primary_model = getattr(settings, "GROQ_MODEL", "openai/gpt-oss-120b")
        pool = GroqPool(api_key=api_key, primary_model=primary_model, stdout=self.stdout)

        if which_pass in ("all", "ui"):
            self._run_pass_a_ui(pool, target_langs, ui_chunk_size, force)
        if which_pass in ("all", "schemes"):
            self._run_pass_b_schemes(pool, target_langs, scheme_batch_size, force)
