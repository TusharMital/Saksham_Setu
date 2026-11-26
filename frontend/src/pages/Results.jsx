import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import SchemeCompareBarAndModal from "../components/SchemeCompareBarAndModal.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n, useTranslatedSchemes } from "../i18n.jsx";
import {
  computeClientEmi,
  formatMoney,
  getSchemeDefaultPrincipal,
} from "../utils/schemeHelpers.js";

export default function Results() {
  const { t, lang } = useI18n();
  const { result, setResult, form, setScheme } = useAppState();
  const [activeTab, setActiveTab] = useState("all");
  const [compareCodes, setCompareCodes] = useState([]);
  const [compareNotice, setCompareNotice] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const navigate = useNavigate();

  // Re-fetch localized rejection reasons if language changed while on Results
  useEffect(() => {
    if (!result || !form?.state || !form?.loan_amount) return;
    if ((result.language || "en") === lang) return;
    let cancelled = false;
    api
      .recommend({
        ...form,
        age: Number(form.age),
        annual_family_income: Number(form.annual_family_income),
        loan_amount: Number(form.loan_amount),
        project_cost: Number(form.project_cost || form.loan_amount),
        lang,
      })
      .then((res) => {
        if (!cancelled && res) setResult(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const rawMatched = useMemo(() => result?.matched || result?.accepted || [], [result]);
  const rawRejected = useMemo(() => result?.rejected || [], [result]);
  const matched = useTranslatedSchemes(rawMatched);
  const rejected = useTranslatedSchemes(rawRejected);

  const userState = form.state || t("paths.stateFallback");
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
          {t("results.completeCheckFirst")}
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
          <span className="eyebrow">{t("results.eyebrow")}</span>
          <h1>{t("results.title", { count: String(matched.length) })}</h1>
          <p>{t("results.subtitle")}</p>
        </div>

        <div className="profile-chip">
          <Icon name="user" size={16} />
          <div>
            <span>{t("results.profileLabel")} </span>
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
      <div className="results-filter-bar" role="tablist" aria-label={t("results.filterTabsAria")}>
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
          <button type="button" onClick={() => setCompareNotice("")} aria-label={t("results.dismissNotice")}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Eligible Schemes Grid */}
      {visibleSchemes.length === 0 ? (
        <div className="empty-tab-card">
          <p>
            {activeTab === "state"
              ? t("results.emptyStateTab", { state: userState })
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
                      <small>{s.agency || t("detail.govtOfIndia")}</small>
                    </div>
                  </div>

                  <div className="why-box">
                    <Icon name="checkCircle" size={16} />
                    <p>{s.overview || s.reason || t("results.matchedDefault")}</p>
                  </div>

                  <div className="metrics-list">
                    {metricRow("percent", t("results.interest"), <bdi>{s.interest_rate}{t("calc.pctPa")}</bdi>, "var(--forest)")}
                    {metricRow("wallet", t("results.maxLoan"), <bdi>{formatMoney(s.max_loan, t("detail.noUpperCap"))}</bdi>)}
                    {metricRow(
                      "award",
                      t("results.subsidy"),
                      s.subsidy_margin_note ? (
                        <span className="metric-note-clamp">{s.subsidy_margin_note}</span>
                      ) : (
                        <>
                          <bdi>{s.subsidy_percent}%</bdi> {t("results.marginMoney")}
                        </>
                      ),
                      "var(--saffron)"
                    )}
                    {metricRow(
                      "calendar",
                      t("results.tenure"),
                      t("results.tenureFormat", {
                        tenure: String(s.tenure_months),
                        moratorium: String(s.moratorium_months),
                      })
                    )}
                    {metricRow(
                      "calc",
                      t("results.emi"),
                      <>
                        <bdi>₹{emiCalc.monthlyEmi.toLocaleString("en-IN")}</bdi> {t("results.perMonth")}
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
                    : [r.reason || t("results.rejectedDefault")];
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
                          <span className="reason-tag">{t("results.disqualifiedTag")}</span> {pt}
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

      <SchemeCompareBarAndModal
        compareCodes={compareCodes}
        comparedSchemes={comparedSchemes}
        compareOpen={compareOpen}
        setCompareOpen={setCompareOpen}
        setCompareCodes={setCompareCodes}
        setCompareNotice={setCompareNotice}
        onToggleCompare={toggleCompare}
        loanAmountBasis={form.loan_amount || 500000}
        profileSummary={`${form.state || t("allSchemes.allIndia")} (${form.caste_category || t("form.cat_general")})`}
        setScheme={setScheme}
      />
    </div>
  );
}
