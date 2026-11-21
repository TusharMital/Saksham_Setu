import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n.jsx";
import { speak, startMic } from "../speech.js";
import Icon from "./Icon.jsx";

export default function Sarthi() {
  const { t, lang, speakLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [typing, setTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const chatLogRef = useRef(null);

  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [history, typing, open]);

  const send = async (text) => {
    const message = (text || input).trim();
    if (!message) return;
    const next = [...history, { role: "user", content: message }];
    setHistory(next);
    setInput("");
    setTyping(true);
    try {
      const data = await api.chat({ message, history: next.slice(-6), language: lang });
      setHistory([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      const body = e.body || {};
      setHistory([...next, { role: "assistant", content: body.message || e.message }]);
    } finally {
      setTyping(false);
    }
  };

  const handleMic = () => {
    setRecording(true);
    startMic((transcript) => {
      setRecording(false);
      if (transcript) {
        setInput(transcript);
      }
    }, speakLang);
  };

  return (
    <div className={`chatbot-widget ${open ? "open" : ""}`}>
      {/* Floating Action Button (FAB) with gentle pulse ring */}
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
                <i className="online-dot" /> {lang === "hi" ? "सहायक सक्रिय" : "Here to guide you"}
              </small>
            </div>
            <div className="chat-head-actions">
              <button
                type="button"
                className="clear-btn"
                onClick={() => setHistory([])}
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
                <p>
                  {lang === "hi"
                    ? "नमस्ते! मैं सारथी हूँ। मैं आपको योजनाएँ खोजने, आवश्यक दस्तावेज़ समझने और ऋण आवेदन में सहायता कर सकता हूँ।"
                    : "Namaste! I’m Sarthi, your GovTech scheme advisor. Ask me anything about loans, subsidies, documents, or bank branches."}
                </p>
                <button
                  type="button"
                  className="speech-listen-btn"
                  onClick={() =>
                    speak(
                      lang === "hi"
                        ? "नमस्ते! मैं सारथी हूँ। ऋण, सब्सिडी या बैंक के बारे में पूछें।"
                        : "Namaste! I am Sarthi. Ask me about loans, subsidies, or bank partners.",
                      speakLang
                    )
                  }
                >
                  <Icon name="speaker" size={14} /> {lang === "hi" ? "सुनें" : "Listen"}
                </button>
              </div>
            </div>

            {history.map((m, i) => (
              <div key={i} className={`chat-bubble-row ${m.role === "user" ? "user-row" : "bot-row"}`}>
                <div className={`chat-bubble ${m.role === "user" ? "user-bubble" : "bot-bubble"}`}>
                  <p>{m.content}</p>
                  {m.role === "assistant" && (
                    <button
                      type="button"
                      className="speech-listen-btn"
                      onClick={() => speak(m.content, speakLang)}
                      aria-label="Listen to message"
                    >
                      <Icon name="speaker" size={13} /> {lang === "hi" ? "सुनें" : "Listen"}
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
              aria-label="Speak into microphone"
            >
              <Icon name="mic" size={18} />
            </button>
            <input
              aria-label={t("chat.placeholder")}
              placeholder={t("chat.placeholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="chat-send-btn" type="submit" disabled={!input.trim()}>
              <Icon name="send" size={18} />
            </button>
          </form>

          <div className="chat-disclaimer">
            <small>{t("chat.note")}</small>
          </div>
        </section>
      ) : null}
    </div>
  );
}
