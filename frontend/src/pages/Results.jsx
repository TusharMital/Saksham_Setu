import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

export default function Results() {
  const { t } = useI18n();
  const { result, form, setScheme } = useAppState();
  const [emis, setEmis] = useState({});
  const navigate = useNavigate();
  const top = result?.top || [];
  const rejected = result?.rejected || [];

  useEffect(() => {
    top.forEach(async (s) => {
      try {
        const data = await api.emi({
          amount: Number(form.loan_amount),
          annual_rate: s.interest_rate,
          tenure_months: s.tenure_months,
          moratorium_months: s.moratorium_months,
        });
        setEmis((prev) => ({ ...prev, [s.code]: data.monthly_emi }));
      } catch {
        /* keep empty */
      }
    });
  }, [top, form.loan_amount]);

  if (!result) {
    return (
      <p>
        {t("results.empty")} <a href="/form">{t("nav.find")}</a>
      </p>
    );
  }

  return (
    <section>
      <h1>{t("results.title")}</h1>
      {top.length === 0 ? <p>{t("results.empty")}</p> : null}
      <div className="grid-3">
        {top.map((s) => (
          <article key={s.code} className={`card scheme-card ${s.best ? "best" : ""}`}>
            {s.best ? <span className="badge">{t("results.best")}</span> : null}
            <h2>
              {s.code} — {s.name}
            </h2>
            <p>{s.reason}</p>
            <p>
              {t("results.score")}: {s.score}
            </p>
            <ul>
              <li>
                {t("results.interest")}: {s.interest_rate}%
              </li>
              <li>
                {t("results.maxLoan")}: Rs {Number(s.max_loan).toLocaleString("en-IN")}
              </li>
              <li>
                {t("results.subsidy")}: {s.subsidy_percent}%
              </li>
              <li>
                {t("results.tenure")}: {s.tenure_months} / {t("results.moratorium")}: {s.moratorium_months}
              </li>
              <li>
                {t("results.emi")}: {emis[s.code] ? `Rs ${emis[s.code]}` : "…"}
              </li>
            </ul>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                setScheme(s);
                navigate("/apply");
              }}
            >
              {t("results.choose")}
            </button>
          </article>
        ))}
      </div>
      <details className="rejected">
        <summary>{t("results.rejectedTitle")}</summary>
        <ul>
          {rejected.map((s) => (
            <li key={s.code}>
              <strong>
                {s.code} — {s.name}:
              </strong>{" "}
              {s.reason}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
