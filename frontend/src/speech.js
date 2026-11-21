export function speak(text, lang, options = {}) {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  try {
    window.speechSynthesis.cancel();
  } catch {}
  if (!text) return null;

  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang || "en-IN";
  u.rate = 0.95;
  if (options.onStart) u.onstart = options.onStart;
  if (options.onEnd) {
    u.onend = options.onEnd;
    u.onerror = options.onEnd;
  }
  try {
    window.speechSynthesis.speak(u);
  } catch {}
  return u;
}

export function cancelSpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
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
      } catch {}
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
      const stateText = opt ? (lang === "hi" ? `चयनित: ${opt}` : `Selected: ${opt}`) : "";
      return [label, stateText].filter(Boolean).join(". ").trim();
    }

    if (el.type === "checkbox" || el.type === "radio") {
      const stateText = el.checked
        ? (lang === "hi" ? "चयनित" : "checked")
        : (lang === "hi" ? "अचयनित" : "not checked");
      return [label, stateText].filter(Boolean).join(", ").trim();
    }

    if (el.type === "button" || el.type === "submit") {
      return (el.value || label || el.innerText || "").replace(/\s+/g, " ").trim();
    }

    let val = el.value ? (lang === "hi" ? `मान: ${el.value}` : `Value: ${el.value}`) : "";
    if (!val && el.placeholder) {
      val = lang === "hi" ? `संकेत: ${el.placeholder}` : `Placeholder: ${el.placeholder}`;
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

export function startMic(onResult, lang) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) {
    onResult("", "Voice input is not available on this browser.");
    return null;
  }
  const rec = new Rec();
  rec.lang = lang || "en-IN";
  rec.interimResults = false;
  rec.onresult = (e) => onResult(e.results[0][0].transcript, null);
  rec.onerror = () => onResult("", "Could not hear. Please type instead.");
  rec.start();
  return rec;
}
