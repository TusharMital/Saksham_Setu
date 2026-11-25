"""Static i18n bundle validation and placeholder integrity helpers."""

import re
from typing import Any

PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z0-9_]+)\}")


def extract_placeholders(text: Any) -> list[str]:
    """Return sorted list of `{var}` placeholders found in text."""
    if not isinstance(text, str):
        return []
    return sorted(f"{{{name}}}" for name in PLACEHOLDER_RE.findall(text))


def _validate_node(source: Any, target: Any, path: str, errors: list[str]) -> None:
    if isinstance(source, dict):
        if not isinstance(target, dict):
            errors.append(f"{path or '<root>'}: expected object, got {type(target).__name__}")
            return
        for key, src_val in source.items():
            child_path = f"{path}.{key}" if path else str(key)
            if key not in target:
                errors.append(f"{child_path}: missing key")
                continue
            _validate_node(src_val, target[key], child_path, errors)
        return

    if isinstance(source, list):
        if not isinstance(target, list):
            errors.append(f"{path}: expected list, got {type(target).__name__}")
            return
        if len(target) != len(source):
            errors.append(f"{path}: expected {len(source)} items, got {len(target)}")
            return
        for idx, (src_item, tgt_item) in enumerate(zip(source, target)):
            _validate_node(src_item, tgt_item, f"{path}[{idx}]", errors)
        return

    if isinstance(source, str):
        if not isinstance(target, str) or not target.strip():
            errors.append(f"{path}: missing or empty string")
            return
        src_ph = extract_placeholders(source)
        tgt_ph = extract_placeholders(target)
        if src_ph != tgt_ph:
            errors.append(f"{path}: placeholder mismatch (expected {src_ph}, got {tgt_ph})")


def validate_bundle(source_dict: dict[str, Any], target_dict: dict[str, Any]) -> list[str]:
    """Verify every key in source_dict exists in target_dict and all `{var}` placeholders match exactly.

    Returns a list of error strings; an empty list means the bundle passed validation.
    """
    errors: list[str] = []
    _validate_node(source_dict, target_dict, "", errors)
    return errors


def sanitize_bundle_with_fallback(
    source_dict: dict[str, Any], target_dict: dict[str, Any]
) -> tuple[dict[str, Any], list[str]]:
    """Repair target_dict using source_dict ONLY for individual keys that fail key/placeholder checks.

    Returns (repaired_bundle, fallback_keys).
    """
    fallbacks: list[str] = []

    def _repair(src: Any, tgt: Any, path: str) -> Any:
        if isinstance(src, dict):
            if not isinstance(tgt, dict):
                fallbacks.append(path or "<root>")
                return dict(src)
            out = {}
            for key, src_val in src.items():
                child_path = f"{path}.{key}" if path else str(key)
                if key not in tgt:
                    fallbacks.append(child_path)
                    out[key] = src_val
                else:
                    out[key] = _repair(src_val, tgt[key], child_path)
            return out

        if isinstance(src, list):
            if not isinstance(tgt, list) or len(tgt) != len(src):
                fallbacks.append(path)
                return list(src)
            return [_repair(s_item, t_item, f"{path}[{idx}]") for idx, (s_item, t_item) in enumerate(zip(src, tgt))]

        if isinstance(src, str):
            if not isinstance(tgt, str) or not tgt.strip():
                fallbacks.append(path)
                return src
            if extract_placeholders(src) != extract_placeholders(tgt):
                fallbacks.append(path)
                return src
            return tgt

        return tgt if tgt is not None else src

    repaired = _repair(source_dict, target_dict, "")
    return repaired, fallbacks
