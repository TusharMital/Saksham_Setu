import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

function buildChannelConfig(channelKey, scheme) {
  const officialUrl =
    scheme?.official_portal_url || scheme?.govt_portal_url || "https://www.jansamarth.in/";
  const bankUrl = scheme?.bank_portal_url || "";
  const schemeQuery = scheme?.code ? `?scheme=${encodeURIComponent(scheme.code)}` : "";

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
      externalUrl: officialUrl.includes("jansamarth.in")
        ? officialUrl
        : "https://www.jansamarth.in/",
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
      internalRoute: `/locator${schemeQuery}`,
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
      internalRoute: `/locator${schemeQuery}`,
      internalLabel: "Find My Branch",
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
      internalRoute: `/locator${schemeQuery}`,
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

export default function ApplyPath() {
  const { t } = useI18n();
  const { form, scheme, setScheme, branch, refNo, setRefNo } = useAppState();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryCode = (searchParams.get("scheme") || "").trim();
  const activeCode = queryCode || scheme?.code || "";

  const [allSchemes, setAllSchemes] = useState([]);
  const [schemeSearch, setSchemeSearch] = useState("");
  const [loadedScheme, setLoadedScheme] = useState(() =>
    scheme && activeCode && scheme.code?.toUpperCase() === activeCode.toUpperCase() ? scheme : null
  );
  const [loading, setLoading] = useState(
    Boolean(activeCode && scheme?.code?.toUpperCase() !== activeCode.toUpperCase())
  );
  const [schemeError, setSchemeError] = useState("");
  const [savingApp, setSavingApp] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");

  // Load 66 schemes for searchable/grouped selector
  useEffect(() => {
    let cancelled = false;
    api
      .schemes()
      .then((res) => {
        if (!cancelled && Array.isArray(res?.schemes)) {
          setAllSchemes(res.schemes);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch scheme details when activeCode changes
  useEffect(() => {
    if (!activeCode) {
      setLoadedScheme(null);
      setSchemeError("");
      setLoading(false);
      return;
    }
    if (scheme && scheme.code?.toUpperCase() === activeCode.toUpperCase()) {
      setLoadedScheme(scheme);
      setSchemeError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSchemeError("");
    api
      .schemeDetail(activeCode)
      .then((res) => {
        if (!cancelled) {
          setLoadedScheme(res);
          setScheme(res);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadedScheme(null);
          setSchemeError(err.body?.detail || err.message || `Scheme '${activeCode}' not found.`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCode, scheme, setScheme]);

  const groupedSchemes = useMemo(() => {
    const q = schemeSearch.trim().toLowerCase();
    const filtered = allSchemes.filter((s) => {
      if (!q) return true;
      return (
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.agency || "").toLowerCase().includes(q)
      );
    });
    return {
      central: filtered.filter((s) => (s.level || "central") === "central"),
      state: filtered.filter((s) => s.level === "state"),
    };
  }, [allSchemes, schemeSearch]);

  const handleSelectScheme = (code) => {
    if (!code) return;
    navigate(`/apply?scheme=${encodeURIComponent(code)}`);
  };

  const handleSaveAndTrack = async () => {
    setSaveNotice("");
    if (refNo && loadedScheme?.code) {
      navigate("/track");
      return;
    }
    if (!form.full_name?.trim()) {
      setSaveNotice(t("paths.needProfileForTrack"));
      return;
    }
    setSavingApp(true);
    try {
      const data = await api.createApplication({
        ...form,
        applicant_name: form.full_name.trim(),
        scheme_code: loadedScheme.code,
        partner: branch?.name || "To be chosen",
        partner_block: branch
          ? `${branch.name}, ${branch.address}, ${branch.phone || ""}`
          : "To be chosen",
      });
      setRefNo(data.ref_no);
      navigate("/track");
    } catch (err) {
      setSaveNotice(err.body?.detail || err.message || "Could not save application.");
    } finally {
      setSavingApp(false);
    }
  };

  // Gate when NO scheme is selected
  if (!activeCode || (!loading && !loadedScheme)) {
    return (
      <div className="page-shell apply-path-page">
        <div className="locator-empty-gate">
          <div className="locator-gate-icon">
            <Icon name="building" size={30} />
          </div>
          <span className="eyebrow">SCHEME-DRIVEN APPLICATION PATH</span>
          <h1>{t("paths.selectSchemeTitle")}</h1>
          <p>{schemeError || t("paths.selectSchemeDesc")}</p>

          <div className="locator-gate-controls">
            <label htmlFor="apply-scheme-search">Search & Select from 66 Central & State Schemes</label>
            <div className="modal-search-box" style={{ width: "100%", height: "42px", background: "#fff" }}>
              <Icon name="search" size={16} />
              <input
                id="apply-scheme-search"
                type="text"
                placeholder="Type scheme code or name (e.g. PMMY, GBS, Stand-Up India)..."
                value={schemeSearch}
                onChange={(e) => setSchemeSearch(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <select
              aria-label="Select a scheme"
              value=""
              onChange={(e) => handleSelectScheme(e.target.value)}
            >
              <option value="">-- Choose a Scheme to View Official Channels --</option>
              {groupedSchemes.central.length > 0 && (
                <optgroup label={`Central Govt Schemes (${groupedSchemes.central.length})`}>
                  {groupedSchemes.central.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name} ({s.interest_rate}% p.a.)
                    </option>
                  ))}
                </optgroup>
              )}
              {groupedSchemes.state.length > 0 && (
                <optgroup label={`State Govt Schemes (${groupedSchemes.state.length})`}>
                  {groupedSchemes.state.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name} ({s.interest_rate}% p.a.)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <div className="locator-gate-actions">
              <Link to="/form" className="btn btn-primary btn-lg">
                <span>{t("paths.findEligibleFirstBtn")}</span>
                <Icon name="arrow" size={18} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedScheme = loadedScheme || { code: activeCode, name: activeCode, available_channels: [] };
  const isState = selectedScheme.level === "state";
  const allowedChannelKeys = Array.isArray(selectedScheme.available_channels)
    ? selectedScheme.available_channels
    : [];
  const channels = allowedChannelKeys
    .map((k) => buildChannelConfig(k, selectedScheme))
    .filter(Boolean);

  return (
    <div className="page-shell apply-path-page">
      {/* Active Scheme Context Banner */}
      <section className="apply-scheme-context-banner">
        <div className="apply-banner-left">
          <div className="apply-banner-badges">
            <span className="scheme-banner-eyebrow">
              <Icon name="award" size={14} /> ACTIVE SCHEME APPLICATION PATH
            </span>
            <span className={`level-badge ${isState ? "state" : "central"}`}>
              {isState ? t("results.stateBadge") : t("results.centralBadge")}
            </span>
          </div>
          <h1>
            {t("paths.applicationPathFor")}{" "}
            <strong>
              {selectedScheme.name} ({selectedScheme.code})
            </strong>
          </h1>
          <p>{t("paths.subtitle")}</p>
          {branch && (
            <div className="apply-selected-bank-chip">
              <Icon name="bank" size={14} />
              <span>
                Selected Partner: <strong>{branch.name}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="apply-banner-right">
          <select
            aria-label="Switch scheme"
            value={selectedScheme.code}
            onChange={(e) => handleSelectScheme(e.target.value)}
          >
            {groupedSchemes.central.length > 0 && (
              <optgroup label="Central Govt Schemes">
                {groupedSchemes.central.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            {groupedSchemes.state.length > 0 && (
              <optgroup label="State Govt Schemes">
                {groupedSchemes.state.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <Link
            to={`/scheme/${encodeURIComponent(selectedScheme.code)}`}
            className="btn btn-outline btn-sm"
          >
            <span>View Scheme Details →</span>
          </Link>
        </div>
      </section>

      {/* Primary Sequential Next-Step Bar */}
      <div className="apply-next-steps-bar">
        <Link
          to={`/locator?scheme=${encodeURIComponent(selectedScheme.code)}`}
          className="btn btn-secondary"
        >
          <Icon name="location" size={18} />
          <span>{t("paths.findBanksForScheme")}</span>
          <Icon name="arrow" size={17} />
        </Link>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSaveAndTrack}
          disabled={savingApp || loading}
        >
          <Icon name="track" size={17} />
          <span>
            {savingApp
              ? "Saving..."
              : refNo
                ? `Track Saved Application (${refNo}) →`
                : t("paths.saveAndTrack")}
          </span>
        </button>

        <Link
          to={`/scheme/${encodeURIComponent(selectedScheme.code)}`}
          className="btn btn-outline"
        >
          <Icon name="document" size={17} />
          <span>{t("detail.docsTitle")}</span>
        </Link>
      </div>

      {saveNotice && (
        <div className="error-banner" style={{ marginBottom: "1.25rem" }} role="status">
          <Icon name="alert" size={18} />
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <p style={{ margin: 0 }}>{saveNotice}</p>
            <Link to="/form" className="btn btn-outline btn-sm">
              <span>{t("nav.find")}</span>
            </Link>
            <Link to="/track" className="btn btn-outline btn-sm">
              <span>{t("nav.track")}</span>
            </Link>
          </div>
        </div>
      )}

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
                <span className={`path-status-pill ${ch.recommended ? "" : "secondary"}`}>
                  {ch.tag}
                </span>
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
                  <a
                    className="btn btn-primary"
                    href={ch.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
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
                <Link
                  to={`/scheme/${encodeURIComponent(selectedScheme.code)}`}
                  className="btn btn-outline"
                >
                  <Icon name="document" size={16} />
                  <span>{t("detail.docsTitle")}</span>
                </Link>
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
        <Link
          to={`/locator?scheme=${encodeURIComponent(selectedScheme.code)}`}
          className="btn btn-secondary"
        >
          <span>{t("detail.findBanksPortals")}</span>
          <Icon name="arrow" size={18} />
        </Link>
      </section>
    </div>
  );
}
