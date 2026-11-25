import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

export default function Results() {
  const { t } = useI18n();
  const { result, form, setScheme } = useAppState();
  const [emis, setEmis] = useState({});
  const [showRejected, setShowRejected] = useState(false);
  const navigate = useNavigate();

  const top = result?.top || [];
  const rejected = result?.rejected || [];

  useEffect(() => {
    top.forEach(async (s) => {
      try {
        const data = await api.emi({
          amount: Number(form.loan_amount || 500000),
          annual_rate: s.interest_rate,
          tenure_months: s.tenure_months,
          moratorium_months: s.moratorium_months,
        });
        setEmis((prev) => ({ ...prev, [s.code]: data.monthly_emi }));
      } catch {
        /* ignore */
      }
    });
  }, [top, form.loan_amount]);

  if (!result) {
    return (
      <div className="page-shell text-center" style={{ padding: "4rem 1rem" }}>
        <h2>{t("results.empty")}</h2>
        <p style={{ color: "var(--slate)", margin: "1rem 0 2rem" }}>
          Please complete the 3-step eligibility check first.
        </p>
        <button className="btn btn-primary btn-lg" type="button" onClick={() => navigate("/form")}>
          <Icon name="search" size={20} />
          <span>{t("nav.find")}</span>
        </button>
      </div>
    );
  }

  const metricRow = (iconName, label, value, highlightColor) => (
    <div className="metric-row">
      <span className="metric-icon">
        <Icon name={iconName} size={16} />
      </span>
      <div className="metric-content">
        <small>{label}</small>
        <strong style={highlightColor ? { color: highlightColor } : undefined}>{value}</strong>
      </div>
    </div>
  );

  return (
    <div className="page-shell">
      {/* Results Header + Profile Chip */}
      <div className="results-head">
        <div className="page-title">
          <span className="eyebrow">YOUR RESULTS</span>
          <h1>{t("results.title", { count: String(top.length) })}</h1>
          <p>{t("results.subtitle")}</p>
        </div>

        <div className="profile-chip">
          <Icon name="user" size={16} />
          <div>
            <span>Profile: </span>
            <strong>
              {form.state} • {form.district} • <bdi>₹{Number(form.loan_amount || 0).toLocaleString("en-IN")}</bdi>
            </strong>
          </div>
          <button type="button" onClick={() => navigate("/form")}>
            {t("results.editProfile")}
          </button>
        </div>
      </div>

      {/* 3-Column Comparison Grid */}
      <div className="scheme-grid">
        {top.map((s, idx) => {
          const isBest = idx === 0 || s.best;
          const scorePercent = s.score || 90 - idx * 5;
          const emiVal = emis[s.code] ? `₹${Number(emis[s.code]).toLocaleString("en-IN")}` : "Calculating...";

          return (
            <article
              key={s.code}
              className={`scheme-card ${isBest ? "featured" : ""}`}
            >
              {isBest && (
                <div className="best-badge-top">
                  <Icon name="award" size={15} />
                  <span>{t("results.best")}</span>
                </div>
              )}

              <div className={`scheme-top-bar ${isBest ? "green" : idx === 1 ? "saffron" : "navy"}`}>
                <span className="scheme-badge-code">{s.code}</span>
                <small className="scheme-match-score">
                  <Icon name="checkCircle" size={13} /> {scorePercent}% {t("results.score")}
                </small>
              </div>

              <div className="scheme-body">
                <div className="scheme-logo">
                  <span className="logo-box">
                    <Icon name="bank" size={22} />
                  </span>
                  <div>
                    <h2>{s.name}</h2>
                    <small>Government of India • NSFDC</small>
                  </div>
                </div>

                <div className="why-box">
                  <Icon name="checkCircle" size={16} />
                  <p>{s.reason || "Matched with high priority for your sector and background."}</p>
                </div>

                <div className="metrics-list">
                  {metricRow("percent", t("results.interest"), <bdi>{s.interest_rate}% p.a.</bdi>, "var(--forest)")}
                  {metricRow("wallet", t("results.maxLoan"), <bdi>₹{Number(s.max_loan).toLocaleString("en-IN")}</bdi>)}
                  {metricRow("award", t("results.subsidy"), <><bdi>{s.subsidy_percent}%</bdi> margin money</>, "var(--saffron)")}
                  {metricRow("calendar", t("results.tenure"), `${s.tenure_months}m tenure (${s.moratorium_months}m moratorium)`)}
                  {metricRow("calc", t("results.emi"), <><bdi>{emiVal}</bdi> / month</>, "var(--saffron-dark)")}
                </div>

                <button
                  type="button"
                  className="btn btn-primary full"
                  style={{ marginTop: "1.25rem" }}
                  onClick={() => {
                    setScheme(s);
                    navigate("/calculator");
                  }}
                >
                  <span>{t("results.choose")}</span>
                  <Icon name="arrow" size={18} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <p className="fine-print">{t("results.indicativeNote")}</p>

      {/* Next Step Banner */}
      <section className="next-banner">
        <div className="banner-copy">
          <span className="banner-icon">
            <Icon name="bank" size={24} />
          </span>
          <p>
            <strong>{t("results.nextStep")}</strong>
            <small>{t("results.findBanksNear")}</small>
          </p>
        </div>
        <Link to="/locator" className="btn btn-secondary">
          <span>{t("results.findBankBtn")}</span>
          <Icon name="arrow" size={18} />
        </Link>
      </section>

      {/* Collapsible Rejected Schemes Section */}
      {rejected.length > 0 && (
        <section className="rejected-section">
          <button
            type="button"
            className="rejected-toggle-bar"
            onClick={() => setShowRejected(!showRejected)}
            aria-expanded={showRejected}
          >
            <span className="rejected-head-left">
              <span className="rejected-icon-wrap">
                <Icon name="close" size={18} />
              </span>
              <div>
                <strong>{t("results.rejectedTitle")}</strong>
                <small>{t("results.rejectedSubtitle", { count: String(rejected.length) })}</small>
              </div>
            </span>
            <Icon name={showRejected ? "close" : "chevronDown"} size={20} />
          </button>

          {showRejected && (
            <div className="rejected-list-card">
              {rejected.map((r) => (
                <div key={r.code} className="rejected-item">
                  <div className="rejected-item-title">
                    <span className="badge-pill">{r.code}</span>
                    <strong>{r.name}</strong>
                  </div>
                  <p className="rejected-reason">
                    <span className="reason-tag">Reason:</span> {r.reason}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
