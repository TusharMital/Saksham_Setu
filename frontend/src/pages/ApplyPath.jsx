import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n, useTranslatedScheme, useTranslatedSchemes } from "../i18n.jsx";

function buildChannelConfig(channelKey, scheme, t) {
  const officialUrl =
    scheme?.official_portal_url || scheme?.govt_portal_url || "https://www.jansamarth.in/";
  const bankUrl = scheme?.bank_portal_url || "";
  const schemeQuery = scheme?.code ? `?scheme=${encodeURIComponent(scheme.code)}` : "";
  const c = (sub) => t(`paths.channels.${channelKey}.${sub}`, {
    scheme: scheme?.name || t("paths.yourMatchedScheme"),
    state: scheme?.applicable_states?.[0] || t("paths.stateFallback"),
  });

  const configs = {
    pmsuraj: {
      key: "pmsuraj",
      icon: "globe",
      tag: c("tag"),
      recommended: true,
      title: c("title"),
      time: c("time"),
      desc: c("desc"),
      steps: [c("step1"), c("step2"), c("step3")],
      externalUrl: "https://pmsuraj.dosje.gov.in/",
      externalLabel: c("ext"),
    },
    jansamarth: {
      key: "jansamarth",
      icon: "globe",
      tag: c("tag"),
      recommended: true,
      title: c("title"),
      time: c("time"),
      desc: c("desc"),
      steps: [c("step1"), c("step2"), c("step3")],
      externalUrl: officialUrl.includes("jansamarth.in")
        ? officialUrl
        : "https://www.jansamarth.in/",
      externalLabel: c("ext"),
    },
    sca: {
      key: "sca",
      icon: "building",
      tag: c("tag"),
      recommended: false,
      title: c("title"),
      time: c("time"),
      desc: c("desc"),
      steps: [c("step1"), c("step2"), c("step3")],
      internalRoute: `/locator${schemeQuery}`,
      internalLabel: c("int"),
      externalUrl: officialUrl,
      externalLabel: c("ext"),
    },
    bank: {
      key: "bank",
      icon: "location",
      tag: c("tag"),
      recommended: false,
      title: c("title"),
      time: c("time"),
      desc: c("desc"),
      steps: [c("step1"), c("step2"), c("step3")],
      internalRoute: `/locator${schemeQuery}`,
      internalLabel: c("int"),
      externalUrl: bankUrl || undefined,
      externalLabel: bankUrl ? c("ext") : undefined,
    },
    mfi: {
      key: "mfi",
      icon: "wallet",
      tag: c("tag"),
      recommended: false,
      title: c("title"),
      time: c("time"),
      desc: c("desc"),
      steps: [c("step1"), c("step2"), c("step3")],
      internalRoute: `/locator${schemeQuery}`,
      internalLabel: c("int"),
    },
    kviconline: {
      key: "kviconline",
      icon: "bank",
      tag: c("tag"),
      recommended: true,
      title: c("title"),
      time: c("time"),
      desc: c("desc"),
      steps: [c("step1"), c("step2"), c("step3")],
      externalUrl: "https://www.kviconline.gov.in/pmegpeportal/",
      externalLabel: c("ext"),
    },
    standupmitra: {
      key: "standupmitra",
      icon: "award",
      tag: c("tag"),
      recommended: true,
      title: c("title"),
      time: c("time"),
      desc: c("desc"),
      steps: [c("step1"), c("step2"), c("step3")],
      externalUrl: "https://www.standupmitra.in/",
      externalLabel: c("ext"),
    },
    pmvishwakarma: {
      key: "pmvishwakarma",
      icon: "sparkles",
      tag: c("tag"),
      recommended: true,
      title: c("title"),
      time: c("time"),
      desc: c("desc"),
      steps: [c("step1"), c("step2"), c("step3")],
      externalUrl: "https://pmvishwakarma.gov.in/",
      externalLabel: c("ext"),
    },
    state_portal: {
      key: "state_portal",
      icon: "bank",
      tag: c("tag"),
      recommended: true,
      title: c("title"),
      time: c("time"),
      desc: c("desc"),
      steps: [c("step1"), c("step2"), c("step3")],
      externalUrl: officialUrl,
      externalLabel: c("ext"),
    },
  };

  return configs[channelKey] || null;
}

