import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n.jsx";
import {
  speak,
  cancelSpeech,
  startMic,
  hasSpeechRecognition,
  hasSpeechSynthesis,
  getVoiceStatus,
} from "../speech.js";
import Icon from "./Icon.jsx";

const AUTO_SPEAK_KEY = "ss-sarthi-autospeak";

export default function Sarthi() {
  const { t, lang, speakLang, currentLanguageMeta } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [typing, setTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micNotice, setMicNotice] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      return localStorage.getItem(AUTO_SPEAK_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [speakingId, setSpeakingId] = useState(null);
  const [voiceInfo, setVoiceInfo] = useState(() => getVoiceStatus(speakLang));

  const chatLogRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [history, typing, open]);

  useEffect(() => {
    const refresh = () => setVoiceInfo(getVoiceStatus(speakLang));
    refresh();
    if (!hasSpeechSynthesis()) return undefined;
    const synth = window.speechSynthesis;
    synth.addEventListener?.("voiceschanged", refresh);
    return () => synth.removeEventListener?.("voiceschanged", refresh);
  }, [speakLang]);

  useEffect(() => {
    if (!open) {
      cancelSpeech();
      setSpeakingId(null);
    }
  }, [open]);

  const toggleAutoSpeak = () => {
    setAutoSpeak((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUTO_SPEAK_KEY, String(next));
      } catch {
        /* ignore */
      }
      if (!next) {
        cancelSpeech();
        setSpeakingId(null);
      }
      return next;
    });
  };

  const speakMessage = (id, text) => {
    if (speakingId === id) {
      cancelSpeech();
      setSpeakingId(null);
      return;
    }
    const res = speak(text, speakLang, {
      onStart: () => setSpeakingId(id),
      onEnd: () => setSpeakingId((curr) => (curr === id ? null : curr)),
      onNoVoice: () => setSpeakingId(null),
    });
    if (!res.spoken) {
      setSpeakingId(null);
    }
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message) return;
    setMicNotice("");
    const next = [...history, { role: "user", content: message }];
    setHistory(next);
    setInput("");
    setTyping(true);
    try {
      const data = await api.chat({
        message,
        history: next.slice(-6),
        lang,
        language: lang,
      });
      const updated = [...next, { role: "assistant", content: data.reply }];
      setHistory(updated);
      if (autoSpeak && voiceInfo.available && data.reply) {
        speakMessage(updated.length - 1, data.reply);
      }
    } catch (e) {
      const body = e.body || {};
      setHistory([...next, { role: "assistant", content: body.message || e.message }]);
    } finally {
      setTyping(false);
    }
  };

  const handleMic = () => {
    if (recording && recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore */
      }
      setRecording(false);
      return;
    }

    if (!hasSpeechRecognition()) {
      setMicNotice("Voice input is not supported in this browser. Please type your question.");
      return;
    }

    setMicNotice("");
    setRecording(true);
    recRef.current = startMic(
      (transcript, errMsg) => {
        setRecording(false);
        if (errMsg) {
          setMicNotice(errMsg);
          return;
        }
        if (transcript) {
          setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
        }
      },
      speakLang,
      {
        onEnd: () => setRecording(false),
      }
    );
  };

  const welcomeText =
    lang === "hi"
      ? "नमस्ते! मैं सारथी हूँ। मैं आपको योजनाएँ खोजने, आवश्यक दस्तावेज़ समझने और ऋण आवेदन में सहायता कर सकता हूँ।"
      : "Namaste! I’m Sarthi, your GovTech scheme advisor. Ask me anything about loans, subsidies, documents, or bank branches.";

  return (
    <div className={`chatbot-widget ${open ? "open" : ""}`}>
      {/* Floating Action Button (FAB) */}
      <button
        className="chat-fab"
        type="button"
        aria-label={open ? t("chat.close") : t("chat.open")}
        onClick={() => setOpen(!open)}
      >
        <span className="fab-pulse-ring" aria-hidden="true" />
        <span className="fab-icon">
          <Icon name={open ? "close" : "bot"} size={24} />
        </span>
        <span className="fab-copy">
          <strong>{t("chat.open")}</strong>
          <small>{t("chat.subtitle")}</small>
        </span>
      </button>

      {/* Floating Chat Drawer Panel */}
      {open ? (
        <section className="chat-drawer" aria-label={t("chat.title")}>
          <header className="chat-head">
            <span className="bot-avatar">
              <Icon name="bot" size={22} />
            </span>
            <div className="bot-meta">
              <strong>{t("chat.title")}</strong>
              <small>
                <i className="online-dot" />{" "}
                <span dir={currentLanguageMeta.direction}>{currentLanguageMeta.native_name}</span>
              </small>
            </div>
            <div className="chat-head-actions">
              <button
                type="button"
                className={`autospeak-btn ${autoSpeak ? "active" : ""}`}
                onClick={toggleAutoSpeak}
                aria-pressed={autoSpeak}
                aria-label={autoSpeak ? "Turn off auto-speak" : "Turn on auto-speak"}
                title={
                  !voiceInfo.available
                    ? `No browser voice for ${currentLanguageMeta.name} (${speakLang})`
                    : autoSpeak
                      ? "Auto-speak ON (click to disable)"
                      : "Auto-speak OFF (click to enable)"
                }
              >
                <Icon name="speaker" size={15} />
                <span>{autoSpeak ? "Auto" : "Mute"}</span>
              </button>
              <button
                type="button"
                className="clear-btn"
                onClick={() => {
                  cancelSpeech();
                  setSpeakingId(null);
                  setHistory([]);
                }}
                aria-label={t("chat.clear")}
                title={t("chat.clear")}
              >
                <Icon name="refresh" size={16} />
              </button>
              <button
                type="button"
                className="close-btn"
                onClick={() => setOpen(false)}
                aria-label={t("chat.close")}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          </header>

          <div className="chat-body" ref={chatLogRef}>
            <div className="chat-welcome">
              <div className="bot-msg">
                <p>{welcomeText}</p>
                {voiceInfo.available && (
                  <button
                    type="button"
                    className="speech-listen-btn"
                    onClick={() => speakMessage("welcome", welcomeText)}
                  >
                    <Icon name={speakingId === "welcome" ? "close" : "speaker"} size={14} />{" "}
                    {speakingId === "welcome" ? "Stop" : lang === "hi" ? "सुनें" : "Listen"}
                  </button>
                )}
              </div>
            </div>

            {history.map((m, i) => (
              <div key={i} className={`chat-bubble-row ${m.role === "user" ? "user-row" : "bot-row"}`}>
                <div className={`chat-bubble ${m.role === "user" ? "user-bubble" : "bot-bubble"}`}>
                  <p>{m.content}</p>
                  {m.role === "assistant" && voiceInfo.available && (
                    <button
                      type="button"
                      className="speech-listen-btn"
                      onClick={() => speakMessage(i, m.content)}
                      aria-label={speakingId === i ? "Stop reading message" : "Replay message aloud"}
                    >
                      <Icon name={speakingId === i ? "close" : "speaker"} size={13} />{" "}
                      {speakingId === i ? "Stop" : "Replay"}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {typing && (
              <div className="chat-bubble-row bot-row">
                <div className="chat-bubble bot-bubble typing-bubble">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}

            {history.length === 0 && (
              <div className="chat-suggestions-box">
                <span className="suggestions-label">
                  {lang === "hi" ? "सुझाए गए प्रश्न:" : "Suggested Questions:"}
                </span>
                {[t("chat.suggest1"), t("chat.suggest2"), t("chat.suggest3")].map((s) => (
                  <button key={s} className="suggestion-pill" type="button" onClick={() => send(s)}>
                    <span>{s}</span>
                    <Icon name="chevron" size={14} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {micNotice && (
            <div className="chat-mic-notice" role="status">
              <small>{micNotice}</small>
            </div>
          )}

          <form
            className="chat-input-bar"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <button
              type="button"
              className={`chat-mic-btn ${recording ? "recording" : ""}`}
              onClick={handleMic}
              aria-label={recording ? "Stop voice recording" : "Start voice input"}
              title={recording ? "Tap to stop listening" : `Speak (${speakLang})`}
            >
              <Icon name="mic" size={18} />
            </button>
            <input
              aria-label={t("chat.placeholder")}
              placeholder={recording ? "Listening..." : t("chat.placeholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="chat-send-btn" type="submit" disabled={!input.trim()}>
              <Icon name="send" size={18} />
            </button>
          </form>

          <div className="chat-disclaimer">
            <small>
              {t("chat.note")}
              {!voiceInfo.available ? ` • Voice playback unavailable for ${currentLanguageMeta.name}` : ""}
            </small>
          </div>
        </section>
      ) : null}
    </div>
  );
}
