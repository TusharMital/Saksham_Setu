import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

function buildChannelConfig(channelKey, scheme) {
  const officialUrl = scheme?.official_portal_url || scheme?.govt_portal_url || "https://www.jansamarth.in/";
  const bankUrl = scheme?.bank_portal_url || "";

  const configs = {
    pmsuraj: {
      key: "pmsuraj",
      icon: "globe",
      tag: "NATIONAL PORTAL",
      recommended: true,
      title: "Apply via PM-SURAJ Portal",
      time: "20–30 mins",
      desc: "Official Ministry of Social Justice & Empowerment national credit portal for NSFDC, NSKFDC, and NBCFDC concessional loans.",
      steps: [
        "Register with Aadhaar-linked mobile number on PM-SURAJ.",
        `Select ${scheme?.name || "your matched scheme"} and upload caste & income certificates.`,
        "Track sanction status directly with your State Channelising Agency or bank.",
      ],
      externalUrl: "https://pmsuraj.dosje.gov.in/",
      externalLabel: "Open PM-SURAJ Portal",
    },
    jansamarth: {
      key: "jansamarth",
      icon: "globe",
      tag: "CENTRAL PORTAL",
      recommended: true,
      title: "Apply via JanSamarth Portal",
      time: "15–25 mins",
      desc: "Unified Government of India portal for instant digital eligibility, subsidy calculation, and bank lender selection.",
      steps: [
        "Check instant digital eligibility using Aadhaar, PAN, and Udyam/Income details.",
        "Compare offers from participating Public & Private Sector Banks online.",
        "Download digital in-principle sanction letter and visit selected branch.",
      ],
      externalUrl: officialUrl.includes("jansamarth.in") ? officialUrl : "https://www.jansamarth.in/",
      externalLabel: "Open JanSamarth Portal",
    },
    sca: {
      key: "sca",
      icon: "building",
      tag: "STATE AGENCY (SCA)",
      recommended: false,
      title: "Apply via State Channelising Agency (SCA)",
      time: "1–2 visits",
      desc: "Submit your file through your state's designated SC/ST/OBC/Minority Finance & Development Corporation office.",
      steps: [
        "Locate your nearest State Channelising Agency (SCA) district office.",
        "Prepare your caste, income, residence, and project report papers.",
        "Submit physical or state-portal application for concessional SCA quota.",
      ],
      internalRoute: scheme?.code ? `/locator?scheme=${encodeURIComponent(scheme.code)}` : "/locator",
      internalLabel: "Find SCA / Partner Office",
      externalUrl: officialUrl,
      externalLabel: "Visit Corporation Website",
    },
    bank: {
      key: "bank",
      icon: "location",
      tag: "PARTNER BANK",
      recommended: false,
      title: "Apply at Nearest Partner Bank Branch",
      time: "1–2 visits",
      desc: "Apply offline at a nearby Public Sector Bank or Regional Rural Bank branch with funds and scheme support.",
      steps: [
        "Find a high-health partner bank branch near your PIN code.",
        "Complete your document checklist and download your project summary PDF.",
        "Meet the branch loan officer to submit the official bank form.",
      ],
      internalRoute: scheme?.code ? `/locator?scheme=${encodeURIComponent(scheme.code)}` : "/locator",
      internalLabel: tLabelFallback("Find My Branch"),
      externalUrl: bankUrl || undefined,
      externalLabel: bankUrl ? "Open Bank Portal" : undefined,
    },
    mfi: {
      key: "mfi",
      icon: "wallet",
      tag: "MICROFINANCE (MFI)",
      recommended: false,
      title: "Apply via Empanelled NBFC-MFI",
      time: "3–5 days",
      desc: "Doorstep micro-credit servicing for individuals and SHG/JLG groups where bank/SCA branches are far away.",
      steps: [
        "Verify NBFC-MFI field centre availability in your locality.",
        "Note that MFI interest rates are higher than SCA or JanSamarth bank channels.",
        "Keep Aadhaar, caste/group KYC, and bank passbook ready.",
      ],
      internalRoute: scheme?.code ? `/locator?scheme=${encodeURIComponent(scheme.code)}` : "/locator",
      internalLabel: "Find MFI / Micro Desk",
    },
    kviconline: {
      key: "kviconline",
      icon: "bank",
      tag: "KVIC PMEGP PORTAL",
      recommended: true,
      title: "Apply on KVIC PMEGP e-Portal",
      time: "25–35 mins",
      desc: "Official Ministry of MSME online portal for PMEGP 15%–35% margin money subsidy applications.",
      steps: [
        "Fill the PMEGP New Unit application form on kviconline.gov.in.",
        "Select KVIC, KVIB, or District Industries Centre (DIC) as implementing agency.",
        "Complete mandatory EDP training after bank sanction for subsidy release.",
      ],
      externalUrl: "https://www.kviconline.gov.in/pmegpeportal/",
      externalLabel: "Open KVIC PMEGP Portal",
    },
    standupmitra: {
      key: "standupmitra",
      icon: "award",
      tag: "SIDBI PORTAL",
      recommended: true,
      title: "Apply on Stand-Up Mitra Portal",
      time: "25–40 mins",
      desc: "Dedicated SIDBI portal connecting SC, ST, and Women greenfield entrepreneurs with Lead District Managers and banks.",
      steps: [
        "Register as a Trainee or Ready Borrower on standupmitra.in.",
        "Confirm active bank sanction availability for your greenfield DPR.",
        "Submit online to your preferred scheduled commercial bank branch.",
      ],
      externalUrl: "https://www.standupmitra.in/",
      externalLabel: "Open Stand-Up Mitra",
    },
    pmvishwakarma: {
      key: "pmvishwakarma",
      icon: "sparkles",
      tag: "ARTISAN CSC PORTAL",
      recommended: true,
      title: "Register on PM Vishwakarma (via CSC)",
      time: "20–30 mins",
      desc: "Biometric Aadhaar registration at your nearest Common Service Centre (CSC) for the 5% loan and ₹15,000 toolkit grant.",
      steps: [
        "Visit nearest CSC with Aadhaar-linked mobile and Ration Card.",
        "Complete biometric e-KYC under your notified traditional artisan trade.",
        "Complete 5-day skill verification to unlock toolkit voucher & 5% loan.",
      ],
      externalUrl: "https://pmvishwakarma.gov.in/",
      externalLabel: "Open PM Vishwakarma Portal",
    },
    state_portal: {
      key: "state_portal",
      icon: "bank",
      tag: "STATE GOVT PORTAL",
      recommended: true,
      title: `Apply on ${scheme?.applicable_states?.[0] || "State"} Govt Portal`,
      time: "20–30 mins",
      desc: `Official State Government portal for ${scheme?.name || "this state scheme"} subsidy & loan processing.`,
      steps: [
        "Create an applicant login only on the official state government website.",
        "Upload state domicile, category certificate, and project report.",
        "Save the portal acknowledgement ID for district committee tracking.",
      ],
      externalUrl: officialUrl,
      externalLabel: "Open Official State Portal",
    },
  };

  return configs[channelKey] || null;
}

