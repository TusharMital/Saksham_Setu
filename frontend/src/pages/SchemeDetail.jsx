import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

function formatCompactInr(val) {
  const n = Number(val || 0);
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (n >= 1000) return `₹${Math.round(n / 1000)}K`;
  return `₹${Math.round(n)}`;
}

function formatFullInr(val) {
  if (val === null || val === undefined) return "No fixed upper cap";
  return `₹${Number(val).toLocaleString("en-IN")}`;
}

function EmiSvgVisuals({ emi, scheme }) {
  if (!emi) return null;
  const principal = Number(emi.principal || 0);
  const interest = Number(emi.total_interest || 0);
  const total = Math.max(1, principal + interest);
  const principalPct = Math.round((principal / total) * 100);
  const interestPct = Math.max(0, 100 - principalPct);

  // Donut SVG geometry (r = 54, circumference = 2 * pi * 54 = 339.29)
  const r = 54;
  const circ = 2 * Math.PI * r;
  const principalDash = (principal / total) * circ;
  const interestDash = (interest / total) * circ;

  // Balance Curve SVG geometry
  const yearly = emi.yearly_schedule || [];
  const points = [
    { year: 0, balance: principal, isMoratorium: (emi.moratorium_months || 0) > 0 },
    ...yearly.map((y) => ({
      year: y.year,
      balance: Number(y.ending_balance || 0),
      isMoratorium: Boolean(y.is_moratorium_year),
      principalPaid: y.principal_paid,
      interestPaid: y.interest_paid,
    })),
  ];

  const width = 620;
  const height = 240;
  const pad = { top: 22, right: 24, bottom: 38, left: 66 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxBal = Math.max(1, ...points.map((p) => p.balance));
  const maxYear = Math.max(1, points[points.length - 1]?.year || 1);

  const xPos = (yr) => pad.left + (yr / maxYear) * plotW;
  const yPos = (bal) => pad.top + plotH - (bal / maxBal) * plotH;

  const linePath = points
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${xPos(pt.year).toFixed(1)} ${yPos(pt.balance).toFixed(1)}`)
    .join(" ");

  const areaPath =
    points.length > 0
      ? `${linePath} L ${xPos(points[points.length - 1].year).toFixed(1)} ${(pad.top + plotH).toFixed(1)} L ${xPos(0).toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`
      : "";

  const moratoriumYears = (emi.moratorium_months || 0) / 12;
  const moratoriumEndX = moratoriumYears > 0 ? xPos(Math.min(maxYear, moratoriumYears)) : pad.left;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="emi-visuals-grid">
      {/* Left SVG: Principal vs Total Interest Donut + Ratio */}
      <div className="emi-svg-card">
        <h3>Principal vs. Total Interest</h3>
        <div className="donut-svg-wrap">
          <svg viewBox="0 0 150 150" className="emi-donut-svg" role="img" aria-label="Principal vs Interest Donut Chart">
            <circle cx="75" cy="75" r={r} fill="none" stroke="#e2e8f0" strokeWidth="18" />
            <circle
              cx="75"
              cy="75"
              r={r}
              fill="none"
              stroke="#15803d"
              strokeWidth="18"
              strokeDasharray={`${principalDash} ${circ}`}
              transform="rotate(-90 75 75)"
            />
            {interest > 0 && (
              <circle
                cx="75"
                cy="75"
                r={r}
                fill="none"
                stroke="#ea580c"
                strokeWidth="18"
                strokeDasharray={`${interestDash} ${circ}`}
                strokeDashoffset={-principalDash}
                transform="rotate(-90 75 75)"
              />
            )}
            <text x="75" y="70" textAnchor="middle" className="donut-center-pct">
              {principalPct}%
            </text>
            <text x="75" y="88" textAnchor="middle" className="donut-center-sub">
              Principal
            </text>
          </svg>

          <div className="donut-legend">
            <div className="donut-legend-row">
              <span className="legend-dot green" />
              <div>
                <small>Principal ({principalPct}%)</small>
                <strong>{formatFullInr(principal)}</strong>
              </div>
            </div>
            <div className="donut-legend-row">
              <span className="legend-dot saffron" />
              <div>
                <small>Total Interest ({interestPct}%)</small>
                <strong>{formatFullInr(interest)}</strong>
              </div>
            </div>
            <div className="donut-legend-row total">
              <span className="legend-dot navy" />
              <div>
                <small>Total Payable ({scheme.tenure_months}m)</small>
                <strong>{formatFullInr(emi.total_payable)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right SVG: Year-by-Year Remaining Balance Curve */}
      <div className="emi-svg-card">
        <div className="curve-head-row">
          <h3>Year-by-Year Remaining Balance Curve</h3>
          {emi.moratorium_months > 0 && (
            <span className="moratorium-legend-tag">
              Moratorium: {emi.moratorium_months}m shaded
            </span>
          )}
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="balance-curve-svg"
          role="img"
          aria-label="Year-by-year remaining loan balance curve"
        >
          <defs>
            <linearGradient id="balAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#15803d" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#15803d" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines + Y-axis labels */}
          {yTicks.map((tVal) => {
            const y = pad.top + plotH * (1 - tVal);
            const labelVal = maxBal * tVal;
            return (
              <g key={tVal}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={pad.left + plotW}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={tVal === 0 ? undefined : "4 4"}
                />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" className="svg-axis-label">
                  {formatCompactInr(labelVal)}
                </text>
              </g>
            );
          })}

          {/* Moratorium shaded zone */}
          {emi.moratorium_months > 0 && moratoriumEndX > pad.left && (
            <g>
              <rect
                x={pad.left}
                y={pad.top}
                width={Math.max(14, moratoriumEndX - pad.left)}
                height={plotH}
                fill="#fef3c7"
                opacity="0.7"
              />
              <line
                x1={Math.max(pad.left + 14, moratoriumEndX)}
                y1={pad.top}
                x2={Math.max(pad.left + 14, moratoriumEndX)}
                y2={pad.top + plotH}
                stroke="#d97706"
                strokeDasharray="4 3"
                strokeWidth="1.5"
              />
              <text
                x={pad.left + 6}
                y={pad.top + 14}
                className="svg-moratorium-text"
              >
                Moratorium ({emi.moratorium_months}m)
              </text>
            </g>
          )}

          {/* Area and Curve */}
          {areaPath && <path d={areaPath} fill="url(#balAreaGrad)" />}
          {linePath && (
            <path d={linePath} fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Data Points & X-axis labels */}
          {points.map((pt) => {
            const cx = xPos(pt.year);
            const cy = yPos(pt.balance);
            const showTick = points.length <= 10 || pt.year === 0 || pt.year === maxYear || pt.year % 2 === 0;
            return (
              <g key={pt.year}>
                <circle cx={cx} cy={cy} r="4.5" fill={pt.isMoratorium && pt.year > 0 ? "#d97706" : "#15803d"} stroke="#ffffff" strokeWidth="2">
                  <title>{`Year ${pt.year}: Remaining Balance ${formatFullInr(pt.balance)}`}</title>
                </circle>
                {showTick && (
                  <text x={cx} y={height - 12} textAnchor="middle" className="svg-axis-label">
                    {pt.year === 0 ? "Start" : `Yr ${pt.year}`}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function SchemeDetail() {
  const { code } = useParams();
  const { t } = useI18n();
  const { form, setScheme } = useAppState();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkedDocs, setCheckedDocs] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .schemeDetail(code, form.loan_amount || undefined)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setScheme(res);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.body?.detail || err.message || "Could not load scheme details.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, form.loan_amount]);

  if (loading) {
    return (
      <div className="page-shell">
        <div className="tracker-skeleton-card">
          <div className="skeleton-line w-40" />
          <div className="skeleton-line w-80" />
          <div className="skeleton-box" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-shell text-center" style={{ padding: "4rem 1rem" }}>
        <h2>Scheme Not Found</h2>
        <p style={{ color: "var(--slate)", margin: "1rem 0 2rem" }}>{error || `No scheme found for code ${code}.`}</p>
        <Link to="/results" className="btn btn-primary">
          Back to Results
        </Link>
      </div>
    );
  }

  const isState = data.level === "state";
  const docs = data.required_documents?.length ? data.required_documents : data.documents || [];
  const emi = data.emi || {
    principal: data.emi_amount,
    monthly_emi: data.monthly_emi,
    total_interest: data.total_interest,
    total_payable: data.total_payable,
    yearly_schedule: data.yearly_schedule || [],
    tenure_months: data.tenure_months,
    moratorium_months: data.moratorium_months,
  };

  return (
    <div className="page-shell scheme-detail-page">
      {/* Breadcrumb / Back Navigation */}
      <div className="detail-breadcrumb">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
          ← {t("detail.back")}
        </button>
        <div className="detail-meta-tags">
          <span className={`level-badge ${isState ? "state" : "central"}`}>
            {isState ? t("results.stateBadge") : t("results.centralBadge")}
          </span>
          <span className="badge-pill">{data.code}</span>
          {(data.applicable_states || []).map((st) => (
            <span key={st} className="state-chip">
              {st === "ALL" ? "All India" : st}
            </span>
          ))}
        </div>
      </div>

      {/* Scheme Hero Header */}
      <section className="detail-hero-card">
        <div className="detail-hero-main">
          <p className="detail-agency">{data.agency || "Government of India"}</p>
          <h1>{data.name}</h1>
          <p className="detail-overview">{data.overview || data.description}</p>

          <div className="detail-eligibility-pills">
            {(data.eligible_categories || []).map((cat) => (
              <span key={cat} className="cat-pill">
                {cat}
              </span>
            ))}
            {data.women_only && <span className="cat-pill women">Women Only</span>}
            <span className="cat-pill income">
              Income Limit: {data.max_income ? formatFullInr(data.max_income) : "No Income Cap"}
            </span>
            <span className="cat-pill loan">
              Loan Range: {formatFullInr(data.min_loan || 0)} – {formatFullInr(data.max_loan)}
            </span>
          </div>

          <div className="detail-hero-actions">
            <Link
              to={`/locator?scheme=${encodeURIComponent(data.code)}`}
              className="btn btn-secondary"
              onClick={() => setScheme(data)}
            >
              <Icon name="location" size={18} />
              <span>{t("detail.findBanksPortals")}</span>
              <Icon name="arrow" size={17} />
            </Link>
            <Link
              to={`/calculator?scheme=${encodeURIComponent(data.code)}`}
              className="btn btn-outline"
              onClick={() => setScheme(data)}
            >
              <Icon name="calc" size={17} />
              <span>{t("detail.viewInCalc")}</span>
            </Link>
          </div>
        </div>

        <aside className="detail-hero-highlights">
          <h3>{t("detail.highlights")}</h3>
          <ul>
            {(data.key_highlights || []).map((hl, i) => (
              <li key={i}>
                <Icon name="checkCircle" size={16} />
                <span>{hl}</span>
              </li>
            ))}
          </ul>
          <div className="detail-rate-subsidy-box">
            <div>
              <small>INTEREST TERMS</small>
              <p>{data.interest_rate_note || `${data.interest_rate}% p.a. indicative`}</p>
            </div>
            <div>
              <small>SUBSIDY & MARGIN</small>
              <p>{data.subsidy_margin_note || `${data.subsidy_percent}% subsidy`}</p>
            </div>
          </div>
        </aside>
      </section>

      {/* Visual SVG EMI Repayment Graph (Auto-calculated, NOT a calculator form) */}
      <section className="detail-emi-section">
        <div className="detail-section-head detail-emi-head-row">
          <div>
            <span className="eyebrow">{t("detail.emiEyebrow")}</span>
            <h2>{t("detail.emiTitle")}</h2>
            <p>
              {form.loan_amount
                ? `Auto-calculated for your requested loan of ₹${Number(form.loan_amount).toLocaleString("en-IN")} at ${data.interest_rate}% p.a. over ${data.tenure_months} months (${data.moratorium_months}m moratorium).`
                : `Auto-calculated on indicative amount ₹${Number(emi.principal || 0).toLocaleString("en-IN")} at ${data.interest_rate}% p.a. over ${data.tenure_months} months (${data.moratorium_months}m moratorium).`}
            </p>
          </div>
          <Link
            to={`/calculator?scheme=${encodeURIComponent(data.code)}`}
            className="btn btn-outline detail-calc-link"
            onClick={() => setScheme(data)}
          >
            <Icon name="calc" size={17} />
            <span>{t("detail.viewInCalc")}</span>
          </Link>
        </div>

        <div className="detail-kpi-strip">
          <div className="kpi-card kpi-saffron">
            <small>MONTHLY EMI</small>
            <strong>₹{Number(emi.monthly_emi || 0).toLocaleString("en-IN")}</strong>
            <span>after {data.moratorium_months}m moratorium</span>
          </div>
          <div className="kpi-card kpi-emerald">
            <small>LOAN PRINCIPAL</small>
            <strong>₹{Number(emi.principal || 0).toLocaleString("en-IN")}</strong>
            <span>at {data.interest_rate}% p.a.</span>
          </div>
          <div className="kpi-card kpi-amber">
            <small>TOTAL INTEREST</small>
            <strong>₹{Number(emi.total_interest || 0).toLocaleString("en-IN")}</strong>
            <span>over {data.tenure_months} months</span>
          </div>
          <div className="kpi-card">
            <small>TOTAL PAYABLE</small>
            <strong>₹{Number(emi.total_payable || 0).toLocaleString("en-IN")}</strong>
            <span>principal + interest</span>
          </div>
        </div>

        <EmiSvgVisuals emi={emi} scheme={data} />
      </section>

      {/* 2-Column Lower Section: Required Documents Checklist + Important Notes */}
      <div className="detail-lower-grid">
        <section className="detail-docs-card">
          <div className="detail-card-head">
            <Icon name="document" size={20} />
            <div>
              <h2>{t("detail.docsTitle")}</h2>
              <small>Scheme-specific checklist for {data.code}</small>
            </div>
          </div>
          <div className="detail-doc-list">
            {docs.map((doc, idx) => {
              const checked = !!checkedDocs[idx];
              return (
                <label key={idx} className={`detail-doc-row ${checked ? "checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setCheckedDocs((p) => ({ ...p, [idx]: !p[idx] }))}
                  />
                  <span className="check-box-icon">
                    <Icon name="check" size={14} />
                  </span>
                  <span>{doc}</span>
                </label>
              );
            })}
          </div>
        </section>

        <aside className="detail-notes-card">
          <div className="detail-card-head">
            <Icon name="alert" size={20} />
            <div>
              <h2>{t("detail.notesTitle")}</h2>
              <small>Key rules & comparison caveats</small>
            </div>
          </div>
          <ul className="detail-notes-list">
            {(data.important_notes || []).map((note, idx) => (
              <li key={idx}>
                <Icon name="alert" size={15} />
                <span>{note}</span>
              </li>
            ))}
          </ul>

          <div className="detail-cta-panel">
            <p>Ready to apply via verified channels for {data.code}?</p>
            <Link
              to={`/apply?scheme=${encodeURIComponent(data.code)}`}
              className="btn btn-primary btn-lg full"
              onClick={() => setScheme(data)}
            >
              <span>{t("detail.applyCta")}</span>
              <Icon name="arrow" size={18} />
            </Link>
            <Link
              to={`/locator?scheme=${encodeURIComponent(data.code)}`}
              className="btn btn-secondary full"
              style={{ marginTop: "10px" }}
              onClick={() => setScheme(data)}
            >
              <Icon name="location" size={17} />
              <span>{t("detail.findBanksPortals")}</span>
            </Link>
            <Link
              to={`/calculator?scheme=${encodeURIComponent(data.code)}`}
              className="btn btn-outline full"
              style={{ marginTop: "10px" }}
              onClick={() => setScheme(data)}
            >
              <Icon name="calc" size={17} />
              <span>{t("detail.viewInCalc")}</span>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
