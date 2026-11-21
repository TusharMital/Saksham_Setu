import { useState } from "react";
import { useI18n } from "../i18n.jsx";
import { speak, startMic } from "../speech.js";
import Icon from "./Icon.jsx";

export default function HelpField({
  name,
  label,
  help,
  type = "text",
  value,
  onChange,
  onFocus,
  error,
  options,
  boolean,
  textarea,
  suffix,
  placeholder,
  example,
}) {
  const { t, speakLang } = useI18n();
  const [bubble, setBubble] = useState(false);
  const [listening, setListening] = useState(false);

  // Instant inline validation check
  const isValid = (() => {
    if (error) return false;
    if (boolean) return true;
    if (options && value) return true;
    if (!value && value !== 0) return false;
    const str = String(value).trim();
    if (name === "mobile") return /^[6-9]\d{9}$/.test(str);
    if (name === "pin") return /^\d{6}$/.test(str);
    if (name === "age") {
      const n = Number(str);
      return n >= 18 && n <= 75;
    }
    if (name === "annual_family_income" || name === "loan_amount" || name === "project_cost") {
      const n = Number(str);
      return !isNaN(n) && n > 0;
    }
    if (name === "full_name") return str.length >= 3;
    if (name === "project_description") return str.length >= 10;
    return str.length > 0;
  })();

  const handleMic = () => {
    setListening(true);
    startMic((text) => {
      setListening(false);
      if (text) {
        if (type === "number") {
          const cleaned = text.replace(/[^\d.]/g, "");
          if (cleaned.length) onChange(cleaned);
        } else {
          onChange(text);
        }
      }
    }, speakLang);
  };

  const handleHelpClick = (e) => {
    e.preventDefault();
    if (onFocus) {
      onFocus({ name, label, help, example });
    }
    setBubble(!bubble);
  };

  const handleFocus = () => {
    if (onFocus) {
      onFocus({ name, label, help, example });
    }
  };

  return (
    <label className={`field ${isValid ? "is-valid" : ""}`} htmlFor={name}>
      <span className="field-label-text">
        <strong>{label}</strong>
        {help && <small className="field-hint">({help.slice(0, 36)}...)</small>}
      </span>

      <div className={`input-wrap ${error ? "has-error" : isValid ? "has-valid" : ""}`}>
        {boolean ? (
          <select
            id={name}
            value={value ? "yes" : "no"}
            onChange={(e) => onChange(e.target.value === "yes")}
            onFocus={handleFocus}
          >
            <option value="no">{t("form.no")}</option>
            <option value="yes">{t("form.yes")}</option>
          </select>
        ) : options ? (
          <select
            id={name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : textarea ? (
          <textarea
            id={name}
            rows={3}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
          />
        ) : (
          <input
            id={name}
            type={type}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
          />
        )}

        {suffix && <em className="input-suffix">{suffix}</em>}

        {/* Live Inline Validation Checkmark */}
        {isValid && !boolean && !options && (
          <span className="valid-tick-badge" title="Valid entry">
            <Icon name="check" size={13} />
          </span>
        )}

        {/* Field Tools: Help, Speaker, Mic */}
        <div className="field-tools" aria-label="Field accessibility tools">
          {help && (
            <button
              type="button"
              className="tool-btn"
              onClick={handleHelpClick}
              aria-label={`Show help for ${label}`}
              title="Show guidance"
            >
              <Icon name="help" size={17} />
            </button>
          )}

          {help && (
            <button
              type="button"
              className="tool-btn"
              onClick={() => speak(`${label}. ${help}`, speakLang)}
              aria-label={`Listen to help for ${label}`}
              title={t("form.listen")}
            >
              <Icon name="speaker" size={17} />
            </button>
          )}

          {!boolean && !options && (
            <button
              type="button"
              className={`tool-btn ${listening ? "recording" : ""}`}
              onClick={handleMic}
              aria-label={t("form.mic")}
              title={t("form.mic")}
            >
              <Icon name="mic" size={17} />
            </button>
          )}
        </div>
      </div>

      {error ? <span className="field-error-text">{error}</span> : null}

      {/* Inline popover bubble for small screens or quick reference */}
      {bubble && help && (
        <div className="field-bubble" role="tooltip">
          <p>{help}</p>
          <div className="bubble-actions">
            <button type="button" onClick={() => speak(help, speakLang)}>
              <Icon name="speaker" size={14} /> {t("form.listen")}
            </button>
            <button type="button" onClick={() => setBubble(false)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>
      )}
    </label>
  );
}
