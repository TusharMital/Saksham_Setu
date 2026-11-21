import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

export default function Calculator() {
  const { t } = useI18n();
  const { form, scheme } = useAppState();
  const [amount, setAmount] = useState(form.loan_amount || 500000);
  const [rate, setRate] = useState(scheme?.interest_rate || 6.5);
  const [tenure, setTenure] = useState(scheme?.tenure_months || 60);
  const [moratorium, setMoratorium] = useState(scheme?.moratorium_months || 0);
  const [out, setOut] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const calculate = async () => {
    setLoading(true);
    try {
      const data = await api.emi({
        amount: Number(amount),
        annual_rate: Number(rate),
        tenure_months: Number(tenure),
        moratorium_months: Number(moratorium),
      });
      setOut(data);
      setError("");
    } catch (e) {
      setError(e.body?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, rate, tenure, moratorium]);

  useEffect(() => {
    if (!out || !canvasRef.current) return;
    const principal = out.schedule.reduce((s, r) => s + r.principal, 0);
    const interest = out.schedule.reduce((s, r) => s + r.interest, 0);
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: [t("calc.principal"), t("calc.int")],
        datasets: [
          {
            data: [principal, interest],
            backgroundColor: ["#15803D", "#EA580C"],
            borderWidth: 2,
            borderColor: "#ffffff",
          },
        ],
      },
      options: {
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 12,
              padding: 14,
              font: { size: 13, weight: "600" },
            },
          },
        },
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }, [out, t]);

  const formatLakh = (num) => {
    const val = Number(num);
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)} Lakh`;
    return `₹${val.toLocaleString("en-IN")}`;
  };

  return (
    <div className="page-shell">
      {/* Page Title */}
      <div className="page-title">
        <span className="eyebrow">PLAN YOUR REPAYMENT</span>
        <h1>{t("calc.title")}</h1>
        <p>{scheme ? `${scheme.code} — ${scheme.name}` : t("calc.subtitle")}</p>
      </div>

      {error ? (
        <div className="error-banner" style={{ marginBottom: "1.5rem" }}>
          <Icon name="alert" size={18} />
          <p>{error}</p>
        </div>
      ) : null}

      {/* Main 2-Column Split: Sliders on Left + KPIs & Chart on Right */}
      <div className="calc-layout">
        {/* Sliders Card */}
        <section className="calc-controls">
          <div className="controls-head">
            <h2>{t("calc.loanDetails")}</h2>
            <p>{t("calc.adjustSliders")}</p>
          </div>

          <label className="slider-field">
            <span className="slider-label-row">
              <strong>{t("calc.amount")}</strong>
              <b>{formatLakh(amount)}</b>
            </span>
            <input
              type="range"
              min={50000}
              max={10000000}
              step={25000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <small className="slider-limits">
              <span>₹50,000</span>
              <span>₹1 Crore</span>
            </small>
          </label>

          <label className="slider-field">
            <span className="slider-label-row">
              <strong>{t("calc.rate")}</strong>
              <b>{rate}% p.a.</b>
            </span>
            <input
              type="range"
              min={4}
              max={18}
              step={0.25}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            />
            <small className="slider-limits">
              <span>4% (Concessional)</span>
              <span>18% (Commercial)</span>
            </small>
          </label>

          <label className="slider-field">
            <span className="slider-label-row">
              <strong>{t("calc.tenure")}</strong>
              <b>{tenure} months ({(tenure / 12).toFixed(1)} yrs)</b>
            </span>
            <input
              type="range"
              min={12}
              max={120}
              step={6}
              value={tenure}
              onChange={(e) => setTenure(Number(e.target.value))}
            />
            <small className="slider-limits">
              <span>1 Year</span>
              <span>10 Years</span>
            </small>
          </label>

          <label className="slider-field">
            <span className="slider-label-row">
              <strong>{t("calc.moratorium")}</strong>
              <b>{moratorium} months</b>
            </span>
            <input
              type="range"
              min={0}
              max={36}
              step={3}
              value={moratorium}
              onChange={(e) => setMoratorium(Number(e.target.value))}
            />
            <small className="slider-limits">
              <span>0 (Immediate)</span>
              <span>36 Months</span>
            </small>
          </label>
        </section>

        {/* Summary Side: 3 KPI Cards + Real Doughnut Chart */}
        <section className="calc-summary">
          {out && (
            <>
              {/* 3 KPI Summary Cards */}
              <div className="kpi-grid">
                <article className="kpi-card kpi-saffron">
                  <span className="kpi-icon">
                    <Icon name="wallet" size={20} />
                  </span>
                  <small>{t("calc.emi")}</small>
                  <strong>₹{Number(out.monthly_emi).toLocaleString("en-IN")}</strong>
                  <span>per month</span>
                </article>

                <article className="kpi-card kpi-amber">
                  <span className="kpi-icon">
                    <Icon name="percent" size={20} />
                  </span>
                  <small>{t("calc.interest")}</small>
                  <strong>₹{Number(out.total_interest).toLocaleString("en-IN")}</strong>
                  <span>over {tenure} months</span>
                </article>

                <article className="kpi-card kpi-emerald">
                  <span className="kpi-icon">
                    <Icon name="bank" size={20} />
                  </span>
                  <small>{t("calc.payable")}</small>
                  <strong>₹{Number(out.total_payable).toLocaleString("en-IN")}</strong>
                  <span>principal + interest</span>
                </article>
              </div>

              {/* Chart.js Principal vs Interest Card */}
              <div className="chart-card">
                <h3 className="chart-heading">{t("calc.chart")}</h3>
                <div className="chart-wrapper">
                  <canvas ref={canvasRef} aria-label="EMI Doughnut Chart" />
                </div>
              </div>

              {/* Tip / Advice Banner */}
              <div className="saving-tip">
                <Icon name="help" size={18} />
                <p>
                  <strong>{t("calc.goodToKnow")}</strong>
                  <small>{t("calc.savingTip")}</small>
                </p>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Amortization Table */}
      {out && out.schedule && (
        <section className="table-card">
          <div className="table-head">
            <div>
              <h2>{t("calc.table")}</h2>
              <p>{t("calc.scheduleSubtitle")}</p>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("calc.month")}</th>
                  <th>{t("calc.emi")}</th>
                  <th>{t("calc.principal")}</th>
                  <th>{t("calc.int")}</th>
                  <th>{t("calc.bal")}</th>
                </tr>
              </thead>
              <tbody>
                {out.schedule.slice(0, 36).map((r) => (
                  <tr key={r.month}>
                    <td>
                      <strong>Month {r.month}</strong>
                    </td>
                    <td style={{ fontWeight: 700, color: "var(--navy)" }}>
                      ₹{Number(r.emi).toLocaleString("en-IN")}
                    </td>
                    <td style={{ color: "var(--forest)" }}>
                      ₹{Number(r.principal).toLocaleString("en-IN")}
                    </td>
                    <td style={{ color: "var(--saffron)" }}>
                      ₹{Number(r.interest).toLocaleString("en-IN")}
                    </td>
                    <td>₹{Number(r.balance).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
