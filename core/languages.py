"""Centralized 23-language registry for Saksham Setu (English + 22 Scheduled Languages of India)."""

from typing import Any

SUPPORTED_LANGUAGES: dict[str, dict[str, Any]] = {
    "en": {
        "code": "en",
        "name": "English",
        "native_name": "English",
        "script": "Latn",
        "direction": "ltr",
        "speech_locale": "en-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "as": {
        "code": "as",
        "name": "Assamese",
        "native_name": "অসমীয়া",
        "script": "Beng",
        "direction": "ltr",
        "speech_locale": "as-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "bn": {
        "code": "bn",
        "name": "Bengali",
        "native_name": "বাংলা",
        "script": "Beng",
        "direction": "ltr",
        "speech_locale": "bn-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "brx": {
        "code": "brx",
        "name": "Bodo",
        "native_name": "बड़ो",
        "script": "Deva",
        "direction": "ltr",
        "speech_locale": "brx-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": False},
    },
    "doi": {
        "code": "doi",
        "name": "Dogri",
        "native_name": "डोगरी",
        "script": "Deva",
        "direction": "ltr",
        "speech_locale": "doi-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": False},
    },
    "gu": {
        "code": "gu",
        "name": "Gujarati",
        "native_name": "ગુજરાતી",
        "script": "Gujr",
        "direction": "ltr",
        "speech_locale": "gu-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "hi": {
        "code": "hi",
        "name": "Hindi",
        "native_name": "हिन्दी",
        "script": "Deva",
        "direction": "ltr",
        "speech_locale": "hi-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "kn": {
        "code": "kn",
        "name": "Kannada",
        "native_name": "ಕನ್ನಡ",
        "script": "Knda",
        "direction": "ltr",
        "speech_locale": "kn-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "ks": {
        "code": "ks",
        "name": "Kashmiri",
        "native_name": "کٲشُر",
        "script": "Arab",
        "direction": "rtl",
        "speech_locale": "ks-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": False},
    },
    "kok": {
        "code": "kok",
        "name": "Konkani",
        "native_name": "कोंकणी",
        "script": "Deva",
        "direction": "ltr",
        "speech_locale": "kok-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": False},
    },
    "mai": {
        "code": "mai",
        "name": "Maithili",
        "native_name": "मैथिली",
        "script": "Deva",
        "direction": "ltr",
        "speech_locale": "mai-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": False},
    },
    "ml": {
        "code": "ml",
        "name": "Malayalam",
        "native_name": "മലയാളം",
        "script": "Mlym",
        "direction": "ltr",
        "speech_locale": "ml-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "mni": {
        "code": "mni",
        "name": "Manipuri",
        "native_name": "ꯃꯩꯇꯩꯂꯣꯟ",
        "script": "Mtei",
        "direction": "ltr",
        "speech_locale": "mni-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": False},
    },
    "mr": {
        "code": "mr",
        "name": "Marathi",
        "native_name": "मराठी",
        "script": "Deva",
        "direction": "ltr",
        "speech_locale": "mr-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "ne": {
        "code": "ne",
        "name": "Nepali",
        "native_name": "नेपाली",
        "script": "Deva",
        "direction": "ltr",
        "speech_locale": "ne-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "or": {
        "code": "or",
        "name": "Odia",
        "native_name": "ଓଡ଼ିଆ",
        "script": "Orya",
        "direction": "ltr",
        "speech_locale": "or-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "pa": {
        "code": "pa",
        "name": "Punjabi",
        "native_name": "ਪੰਜਾਬੀ",
        "script": "Guru",
        "direction": "ltr",
        "speech_locale": "pa-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "sa": {
        "code": "sa",
        "name": "Sanskrit",
        "native_name": "संस्कृतम्",
        "script": "Deva",
        "direction": "ltr",
        "speech_locale": "sa-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": False},
    },
    "sat": {
        "code": "sat",
        "name": "Santali",
        "native_name": "ᱥᱟᱱᱛᱟᱲᱤ",
        "script": "Olck",
        "direction": "ltr",
        "speech_locale": "sat-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": False},
    },
    "sd": {
        "code": "sd",
        "name": "Sindhi",
        "native_name": "سنڌي",
        "script": "Arab",
        "direction": "rtl",
        "speech_locale": "sd-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": False},
    },
    "ta": {
        "code": "ta",
        "name": "Tamil",
        "native_name": "தமிழ்",
        "script": "Taml",
        "direction": "ltr",
        "speech_locale": "ta-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "te": {
        "code": "te",
        "name": "Telugu",
        "native_name": "తెలుగు",
        "script": "Telu",
        "direction": "ltr",
        "speech_locale": "te-IN",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
    "ur": {
        "code": "ur",
        "name": "Urdu",
        "native_name": "اردو",
        "script": "Arab",
        "direction": "rtl",
        "speech_locale": "ur-PK",
        "capabilities": {"ui_translation": True, "groq_chat": True, "browser_tts_hint": True},
    },
}


def get_language_meta(code: str) -> dict[str, Any]:
    """Validate language code strictly against SUPPORTED_LANGUAGES and return a copy of its metadata."""
    if not isinstance(code, str):
        raise ValueError("Language code must be a string.")
    normalized = code.strip().lower()
    if normalized not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language code: {code!r}")
    meta = SUPPORTED_LANGUAGES[normalized]
    return {**meta, "capabilities": dict(meta["capabilities"])}


def list_supported_languages() -> list[dict[str, Any]]:
    """Return metadata dictionaries for all 23 supported languages."""
    return [get_language_meta(code) for code in SUPPORTED_LANGUAGES]


SCRIPT_RANGES: dict[str, tuple[tuple[int, int], ...]] = {
    "Deva": ((0x0900, 0x097F), (0xA8E0, 0xA8FF), (0x1CD0, 0x1CFF)),
    "Beng": ((0x0980, 0x09FF),),
    "Guru": ((0x0A00, 0x0A7F),),
    "Gujr": ((0x0A80, 0x0AFF),),
    "Orya": ((0x0B00, 0x0B7F),),
    "Taml": ((0x0B80, 0x0BFF),),
    "Telu": ((0x0C00, 0x0C7F),),
    "Knda": ((0x0C80, 0x0CFF),),
    "Mlym": ((0x0D00, 0x0D7F),),
    "Arab": ((0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)),
    "Mtei": ((0xABC0, 0xABFF), (0xAAE0, 0xAAFF)),
    "Olck": ((0x1C50, 0x1C7F),),
}


def is_script_char(ch: str, script: str) -> bool:
    """Return True if character `ch` falls within the Unicode block(s) for `script`."""
    ranges = SCRIPT_RANGES.get(script)
    if not ranges or not ch:
        return False
    cp = ord(ch)
    return any(lo <= cp <= hi for lo, hi in ranges)
