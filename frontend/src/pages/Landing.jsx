import { Link } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { useI18n } from "../i18n.jsx";

export default function Landing() {
  const { t } = useI18n();

  const steps = [
    { num: "01", icon: "user", title: t("landing.s1"), desc: t("landing.s1d") },
    { num: "02", icon: "search", title: t("landing.s2"), desc: t("landing.s2d") },
    { num: "03", icon: "bank", title: t("landing.s3"), desc: t("landing.s3d") },
    { num: "04", icon: "track", title: t("landing.s4"), desc: t("landing.s4d") },
  ];

  return (
    <div className="landing-page">
      {/* Figma-Style Warm Hero Section */}
      <section className="hero">
        <div className="hero-copy">
          <span className="trust-pill">
            <Icon name="checkCircle" size={16} />
            <span>{t("landing.heroBadge")}</span>
          </span>

          <h1>
            {t("landing.heroTitlePre")}{" "}
            <em>{t("landing.heroTitleEm")}</em>
          </h1>

          <p className="hero-desc">{t("landing.promise")}</p>

          <div className="hero-actions">
            <Link to="/form" className="btn btn-primary btn-hero">
              <span>{t("landing.cta")}</span>
              <Icon name="arrow" size={20} />
            </Link>
            <Link to="/calculator" className="btn btn-outline btn-hero">
              <Icon name="calc" size={20} />
              <span>{t("landing.calcCta")}</span>
            </Link>
          </div>

          <div className="hero-proof">
            <div className="proof-item">
              <strong>{t("landing.heroProofTime")}</strong>
              <span>{t("landing.heroProofTimeLabel")}</span>
            </div>
            <div className="proof-item">
              <strong>{t("landing.heroProofSchemes")}</strong>
              <span>{t("landing.heroProofSchemesLabel")}</span>
            </div>
            <div className="proof-item">
              <strong>{t("landing.heroProofFee")}</strong>
              <span>{t("landing.heroProofFeeLabel")}</span>
            </div>
          </div>
        </div>

        {/* Hero Visual: Sun-disc and Floating Match Card */}
        <div className="hero-visual">
          <div className="sun-disc" aria-hidden="true" />

          <div className="hero-card interactive-tilt">
            <div className="mini-profile">
              <span className="profile-icon">
                <Icon name="user" size={20} />
              </span>
              <div>
                <small>{t("landing.previewProfile")}</small>
                <strong>{t("landing.previewProfileDesc")}</strong>
              </div>
              <b className="verified-check" title={t("landing.profileVerifiedTitle")}>✓</b>
            </div>

            <div className="match-score">
              <span className="score-ring">
                {t("landing.previewMatchScore")}
              </span>
              <div>
                <strong>{t("landing.previewMatchText")}</strong>
                <small>{t("landing.previewSchemeName")}</small>
              </div>
            </div>

            <div className="mini-metrics">
              <div className="metric-pill">
                <small>{t("landing.previewLoanMax")}</small>
                <strong>{t("landing.previewLoanVal")}</strong>
              </div>
              <div className="metric-pill">
                <small>{t("landing.previewRate")}</small>
                <strong>{t("landing.previewRateVal")}</strong>
              </div>
            </div>

            <div className="mini-bank">
              <Icon name="bank" size={18} />
              <p>
                <strong>{t("landing.previewBankNearby")}</strong>
                <small>{t("landing.previewFundsLive")}</small>
              </p>
              <i className="status-dot-pulse" title={t("landing.liveFundsTitle")} />
            </div>
          </div>

          {/* Floating Micro-Badges with gentle CSS float animation */}
          <div className="float-card fc-one float-anim-1">
            <Icon name="checkCircle" size={18} />
            <span>
              <strong>{t("landing.badgeSecure")}</strong>
              <small>{t("landing.badgeSecureSub")}</small>
            </span>
          </div>

          <div className="float-card fc-two float-anim-2">
            <span className="hindi-badge">अ</span>
            <span>
              <strong>{t("landing.badgeVoice")}</strong>
              <small>{t("landing.badgeVoiceSub")}</small>
            </span>
          </div>
        </div>
      </section>

      {/* Target Focus Groups Strip */}
      <section className="focus-strip">
        <div className="page-shell-compact">
          <div className="target-groups-row" aria-label={t("landing.targetGroupsTitle")}>
            <span className="focus-label">{t("landing.targetGroupsTitle")}</span>
            <span className="group-tag">{t("landing.tagSC")}</span>
            <span className="group-tag">{t("landing.tagWomen")}</span>
            <span className="group-tag">{t("landing.tagPwd")}</span>
            <span className="group-tag">{t("landing.tagSafai")}</span>
            <span className="group-tag">{t("landing.tagShg")}</span>
          </div>
        </div>
      </section>

      {/* Bolt-Style 4-Card "How It Works" Section */}
      <section className="how-section">
        <div className="page-shell-compact">
          <div className="section-heading">
            <span className="eyebrow">{t("landing.howEyebrow")}</span>
            <h2>{t("landing.how")}</h2>
            <p>{t("landing.howSub")}</p>
          </div>

          <div className="how-grid">
            {steps.map((s) => (
              <article className="how-card" key={s.num}>
                <span className="how-icon">
                  <Icon name={s.icon} size={24} />
                </span>
                <small className="how-card-num">{s.num}</small>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </article>
            ))}
          </div>

          <div className="how-cta-center">
            <Link to="/form" className="btn btn-secondary btn-lg">
              <span>{t("landing.cta")}</span>
              <Icon name="arrow" size={20} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
