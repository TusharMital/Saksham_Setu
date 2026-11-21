import { useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n.jsx";

export default function Sarthi() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [typing, setTyping] = useState(false);

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

  return (
    <>
      <button className="chat-fab" type="button" aria-label={t("chat.open")} onClick={() => setOpen(!open)}>
        {open ? "×" : "स"}
      </button>
      {open ? (
        <section className="chat-panel" aria-label={t("chat.title")}>
          <header className="actions" style={{ padding: 8 }}>
            <strong>{t("chat.title")}</strong>
            <button className="btn" type="button" onClick={() => setHistory([])}>
              {t("chat.clear")}
            </button>
          </header>
          <div className="chat-log">
            {history.map((m, i) => (
              <div key={i} className={`msg ${m.role === "user" ? "user" : "bot"}`}>
                {m.content}
              </div>
            ))}
            {typing ? <div className="msg bot">{t("chat.typing")}</div> : null}
            <div className="actions">
              {[t("chat.suggest1"), t("chat.suggest2"), t("chat.suggest3")].map((s) => (
                <button key={s} className="btn" type="button" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              aria-label={t("chat.placeholder")}
              placeholder={t("chat.placeholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="btn btn-primary" type="submit">
              {t("chat.send")}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
