import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n, useTranslatedScheme, useTranslatedSchemes } from "../i18n.jsx";

const MARKET_PRESETS = [
  {
    id: "mudra",
    name: "Mudra / Micro Business Loan",
    amount: 200000,
    rate: 10.5,
    range: "9.50% – 12.00%",
    tenure: 36,
    moratorium: 0,
  },
  {
    id: "msme",
    name: "MSME / Small Business Term Loan",
    amount: 1000000,
    rate: 10.25,
    range: "9.00% – 12.50%",
    tenure: 60,
    moratorium: 0,
  },
  {
    id: "education",
    name: "Education Loan",
    amount: 800000,
    rate: 9.25,
    range: "8.50% – 10.75%",
    tenure: 84,
    moratorium: 12,
  },
  {
    id: "housing",
    name: "Home / Affordable Housing Loan",
    amount: 1500000,
    rate: 8.75,
    range: "8.35% – 9.75%",
    tenure: 180,
    moratorium: 0,
  },
  {
    id: "agriculture",
    name: "Agriculture / KCC / Solar Pump Loan",
    amount: 300000,
    rate: 7.0,
    range: "7.00% – 9.00%",
    tenure: 60,
    moratorium: 0,
  },
  {
    id: "vehicle",
    name: "Commercial Vehicle / E-Rickshaw Loan",
    amount: 400000,
    rate: 11.0,
    range: "9.50% – 13.50%",
    tenure: 60,
    moratorium: 0,
  },
  {
    id: "personal",
    name: "Personal / General Unsecured Loan",
    amount: 150000,
    rate: 13.0,
    range: "11.00% – 16.00%",
    tenure: 36,
    moratorium: 0,
  },
];

const AMOUNT_MIN = 10000;
const AMOUNT_MAX = 10000000;
const RATE_MIN = 1;
const RATE_MAX = 24;
const TENURE_MIN_MONTHS = 6;
const TENURE_MAX_MONTHS = 360;
const MARKET_BENCHMARK_RATE = 11.0;

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function formatInr(val) {
  const num = Number(val || 0);
  return `₹${Math.round(num).toLocaleString("en-IN")}`;
}

function formatExactInr(val) {
  const num = Number(val || 0);
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatCompactInr(val, units = {}) {
  const n = Number(val || 0);
  const cr = units.cr || "Cr";
  const l = units.l || "L";
  const k = units.k || "K";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2).replace(/\.00$/, "")} ${cr}`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1).replace(/\.0$/, "")}${l}`;
  if (n >= 1000) return `₹${Math.round(n / 1000)}${k}`;
  return `₹${Math.round(n)}`;
}

function buildYearlySchedule(schedule, initialPrincipal, moratoriumMonths) {
  const years = new Map();
  for (const row of schedule) {
    const yr = Math.floor((row.month - 1) / 12) + 1;
    if (!years.has(yr)) {
      years.set(yr, {
        year: yr,
        principal_paid: 0,
        interest_paid: 0,
        total_paid: 0,
        ending_balance: Number(row.balance),
        moratorium_months: 0,
        months: [],
      });
    }
    const bucket = years.get(yr);
    bucket.principal_paid += Number(row.principal);
    bucket.interest_paid += Number(row.interest);
    bucket.total_paid += Number(row.emi);
    bucket.ending_balance = Number(row.balance);
    if (row.month <= moratoriumMonths) {
      bucket.moratorium_months += 1;
    }
    bucket.months.push(row);
  }

  const out = [];
  let runningOpen = Number(initialPrincipal || 0);
  for (const yr of Array.from(years.keys()).sort((a, b) => a - b)) {
    const b = years.get(yr);
    out.push({
      year: b.year,
      opening_balance: Number(runningOpen.toFixed(2)),
      principal_paid: Number(b.principal_paid.toFixed(2)),
      interest_paid: Number(b.interest_paid.toFixed(2)),
      total_paid: Number(b.total_paid.toFixed(2)),
      ending_balance: Number(b.ending_balance.toFixed(2)),
      moratorium_months: b.moratorium_months,
      is_moratorium_year: b.moratorium_months > 0,
      months: b.months,
    });
    runningOpen = b.ending_balance;
  }
  return out;
}

function calculateEmiLocal(principal, annualRate, tenureMonths, moratoriumMonths = 0) {
  const p = Math.max(0, Number(principal || 0));
  const nTotal = Math.max(1, Math.round(Number(tenureMonths || 60)));
  const m = Math.max(0, Math.min(Math.round(Number(moratoriumMonths || 0)), nTotal - 1));
  const n = Math.max(1, nTotal - m);
  const r = Math.max(0, Number(annualRate || 0)) / 12 / 100;

  if (p <= 0) {
    return {
      principal: 0,
      annual_rate: Number(annualRate || 0),
      tenure_months: nTotal,
      moratorium_months: m,
      monthly_emi: 0,
      total_interest: 0,
      total_payable: 0,
      schedule: [],
      yearly_schedule: [],
    };
  }

  const pAfterMoratorium = m > 0 ? p * Math.pow(1 + r, m) : p;
  let emi = 0;
  if (r === 0) {
    emi = pAfterMoratorium / n;
  } else {
    const factor = Math.pow(1 + r, n);
    emi = (pAfterMoratorium * r * factor) / (factor - 1);
  }

  const schedule = [];
  let balance = p;
  let totalInterest = 0;

  for (let month = 1; month <= nTotal; month++) {
    const interest = balance * r;
    let principalPaid = 0;
    let payment = 0;
    let note = "";

    if (month <= m) {
      principalPaid = 0;
      payment = 0;
      totalInterest += interest;
      balance += interest;
      note = "Moratorium — interest added, no EMI";
    } else {
      if (month === nTotal) {
        principalPaid = balance;
        payment = principalPaid + interest;
      } else {
        principalPaid = Math.min(emi - interest, balance);
        payment = emi;
      }
      totalInterest += interest;
      balance = Math.max(0, balance - principalPaid);
    }

    schedule.push({
      month,
      emi: Number(payment.toFixed(2)),
      principal: Number(principalPaid.toFixed(2)),
      interest: Number(interest.toFixed(2)),
      balance: Number(balance.toFixed(2)),
      note,
    });
  }

  return {
    principal: Number(p.toFixed(2)),
    annual_rate: Number(annualRate || 0),
    tenure_months: nTotal,
    moratorium_months: m,
    monthly_emi: Number(emi.toFixed(2)),
    total_interest: Number(totalInterest.toFixed(2)),
    total_payable: Number((p + totalInterest).toFixed(2)),
    schedule,
    yearly_schedule: buildYearlySchedule(schedule, p, m),
  };
}

function resolveSchemeAmount(schemeObj, userLoanAmount) {
  const minLoan = schemeObj?.min_loan != null ? Number(schemeObj.min_loan) : 0;
  const maxLoan = schemeObj?.max_loan != null ? Number(schemeObj.max_loan) : null;
  const req = Number(userLoanAmount || 0);

  if (req > 0) {
    const aboveMin = req >= minLoan;
    const belowMax = maxLoan === null || maxLoan <= 0 || req <= maxLoan;
    if (aboveMin && belowMax) return req;
    if (maxLoan !== null && maxLoan > 0 && req > maxLoan) return maxLoan;
    if (req < minLoan) return Math.max(10000, minLoan);
  }

  let base = 500000;
  if (maxLoan !== null && maxLoan > 0) base = Math.min(base, maxLoan);
  if (minLoan > base) base = minLoan;
  return Math.max(10000, base);
}