export default function ApplyPath() {
  const { t } = useI18n();
  const {
    scheme,
    setScheme,
    branch,
    sarthiRecommendedChannel,
    startSarthiPathAdvisor,
  } = useAppState();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const cardRefs = useRef({});

  const queryCode = (searchParams.get("scheme") || "").trim();
  const activeCode = queryCode || scheme?.code || "";

  const [allSchemes, setAllSchemes] = useState([]);
  const translatedAllSchemes = useTranslatedSchemes(allSchemes);
  const [schemeSearch, setSchemeSearch] = useState("");
  const [loadedScheme, setLoadedScheme] = useState(() =>
    scheme && activeCode && scheme.code?.toUpperCase() === activeCode.toUpperCase() ? scheme : null
  );
  const translatedLoadedScheme = useTranslatedScheme(loadedScheme);
  const [loading, setLoading] = useState(
    Boolean(activeCode && scheme?.code?.toUpperCase() !== activeCode.toUpperCase())
  );
  const [schemeError, setSchemeError] = useState("");

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
    const filtered = translatedAllSchemes.filter((s) => {
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
  }, [translatedAllSchemes, schemeSearch]);

  const handleSelectScheme = (code) => {
    if (!code) return;
    navigate(`/apply?scheme=${encodeURIComponent(code)}`);
  };

  useEffect(() => {
    if (
      sarthiRecommendedChannel?.channelKey &&
      sarthiRecommendedChannel?.schemeCode?.toUpperCase() === activeCode.toUpperCase()
    ) {
      const el = cardRefs.current[sarthiRecommendedChannel.channelKey];
      if (el && typeof el.scrollIntoView === "function") {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 120);
      }
    }
  }, [sarthiRecommendedChannel, activeCode]);

  // Gate when NO scheme is selected
  if (!activeCode || (!loading && !loadedScheme)) {
    return (
      <div className="page-shell apply-path-page">
        <div className="locator-empty-gate">
          <div className="locator-gate-icon">
            <Icon name="building" size={30} />
          </div>
          <span className="eyebrow">{t("paths.eyebrowGate")}</span>
          <h1>{t("paths.selectSchemeTitle")}</h1>
          <p>{schemeError || t("paths.selectSchemeDesc")}</p>

          <div className="locator-gate-controls">
            <label htmlFor="apply-scheme-search">{t("paths.gateSearchLabel")}</label>
            <div className="modal-search-box" style={{ width: "100%", height: "42px", background: "#fff" }}>
              <Icon name="search" size={16} />
              <input
                id="apply-scheme-search"
                type="text"
                placeholder={t("paths.gateSearchPlaceholder")}
                value={schemeSearch}
                onChange={(e) => setSchemeSearch(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <select
              aria-label={t("paths.selectSchemeLabel")}
              value=""
              onChange={(e) => handleSelectScheme(e.target.value)}
            >
              <option value="">{t("paths.chooseSchemePlaceholder")}</option>
              {groupedSchemes.central.length > 0 && (
                <optgroup label={`${t("results.tabCentral")} (${groupedSchemes.central.length})`}>
                  {groupedSchemes.central.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name} ({s.interest_rate}% {t("detail.perAnnum")})
                    </option>
                  ))}
                </optgroup>
              )}
              {groupedSchemes.state.length > 0 && (
                <optgroup label={`${t("allSchemes.levelState")} (${groupedSchemes.state.length})`}>
                  {groupedSchemes.state.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name} ({s.interest_rate}% {t("detail.perAnnum")})
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

  const selectedScheme = translatedLoadedScheme || { code: activeCode, name: activeCode, available_channels: [] };
  const isState = selectedScheme.level === "state";
  const allowedChannelKeys = Array.isArray(selectedScheme.available_channels)
    ? selectedScheme.available_channels
    : [];
  const channels = allowedChannelKeys
    .map((k) => buildChannelConfig(k, selectedScheme, t))
    .filter(Boolean);

  return (
    <div className="page-shell apply-path-page">
      {/* Active Scheme Context Banner */}
      <section className="apply-scheme-context-banner">
        <div className="apply-banner-left">
          <div className="apply-banner-badges">
            <span className="scheme-banner-eyebrow">
              <Icon name="award" size={14} /> {t("paths.eyebrowActive")}
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
                {t("paths.selectedPartner")} <strong>{branch.name}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="apply-banner-right">
          <select
            aria-label={t("paths.switchSchemeLabel")}
            value={selectedScheme.code}
            onChange={(e) => handleSelectScheme(e.target.value)}
          >
            {groupedSchemes.central.length > 0 && (
              <optgroup label={t("results.tabCentral")}>
                {groupedSchemes.central.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            {groupedSchemes.state.length > 0 && (
              <optgroup label={t("allSchemes.levelState")}>
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
            <span>{t("paths.viewDetailsArrow")}</span>
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

        <Link
          to={`/calculator?scheme=${encodeURIComponent(selectedScheme.code)}`}
          className="btn btn-outline"
        >
          <Icon name="calc" size={17} />
          <span>{t("detail.viewInCalc")}</span>
        </Link>

        <Link
          to={`/scheme/${encodeURIComponent(selectedScheme.code)}`}
          className="btn btn-outline"
        >
          <Icon name="document" size={17} />
          <span>{t("detail.docsTitle")}</span>
        </Link>
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
          {channels.map((ch) => {
            const isSarthiPicked =
              sarthiRecommendedChannel?.schemeCode?.toUpperCase() === selectedScheme.code?.toUpperCase() &&
              sarthiRecommendedChannel?.channelKey === ch.key;
            return (
              <article
                key={ch.key}
                id={`channel-card-${ch.key}`}
                ref={(el) => {
                  cardRefs.current[ch.key] = el;
                }}
                className={`path-card ${ch.recommended ? "recommended" : ""} ${isSarthiPicked ? "sarthi-picked" : ""}`}
              >
                <div className="path-card-top">
                  <span className="path-icon-box">
                    <Icon name={ch.icon} size={24} />
                  </span>
                  <div className="path-card-badges">
                    {isSarthiPicked && (
                      <span className="sarthi-rec-badge">
                        <Icon name="sparkles" size={12} />
                        <span>{t("paths.recommendedBySarthi")}</span>
                      </span>
                    )}
                    <span className={`path-status-pill ${ch.recommended ? "" : "secondary"}`}>
                      {ch.tag}
                    </span>
                  </div>
                </div>

                <h2>{ch.title}</h2>
                <p>{ch.desc}</p>

                <div className="time-est-badge">
                  <Icon name="track" size={16} />
                  <span>
                    {t("paths.typicalTime")} <strong>{ch.time}</strong>
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
                </div>
              </article>
            );
          })}
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
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            startSarthiPathAdvisor({
              schemeCode: selectedScheme.code,
              schemeName: selectedScheme.name,
              availableChannels: channels.map((c) => c.key),
            })
          }
        >
          <Icon name="sparkles" size={17} />
          <span>{t("paths.askSarthiBtn")} →</span>
        </button>
      </section>
    </div>
  );
}
