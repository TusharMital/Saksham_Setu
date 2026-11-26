import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon.jsx";
import { api } from "../api.js";
import { useI18n } from "../i18n.jsx";
import {
  CHANNEL_LABELS,
  computeClientEmi,
  formatMoney,
  getSchemeDefaultPrincipal,
} from "../utils/schemeHelpers.js";

export default function SchemeCompareBarAndModal({
  compareCodes,
  comparedSchemes,
  compareOpen,
  setCompareOpen,
  setCompareCodes,
  setCompareNotice,
  onToggleCompare,
  loanAmountBasis,
  profileSummary,
  setScheme,
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [compareDetails, setCompareDetails] = useState({});
  const [compareLoading, setCompareLoading] = useState(false);

  useEffect(() => {
    if (!compareOpen || comparedSchemes.length === 0) return;
    let cancelled = false;
    setCompareLoading(true);
    Promise.all(
      comparedSchemes.map((s) => {
        const basis = loanAmountBasis ? Number(loanAmountBasis) : undefined;
        return api
          .schemeDetail(s.code, basis || undefined)
          .then((data) => [s.code, data])
          .catch(() => [s.code, null]);
      })
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
  }, [compareOpen, comparedSchemes, loanAmountBasis]);

  return (
    <>
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
                      onClick={() => onToggleCompare(cs.code)}
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

      {compareOpen && comparedSchemes.length >= 2 && (
        <div
          className="split-compare-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Scheme Side-by-Side Comparison"
        >
          <div className="split-compare-window">
            <header className="split-compare-header">
              <div>
                <span className="eyebrow">SIDE-BY-SIDE SCHEME COMPARISON</span>
                <h2>Comparing {comparedSchemes.length} Schemes</h2>
                <p>
                  Loan Basis:{" "}
                  <strong>
                    ₹{Number(loanAmountBasis || 500000).toLocaleString("en-IN")}
                  </strong>
                  {profileSummary ? ` • ${profileSummary}` : ""}
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
                const principal =
                  detail?.emi?.principal || getSchemeDefaultPrincipal(s, loanAmountBasis);
                const fallbackCalc = computeClientEmi(
                  principal,
                  s.interest_rate,
                  s.tenure_months,
                  s.moratorium_months
                );
                const monthlyEmi = detail?.monthly_emi ?? fallbackCalc.monthlyEmi;
                const totalInterest = detail?.total_interest ?? fallbackCalc.totalInterest;
                const totalPayable = detail?.total_payable ?? fallbackCalc.totalPayable;
                const principalPct =
                  totalPayable > 0 ? Math.round((principal / totalPayable) * 100) : 100;
                const interestPct = Math.max(0, 100 - principalPct);
                const isState = s.level === "state";
                const subsidyText = s.subsidy_note || s.subsidy_margin_note;

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

                      <section className="split-section">
                        <h4>Summary</h4>
                        <dl className="split-kv-list">
                          <div>
                            <dt>{s.score ? "Match Score" : "Categories"}</dt>
                            <dd>
                              <strong>
                                {s.score
                                  ? `${s.score}%`
                                  : (s.eligible_categories || []).join(", ") || "All"}
                              </strong>
                            </dd>
                          </div>
                          <div>
                            <dt>Interest Rate</dt>
                            <dd className="text-forest">
                              <strong>{s.interest_rate}% p.a.</strong>
                            </dd>
                          </div>
                          <div>
                            <dt>Max Loan Limit</dt>
                            <dd>
                              <strong>{formatMoney(s.max_loan)}</strong>
                            </dd>
                          </div>
                          <div>
                            <dt>Tenure & Moratorium</dt>
                            <dd>
                              {s.tenure_months}m ({s.moratorium_months}m moratorium)
                            </dd>
                          </div>
                        </dl>
                        <p className="split-sub-note">
                          <strong>Subsidy / Margin:</strong>{" "}
                          {subsidyText || `${s.subsidy_percent || 0}%`}
                        </p>
                        {s.interest_rate_note && (
                          <p className="split-sub-note">
                            <strong>Rate Terms:</strong> {s.interest_rate_note}
                          </p>
                        )}
                      </section>

                      <section className="split-section">
                        <h4>EMI Details {compareLoading && !detail ? "(updating…)" : ""}</h4>
                        <div className="split-emi-kpis">
                          <div>
                            <small>Monthly EMI</small>
                            <strong className="text-saffron">
                              ₹{Number(monthlyEmi).toLocaleString("en-IN")}
                            </strong>
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

                        <div className="ratio-bar-wrap" aria-label="Principal vs Interest Ratio">
                          <div className="ratio-bar-labels">
                            <span>Principal {principalPct}%</span>
                            <span>Interest {interestPct}%</span>
                          </div>
                          <div className="ratio-bar-track">
                            <div
                              className="ratio-bar-principal"
                              style={{ width: `${principalPct}%` }}
                            />
                            <div
                              className="ratio-bar-interest"
                              style={{ width: `${interestPct}%` }}
                            />
                          </div>
                        </div>
                      </section>

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
    </>
  );
}
