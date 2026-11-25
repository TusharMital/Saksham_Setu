import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n.jsx";
import Icon from "./Icon.jsx";

const HELP_BUBBLE_EVENT = "ss-help-bubble-open";

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
  suffix,
  placeholder,
  example,
}) {
  const { t } = useI18n();
  const [bubble, setBubble] = useState(false);
  const fieldRef = useRef(null);

  // Close when another HelpField opens, clicking outside, or pressing Escape
  useEffect(() => {
    const onOtherOpen = (e) => {
      if (e.detail !== name) {
        setBubble(false);
      }
    };
    window.addEventListener(HELP_BUBBLE_EVENT, onOtherOpen);
    return () => window.removeEventListener(HELP_BUBBLE_EVENT, onOtherOpen);
  }, [name]);

  useEffect(() => {
    if (!bubble) return undefined;
    const onOutsideClick = (e) => {
      if (fieldRef.current && !fieldRef.current.contains(e.target)) {
        setBubble(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setBubble(false);
      }
    };
    document.addEventListener("mousedown", onOutsideClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [bubble]);

  // Instant inline validation check
  const isValid = (() => {
    if (error) return false;
    if (boolean) return true;
    if (options && value) return true;
    if (!value && value !== 0) return false;
    const str = String(value).trim();
    if (name === "mobile") return /^[6-9]\d{9}$/.test(str);
    if (name === "pin") return /^[1-9]\d{5}$/.test(str);
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

  const handleHelpClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBubble((prev) => {
      const next = !prev;
      if (next) {
        window.dispatchEvent(new CustomEvent(HELP_BUBBLE_EVENT, { detail: name }));
      }
      return next;
    });
  };

  return (
    <div ref={fieldRef} className={`field ${isValid ? "is-valid" : ""}`}>
      <label className="field-label-text" htmlFor={name}>
        <strong>{label}</strong>
        {help && <small className="field-hint">({help.slice(0, 36)}...)</small>}
      </label>

      <div className={`input-wrap ${error ? "has-error" : isValid ? "has-valid" : ""}`}>
        {boolean ? (
          <select
            id={name}
            value={value ? "yes" : "no"}
            onChange={(e) => onChange(e.target.value === "yes")}
          >
            <option value="no">{t("form.no")}</option>
            <option value="yes">{t("form.yes")}</option>
          </select>
        ) : options ? (
          <select
            id={name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
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
          />
        ) : (
          <input
            id={name}
            type={type}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {suffix && <em className="input-suffix">{suffix}</em>}

        {/* Live Inline Validation Checkmark */}
        {isValid && !boolean && !options && (
          <span className="valid-tick-badge" title="Valid entry">
            <Icon name="check" size={13} />
          </span>
        )}

        {/* Single click-only ? help button */}
        {help && (
          <div className="field-tools">
            <button
              type="button"
              className={`tool-btn ${bubble ? "active" : ""}`}
              onClick={handleHelpClick}
              aria-expanded={bubble}
              aria-label={`Show help for ${label}`}
              title="Toggle field guidance"
            >
              <Icon name="help" size={17} />
            </button>
          </div>
        )}
      </div>

      {error ? <span className="field-error-text">{error}</span> : null}

      {/* Strictly click-only inline help bubble directly beneath this field */}
      {bubble && help && (
        <div className="field-bubble" role="dialog" aria-label={`Help: ${label}`}>
          <p>{help}</p>
          {example && <small className="bubble-example">{example}</small>}
          <div className="bubble-actions">
            <span />
            <button type="button" onClick={() => setBubble(false)} aria-label="Close help">
              <Icon name="close" size={14} /> Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
