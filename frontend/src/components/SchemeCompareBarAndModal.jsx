import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon.jsx";
import { api } from "../api.js";
import { useI18n, useTranslatedSchemes } from "../i18n.jsx";
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
  const translatedCompared = useTranslatedSchemes(comparedSchemes);
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
        <div className="sticky-compare-bar" role="region" aria-label={t("compare.barAria")}>
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
                      aria-label={t("compare.removeAria", { name: cs.name })}
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
                title={compareCodes.length < 2 ? t("compare.minSelectHint") : undefined}
                onClick={() => setCompareOpen(true)}
              >
                <span>{t("results.compareSelected", { count: String(compareCodes.length) })}</span>
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {compareOpen && translatedCompared.length >= 2 && (
        <div
          className="split-compare-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("compare.eyebrow")}
        >
          <div className="split-compare-window">
            <header className="split-compare-header">
              <div>
                <span className="eyebrow">{t("compare.eyebrow")}</span>
                <h2>{t("compare.title", { count: String(translatedCompared.length) })}</h2>
                <p>
                  {t("compare.loanBasis")}{" "}
                  <strong>
                    <bdi>₹{Number(loanAmountBasis || 500000).toLocaleString("en-IN")}</bdi>
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
              style={{ "--compare-cols": translatedCompared.length }}
            >
              {translatedCompared.map((s) => {
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
                        aria-label={t("compare.removeAria", { name: s.code })}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>

                    <div className="split-col-body">
                      <h3>{s.name}</h3>
                      <small className="split-col-agency">{s.agency}</small>

                      <section className="split-section">
                        <h4>{t("compare.summary")}</h4>
                        <dl className="split-kv-list">
                          <div>
                            <dt>{s.score ? t("compare.matchScore") : t("compare.categories")}</dt>
                            <dd>
                              <strong>
                                {s.score
                                  ? `${s.score}%`
                                  : (s.eligible_categories || []).join(", ") || t("allSchemes.allOption")}
                              </strong>
                            </dd>
                          </div>
                          <div>
                            <dt>{t("compare.interestRate")}</dt>
                            <dd className="text-forest">
                              <strong><bdi>{s.interest_rate}{t("calc.pctPa")}</bdi></strong>
                            </dd>
                          </div>
                          <div>
                            <dt>{t("compare.maxLoanLimit")}</dt>
                            <dd>
                              <strong><bdi>{formatMoney(s.max_loan, t("detail.noUpperCap"))}</bdi></strong>
                            </dd>
                          </div>
                          <div>
                            <dt>{t("compare.tenureMoratorium")}</dt>
                            <dd>
                              <bdi>{t("results.tenureFormat", { tenure: String(s.tenure_months), moratorium: String(s.moratorium_months) })}</bdi>
                            </dd>
                          </div>
                        </dl>
                        <p className="split-sub-note">
                          <strong>{t("compare.subsidyMargin")}</strong>{" "}
                          {subsidyText || `${s.subsidy_percent || 0}%`}
                        </p>
                        {s.interest_rate_note && (
                          <p className="split-sub-note">
                            <strong>{t("compare.rateTerms")}</strong> {s.interest_rate_note}
                          </p>
                        )}
                      </section>

                      <section className="split-section">
                        <h4>{t("compare.emiDetails")} {compareLoading && !detail ? t("compare.updating") : ""}</h4>
                        <div className="split-emi-kpis">
                          <div>
                            <small>{t("compare.monthlyEmi")}</small>
                            <strong className="text-saffron">
                              <bdi>₹{Number(monthlyEmi).toLocaleString("en-IN")}</bdi>
                            </strong>
                          </div>
                          <div>
                            <small>{t("compare.totalInterest")}</small>
                            <strong><bdi>₹{Number(totalInterest).toLocaleString("en-IN")}</bdi></strong>
                          </div>
                          <div>
                            <small>{t("compare.totalPayable")}</small>
                            <strong><bdi>₹{Number(totalPayable).toLocaleString("en-IN")}</bdi></strong>
                          </div>
                        </div>

                        <div className="ratio-bar-wrap" aria-label={t("calc.ratioLabel")}>
                          <div className="ratio-bar-labels">
                            <span>{t("compare.principalPct", { pct: String(principalPct) })}</span>
                            <span>{t("compare.interestPct", { pct: String(interestPct) })}</span>
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
                        <h4>{t("compare.notesChannels")}</h4>
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
                              {t(`channels.${ch}`) !== `channels.${ch}` ? t(`channels.${ch}`) : (CHANNEL_LABELS[ch] || ch)}
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
