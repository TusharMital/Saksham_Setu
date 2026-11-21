import { useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n.jsx";

export default function Tracker() {
  const { t } = useI18n();
  const [ref, setRef] = useState("SS-2026-10001");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const go = async () => {
    try {
      setData(await api.application(ref));
      setError("");
    } catch (e) {
      setData(null);
      setError(e.body?.detail || e.message);
    }
  };

  return (
    <section>
      <h1>{t("track.title")}</h1>
      <p>{t("track.samples")}</p>
      <div className="actions">
        <input
          aria-label={t("track.title")}
          placeholder={t("track.placeholder")}
          value={ref}
          onChange={(e) => setRef(e.target.value)}
        />
        <button className="btn btn-primary" type="button" onClick={go}>
          {t("track.go")}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {data ? (
        <div className="card">
          <h2>
            {data.application.applicant_name} · {data.application.ref_no}
          </h2>
          <ol className="timeline">
            {data.timeline.map((s) => (
              <li key={s.name} className={s.state}>
                {s.name}
              </li>
            ))}
          </ol>
          {data.pending_document ? (
            <p>
              <strong>{t("track.pending")}:</strong> {data.pending_document}
            </p>
          ) : null}
          {data.application.status === "rejected" ? (
            <>
              <p>
                <strong>{t("track.rejected")}:</strong> {data.rejection_reason}
              </p>
              <p>
                <strong>{t("track.fix")}:</strong> {data.fix_suggestion}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