function LockSvg({ size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function UnlockSvg({ size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.6-1.7" />
    </svg>
  );
}

function DonutChartSvg({ principal, interest, totalPayable, t }) {
  const [hoveredSegment, setHoveredSegment] = useState(null);
  const total = Math.max(1, principal + interest);
  const principalPct = Math.round((principal / total) * 100);
  const interestPct = Math.max(0, 100 - principalPct);

  const r = 60;
  const circ = 2 * Math.PI * r;
  const principalDash = (principal / total) * circ;
  const interestDash = (interest / total) * circ;

  const centerPct = hoveredSegment === "interest" ? `${interestPct}%` : `${principalPct}%`;
  const centerLabel =
    hoveredSegment === "interest" ? t("calc.interestPaid") : t("calc.principalPaid");
  const centerAmount =
    hoveredSegment === "interest" ? formatExactInr(interest) : formatExactInr(principal);

  return (
    <div className="calc-svg-card">
      <div className="calc-svg-head">
        <h3>{t("calc.donutTitle")}</h3>
        <span className="ratio-pill">
          {principalPct}% : {interestPct}%
        </span>
      </div>

      <div className="calc-donut-layout">
        <svg
          viewBox="0 0 176 176"
          className="calc-donut-svg"
          role="img"
          aria-label={t("calc.donutTitle")}
        >
          <circle cx="88" cy="88" r={r} fill="none" stroke="#e2e8f0" strokeWidth="22" />
          <circle
            cx="88"
            cy="88"
            r={r}
            fill="none"
            stroke="#15803d"
            strokeWidth={hoveredSegment === "principal" ? "26" : "22"}
            strokeDasharray={`${principalDash} ${circ}`}
            transform="rotate(-90 88 88)"
            className="donut-segment"
            onMouseEnter={() => setHoveredSegment("principal")}
            onMouseLeave={() => setHoveredSegment(null)}
          >
            <title>{`${t("calc.principal")}: ${formatExactInr(principal)} (${principalPct}%)`}</title>
          </circle>
          {interest > 0 && (
            <circle
              cx="88"
              cy="88"
              r={r}
              fill="none"
              stroke="#ea580c"
              strokeWidth={hoveredSegment === "interest" ? "26" : "22"}
              strokeDasharray={`${interestDash} ${circ}`}
              strokeDashoffset={-principalDash}
              transform="rotate(-90 88 88)"
              className="donut-segment"
              onMouseEnter={() => setHoveredSegment("interest")}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              <title>{`${t("calc.interest")}: ${formatExactInr(interest)} (${interestPct}%)`}</title>
            </circle>
          )}
          <text x="88" y="80" textAnchor="middle" className="calc-donut-pct">
            {centerPct}
          </text>
          <text x="88" y="97" textAnchor="middle" className="calc-donut-sub">
            {centerLabel}
          </text>
          <text x="88" y="113" textAnchor="middle" className="calc-donut-val">
            {centerAmount}
          </text>
        </svg>

        <div className="calc-donut-legend">
          <button
            type="button"
            className={`calc-legend-item ${hoveredSegment === "principal" ? "active" : ""}`}
            onMouseEnter={() => setHoveredSegment("principal")}
            onMouseLeave={() => setHoveredSegment(null)}
            onFocus={() => setHoveredSegment("principal")}
            onBlur={() => setHoveredSegment(null)}
          >
            <span className="legend-dot green" />
            <div>
              <small>
                {t("calc.principalAmount")} ({principalPct}%)
              </small>
              <strong>{formatExactInr(principal)}</strong>
            </div>
          </button>

          <button
            type="button"
            className={`calc-legend-item ${hoveredSegment === "interest" ? "active" : ""}`}
            onMouseEnter={() => setHoveredSegment("interest")}
            onMouseLeave={() => setHoveredSegment(null)}
            onFocus={() => setHoveredSegment("interest")}
            onBlur={() => setHoveredSegment(null)}
          >
            <span className="legend-dot saffron" />
            <div>
              <small>
                {t("calc.totalInterest")} ({interestPct}%)
              </small>
              <strong>{formatExactInr(interest)}</strong>
            </div>
          </button>

          <div className="calc-legend-total">
            <span className="legend-dot navy" />
            <div>
              <small>{t("calc.totalPayable")}</small>
              <strong>{formatExactInr(totalPayable)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function YearlyRepaymentSvg({ yearly, principal, moratoriumMonths, t }) {
  const [activeYear, setActiveYear] = useState(null);

  useEffect(() => {
    if (yearly.length > 0) {
      setActiveYear((prev) =>
        prev && yearly.some((y) => y.year === prev) ? prev : yearly[0].year
      );
    } else {
      setActiveYear(null);
    }
  }, [yearly]);

  if (!yearly || yearly.length === 0) return null;

  const width = 680;
  const height = 290;
  const pad = { top: 24, right: 62, bottom: 42, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const numYears = yearly.length;
  const colW = plotW / numYears;
  const barW = Math.min(34, Math.max(8, colW * 0.56));

  const maxBalance = Math.max(
    1,
    principal,
    ...yearly.map((y) => Number(y.opening_balance || 0)),
    ...yearly.map((y) => Number(y.ending_balance || 0))
  );
  const maxAnnualPay = Math.max(
    1,
    ...yearly.map((y) => Number(y.principal_paid || 0) + Number(y.interest_paid || 0))
  );
  const barScaleMax = maxAnnualPay * 1.15;

  const xCenter = (idx) => pad.left + (idx + 0.5) * colW;
  const yBal = (bal) => pad.top + plotH - (Number(bal) / maxBalance) * plotH;
  const hPay = (amt) => (Number(amt) / barScaleMax) * plotH;

  // Balance curve points: start at left edge (Year 0) + end of each year column
  const curvePoints = [
    {
      year: 0,
      x: pad.left + colW * 0.12,
      y: yBal(principal),
      balance: principal,
    },
    ...yearly.map((y, idx) => ({
      year: y.year,
      x: xCenter(idx),
      y: yBal(y.ending_balance),
      balance: y.ending_balance,
      isMoratorium: y.is_moratorium_year,
    })),
  ];

  const linePath = curvePoints
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(" ");

  const moratoriumYearsCount = yearly.filter((y) => y.is_moratorium_year).length;
  const inspected = yearly.find((y) => y.year === activeYear) || yearly[0];
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="calc-svg-card">
      <div className="calc-svg-head wrap">
        <div>
          <h3>{t("calc.yearlyGraphTitle")}</h3>
          <small className="calc-svg-sub">{t("calc.inspectYearPrompt")}</small>
        </div>
        <div className="calc-chart-legend-inline">
          <span>
            <i className="dot green" /> {t("calc.principalPaid")}
          </span>
          <span>
            <i className="dot saffron" /> {t("calc.interestPaid")}
          </span>
          <span>
            <i className="dot navy-line" /> {t("calc.closingBal")}
          </span>
          {moratoriumMonths > 0 && (
            <span className="moratorium-legend-tag">
              {t("calc.moratoriumShort")}: {t("detail.monthsShort", { months: String(moratoriumMonths) })}
            </span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="calc-yearly-svg"
        role="img"
        aria-label={t("calc.yearlyGraphTitle")}
      >
        {/* Horizontal gridlines + Left (Balance) & Right (Annual Payment) Y-axis labels */}
        {yTicks.map((tick) => {
          const y = pad.top + plotH * (1 - tick);
          const units = { cr: t("calc.unitCr"), l: t("calc.unitL"), k: t("calc.unitK") };
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                y1={y}
                x2={pad.left + plotW}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray={tick === 0 ? undefined : "4 4"}
              />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" className="svg-axis-label">
                {formatCompactInr(maxBalance * tick, units)}
              </text>
              <text
                x={pad.left + plotW + 8}
                y={y + 4}
                textAnchor="start"
                className="svg-axis-label svg-axis-right"
              >
                {formatCompactInr(barScaleMax * tick, units)}
              </text>
            </g>
          );
        })}

        {/* Moratorium Shaded Years */}
        {moratoriumYearsCount > 0 && (
          <g>
            <rect
              x={pad.left}
              y={pad.top}
              width={moratoriumYearsCount * colW}
              height={plotH}
              fill="#fef3c7"
              opacity="0.7"
            />
            <line
              x1={pad.left + moratoriumYearsCount * colW}
              y1={pad.top}
              x2={pad.left + moratoriumYearsCount * colW}
              y2={pad.top + plotH}
              stroke="#d97706"
              strokeDasharray="4 3"
              strokeWidth="1.5"
            />
          </g>
        )}

        {/* Stacked Bars per Year (Principal bottom, Interest top) */}
        {yearly.map((y, idx) => {
          const cx = xCenter(idx);
          const bx = cx - barW / 2;
          const pH = hPay(y.principal_paid);
          const iH = hPay(y.interest_paid);
          const pY = pad.top + plotH - pH;
          const iY = pY - iH;
          const isActive = activeYear === y.year;
          const showXTick =
            numYears <= 10 || y.year === 1 || y.year === numYears || y.year % Math.ceil(numYears / 8) === 0;

          return (
            <g
              key={y.year}
              className="yearly-col-group"
              tabIndex={0}
              role="button"
              aria-label={t("calc.svgYearAria", {
                year: String(y.year),
                principal: formatExactInr(y.principal_paid),
                interest: formatExactInr(y.interest_paid),
                balance: formatExactInr(y.ending_balance),
              })}
              onMouseEnter={() => setActiveYear(y.year)}
              onClick={() => setActiveYear(y.year)}
              onFocus={() => setActiveYear(y.year)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveYear(y.year);
                }
              }}
            >
              {/* Active highlight band */}
              {isActive && (
                <rect
                  x={pad.left + idx * colW}
                  y={pad.top}
                  width={colW}
                  height={plotH}
                  fill="rgba(15, 23, 42, 0.06)"
                />
              )}

              {/* Principal Paid Bar */}
              {pH > 0 && (
                <rect
                  x={bx}
                  y={pY}
                  width={barW}
                  height={pH}
                  rx="2"
                  fill={isActive ? "#166534" : "#15803d"}
                  opacity={isActive ? 1 : 0.88}
                />
              )}

              {/* Interest Paid Bar */}
              {iH > 0 && (
                <rect
                  x={bx}
                  y={iY}
                  width={barW}
                  height={iH}
                  rx="2"
                  fill={isActive ? "#c2410c" : "#ea580c"}
                  opacity={isActive ? 1 : 0.88}
                />
              )}

              {/* Transparent full-column hit target */}
              <rect
                x={pad.left + idx * colW}
                y={pad.top}
                width={colW}
                height={plotH}
                fill="transparent"
                style={{ cursor: "pointer" }}
              />

              {showXTick && (
                <text
                  x={cx}
                  y={height - 14}
                  textAnchor="middle"
                  className={`svg-axis-label ${isActive ? "active" : ""}`}
                >
                  {t("calc.svgYearShort", { year: String(y.year) })}
                </text>
              )}
            </g>
          );
        })}

        {/* Remaining Balance Curve */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="#0f172a"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Curve Dots */}
        {curvePoints.map((pt) => {
          const isActive = pt.year > 0 && activeYear === pt.year;
          return (
            <circle
              key={`pt-${pt.year}`}
              cx={pt.x}
              cy={pt.y}
              r={isActive ? 5.5 : 3.5}
              fill={pt.isMoratorium ? "#d97706" : "#0f172a"}
              stroke="#ffffff"
              strokeWidth="2"
              style={{ pointerEvents: "none" }}
            />
          );
        })}
      </svg>

      {/* Interactive Year Inspection Readout */}
      {inspected && (
        <div className="calc-year-inspector" role="region" aria-live="polite">
          <div className="inspector-head">
            <strong>{t("calc.yearLabel", { year: String(inspected.year) })}</strong>
            {inspected.is_moratorium_year && (
              <span className="moratorium-badge-sm">
                {t("calc.moratoriumShort")} ({t("detail.monthsShort", { months: String(inspected.moratorium_months) })})
              </span>
            )}
          </div>
          <div className="inspector-metrics">
            <div>
              <small>{t("calc.openingBal")}</small>
              <b>{formatExactInr(inspected.opening_balance)}</b>
            </div>
            <div>
              <small>{t("calc.principalPaid")}</small>
              <b className="text-forest">{formatExactInr(inspected.principal_paid)}</b>
            </div>
            <div>
              <small>{t("calc.interestPaid")}</small>
              <b className="text-saffron">{formatExactInr(inspected.interest_paid)}</b>
            </div>
            <div>
              <small>{t("calc.yearlyPayment")}</small>
              <b>{formatExactInr(inspected.total_paid)}</b>
            </div>
            <div>
              <small>{t("calc.closingBal")}</small>
              <b>{formatExactInr(inspected.ending_balance)}</b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Calculator() {
  const { t } = useI18n();
  const { form, setScheme } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const querySchemeCode = (searchParams.get("scheme") || "").trim();

  // All 66 schemes for Mode B dropdown
  const [allSchemes, setAllSchemes] = useState([]);
  const translatedAllSchemes = useTranslatedSchemes(allSchemes);
  const [schemesLoading, setSchemesLoading] = useState(false);

  // Mode B active locked scheme
  const [lockedScheme, setLockedScheme] = useState(null);
  const translatedLockedScheme = useTranslatedScheme(lockedScheme);
  const [schemeLoading, setSchemeLoading] = useState(Boolean(querySchemeCode));
  const [schemeError, setSchemeError] = useState("");

  // Mode A parameters & live input drafts
  const [activePresetId, setActivePresetId] = useState("mudra");
  const [amount, setAmount] = useState(MARKET_PRESETS[0].amount);
  const [rate, setRate] = useState(MARKET_PRESETS[0].rate);
  const [tenure, setTenure] = useState(MARKET_PRESETS[0].tenure);
  const [moratorium, setMoratorium] = useState(MARKET_PRESETS[0].moratorium);
  const [tenureUnit, setTenureUnit] = useState("months");

  const [amountDraft, setAmountDraft] = useState(String(MARKET_PRESETS[0].amount));
  const [rateDraft, setRateDraft] = useState(String(MARKET_PRESETS[0].rate));
  const [tenureDraft, setTenureDraft] = useState(String(MARKET_PRESETS[0].tenure));
  const [moratoriumDraft, setMoratoriumDraft] = useState(String(MARKET_PRESETS[0].moratorium));

  // Authoritative backend EMI response (synced in background) & UI state
  const [serverEmi, setServerEmi] = useState(null);
  const [error, setError] = useState("");
  const [scheduleExpanded, setScheduleExpanded] = useState(true);
  const [expandedYearMonths, setExpandedYearMonths] = useState(null);
  const emiRequestSeq = useRef(0);

  const presetLabels = useMemo(
    () => ({
      mudra: t("calc.presetMudra"),
      msme: t("calc.presetMsme"),
      education: t("calc.presetEducation"),
      housing: t("calc.presetHousing"),
      agriculture: t("calc.presetAgri"),
      vehicle: t("calc.presetVehicle"),
      personal: t("calc.presetPersonal"),
    }),
    [t]
  );

  const isLocked = Boolean(translatedLockedScheme);
  const selectedPreset = useMemo(
    () => MARKET_PRESETS.find((p) => p.id === activePresetId) || null,
    [activePresetId]
  );

  // Sync draft strings whenever numeric values change programmatically
  const syncAllDrafts = (nextAmount, nextRate, nextTenureMonths, nextMoratorium, unit = tenureUnit) => {
    setAmountDraft(String(Math.round(nextAmount)));
    setRateDraft(String(Number(nextRate)));
    setTenureDraft(
      unit === "years"
        ? String(Number((nextTenureMonths / 12).toFixed(2)))
        : String(Math.round(nextTenureMonths))
    );
    setMoratoriumDraft(String(Math.round(nextMoratorium)));
  };

  // Fetch all 66 schemes once for the "Load Govt Scheme" selector
  useEffect(() => {
    let cancelled = false;
    setSchemesLoading(true);
    api
      .schemes()
      .then((res) => {
        if (!cancelled && Array.isArray(res?.schemes)) {
          setAllSchemes(res.schemes);
        }
      })
      .catch(() => {
        /* ignore if offline */
      })
      .finally(() => {
        if (!cancelled) setSchemesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle ?scheme=<CODE> URL param -> enter Mode B (Locked Govt Scheme)
  useEffect(() => {
    if (!querySchemeCode) {
      setLockedScheme(null);
      setSchemeError("");
      setSchemeLoading(false);
      return;
    }

    let cancelled = false;
    setSchemeLoading(true);
    setSchemeError("");

    const known = allSchemes.find(
      (s) => s.code?.toUpperCase() === querySchemeCode.toUpperCase()
    );
    const knownTargetAmount = known ? resolveSchemeAmount(known, form.loan_amount) : undefined;

    api
      .schemeDetail(querySchemeCode, knownTargetAmount)
      .then(async (res) => {
        if (cancelled) return;
        const resolvedAmt = resolveSchemeAmount(res, form.loan_amount);
        let finalRes = res;
        if (
          res?.emi?.principal !== undefined &&
          Math.abs(Number(res.emi.principal) - resolvedAmt) > 1
        ) {
          try {
            finalRes = await api.schemeDetail(querySchemeCode, resolvedAmt);
          } catch {
            finalRes = res;
          }
        }
        if (cancelled) return;

        const lockedAmt = Number(finalRes.emi?.principal || resolvedAmt);
        const lockedRate = Number(finalRes.interest_rate || 0);
        const lockedTenure = Number(finalRes.tenure_months || 60);
        const lockedMoratorium = Math.min(
          Number(finalRes.moratorium_months || 0),
          Math.max(0, lockedTenure - 1)
        );

        setLockedScheme(finalRes);
        setScheme(finalRes);
        setAmount(lockedAmt);
        setRate(lockedRate);
        setTenure(lockedTenure);
        setMoratorium(lockedMoratorium);
        setTenureUnit("months");
        syncAllDrafts(lockedAmt, lockedRate, lockedTenure, lockedMoratorium, "months");
        setServerEmi(finalRes.emi || null);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setLockedScheme(null);
          setSchemeError(err.body?.detail || err.message || t("detail.notFoundDesc", { code: querySchemeCode }));
        }
      })
      .finally(() => {
        if (!cancelled) setSchemeLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [querySchemeCode, form.loan_amount]);

  // Mode A: sync authoritative backend EMI with debounced call to /api/emi/
  useEffect(() => {
    if (isLocked || querySchemeCode) return;

    const seq = ++emiRequestSeq.current;
    const timer = setTimeout(() => {
      const safeTenure = clamp(Math.round(tenure), 1, 360);
      const safeMoratorium = clamp(Math.round(moratorium), 0, Math.max(0, safeTenure - 1));
      api
        .emi({
          amount: Number(amount),
          annual_rate: Number(rate),
          tenure_months: safeTenure,
          moratorium_months: safeMoratorium,
        })
        .then((data) => {
          if (seq === emiRequestSeq.current) {
            setServerEmi(data);
            setError("");
          }
        })
        .catch((e) => {
          if (seq === emiRequestSeq.current) {
            setError(e.body?.detail || e.message);
          }
        });
    }, 120);

    return () => clearTimeout(timer);
  }, [amount, rate, tenure, moratorium, isLocked, querySchemeCode]);

  // Instant local calculation (mirrors core/emi.py) for zero-lag 60fps UI & SVG graphs
  const localCalc = useMemo(
    () => calculateEmiLocal(amount, rate, tenure, moratorium),
    [amount, rate, tenure, moratorium]
  );

  // Merge authoritative backend figures when matching current parameters
  const activeCalc = useMemo(() => {
    if (
      serverEmi &&
      Math.abs(Number(serverEmi.principal) - localCalc.principal) < 1 &&
      Math.abs(Number(serverEmi.annual_rate) - localCalc.annual_rate) < 0.01 &&
      Number(serverEmi.tenure_months) === localCalc.tenure_months &&
      Number(serverEmi.moratorium_months) === localCalc.moratorium_months
    ) {
      const yearly =
        Array.isArray(serverEmi.yearly_schedule) && serverEmi.yearly_schedule.length > 0
          ? (() => {
              let open = Number(serverEmi.principal);
              return serverEmi.yearly_schedule.map((y, idx) => {
                const localYear = localCalc.yearly_schedule[idx];
                const row = {
                  ...y,
                  opening_balance: Number(open.toFixed(2)),
                  months: localYear?.months || [],
                };
                open = Number(y.ending_balance);
                return row;
              });
            })()
          : serverEmi.schedule
          ? buildYearlySchedule(
              serverEmi.schedule,
              serverEmi.principal,
              serverEmi.moratorium_months
            )
          : localCalc.yearly_schedule;

      return {
        ...localCalc,
        monthly_emi: Number(serverEmi.monthly_emi),
        total_interest: Number(serverEmi.total_interest),
        total_payable: Number(serverEmi.total_payable),
        yearly_schedule: yearly,
      };
    }
    return localCalc;
  }, [serverEmi, localCalc]);

  // Market Savings Comparison when Mode B (Govt Scheme) is locked
  const marketComparison = useMemo(() => {
    if (!isLocked) return null;
    const marketEmi = calculateEmiLocal(
      activeCalc.principal,
      MARKET_BENCHMARK_RATE,
      activeCalc.tenure_months,
      activeCalc.moratorium_months
    );
    const interestSaved = Math.max(0, marketEmi.total_interest - activeCalc.total_interest);
    const monthlySaved = Math.max(0, marketEmi.monthly_emi - activeCalc.monthly_emi);
    return {
      marketRate: MARKET_BENCHMARK_RATE,
      marketInterest: marketEmi.total_interest,
      marketMonthlyEmi: marketEmi.monthly_emi,
      interestSaved,
      monthlySaved,
      isCheaper: activeCalc.annual_rate < MARKET_BENCHMARK_RATE && interestSaved > 0,
    };
  }, [isLocked, activeCalc]);

  const applyPreset = (preset) => {
    if (isLocked) return;
    setActivePresetId(preset.id);
    setAmount(preset.amount);
    setRate(preset.rate);
    setTenure(preset.tenure);
    setMoratorium(preset.moratorium);
    syncAllDrafts(preset.amount, preset.rate, preset.tenure, preset.moratorium, tenureUnit);
  };

  const handleSelectScheme = (code) => {
    if (!code) {
      handleUnlockToCustom();
      return;
    }
    setSearchParams({ scheme: code });
  };

  const handleUnlockToCustom = () => {
    setLockedScheme(null);
    setSchemeError("");
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("scheme");
    setSearchParams(nextParams);

    const preset = MARKET_PRESETS[0];
    setActivePresetId(preset.id);
    setAmount(preset.amount);
    setRate(preset.rate);
    setTenure(preset.tenure);
    setMoratorium(preset.moratorium);
    setServerEmi(null);
    syncAllDrafts(preset.amount, preset.rate, preset.tenure, preset.moratorium, tenureUnit);
  };

  // Amazon-style dual input handlers (Mode A only)
  const handleAmountSlider = (val) => {
    if (isLocked) return;
    const next = clamp(Number(val), AMOUNT_MIN, AMOUNT_MAX);
    setActivePresetId("custom");
    setAmount(next);
    setAmountDraft(String(next));
  };

  const handleAmountText = (raw) => {
    if (isLocked) return;
    setAmountDraft(raw);
    if (raw === "") return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1000 && parsed <= AMOUNT_MAX) {
      setActivePresetId("custom");
      setAmount(parsed);
    }
  };

  const handleAmountBlur = () => {
    const parsed = Number(amountDraft);
    const next = Number.isFinite(parsed)
      ? clamp(Math.round(parsed), AMOUNT_MIN, AMOUNT_MAX)
      : AMOUNT_MIN;
    setAmount(next);
    setAmountDraft(String(next));
  };

  const handleRateSlider = (val) => {
    if (isLocked) return;
    const next = clamp(Number(val), RATE_MIN, RATE_MAX);
    setActivePresetId("custom");
    setRate(next);
    setRateDraft(String(next));
  };

  const handleRateText = (raw) => {
    if (isLocked) return;
    setRateDraft(raw);
    if (raw === "" || raw.endsWith(".")) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= RATE_MIN && parsed <= RATE_MAX) {
      setActivePresetId("custom");
      setRate(parsed);
    }
  };

  const handleRateBlur = () => {
    const parsed = Number(rateDraft);
    const next = Number.isFinite(parsed)
      ? Number(clamp(parsed, RATE_MIN, RATE_MAX).toFixed(2))
      : RATE_MIN;
    setRate(next);
    setRateDraft(String(next));
  };

  const handleTenureUnitSwitch = (unit) => {
    if (isLocked || unit === tenureUnit) return;
    setTenureUnit(unit);
    setTenureDraft(
      unit === "years"
        ? String(Number((tenure / 12).toFixed(2)))
        : String(Math.round(tenure))
    );
  };

  const handleTenureSlider = (val) => {
    if (isLocked) return;
    const num = Number(val);
    const nextMonths =
      tenureUnit === "years"
        ? clamp(Math.round(num * 12), TENURE_MIN_MONTHS, TENURE_MAX_MONTHS)
        : clamp(Math.round(num), TENURE_MIN_MONTHS, TENURE_MAX_MONTHS);
    setActivePresetId("custom");
    setTenure(nextMonths);
    setTenureDraft(
      tenureUnit === "years" ? String(Number((nextMonths / 12).toFixed(2))) : String(nextMonths)
    );
    if (moratorium >= nextMonths) {
      const clampedM = Math.max(0, nextMonths - 1);
      setMoratorium(clampedM);
      setMoratoriumDraft(String(clampedM));
    }
  };

  const handleTenureText = (raw) => {
    if (isLocked) return;
    setTenureDraft(raw);
    if (raw === "" || raw.endsWith(".")) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const nextMonths =
      tenureUnit === "years" ? Math.round(parsed * 12) : Math.round(parsed);
    if (nextMonths >= 1 && nextMonths <= TENURE_MAX_MONTHS) {
      setActivePresetId("custom");
      setTenure(nextMonths);
      if (moratorium >= nextMonths) {
        const clampedM = Math.max(0, nextMonths - 1);
        setMoratorium(clampedM);
        setMoratoriumDraft(String(clampedM));
      }
    }
  };

  const handleTenureBlur = () => {
    const parsed = Number(tenureDraft);
    const rawMonths = Number.isFinite(parsed)
      ? tenureUnit === "years"
        ? Math.round(parsed * 12)
        : Math.round(parsed)
      : TENURE_MIN_MONTHS;
    const nextMonths = clamp(rawMonths, 1, TENURE_MAX_MONTHS);
    setTenure(nextMonths);
    setTenureDraft(
      tenureUnit === "years" ? String(Number((nextMonths / 12).toFixed(2))) : String(nextMonths)
    );
    if (moratorium >= nextMonths) {
      const clampedM = Math.max(0, nextMonths - 1);
      setMoratorium(clampedM);
      setMoratoriumDraft(String(clampedM));
    }
  };

  const maxMoratorium = Math.min(36, Math.max(0, tenure - 1));

  const handleMoratoriumSlider = (val) => {
    if (isLocked) return;
    const next = clamp(Math.round(Number(val)), 0, maxMoratorium);
    setActivePresetId("custom");
    setMoratorium(next);
    setMoratoriumDraft(String(next));
  };

  const handleMoratoriumText = (raw) => {
    if (isLocked) return;
    setMoratoriumDraft(raw);
    if (raw === "") return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= maxMoratorium) {
      setActivePresetId("custom");
      setMoratorium(Math.round(parsed));
    }
  };

  const handleMoratoriumBlur = () => {
    const parsed = Number(moratoriumDraft);
    const next = Number.isFinite(parsed) ? clamp(Math.round(parsed), 0, maxMoratorium) : 0;
    setMoratorium(next);
    setMoratoriumDraft(String(next));
  };

  const totalPayableVal = Math.max(1, activeCalc.principal + activeCalc.total_interest);
  const principalRatioPct = Math.round((activeCalc.principal / totalPayableVal) * 100);
  const interestRatioPct = Math.max(0, 100 - principalRatioPct);

  return (
    <div className="page-shell calc-page">
      {/* Page Title & Mode Switcher Bar */}
      <div className="calc-top-header">
        <div className="page-title" style={{ marginBottom: 0 }}>
          <div className="calc-mode-pills">
            <span className={`calc-mode-badge ${isLocked ? "locked" : "general"}`}>
              {isLocked ? <LockSvg size={13} /> : <UnlockSvg size={13} />}
              <span>{isLocked ? t("calc.modeLockedBadge") : t("calc.modeGeneralBadge")}</span>
            </span>
          </div>
          <h1>{t("calc.title")}</h1>
          <p>
            {isLocked && translatedLockedScheme
              ? `${translatedLockedScheme.code} — ${translatedLockedScheme.name}`
              : t("calc.subtitle")}
          </p>
        </div>

        {/* Load Govt Scheme Dropdown */}
        <div className="calc-scheme-loader">
          <label htmlFor="calc-scheme-select">
            <Icon name="bank" size={15} />
            <span>{t("calc.loadSchemeLabel")}</span>
          </label>
          <div className="calc-scheme-select-row">
            <select
              id="calc-scheme-select"
              value={translatedLockedScheme?.code || querySchemeCode || ""}
              onChange={(e) => handleSelectScheme(e.target.value)}
              disabled={schemesLoading}
            >
              <option value="">{t("calc.loadSchemePlaceholder")}</option>
              {translatedAllSchemes.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name} ({s.interest_rate}{t("calc.pctPa")})
                </option>
              ))}
            </select>
            {isLocked && (
              <button
                type="button"
                className="btn btn-outline btn-sm calc-unlock-btn"
                onClick={handleUnlockToCustom}
              >
                <UnlockSvg size={14} />
                <span>{t("calc.unlockSwitchBtn")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mode B Lock Banner */}
      {isLocked && translatedLockedScheme && (
        <div className="calc-lock-banner" role="status">
          <div className="calc-lock-banner-main">
            <span className="calc-lock-icon-circle">
              <LockSvg size={20} />
            </span>
            <div>
              <strong>
                {t("calc.lockedBannerTitle", {
                  name: translatedLockedScheme.name,
                  code: translatedLockedScheme.code,
                })}
              </strong>
              <p>{t("calc.lockedBannerDesc")}</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleUnlockToCustom}
          >
            <UnlockSvg size={14} />
            <span>{t("calc.unlockSwitchBtn")}</span>
          </button>
        </div>
      )}

      {(error || schemeError) && (
        <div className="error-banner" style={{ marginBottom: "1.25rem" }}>
          <Icon name="alert" size={18} />
          <p>{schemeError || error}</p>
        </div>
      )}

      {/* Mode A: 7 Loan Type Preset Selector Cards */}
      <section className={`calc-presets-section ${isLocked ? "is-locked" : ""}`}>
        <div className="calc-presets-head">
          <div>
            <h2>{t("calc.presetsHeading")}</h2>
            <p>{t("calc.presetsSub")}</p>
          </div>
          {isLocked && (
            <span className="locked-chip">
              <LockSvg size={13} /> {t("calc.lockedChip")}
            </span>
          )}
        </div>

        <div className="calc-presets-grid" role="group" aria-label={t("calc.presetsHeading")}>
          {MARKET_PRESETS.map((preset) => {
            const isActive = !isLocked && activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={isLocked}
                aria-pressed={isActive}
                className={`calc-preset-card ${isActive ? "active" : ""}`}
                onClick={() => applyPreset(preset)}
              >
                <div className="preset-card-top">
                  <strong>{presetLabels[preset.id] || preset.name}</strong>
                  <span className="preset-rate-pill"><bdi>{preset.rate.toFixed(2)}{t("calc.pctPa")}</bdi></span>
                </div>
                <div className="preset-card-meta">
                  <span><bdi>{formatInr(preset.amount)}</bdi></span>
                  <span>•</span>
                  <span><bdi>{preset.tenure}{t("calc.mosShort")}</bdi></span>
                  {preset.moratorium > 0 && (
                    <>
                      <span>•</span>
                      <span><bdi>{preset.moratorium}{t("calc.mosShort")}</bdi></span>
                    </>
                  )}
                </div>
                <small className="preset-range-badge">
                  {t("calc.marketRange", { range: preset.range })}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main 2-Column Split: Left Controls (Amazon-style Dual Inputs) / Right Hero Results + Graphs */}
      <div className="calc-layout-pro">
        {/* Left Column: Parameter Controls + Mode B Official Scheme Terms */}
        <div className="calc-left-stack">
          <section className={`calc-controls ${isLocked ? "is-locked" : ""}`}>
            <div className="controls-head">
              <div className="controls-head-row">
                <h2>{t("calc.loanDetails")}</h2>
                {isLocked ? (
                  <span className="locked-chip">
                    <LockSvg size={13} /> {t("calc.fixedByScheme")}
                  </span>
                ) : (
                  <span className="preset-active-tag">
                    {selectedPreset ? (presetLabels[selectedPreset.id] || selectedPreset.name) : t("calc.customLabel")}
                  </span>
                )}
              </div>
              <p>
                {isLocked
                  ? t("calc.lockedBannerDesc")
                  : t("calc.adjustSliders")}
              </p>
            </div>

            {schemeLoading && (
              <div className="calc-loading-pill">{t("calc.loadingSchemeRules")}</div>
            )}

            {/* 1. Loan Amount (₹) */}
            <div className="dual-field">
              <div className="dual-label-row">
                <label htmlFor="calc-amount-input">
                  <strong>{t("calc.amount")}</strong>
                </label>
                <div className="amazon-input-wrap">
                  <span className="input-prefix">₹</span>
                  <input
                    id="calc-amount-input"
                    type="number"
                    min={1000}
                    max={AMOUNT_MAX}
                    step="any"
                    disabled={isLocked}
                    value={amountDraft}
                    onChange={(e) => handleAmountText(e.target.value)}
                    onBlur={handleAmountBlur}
                    aria-label={t("calc.amount")}
                  />
                </div>
              </div>
              <input
                type="range"
                min={AMOUNT_MIN}
                max={AMOUNT_MAX}
                step={1000}
                disabled={isLocked}
                value={clamp(amount, AMOUNT_MIN, AMOUNT_MAX)}
                onChange={(e) => handleAmountSlider(e.target.value)}
                aria-label={t("allSchemes.sliderAria", { label: t("calc.amount") })}
              />
              <small className="slider-limits">
                <span><bdi>{t("calc.amountMinLimit")}</bdi></span>
                <span className="limit-mid"><bdi>{formatCompactInr(amount, { cr: t("calc.unitCr"), l: t("calc.unitL"), k: t("calc.unitK") })}</bdi></span>
                <span><bdi>{t("calc.amountMaxLimit")}</bdi></span>
              </small>
            </div>

            {/* 2. Interest Rate (% p.a.) */}
            <div className="dual-field">
              <div className="dual-label-row">
                <label htmlFor="calc-rate-input">
                  <strong>{t("calc.rate")}</strong>
                  {!isLocked && selectedPreset && (
                    <span className="field-market-hint">
                      {t("calc.marketRange", { range: selectedPreset.range })}
                    </span>
                  )}
                </label>
                <div className="amazon-input-wrap compact">
                  <input
                    id="calc-rate-input"
                    type="number"
                    min={RATE_MIN}
                    max={RATE_MAX}
                    step="any"
                    disabled={isLocked}
                    value={rateDraft}
                    onChange={(e) => handleRateText(e.target.value)}
                    onBlur={handleRateBlur}
                    aria-label={t("calc.rate")}
                  />
                  <span className="input-suffix">{t("calc.pctPa")}</span>
                </div>
              </div>
              <input
                type="range"
                min={RATE_MIN}
                max={RATE_MAX}
                step={0.05}
                disabled={isLocked}
                value={clamp(rate, RATE_MIN, RATE_MAX)}
                onChange={(e) => handleRateSlider(e.target.value)}
                aria-label={t("allSchemes.sliderAria", { label: t("calc.rate") })}
              />
              <small className="slider-limits">
                <span>1%</span>
                <span className="limit-mid">{Number(rate).toFixed(2)}{t("calc.pctPa")}</span>
                <span>24%</span>
              </small>
            </div>

            {/* 3. Tenure (Months / Years Toggle) */}
            <div className="dual-field">
              <div className="dual-label-row">
                <div className="tenure-title-toggle">
                  <label htmlFor="calc-tenure-input">
                    <strong>{t("calc.tenure")}</strong>
                  </label>
                  <div className="unit-toggle-group" role="group" aria-label={t("calc.tenureUnitAria")}>
                    <button
                      type="button"
                      disabled={isLocked}
                      className={tenureUnit === "months" ? "active" : ""}
                      onClick={() => handleTenureUnitSwitch("months")}
                    >
                      {t("calc.monthsLabel")}
                    </button>
                    <button
                      type="button"
                      disabled={isLocked}
                      className={tenureUnit === "years" ? "active" : ""}
                      onClick={() => handleTenureUnitSwitch("years")}
                    >
                      {t("calc.yearsLabel")}
                    </button>
                  </div>
                </div>
                <div className="amazon-input-wrap compact">
                  <input
                    id="calc-tenure-input"
                    type="number"
                    min={1}
                    max={tenureUnit === "years" ? 30 : TENURE_MAX_MONTHS}
                    step="any"
                    disabled={isLocked}
                    value={tenureDraft}
                    onChange={(e) => handleTenureText(e.target.value)}
                    onBlur={handleTenureBlur}
                    aria-label={t("calc.tenure")}
                  />
                  <span className="input-suffix">
                    {tenureUnit === "years" ? t("calc.yrsUnit") : t("calc.mosUnit")}
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={tenureUnit === "years" ? 1 : TENURE_MIN_MONTHS}
                max={tenureUnit === "years" ? 30 : TENURE_MAX_MONTHS}
                step={tenureUnit === "years" ? 0.5 : 1}
                disabled={isLocked}
                value={
                  tenureUnit === "years"
                    ? clamp(Number((tenure / 12).toFixed(2)), 1, 30)
                    : clamp(tenure, TENURE_MIN_MONTHS, TENURE_MAX_MONTHS)
                }
                onChange={(e) => handleTenureSlider(e.target.value)}
                aria-label={t("allSchemes.sliderAria", { label: t("calc.tenure") })}
              />
              <small className="slider-limits">
                <span>{tenureUnit === "years" ? t("calc.minYearsLimit") : t("calc.minMonthsLimit")}</span>
                <span className="limit-mid">
                  <bdi>
                    {tenure} {t("calc.monthsUnit")} ({(tenure / 12).toFixed(1)} {t("calc.yrsUnit")})
                  </bdi>
                </span>
                <span>{tenureUnit === "years" ? t("calc.maxYearsLimit") : t("calc.maxMonthsLimit")}</span>
              </small>
            </div>

            {/* 4. Moratorium Period (Months) */}
            <div className="dual-field">
              <div className="dual-label-row">
                <label htmlFor="calc-moratorium-input">
                  <strong>{t("calc.moratoriumShort")}</strong>
                </label>
                <div className="amazon-input-wrap compact">
                  <input
                    id="calc-moratorium-input"
                    type="number"
                    min={0}
                    max={maxMoratorium}
                    step={1}
                    disabled={isLocked}
                    value={moratoriumDraft}
                    onChange={(e) => handleMoratoriumText(e.target.value)}
                    onBlur={handleMoratoriumBlur}
                    aria-label={t("calc.moratoriumShort")}
                  />
                  <span className="input-suffix">{t("calc.mosUnit")}</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={maxMoratorium}
                step={1}
                disabled={isLocked}
                value={clamp(moratorium, 0, maxMoratorium)}
                onChange={(e) => handleMoratoriumSlider(e.target.value)}
                aria-label={t("allSchemes.sliderAria", { label: t("calc.moratoriumShort") })}
              />
              <small className="slider-limits">
                <span>{t("calc.moratoriumZeroLimit")}</span>
                <span className="limit-mid">
                  <bdi>{moratorium} {t("calc.monthsUnit")}</bdi>
                </span>
                <span><bdi>{maxMoratorium} {t("calc.monthsUnit")}</bdi></span>
              </small>
            </div>
          </section>

          {/* Mode B Official Scheme Terms Card */}
          {isLocked && translatedLockedScheme && (
            <section className="calc-scheme-terms-card">
              <div className="scheme-terms-head">
                <div>
                  <span className="eyebrow">{t("calc.schemeTermsTitle")}</span>
                  <h3>{translatedLockedScheme.name}</h3>
                </div>
                <span
                  className={`level-badge ${
                    translatedLockedScheme.level === "state" ? "state" : "central"
                  }`}
                >
                  {translatedLockedScheme.level === "state"
                    ? t("results.stateBadge")
                    : t("results.centralBadge")}
                </span>
              </div>

              <dl className="scheme-terms-dl">
                <div>
                  <dt>{t("calc.agencyLabel")}</dt>
                  <dd>{translatedLockedScheme.agency || t("detail.govtOfIndia")}</dd>
                </div>
                <div>
                  <dt>{t("calc.rateNoteLabel")}</dt>
                  <dd>
                    <strong><bdi>{translatedLockedScheme.interest_rate}{t("calc.pctPa")}</bdi></strong>
                    {translatedLockedScheme.interest_rate_note
                      ? ` — ${translatedLockedScheme.interest_rate_note}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>{t("calc.loanLimitLabel")}</dt>
                  <dd>
                    <bdi>
                      {formatInr(translatedLockedScheme.min_loan || 0)} –{" "}
                      {translatedLockedScheme.max_loan != null
                        ? formatInr(translatedLockedScheme.max_loan)
                        : t("detail.noUpperCap")}
                    </bdi>
                  </dd>
                </div>
                <div>
                  <dt>{t("calc.subsidyNoteLabel")}</dt>
                  <dd>
                    {translatedLockedScheme.subsidy_margin_note ||
                      `${translatedLockedScheme.subsidy_percent || 0}%`}
                  </dd>
                </div>
                <div>
                  <dt>{t("calc.tenureMoratoriumLabel")}</dt>
                  <dd>
                    <bdi>
                      {t("results.tenureFormat", {
                        tenure: String(translatedLockedScheme.tenure_months),
                        moratorium: String(translatedLockedScheme.moratorium_months),
                      })}
                    </bdi>
                  </dd>
                </div>
              </dl>

              <div className="scheme-terms-actions">
                <Link
                  to={`/scheme/${encodeURIComponent(translatedLockedScheme.code)}`}
                  className="btn btn-outline btn-sm"
                >
                  <span>{t("calc.viewSchemeDetails")}</span>
                </Link>
                <Link
                  to={`/apply?scheme=${encodeURIComponent(translatedLockedScheme.code)}`}
                  className="btn btn-primary btn-sm"
                  onClick={() => setScheme(translatedLockedScheme)}
                >
                  <span>{t("calc.applyScheme")}</span>
                  <Icon name="arrow" size={15} />
                </Link>
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Hero Output Panel + Market Savings Callout + Dual SVG Graphs */}
        <section className="calc-results-column">
          {/* Hero Output Panel */}
          <div className="calc-hero-panel">
            <div className="calc-hero-top">
              <div>
                <span className="hero-emi-eyebrow">{t("calc.heroEmiLabel")}</span>
                <div className="hero-emi-readout">
                  <strong><bdi>{formatExactInr(activeCalc.monthly_emi)}</bdi></strong>
                  <span>/ {t("calc.perMonth")}</span>
                </div>
                <small className="hero-emi-sub">
                  <bdi>
                    {activeCalc.annual_rate}{t("calc.pctPa")} • {activeCalc.tenure_months} {t("calc.monthsUnit")}
                    {activeCalc.moratorium_months > 0
                      ? ` (${activeCalc.moratorium_months}${t("calc.mosShort")})`
                      : ""}
                  </bdi>
                </small>
              </div>
              <div className="hero-ratio-chip">
                <small>{t("calc.ratioLabel")}</small>
                <strong>
                  <bdi>{principalRatioPct}% / {interestRatioPct}%</bdi>
                </strong>
                <div className="ratio-bar-track compact">
                  <div
                    className="ratio-bar-principal"
                    style={{ width: `${principalRatioPct}%` }}
                  />
                  <div
                    className="ratio-bar-interest"
                    style={{ width: `${interestRatioPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="calc-kpi-strip-4">
              <article className="calc-mini-kpi">
                <small>{t("calc.principalAmount")}</small>
                <strong className="text-forest"><bdi>{formatExactInr(activeCalc.principal)}</bdi></strong>
                <span><bdi>{principalRatioPct}%</bdi></span>
              </article>
              <article className="calc-mini-kpi">
                <small>{t("calc.totalInterest")}</small>
                <strong className="text-saffron">
                  <bdi>{formatExactInr(activeCalc.total_interest)}</bdi>
                </strong>
                <span><bdi>{interestRatioPct}%</bdi></span>
              </article>
              <article className="calc-mini-kpi">
                <small>{t("calc.totalPayable")}</small>
                <strong><bdi>{formatExactInr(activeCalc.total_payable)}</bdi></strong>
                <span>{t("detail.principalPlusInterest")}</span>
              </article>
              <article className="calc-mini-kpi">
                <small>{t("calc.ratioLabel")}</small>
                <strong>
                  <bdi>{principalRatioPct}% : {interestRatioPct}%</bdi>
                </strong>
                <span>{t("detail.principalLabel")}</span>
              </article>
            </div>
          </div>

          {/* Govt Scheme vs. Bank Market (11.0%) Savings Callout */}
          {isLocked && translatedLockedScheme && marketComparison && (
            <div
              className={`calc-savings-callout ${
                marketComparison.isCheaper ? "is-saving" : "is-neutral"
              }`}
            >
              <div className="savings-callout-head">
                <Icon name="award" size={20} />
                <div>
                  <span className="eyebrow">{t("calc.savingsTitle")}</span>
                  <h3>
                    {marketComparison.isCheaper
                      ? t("calc.savingsHighlight", {
                          saved: formatExactInr(marketComparison.interestSaved),
                        })
                      : t("calc.savingsNeutralTitle", {
                          code: translatedLockedScheme.code,
                          rate: String(activeCalc.annual_rate),
                        })}
                  </h3>
                </div>
              </div>
              {marketComparison.isCheaper ? (
                <p>
                  {t("calc.savingsSub", {
                    marketInterest: formatExactInr(marketComparison.marketInterest),
                    schemeInterest: formatExactInr(activeCalc.total_interest),
                    code: translatedLockedScheme.code,
                    monthlyDiff: formatExactInr(marketComparison.monthlySaved),
                  })}
                </p>
              ) : (
                <p>
                  <bdi>
                    {t("calc.bankMarketLabel")} {formatExactInr(marketComparison.marketInterest)} {t("calc.vsLabel")}{" "}
                    {formatExactInr(activeCalc.total_interest)} ({translatedLockedScheme.code})
                  </bdi>
                </p>
              )}
              <div className="savings-compare-pills">
                <span>
                  {translatedLockedScheme.code} ({activeCalc.annual_rate}%):{" "}
                  <b><bdi>{formatExactInr(activeCalc.monthly_emi)}</bdi></b>
                </span>
                <span>
                  {t("calc.bankMarketLabel")}{" "}
                  <b><bdi>{formatExactInr(marketComparison.marketMonthlyEmi)}</bdi></b>
                </span>
              </div>
            </div>
          )}

          {/* Dual Interactive SVG Graphs */}
          <DonutChartSvg
            principal={activeCalc.principal}
            interest={activeCalc.total_interest}
            totalPayable={activeCalc.total_payable}
            t={t}
          />

          <YearlyRepaymentSvg
            yearly={activeCalc.yearly_schedule}
            principal={activeCalc.principal}
            moratoriumMonths={activeCalc.moratorium_months}
            t={t}
          />

          {/* Tip / Advice Banner */}
          <div className="saving-tip" style={{ marginTop: 0 }}>
            <Icon name="help" size={18} />
            <p>
              <strong>{t("calc.goodToKnow")}</strong>
              <small>{t("calc.savingTip")}</small>
            </p>
          </div>
        </section>
      </div>

      {/* Expandable Year-by-Year Amortization Schedule Table */}
      {activeCalc.yearly_schedule && activeCalc.yearly_schedule.length > 0 && (
        <section className="table-card calc-yearly-table-card">
          <div className="table-head calc-table-head-row">
            <div>
              <h2>{t("calc.table")}</h2>
              <p>{t("calc.scheduleSubtitle")}</p>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              aria-expanded={scheduleExpanded}
              onClick={() => setScheduleExpanded((v) => !v)}
            >
              <span>
                {scheduleExpanded
                  ? t("calc.collapseSchedule")
                  : t("calc.expandSchedule", {
                      count: String(activeCalc.yearly_schedule.length),
                    })}
              </span>
              <Icon name={scheduleExpanded ? "close" : "chevronDown"} size={16} />
            </button>
          </div>

          {scheduleExpanded && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("calc.yearColHeader")}</th>
                    <th>{t("calc.openingBal")}</th>
                    <th>{t("calc.principalPaid")}</th>
                    <th>{t("calc.interestPaid")}</th>
                    <th>{t("calc.yearlyPayment")}</th>
                    <th>{t("calc.closingBal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCalc.yearly_schedule.map((row) => {
                    const isMonthsOpen = expandedYearMonths === row.year;
                    return (
                      <Fragment key={`yr-grp-${row.year}`}>
                        <tr
                          className={`yearly-table-row ${
                            row.is_moratorium_year ? "moratorium-row" : ""
                          }`}
                          onClick={() =>
                            setExpandedYearMonths(isMonthsOpen ? null : row.year)
                          }
                          title={t("calc.toggleMonthlyRows")}
                        >
                          <td>
                            <strong>{t("calc.yearLabel", { year: String(row.year) })}</strong>
                            {row.is_moratorium_year && (
                              <span className="moratorium-badge-sm" style={{ marginLeft: 8 }}>
                                <bdi>{t("calc.moratoriumMonthsBadge", { months: String(row.moratorium_months) })}</bdi>
                              </span>
                            )}
                          </td>
                          <td>{formatExactInr(row.opening_balance)}</td>
                          <td style={{ color: "var(--forest)", fontWeight: 700 }}>
                            {formatExactInr(row.principal_paid)}
                          </td>
                          <td style={{ color: "var(--saffron)", fontWeight: 700 }}>
                            {formatExactInr(row.interest_paid)}
                          </td>
                          <td style={{ fontWeight: 700, color: "var(--navy)" }}>
                            {formatExactInr(row.total_paid)}
                          </td>
                          <td>{formatExactInr(row.ending_balance)}</td>
                        </tr>
                        {isMonthsOpen &&
                          Array.isArray(row.months) &&
                          row.months.map((m) => (
                            <tr key={`m-${m.month}`} className="monthly-subrow">
                              <td>
                                <small>
                                  {t("calc.monthLabel", { month: String(m.month) })}
                                  {m.note ? ` ${t("calc.moratoriumLabel")}` : ""}
                                </small>
                              </td>
                              <td>—</td>
                              <td style={{ color: "var(--forest)" }}>
                                {formatExactInr(m.principal)}
                              </td>
                              <td style={{ color: "var(--saffron)" }}>
                                {formatExactInr(m.interest)}
                              </td>
                              <td>{formatExactInr(m.emi)}</td>
                              <td>{formatExactInr(m.balance)}</td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
