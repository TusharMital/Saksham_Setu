import { useState } from "react";
import { useI18n } from "../i18n.jsx";
import { speak, startMic } from "../speech.js";

export default function HelpField({
  name,
  label,
  help,
  type = "text",
  value,
  onChange,
  error,
  options,
  boolean,
  textarea,
}) {
  const { t, speakLang } = useI18n();
  const [bubble, setBubble] = useState(null);

  const show = (e) => {
    const x = e.clientX || (e.touches && e.touches[0].clientX) || 24;
    const y = e.clientY || (e.touches && e.touches[0].clientY) || 24;
    setBubble({ x: Math.min(x + 12, window.innerWidth - 300), y: Math.min(y + 12, window.innerHeight - 160) });
  };

  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        <button
          type="button"
          className="icon-btn"
          style={{ width: 36, height: 36, minWidth: 36, marginLeft: 8, verticalAlign: "middle" }}
          aria-label={`Help: ${label}`}
          onMouseMove={show}
          onClick={show}
        >
          i
        </button>
      </label>
      <div className="field-row">
        {boolean ? (
          <select id={name} value={value ? "yes" : "no"} onChange={(e) => onChange(e.target.value === "yes")}>
            <option value="no">{t("form.no")}</option>
            <option value="yes">{t("form.yes")}</option>
          </select>
        ) : options ? (
          <select id={name} value={value} onChange={(e) => onChange(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : textarea ? (
          <textarea id={name} value={value} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input id={name} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
        )}
        {!boolean && !options && (
          <button
            type="button"
            className="icon-btn"
            aria-label={t("form.mic")}
            onClick={() =>
              startMic((text, err) => {
                if (text) onChange(text.replace(/[^\d.]/g, "").length && type === "number" ? text.replace(/[^\d.]/g, "") : text);
                if (err) onChange(value);
              }, speakLang)
            }
          >
            🎤
          </button>
        )}
      </div>
      {error ? <div className="error">{error}</div> : null}
      {bubble ? (
        <div className="help-bubble" style={{ left: bubble.x, top: bubble.y }} role="tooltip">
          <p>{help}</p>
          <button type="button" onClick={() => speak(help, speakLang)}>
            {t("form.listen")}
          </button>
          <button type="button" onClick={() => setBubble(null)} style={{ marginLeft: 8, background: "#444" }}>
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
