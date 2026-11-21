import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

export default function Calculator() {
  const { t } = useI18n();
  const { form, scheme } = useAppState();
  const [amount, setAmount] = useState(form.loan_amount || 500000);
  const [rate, setRate] = useState(scheme?.interest_rate || 6);
  const [tenure, setTenure] = useState(scheme?.tenure_months || 60);
  const [moratorium, setMoratorium] = useState(scheme?.moratorium_months || 0);
  const [out, setOut] = useState(null);
  const [error, setError] = useState("");
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const run = async () => {
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
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!out || !canvasRef.current) return;
    const principal = out.schedule.reduce((s, r) => s + r.principal, 0);
    const interest = out.schedule.reduce((s, r) => s + r.interest, 0);
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: [t("calc.principal"), t("calc.int")],
        datasets: [{ data: [principal, interest], backgroundColor: ["#166534", "#e26a12"] }],
      },
      options: { plugins: { legend: { position: "bottom" } } },
    });
  }, [out, t]);

  return (
    <section>
      <h1>{t("calc.title")}</h1>
      <div className="card">
        <label>
          {t("calc.amount")}
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          {t("calc.rate")}
          <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <label>
          {t("calc.tenure")}
          <input type="number" value={tenure} onChange={(e) => setTenure(e.target.value)} />
        </label>
        <label>
          {t("calc.moratorium")}
          <input type="number" value={moratorium} onChange={(e) => setMoratorium(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="button" onClick={run}>
          {t("calc.emi")}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {out ? (
        <>
          <div className="grid-3">
            <div className="card">
              <strong>{t("calc.emi")}</strong>
              <p>Rs {out.monthly_emi}</p>
            </div>
            <div className="card">
              <strong>{t("calc.interest")}</strong>
              <p>Rs {out.total_interest}</p>
            </div>
            <div className="card">
              <strong>{t("calc.payable")}</strong>
              <p>Rs {out.total_payable}</p>
            </div>
          </div>
          <h2>{t("calc.chart")}</h2>
          <canvas ref={canvasRef} aria-label={t("calc.chart")} />
          <h2>{t("calc.table")}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("calc.month")}</th>
                  <th>EMI</th>
                  <th>{t("calc.principal")}</th>
                  <th>{t("calc.int")}</th>
                  <th>{t("calc.bal")}</th>
                </tr>
              </thead>
              <tbody>
                {out.schedule.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{row.emi}</td>
                    <td>{row.principal}</td>
                    <td>{row.interest}</td>
                    <td>{row.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
