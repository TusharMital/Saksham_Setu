import { useState, useEffect } from "react";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useI18n } from "../i18n.jsx";

const SAMPLES = [
  { ref: "SS-2026-10001", labelKey: "sampleApproved" },
  { ref: "SS-2026-10002", labelKey: "sampleRefused" },
  { ref: "SS-2026-10003", labelKey: "sampleDocs" },
  { ref: "SS-2026-10004", labelKey: "sampleField" },
];

export default function Tracker() {
  const { t } = useI18n();
  const [ref, setRef] = useState("SS-2026-10001");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchStatus = async (targetRef) => {
    const code = (targetRef || ref).trim();
    if (!code) return;
    setBusy(true);
    try {
      const res = await api.application(code);
      setData(res);
      setError("");
    } catch (e) {
      setData(null);
      setError(e.body?.detail || e.message || "Application not found.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    fetchStatus("SS-2026-10001");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-shell">
      {/* Title */}
      <div className="page-title">
        <span className="eyebrow">APPLICATION TRACKER</span>
        <h1>{t("track.title")}</h1>
        <p>{t("track.subtitle")}</p>
      </div>

      {/* Quick Test Demo Chips */}
      <div className="quick-demos-box">
        <span className="quick-title-label">{t("track.quickTitle")}</span>
        <div className="quick-buttons-row">
          {SAMPLES.map((s) => (
            <button
              key={s.ref}
              type="button"
              className={`demo-pill-btn ${ref === s.ref ? "active" : ""}`}
              onClick={() => {
                setRef(s.ref);
                fetchStatus(s.ref);
              }}
            >
              <strong>{t(`track.${s.labelKey}`)}</strong>
              <small>{s.ref}</small>
            </button>
          ))}
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="track-search-bar">
        <div className="search-wrap-full">
          <Icon name="search" size={20} />
          <input
            aria-label={t("track.title")}
            placeholder={t("track.placeholder")}
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") fetchStatus();
            }}
          />
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => fetchStatus()}
            disabled={busy}
          >
            <span>{busy ? "..." : t("track.go")}</span>
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="error-banner" style={{ marginTop: "1rem" }}>
          <Icon name="alert" size={18} />
          <p>{error}</p>
        </div>
      ) : null}

      {/* Loading Skeleton Indicator */}
      {busy && (
        <div className="tracker-skeleton-card animate-pulse">
          <div className="skeleton-line w-40" />
          <div className="skeleton-line w-80" />
          <div className="skeleton-box" />
        </div>
      )}

      {/* Detailed Application Result */}
      {data && !busy && (
        <div className="tracker-result-area animate-fade-in">
          {/* Summary Card */}
          <section className="application-summary-card">
            <div className="summary-col">
              <small>APPLICATION</small>
              <strong>{data.application.applicant_name}</strong>
              <span>
                {data.application.scheme_code} • ₹{Number(data.application.loan_amount || 1000000).toLocaleString("en-IN")}
              </span>
            </div>

            <div className="summary-col">
              <small>PARTNER BANK & BRANCH</small>
              <strong>{data.application.partner}</strong>
              <span>Ref: {data.application.ref_no}</span>
            </div>

            <div className="summary-col status-col">
              <span className={`status-tag ${data.application.status === "rejected" ? "bad" : data.pending_document ? "amber" : "good"}`}>
                {data.application.status.toUpperCase()}
              </span>
            </div>
          </section>

          {/* 4-Stage Visual Timeline Stepper */}
          <section className="timeline-card">
            <div className="timeline-head">
              <div>
                <h2>{t("track.whereStands")}</h2>
                <p>Stage-by-stage status tracked live</p>
              </div>
              <span className="days-counter">
                <strong>6</strong> {t("track.daysSince")}
              </span>
            </div>

            <div className="timeline-flow">
              {data.timeline.map((s, idx) => (
                <div key={s.name} className={`timeline-step-node ${s.state}`}>
                  <div className="timeline-marker-circle">
                    {s.state === "done" ? (
                      <Icon name="check" size={18} />
                    ) : s.state === "rejected" ? (
                      <Icon name="close" size={18} />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <div className="timeline-step-info">
                    <small className="step-timestamp">
                      {s.state === "done" ? "Completed" : s.state === "current" ? "In Progress" : "Pending"}
                    </small>
                    <h3>{s.name}</h3>
                    <p>{s.details || "Verified against government scheme standards."}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Pending Document Alert */}
          {data.pending_document ? (
            <section className="pending-doc-card">
              <span className="alert-avatar">
                <Icon name="alert" size={24} />
              </span>
              <div className="alert-copy">
                <strong>{t("track.pending")}</strong>
                <p>{data.pending_document}</p>
                <small>Please carry an original copy during your branch visit.</small>
              </div>
            </section>
          ) : null}

          {/* Rejection Diagnostics & Remediation Box */}
          {data.application.status === "rejected" ? (
            <section className="diagnostic-card">
              <div className="diagnostic-avatar">
                <Icon name="close" size={26} />
              </div>
              <div className="diagnostic-body">
                <span className="eyebrow red">{t("track.rejected")}</span>
                <h2>Rejection Reason & Immediate Remediation</h2>
                <p className="reason-text">{data.rejection_reason}</p>

                <div className="remediation-steps">
                  <strong>{t("track.whatNext")}:</strong>
                  <p>{data.fix_suggestion}</p>
                </div>
              </div>
            </section>
          ) : null}

          {/* Sarthi Help Banner */}
          <div className="tracker-sarthi-help">
            <Icon name="bot" size={24} />
            <div className="help-text">
              <strong>Need help with this status?</strong>
              <span>Ask Sarthi in Hindi or English for advice on correcting documents.</span>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                const fab = document.querySelector(".chat-fab");
                if (fab) fab.click();
              }}
            >
              <span>Chat with Sarthi</span>
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
