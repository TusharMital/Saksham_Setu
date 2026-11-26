"""Shared helper to load sanitized i18n template sections from core/translations/<lang>.json."""

import json
from functools import lru_cache
from pathlib import Path

from core.i18n_validator import sanitize_bundle_with_fallback
from core.languages import SUPPORTED_LANGUAGES

TRANSLATIONS_DIR = Path(__file__).resolve().parent / "translations"


@lru_cache(maxsize=128)
def _load_section_from_disk(section_name: str, lang_code: str) -> dict:
    en_path = TRANSLATIONS_DIR / "en.json"
    en_section = {}
    if en_path.exists():
        try:
            en_data = json.loads(en_path.read_text(encoding="utf-8"))
            if isinstance(en_data.get(section_name), dict):
                en_section = en_data[section_name]
        except (OSError, ValueError):
            pass

    if lang_code == "en":
        return en_section

    tgt_path = TRANSLATIONS_DIR / f"{lang_code}.json"
    if not tgt_path.exists():
        return en_section
    try:
        tgt_data = json.loads(tgt_path.read_text(encoding="utf-8"))
        tgt_section = tgt_data.get(section_name) if isinstance(tgt_data.get(section_name), dict) else {}
        repaired, _ = sanitize_bundle_with_fallback(en_section, tgt_section)
        return repaired
    except (OSError, ValueError):
        return en_section


def get_section_templates(section_name: str, defaults: dict[str, str], lang: str = "en") -> dict[str, str]:
    """Return a merged dictionary of localized templates for `section_name`, safe against missing keys."""
    code = str(lang or "en").strip().lower()
    if code not in SUPPORTED_LANGUAGES:
        code = "en"
    disk_en = _load_section_from_disk(section_name, "en")
    base = {**defaults, **disk_en}
    if code == "en":
        return base
    disk_tgt = _load_section_from_disk(section_name, code)
    repaired, _ = sanitize_bundle_with_fallback(base, disk_tgt)
    return repaired


def fmt_tpl(tpl: str, **kwargs) -> str:
    out = str(tpl)
    for k, v in kwargs.items():
        out = out.replace(f"{{{k}}}", str(v))
    return out
