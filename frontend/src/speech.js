/**
 * Upgraded accessibility speech controller with independent TTS/STT capability
 * detection and strict locale voice matching (never falls back to English for
 * non-English scripts).
 */

export function hasSpeechSynthesis() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

export function hasSpeechRecognition() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export function getSpeechCapabilities() {
  return {
    tts: hasSpeechSynthesis(),
    stt: hasSpeechRecognition(),
  };
}

function normalizeTag(tag) {
  return String(tag || "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();
}

function isEnglishLocale(locale) {
  return normalizeTag(locale).split("-")[0] === "en";
}

export function getAvailableVoices() {
  if (!hasSpeechSynthesis()) return [];
  try {
    return window.speechSynthesis.getVoices() || [];
  } catch {
    return [];
  }
}

/**
 * Exact first, then primary-subtag prefix match for `speechLocale`.
 * Never returns an English voice when `speechLocale` is non-English.
 */
export function findVoice(speechLocale, voices) {
  const list = Array.isArray(voices) ? voices : getAvailableVoices();
  if (!list.length) return null;

  const target = normalizeTag(speechLocale || "en-IN");
  const primary = target.split("-")[0];
  if (!primary) return null;

  // 1. Exact locale tag match (e.g. hi-in === hi-in)
  const exact = list.find((v) => normalizeTag(v.lang) === target);
  if (exact) return exact;

  // 2. Primary language subtag match (e.g. ur-in matches ur-pk, ta matches ta-in)
  const prefixMatch = list.find((v) => {
    const vLang = normalizeTag(v.lang);
    return vLang === primary || vLang.startsWith(`${primary}-`);
  });
  if (prefixMatch) return prefixMatch;

  // Never fall back to English for non-English scripts
  return null;
}

export function getVoiceStatus(speechLocale) {
  if (!hasSpeechSynthesis()) {
    return { supported: false, available: false, voice: null };
  }
  const voices = getAvailableVoices();
  const voice = findVoice(speechLocale, voices);
  if (voice) {
    return { supported: true, available: true, voice };
  }
  if (voices.length === 0 && isEnglishLocale(speechLocale)) {
    return { supported: true, available: true, voice: null };
  }
  return { supported: true, available: false, voice: null };
}

export function cancelSpeech() {
  if (!hasSpeechSynthesis()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export function speak(text, speechLocale, options = {}) {
  cancelSpeech();
  if (!text || !hasSpeechSynthesis()) {
    options.onNoVoice?.("unsupported");
    options.onEnd?.();
    return { spoken: false, reason: "unsupported", utterance: null };
  }

  const { available, voice } = getVoiceStatus(speechLocale);
  if (!available) {
    options.onNoVoice?.("no_voice");
    options.onEnd?.();
    return { spoken: false, reason: "no_voice", utterance: null };
  }

  try {
    const u = new window.SpeechSynthesisUtterance(String(text));
    u.lang = voice?.lang || speechLocale || "en-IN";
    if (voice) u.voice = voice;
    u.rate = options.rate || 0.95;
    if (options.onStart) u.onstart = options.onStart;
    if (options.onEnd) {
      u.onend = options.onEnd;
      u.onerror = options.onEnd;
    }
    window.speechSynthesis.speak(u);
    return { spoken: true, reason: null, utterance: u };
  } catch {
    options.onEnd?.();
    return { spoken: false, reason: "error", utterance: null };
  }
}

export function extractReadableText(el, lang = "en") {
  if (!el) return "";

  const dataSpeak = el.getAttribute?.("data-speak");
  if (dataSpeak) return dataSpeak.trim();

  const tagName = el.tagName ? el.tagName.toLowerCase() : "";

  if (tagName === "input" || tagName === "select" || tagName === "textarea") {
    let label = "";
    if (el.id && typeof document !== "undefined") {
      try {
        const escapedId = window.CSS?.escape ? window.CSS.escape(el.id) : el.id;
        const labelEl = document.querySelector(`label[for="${escapedId}"]`);
        if (labelEl) label = labelEl.innerText || labelEl.textContent || "";
      } catch {
        /* ignore */
      }
    }
    if (!label && el.closest) {
      const parentLabel = el.closest("label");
      if (parentLabel) label = parentLabel.innerText || parentLabel.textContent || "";
    }
    if (!label && el.getAttribute && typeof document !== "undefined") {
      const ariaLabelledBy = el.getAttribute("aria-labelledby");
      if (ariaLabelledBy) {
        const lb = document.getElementById(ariaLabelledBy);
        if (lb) label = lb.innerText || lb.textContent || "";
      }
    }
    if (!label && el.getAttribute) {
      label = el.getAttribute("aria-label") || "";
    }
    label = label.replace(/\s+/g, " ").trim();

    if (tagName === "select") {
      const opt = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex]?.text : "";
      const stateText = opt ? (lang === "hi" ? `चयनित: ${opt}` : opt) : "";
      return [label, stateText].filter(Boolean).join(". ").trim();
    }

    if (el.type === "checkbox" || el.type === "radio") {
      const stateText = el.checked
        ? lang === "hi"
          ? "चयनित"
          : "checked"
        : lang === "hi"
          ? "अचयनित"
          : "not checked";
      return [label, stateText].filter(Boolean).join(", ").trim();
    }

    if (el.type === "button" || el.type === "submit") {
      return (el.value || label || el.innerText || "").replace(/\s+/g, " ").trim();
    }

    let val = el.value ? String(el.value) : "";
    if (!val && el.placeholder) {
      val = String(el.placeholder);
    }
    return [label, val].filter(Boolean).join(". ").trim();
  }

  const ariaLabel = el.getAttribute?.("aria-label");
  if (ariaLabel) return ariaLabel.trim();

  const rawText = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  if (rawText) return rawText;

  const title = el.getAttribute?.("title");
  if (title) return title.trim();

  return "";
}

export function startMic(onResult, speechLocale, options = {}) {
  const Rec =
    typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!Rec) {
    onResult("", "Voice input is not supported in this browser. Please type your question.");
    return null;
  }

  try {
    const rec = new Rec();
    rec.lang = speechLocale || "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => options.onStart?.();
    rec.onresult = (e) => {
      const transcript = e?.results?.[0]?.[0]?.transcript || "";
      onResult(transcript, null);
    };
    rec.onerror = (e) => {
      const errCode = e?.error || "";
      if (errCode === "not-allowed" || errCode === "service-not-allowed") {
        onResult("", "Microphone permission denied. You can still type your message.");
      } else if (errCode === "no-speech") {
        onResult("", "No speech detected. Tap the mic and try again, or type your message.");
      } else {
        onResult("", "Voice recognition could not complete. Please type instead.");
      }
    };
    rec.onend = () => options.onEnd?.();
    rec.start();
    return rec;
  } catch {
    onResult("", "Could not start voice input. Please type instead.");
    return null;
  }
}
