import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

export default function ApplyPath() {
  const { t } = useI18n();
  const { scheme } = useAppState();
  const navigate = useNavigate();

  const selectedScheme = scheme || {
    code: "Stand-Up India / Term Loan",
    name: "National Concessional Scheme for SC Entrepreneurs",
  };

  const offlineSteps = [
    "Pick your chosen scheme from the Results page",
    "Call the nearest partner branch (number on Find Bank page)",
    "Complete the checklist on the Documents page",
    "Visit the branch, meet the manager, fill the paper form",
  ];

  return (
    <div className="page-shell apply-path-page">
      {/* Page Title */}
      <div className="page-title">
        <span className="eyebrow">CHOOSE HOW TO APPLY</span>
        <h1>{t("paths.title")}</h1>
        <p>{t("paths.subtitle")}</p>
        <div className="scheme-tag-pill" style={{ marginTop: "12px", display: "inline-flex" }}>
          <Icon name="award" size={16} />
          <span>
            Selected Scheme: <strong>{selectedScheme.code} — {selectedScheme.name}</strong>
          </span>
        </div>
      </div>

      {/* 3-Column Paths Grid */}
      <div className="path-grid">
        {/* Route 1: Offline via Nearest Partner Bank (Recommended) */}
        <article className="path-card recommended">
          <div className="path-card-top">
            <span className="path-icon-box">
              <Icon name="location" size={24} />
            </span>
            <span className="path-status-pill">{t("paths.offlineTag")}</span>
          </div>

          <h2>{t("paths.offline")}</h2>
          <p>{t("paths.offlineHelp")}</p>

          <div className="time-est-badge">
            <Icon name="track" size={16} />
            <span>
              Typical time: <strong>{t("paths.offlineTime")}</strong>
            </span>
          </div>

          <ul className="path-steps-list">
            {offlineSteps.map((step) => (
              <li key={step}>
                <Icon name="checkCircle" size={16} />
                <span>{step}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: "auto" }}
            onClick={() => navigate("/locator")}
          >
            <span>{t("paths.openMap")}</span>
            <Icon name="arrow" size={18} />
          </button>
        </article>

        {/* Route 2: Bank Portal (Apply Online) */}
        <article className="path-card">
          <div className="path-card-top">
            <span className="path-icon-box">
              <Icon name="building" size={24} />
            </span>
            <span className="path-status-pill secondary">{t("paths.bankTag")}</span>
          </div>

          <h2>{t("paths.bank")}</h2>
          <p>{t("paths.bankHelp")}</p>

          <div className="time-est-badge">
            <Icon name="track" size={16} />
            <span>
              Typical time: <strong>{t("paths.bankTime")}</strong>
            </span>
          </div>

          {/* Video Guide Placeholder */}
          <div className="video-card-placeholder">
            <span className="play-icon-circle">
              <Icon name="play" size={20} />
            </span>
            <strong>{t("paths.video")}</strong>
            <small>{t("paths.videoMeta")}</small>
          </div>

          <ul className="path-steps-list">
            {(t("paths.stepsBank") || []).map((step) => (
              <li key={step}>
                <Icon name="checkCircle" size={16} />
                <span>{step}</span>
              </li>
            ))}
          </ul>

          <div className="card-actions-col" style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
            {selectedScheme.bank_portal_url ? (
              <a
                className="btn btn-outline"
                href={selectedScheme.bank_portal_url}
                target="_blank"
                rel="noreferrer"
              >
                <span>{t("paths.openPortal")}</span>
                <Icon name="external" size={16} />
              </a>
            ) : null}

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate("/documents")}
            >
              <span>{t("nav.documents")}</span>
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </article>

        {/* Route 3: Government Scheme Portal */}
        <article className="path-card">
          <div className="path-card-top">
            <span className="path-icon-box">
              <Icon name="bank" size={24} />
            </span>
            <span className="path-status-pill secondary">{t("paths.govtTag")}</span>
          </div>

          <h2>{t("paths.govt")}</h2>
          <p>{t("paths.govtHelp")}</p>

          <div className="time-est-badge">
            <Icon name="track" size={16} />
            <span>
              Typical time: <strong>{t("paths.govtTime")}</strong>
            </span>
          </div>

          <ul className="path-steps-list">
            {(t("paths.stepsGovt") || []).map((step) => (
              <li key={step}>
                <Icon name="checkCircle" size={16} />
                <span>{step}</span>
              </li>
            ))}
          </ul>

          <a
            className="btn btn-outline"
            style={{ marginTop: "auto" }}
            href={selectedScheme.govt_portal_url || "https://nsfdc.nic.in"}
            target="_blank"
            rel="noreferrer"
          >
            <span>{t("paths.openPortal")}</span>
            <Icon name="external" size={16} />
          </a>
        </article>
      </div>

      {/* Sarthi Help Choice Banner */}
      <section className="sarthi-choice-banner">
        <span className="banner-bot-icon">
          <Icon name="bot" size={28} />
        </span>
        <div className="banner-text">
          <h2>{t("paths.askSarthiPrompt")}</h2>
          <p>{t("paths.askSarthiSub")}</p>
        </div>
        <Link to="/documents" className="btn btn-secondary">
          <span>{t("paths.askSarthiBtn")}</span>
          <Icon name="arrow" size={18} />
        </Link>
      </section>
    </div>
  );
}
