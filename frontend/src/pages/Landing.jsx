import { Link } from "react-router-dom";
import { useI18n } from "../i18n.jsx";

export default function Landing() {
  const { t } = useI18n();
  const steps = [
    ["s1", "s1d"],
    ["s2", "s2d"],
    ["s3", "s3d"],
    ["s4", "s4d"],
  ];
  return (
    <section className="hero">
      <h1>{t("appName")}</h1>
      <p>{t("landing.promise")}</p>
      <div className="cta-row">
        <Link className="btn btn-primary" to="/form" style={{ fontSize: "1.2rem", minHeight: 56, padding: "12px 28px" }}>
          {t("landing.cta")}
        </Link>
      </div>
      <h2>{t("landing.how")}</h2>
      <div className="steps">
        {steps.map(([a, b], i) => (
          <article className="step-card" key={a}>
            <strong>
              {i + 1}. {t(`landing.${a}`)}
            </strong>
            <p>{t(`landing.${b}`)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
