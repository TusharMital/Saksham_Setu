export function speak(text, lang) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang || "en-IN";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
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
