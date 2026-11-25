import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

function computeClientEmi(principal, annualRate, tenureMonths, moratoriumMonths = 0) {
  const p = Number(principal || 0);
  const nTotal = Math.max(1, Number(tenureMonths || 60));
  const m = Math.max(0, Math.min(Number(moratoriumMonths || 0), nTotal - 1));
  const n = Math.max(1, nTotal - m);
  const r = Number(annualRate || 0) / 12 / 100;
  if (p <= 0) return { monthlyEmi: 0, totalInterest: 0, totalPayable: 0 };
  const pAfterMoratorium = m > 0 ? p * Math.pow(1 + r, m) : p;
  const emi = r === 0 ? pAfterMoratorium / n : (pAfterMoratorium * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  // Accurate capitalization during moratorium
  let balance = p;
  let totalInterest = 0;
  for (let month = 1; month <= nTotal; month++) {
    const interest = balance * r;
    totalInterest += interest;
    if (month <= m) {
      balance += interest;
    } else {
      const principalPaid = month === nTotal ? balance : Math.min(emi - interest, balance);
      balance = Math.max(0, balance - principalPaid);
    }
  }
  return {
    monthlyEmi: Math.round(emi),
    totalInterest: Math.round(totalInterest),
    totalPayable: Math.round(p + totalInterest),
  };
}

function getSchemeDefaultPrincipal(scheme, userLoanAmount) {
  const req = Number(userLoanAmount || 0);
  if (req > 0) return req;
  const minLoan = Number(scheme.min_loan || 0);
  const maxLoan = scheme.max_loan !== null && scheme.max_loan !== undefined ? Number(scheme.max_loan) : null;
  let base = 500000;
  if (maxLoan && maxLoan > 0) base = Math.min(base, maxLoan);
  if (minLoan > base) base = minLoan;
  return Math.max(10000, base);
}

function formatMoney(val) {
  if (val === null || val === undefined) return "No fixed cap";
  const num = Number(val);
  if (Number.isNaN(num)) return "—";
  return `₹${num.toLocaleString("en-IN")}`;
}

const CHANNEL_LABELS = {
  pmsuraj: "PM-SURAJ",
  jansamarth: "JanSamarth",
  sca: "State SCA",
  bank: "Bank Branch",
  mfi: "NBFC-MFI",
  kviconline: "KVIC PMEGP",
  standupmitra: "Stand-Up Mitra",
  pmvishwakarma: "PM Vishwakarma",
  state_portal: "State Portal",
};

export default function Results() {
  const { t } = useI18n();
  const { result, form, setScheme } = useAppState();
  const [activeTab, setActiveTab] = useState("all");
  const [compareCodes, setCompareCodes] = useState([]);
  const [compareNotice, setCompareNotice] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareDetails, setCompareDetails] = useState({});
  const [compareLoading, setCompareLoading] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const navigate = useNavigate();

  const matched = useMemo(() => result?.matched || result?.accepted || [], [result]);
  const rejected = useMemo(() => result?.rejected || [], [result]);

  const userState = form.state || "State";
  const centralSchemes = useMemo(() => matched.filter((s) => (s.level || "central") === "central"), [matched]);
  const stateSchemes = useMemo(() => matched.filter((s) => s.level === "state"), [matched]);

  const visibleSchemes = useMemo(() => {
    if (activeTab === "central") return centralSchemes;
    if (activeTab === "state") return stateSchemes;
    return matched;
  }, [activeTab, centralSchemes, stateSchemes, matched]);

  const comparedSchemes = useMemo(
    () => compareCodes.map((code) => matched.find((s) => s.code === code)).filter(Boolean),
    [compareCodes, matched]
  );

  // Fetch authoritative EMI breakdown from backend when Split-Window Comparison opens
  useEffect(() => {
    if (!compareOpen || comparedSchemes.length === 0) return;
    let cancelled = false;
    setCompareLoading(true);
    Promise.all(
      comparedSchemes.map((s) =>
        api
          .schemeDetail(s.code, form.loan_amount || undefined)
          .then((data) => [s.code, data])
          .catch(() => [s.code, null])
      )
    ).then((entries) => {
      if (cancelled) return;
      const map = {};
      for (const [code, data] of entries) {
        if (data) map[code] = data;
      }
      setCompareDetails(map);
      setCompareLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [compareOpen, comparedSchemes, form.loan_amount]);

  const toggleCompare = (code) => {
    setCompareNotice("");
    setCompareCodes((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= 3) {
        setCompareNotice(t("results.compareMaxNotice"));
        return prev;
      }
      return [...prev, code];
    });
  };

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
    <div className="page-shell" style={{ paddingBottom: compareCodes.length > 0 ? "110px" : undefined }}>
      {/* Results Header + Profile Chip */}
      <div className="results-head">
        <div className="page-title" style={{ marginBottom: 0 }}>
          <span className="eyebrow">YOUR RESULTS</span>
          <h1>{t("results.title", { count: String(matched.length) })}</h1>
          <p>{t("results.subtitle")}</p>
        </div>

        <div className="profile-chip">
          <Icon name="user" size={16} />
          <div>
            <span>Profile: </span>
            <strong>
              {form.state} • {form.caste_category || "General"} •{" "}
              <bdi>₹{Number(form.loan_amount || 0).toLocaleString("en-IN")}</bdi>
            </strong>
          </div>
          <button type="button" onClick={() => navigate("/form")}>
            {t("results.editProfile")}
          </button>
        </div>
      </div>

      {/* Filter Tabs: All Eligible / Central Govt / [User's State] Govt */}
      <div className="results-filter-bar" role="tablist" aria-label="Filter eligible schemes by government level">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={`filter-tab-btn ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          <span>{t("results.tabAll")}</span>
          <span className="tab-count-pill">{matched.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "central"}
          className={`filter-tab-btn ${activeTab === "central" ? "active" : ""}`}
          onClick={() => setActiveTab("central")}
        >
          <span>{t("results.tabCentral")}</span>
          <span className="tab-count-pill">{centralSchemes.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "state"}
          className={`filter-tab-btn ${activeTab === "state" ? "active" : ""}`}
          onClick={() => setActiveTab("state")}
        >
          <span>{t("results.tabState", { state: userState })}</span>
          <span className="tab-count-pill">{stateSchemes.length}</span>
        </button>
      </div>

      {compareNotice && (
        <div className="compare-notice-banner" role="status">
          <Icon name="alert" size={16} />
          <span>{compareNotice}</span>
          <button type="button" onClick={() => setCompareNotice("")} aria-label="Dismiss notice">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Eligible Schemes Grid */}
      {visibleSchemes.length === 0 ? (
        <div className="empty-tab-card">
          <p>
            {activeTab === "state"
              ? `No state-specific schemes matched your profile in ${userState}. Switch to "All Eligible" or "Central Govt" to view nationwide schemes, or inspect the Not Selected section below.`
              : t("results.empty")}
          </p>
        </div>
      ) : (
        <div className="scheme-grid">
          {visibleSchemes.map((s, idx) => {
            const isBest = Boolean(s.best) || (activeTab === "all" && idx === 0);
            const scorePercent = s.score || Math.max(60, 95 - idx * 3);
            const principal = getSchemeDefaultPrincipal(s, form.loan_amount);
            const emiCalc = computeClientEmi(principal, s.interest_rate, s.tenure_months, s.moratorium_months);
            const isCompared = compareCodes.includes(s.code);
            const isState = s.level === "state";

            return (
              <article
                key={s.code}
                className={`scheme-card ${isBest ? "featured" : ""} ${isCompared ? "is-compared" : ""}`}
              >
                {isBest && (
                  <div className="best-badge-top">
                    <Icon name="award" size={15} />
                    <span>{t("results.best")}</span>
                  </div>
                )}

                <div className={`scheme-top-bar ${isBest ? "green" : isState ? "saffron" : "navy"}`}>
                  <span className="scheme-badge-code">{s.code}</span>
                  <div className="scheme-top-right">
                    <span className={`level-badge ${isState ? "state" : "central"}`}>
                      {isState ? t("results.stateBadge") : t("results.centralBadge")}
                    </span>
                    <small className="scheme-match-score">
                      <Icon name="checkCircle" size={13} /> {scorePercent}% {t("results.score")}
                    </small>
                  </div>
                </div>

                <div className="scheme-body">
                  <div className="scheme-logo">
                    <span className="logo-box">
                      <Icon name="bank" size={22} />
                    </span>
                    <div>
                      <h2>{s.name}</h2>
                      <small>{s.agency || "Government of India"}</small>
                    </div>
                  </div>

                  <div className="why-box">
                    <Icon name="checkCircle" size={16} />
                    <p>{s.overview || s.reason || "Matched with your profile and eligibility rules."}</p>
                  </div>

                  <div className="metrics-list">
                    {metricRow("percent", t("results.interest"), <bdi>{s.interest_rate}% p.a.</bdi>, "var(--forest)")}
                    {metricRow("wallet", t("results.maxLoan"), <bdi>{formatMoney(s.max_loan)}</bdi>)}
                    {metricRow(
                      "award",
                      t("results.subsidy"),
                      s.subsidy_margin_note ? (
                        <span className="metric-note-clamp">{s.subsidy_margin_note}</span>
                      ) : (
                        <>
                          <bdi>{s.subsidy_percent}%</bdi> margin money
                        </>
                      ),
                      "var(--saffron)"
                    )}
                    {metricRow(
                      "calendar",
                      t("results.tenure"),
                      `${s.tenure_months}m tenure (${s.moratorium_months}m moratorium)`
                    )}
                    {metricRow(
                      "calc",
                      t("results.emi"),
                      <>
                        <bdi>₹{emiCalc.monthlyEmi.toLocaleString("en-IN")}</bdi> / month
                      </>,
                      "var(--saffron-dark)"
                    )}
                  </div>

                  <div className="scheme-card-actions">
                    <button
                      type="button"
                      className="btn btn-primary scheme-action-details"
                      onClick={() => {
                        setScheme(s);
                        navigate(`/scheme/${encodeURIComponent(s.code)}`);
                      }}
                    >
                      <span>{t("results.moreDetails")}</span>
                      <Icon name="arrow" size={16} />
                    </button>

                    <button
                      type="button"
                      className={`btn scheme-action-compare ${isCompared ? "btn-compare-active" : "btn-outline"}`}
                      onClick={() => toggleCompare(s.code)}
                      aria-pressed={isCompared}
                    >
                      {isCompared ? <Icon name="check" size={16} /> : null}
                      <span>{isCompared ? t("results.comparedAdded") : t("results.compare")}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="fine-print">{t("results.indicativeNote")}</p>

      {/* Expandable Not Selected / Rejected Schemes Section */}
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
              {rejected.map((r) => {
                const reasons =
                  Array.isArray(r.rejection_reasons) && r.rejection_reasons.length > 0
                    ? r.rejection_reasons
                    : [r.reason || "Did not meet scheme eligibility criteria."];
                const isState = r.level === "state";

                return (
                  <div key={r.code} className="rejected-item">
                    <div className="rejected-item-header">
                      <div className="rejected-item-title">
                        <span className="badge-pill">{r.code}</span>
                        <span className={`level-badge-sm ${isState ? "state" : "central"}`}>
                          {isState ? t("results.stateBadge") : t("results.centralBadge")}
                        </span>
                        <strong>{r.name}</strong>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm-detail"
                        onClick={() => {
                          setScheme(r);
                          navigate(`/scheme/${encodeURIComponent(r.code)}`);
                        }}
                      >
                        <span>{t("results.moreDetails")}</span>
                        <Icon name="arrow" size={15} />
                      </button>
                    </div>
                    {r.agency && <small className="rejected-agency">{r.agency}</small>}
                    <ul className="rejected-reasons-list">
                      {reasons.map((pt, i) => (
                        <li key={i}>
                          <span className="reason-tag">Disqualified:</span> {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Sticky Compare Bar */}
      {compareCodes.length > 0 && (
        <div className="sticky-compare-bar" role="region" aria-label="Scheme Comparison Bar">
          <div className="sticky-compare-inner">
            <div className="compare-selected-pills">
              <strong className="compare-bar-title">
                {t("results.compareSelected", { count: String(compareCodes.length) })}
              </strong>
              <div className="compare-chips-row">
                {comparedSchemes.map((cs) => (
                  <span key={cs.code} className="compare-chip">
                    <b>{cs.code}</b>
                    <button
                      type="button"
                      onClick={() => toggleCompare(cs.code)}
                      aria-label={`Remove ${cs.name} from comparison`}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="compare-bar-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setCompareCodes([]);
                  setCompareOpen(false);
                  setCompareNotice("");
                }}
              >
                {t("results.clearCompare")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={compareCodes.length < 2}
                title={compareCodes.length < 2 ? "Select at least 2 schemes to compare" : undefined}
                onClick={() => setCompareOpen(true)}
              >
                <span>{t("results.compareSelected", { count: String(compareCodes.length) })}</span>
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Width Split-Window Comparison View (2 or 3 equal side-by-side columns) */}
      {compareOpen && comparedSchemes.length >= 2 && (
        <div className="split-compare-overlay" role="dialog" aria-modal="true" aria-label="Scheme Side-by-Side Comparison">
          <div className="split-compare-window">
            <header className="split-compare-header">
              <div>
                <span className="eyebrow">SIDE-BY-SIDE SCHEME COMPARISON</span>
                <h2>Comparing {comparedSchemes.length} Schemes for Your Profile</h2>
                <p>
                  Loan Basis:{" "}
                  <strong>
                    ₹{Number(form.loan_amount || 500000).toLocaleString("en-IN")}
                  </strong>{" "}
                  • {form.state} ({form.caste_category || "General"})
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCompareOpen(false)}
              >
                <Icon name="close" size={18} />
                <span>{t("results.closeCompare")}</span>
              </button>
            </header>

            <div
              className="split-compare-columns"
              style={{ "--compare-cols": comparedSchemes.length }}
            >
              {comparedSchemes.map((s) => {
                const detail = compareDetails[s.code];
                const principal = detail?.emi?.principal || getSchemeDefaultPrincipal(s, form.loan_amount);
                const fallbackCalc = computeClientEmi(
                  principal,
                  s.interest_rate,
                  s.tenure_months,
                  s.moratorium_months
                );
                const monthlyEmi = detail?.monthly_emi ?? fallbackCalc.monthlyEmi;
                const totalInterest = detail?.total_interest ?? fallbackCalc.totalInterest;
                const totalPayable = detail?.total_payable ?? fallbackCalc.totalPayable;
                const principalPct = totalPayable > 0 ? Math.round((principal / totalPayable) * 100) : 100;
                const interestPct = Math.max(0, 100 - principalPct);
                const isState = s.level === "state";

                return (
                  <article key={s.code} className="split-col-card">
                    <div className={`split-col-top ${isState ? "saffron" : "navy"}`}>
                      <div className="split-col-badges">
                        <span className="scheme-badge-code">{s.code}</span>
                        <span className={`level-badge ${isState ? "state" : "central"}`}>
                          {isState ? t("results.stateBadge") : t("results.centralBadge")}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="split-col-remove"
                        onClick={() => {
                          const next = compareCodes.filter((c) => c !== s.code);
                          setCompareCodes(next);
                          if (next.length < 2) setCompareOpen(false);
                        }}
                        aria-label={`Remove ${s.code}`}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>

                    <div className="split-col-body">
                      <h3>{s.name}</h3>
                      <small className="split-col-agency">{s.agency}</small>

                      {/* Section 1: Summary */}
                      <section className="split-section">
                        <h4>Summary</h4>
                        <dl className="split-kv-list">
                          <div>
                            <dt>Match Score</dt>
                            <dd><strong>{s.score || "—"}%</strong></dd>
                          </div>
                          <div>
                            <dt>Interest Rate</dt>
                            <dd className="text-forest"><strong>{s.interest_rate}% p.a.</strong></dd>
                          </div>
                          <div>
                            <dt>Max Loan Limit</dt>
                            <dd><strong>{formatMoney(s.max_loan)}</strong></dd>
                          </div>
                          <div>
                            <dt>Tenure & Moratorium</dt>
                            <dd>{s.tenure_months}m ({s.moratorium_months}m moratorium)</dd>
                          </div>
                        </dl>
                        <p className="split-sub-note">
                          <strong>Subsidy / Margin:</strong> {s.subsidy_margin_note || `${s.subsidy_percent}%`}
                        </p>
                        {s.interest_rate_note && (
                          <p className="split-sub-note">
                            <strong>Rate Terms:</strong> {s.interest_rate_note}
                          </p>
                        )}
                      </section>

                      {/* Section 2: EMI Details */}
                      <section className="split-section">
                        <h4>
                          EMI Details {compareLoading && !detail ? "(updating…)" : ""}
                        </h4>
                        <div className="split-emi-kpis">
                          <div>
                            <small>Monthly EMI</small>
                            <strong className="text-saffron">₹{Number(monthlyEmi).toLocaleString("en-IN")}</strong>
                          </div>
                          <div>
                            <small>Total Interest</small>
                            <strong>₹{Number(totalInterest).toLocaleString("en-IN")}</strong>
                          </div>
                          <div>
                            <small>Total Payable</small>
                            <strong>₹{Number(totalPayable).toLocaleString("en-IN")}</strong>
                          </div>
                        </div>

                        {/* Principal vs Interest Ratio Bar */}
                        <div className="ratio-bar-wrap" aria-label="Principal vs Interest Ratio">
                          <div className="ratio-bar-labels">
                            <span>Principal {principalPct}%</span>
                            <span>Interest {interestPct}%</span>
                          </div>
                          <div className="ratio-bar-track">
                            <div className="ratio-bar-principal" style={{ width: `${principalPct}%` }} />
                            <div className="ratio-bar-interest" style={{ width: `${interestPct}%` }} />
                          </div>
                        </div>
                      </section>

                      {/* Section 3: Important Notes */}
                      <section className="split-section">
                        <h4>Important Notes & Channels</h4>
                        {s.key_highlights?.length > 0 && (
                          <ul className="split-notes-list highlights">
                            {s.key_highlights.slice(0, 3).map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        )}
                        {s.important_notes?.length > 0 && (
                          <ul className="split-notes-list warnings">
                            {s.important_notes.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        )}
                        <div className="split-channel-pills">
                          {(s.available_channels || []).map((ch) => (
                            <span key={ch} className="channel-mini-pill">
                              {CHANNEL_LABELS[ch] || ch}
                            </span>
                          ))}
                        </div>
                      </section>

                      <div className="split-col-footer">
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            setScheme(s);
                            setCompareOpen(false);
                            navigate(`/scheme/${encodeURIComponent(s.code)}`);
                          }}
                        >
                          <span>{t("results.moreDetails")}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            setScheme(s);
                            setCompareOpen(false);
                            navigate(`/apply?scheme=${encodeURIComponent(s.code)}`);
                          }}
                        >
                          <span>{t("results.applyBtn")}</span>
                          <Icon name="arrow" size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
