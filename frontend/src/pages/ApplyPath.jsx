import { useNavigate } from "react-router-dom";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

export default function ApplyPath() {
  const { t } = useI18n();
  const { scheme } = useAppState();
  const navigate = useNavigate();
  if (!scheme) {
    return <p>{t("results.empty")}</p>;
  }
  return (
    <section>
      <h1>{t("paths.title")}</h1>
      <p>
        {scheme.code} — {scheme.name}
      </p>
      <div className="grid-3">
        <article className="card">
          <h2>{t("paths.offline")}</h2>
          <p>{t("paths.offlineHelp")}</p>
          <button className="btn btn-primary" type="button" onClick={() => navigate("/locator")}>
            {t("paths.openMap")}
          </button>
        </article>
        <article className="card">
          <h2>{t("paths.bank")}</h2>
          <p>{t("paths.bankHelp")}</p>
          <ol>
            {(t("paths.stepsBank") || []).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="video-ph" aria-label={t("paths.video")}>
            {t("paths.video")}
          </div>
          {scheme.bank_portal_url ? (
            <a className="btn" href={scheme.bank_portal_url} target="_blank" rel="noreferrer">
              {t("paths.openPortal")}
            </a>
          ) : null}
          <button className="btn btn-primary" type="button" onClick={() => navigate("/documents")}>
            {t("docs.title")}
          </button>
        </article>
        <article className="card">
          <h2>{t("paths.govt")}</h2>
          <p>{t("paths.govtHelp")}</p>
          <ol>
            {(t("paths.stepsGovt") || []).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="video-ph" aria-label={t("paths.video")}>
            {t("paths.video")}
          </div>
          {scheme.govt_portal_url ? (
            <a className="btn" href={scheme.govt_portal_url} target="_blank" rel="noreferrer">
              {t("paths.openPortal")}
            </a>
          ) : null}
        </article>
      </div>
    </section>
  );
}