function tLabelFallback(str) {
  return str;
}

export default function ApplyPath() {
  const { t } = useI18n();
  const { scheme, setScheme } = useAppState();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryCode = searchParams.get("scheme");
  const [loadedScheme, setLoadedScheme] = useState(() =>
    queryCode && scheme?.code?.toUpperCase() !== queryCode.toUpperCase() ? null : scheme
  );
  const [loading, setLoading] = useState(Boolean(queryCode && scheme?.code?.toUpperCase() !== queryCode.toUpperCase()));

  useEffect(() => {
    if (!queryCode) {
      setLoadedScheme(scheme);
      setLoading(false);
      return;
    }
    if (scheme && scheme.code?.toUpperCase() === queryCode.toUpperCase()) {
      setLoadedScheme(scheme);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .schemeDetail(queryCode)
      .then((res) => {
        if (!cancelled) {
          setLoadedScheme(res);
          setScheme(res);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadedScheme(scheme);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryCode, scheme, setScheme]);

  const selectedScheme = loadedScheme || {
    code: queryCode || "GENERAL",
    name: "Select a scheme to see exact official channels",
    available_channels: ["pmsuraj", "jansamarth", "bank"],
    official_portal_url: "https://www.jansamarth.in/",
  };

  const allowedChannelKeys =
    Array.isArray(selectedScheme.available_channels) && selectedScheme.available_channels.length > 0
      ? selectedScheme.available_channels
      : ["bank", "state_portal"];

  const channels = allowedChannelKeys.map((k) => buildChannelConfig(k, selectedScheme)).filter(Boolean);

  return (
    <div className="page-shell apply-path-page">
      {/* Page Title */}
      <div className="page-title">
        <span className="eyebrow">OFFICIAL APPLICATION CHANNELS</span>
        <h1>{t("paths.title")}</h1>
        <p>{t("paths.subtitle")}</p>
        <div className="scheme-tag-pill" style={{ marginTop: "12px", display: "inline-flex", flexWrap: "wrap" }}>
          <Icon name="award" size={16} />
          <span>
            Selected Scheme:{" "}
            <strong>
              {selectedScheme.code} — {selectedScheme.name}
            </strong>
          </span>
          {selectedScheme.code && selectedScheme.code !== "GENERAL" && (
            <Link
              to={`/scheme/${encodeURIComponent(selectedScheme.code)}`}
              style={{ color: "var(--saffron)", fontWeight: 700, marginLeft: "6px" }}
            >
              View Scheme Details →
            </Link>
          )}
        </div>
        <div style={{ marginTop: "14px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link
            to={
              selectedScheme.code && selectedScheme.code !== "GENERAL"
                ? `/locator?scheme=${encodeURIComponent(selectedScheme.code)}`
                : "/locator"
            }
            className="btn btn-secondary"
          >
            <Icon name="location" size={18} />
            <span>{t("detail.findBanksPortals")}</span>
            <Icon name="arrow" size={17} />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="tracker-skeleton-card">
          <div className="skeleton-line w-40" />
          <div className="skeleton-box" />
        </div>
      ) : (
        <div
          className="path-grid"
          style={{
            gridTemplateColumns:
              channels.length === 1
                ? "minmax(300px, 540px)"
                : channels.length === 2
                  ? "repeat(2, 1fr)"
                  : undefined,
          }}
        >
          {channels.map((ch) => (
            <article key={ch.key} className={`path-card ${ch.recommended ? "recommended" : ""}`}>
              <div className="path-card-top">
                <span className="path-icon-box">
                  <Icon name={ch.icon} size={24} />
                </span>
                <span className={`path-status-pill ${ch.recommended ? "" : "secondary"}`}>{ch.tag}</span>
              </div>

              <h2>{ch.title}</h2>
              <p>{ch.desc}</p>

              <div className="time-est-badge">
                <Icon name="track" size={16} />
                <span>
                  Typical time: <strong>{ch.time}</strong>
                </span>
              </div>

              <ul className="path-steps-list">
                {ch.steps.map((step) => (
                  <li key={step}>
                    <Icon name="checkCircle" size={16} />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {ch.externalUrl && (
                  <a className="btn btn-primary" href={ch.externalUrl} target="_blank" rel="noreferrer">
                    <span>{ch.externalLabel}</span>
                    <Icon name="external" size={16} />
                  </a>
                )}
                {ch.internalRoute && (
                  <button
                    type="button"
                    className={ch.externalUrl ? "btn btn-outline" : "btn btn-primary"}
                    onClick={() => navigate(ch.internalRoute)}
                  >
                    <span>{ch.internalLabel}</span>
                    <Icon name="arrow" size={18} />
                  </button>
                )}
                <button type="button" className="btn btn-outline" onClick={() => navigate("/documents")}>
                  <span>{t("nav.documents")} & PDF</span>
                  <Icon name="document" size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

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
          <span>{t("nav.documents")}</span>
          <Icon name="arrow" size={18} />
        </Link>
      </section>
    </div>
  );
}
