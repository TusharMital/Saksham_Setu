import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n, useTranslatedScheme, useTranslatedSchemes, useTranslatedTexts } from "../i18n.jsx";

const CHANNEL_LABELS = {
  pmsuraj: "PM-SURAJ",
  jansamarth: "JanSamarth",
  sca: "State SCA",
  bank: "Bank Branch",
  mfi: "NBFC-MFI",
  kviconline: "KVIC PMEGP",
  standupmitra: "Stand-Up Mitra",
  pmvishwakarma: "PM Vishwakarma",
  state_portal: "State Portal",
};

const RADIUS_OPTIONS = [5, 10, 25];

function formatCompactInr(val, noCapLabel = "No cap", units = {}) {
  if (val === null || val === undefined) return noCapLabel;
  const n = Number(val);
  if (Number.isNaN(n)) return "—";
  const cr = units.cr || "Cr";
  const l = units.l || "L";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2).replace(/\.00$/, "")} ${cr}`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1).replace(/\.0$/, "")}${l}`;
  return `₹${n.toLocaleString("en-IN")}`;
}

const INDIA_CENTER = [22.5937, 78.9629];

function isValidCoordPair(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const fLat = Number(lat);
  const fLng = Number(lng);
  if (!Number.isFinite(fLat) || !Number.isFinite(fLng)) return false;
  if (Math.abs(fLat) < 1e-6 && Math.abs(fLng) < 1e-6) return false;
  return fLat >= -90 && fLat <= 90 && fLng >= -180 && fLng <= 180;
}

function buildDirectionsUrl(item, userCoords = null) {
  if (
    item?.directions_url &&
    !String(item.directions_url).includes("destination=0,0") &&
    !String(item.directions_url).includes("destination=0.0,0.0")
  ) {
    return item.directions_url;
  }
  if (isValidCoordPair(item?.lat, item?.lng)) {
    const fLat = Number(item.lat);
    const fLng = Number(item.lng);
    const bLat = fLat >= 68 && fLat <= 98 && fLng >= 6 && fLng <= 38 ? fLng : fLat;
    const bLng = fLat >= 68 && fLat <= 98 && fLng >= 6 && fLng <= 38 ? fLat : fLng;
    if (Array.isArray(userCoords) && isValidCoordPair(userCoords[0], userCoords[1])) {
      return `https://www.google.com/maps/dir/?api=1&origin=${userCoords[0]},${userCoords[1]}&destination=${bLat},${bLng}&travelmode=driving`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${bLat},${bLng}`;
  }
  const query = [item?.name || item?.branch_name, item?.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || "India")}`;
}

function createBranchIcon(isSelected, healthColor, instType) {
  const fill = isSelected
    ? "#ea580c"
    : instType === "SCA"
      ? "#1d4ed8"
      : healthColor === "green"
        ? "#15803d"
        : healthColor === "amber"
          ? "#d97706"
          : "#dc2626";
  const ring = isSelected ? "#0f172a" : "#ffffff";
  const scale = isSelected ? 1.18 : 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40" style="transform:scale(${scale});transform-origin:16px 40px;">
    <path d="M16 1C8.3 1 2 7.3 2 15c0 10.5 14 23.5 14 23.5S30 25.5 30 15C30 7.3 23.7 1 16 1z" fill="${fill}" stroke="${ring}" stroke-width="2.5"/>
    <circle cx="16" cy="15" r="5.5" fill="#ffffff"/>
  </svg>`;
  return L.divIcon({
    className: "custom-map-pin",
    html: svg,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -36],
  });
}

function createUserPulseIcon(youAreHereLabel = "You are here") {
  return L.divIcon({
    className: "user-gps-pin-wrap",
    html: `<div class="user-gps-pulse-dot" title="${youAreHereLabel}"><span class="pulse-ring"></span><span class="core-dot"></span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

function MapViewportController({ target, zoom, flySeq, resultsKey }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map, target, zoom, resultsKey]);

  useEffect(() => {
    if (target && target.length === 2 && isValidCoordPair(target[0], target[1])) {
      map.flyTo(target, zoom || 5, { duration: 0.9 });
      const timer = setTimeout(() => map.invalidateSize(), 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [target, zoom, flySeq, map]);

  return null;
}

function InstitutionDetailsModal({
  item,
  activeSchemeCode,
  userCoords,
  onClose,
  onSelectAndApply,
  onCopyPhone,
  copiedKey,
  t,
  trText,
}) {
  const [modalTab, setModalTab] = useState("overview");
  const [schemeQuery, setSchemeQuery] = useState("");

  useEffect(() => {
    setModalTab("overview");
    setSchemeQuery("");
  }, [item?.id]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const providedSchemes = Array.isArray(item?.provided_schemes) ? item.provided_schemes : [];
  const translatedProvidedSchemes = useTranslatedSchemes(providedSchemes);
  const allBranches = Array.isArray(item?.all_branches) ? item.all_branches : [];

  if (!item) return null;

  const filteredSchemes = translatedProvidedSchemes.filter((s) => {
    const q = schemeQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q)
    );
  });

  const isPortal = item.institution_type === "PORTAL";
  const directionsUrl = buildDirectionsUrl(item, userCoords);

  return (
    <div
      className="locator-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("locator.modalAria", { name: item.name })}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="locator-modal-window">
        <header className="locator-modal-header">
          <div className="locator-modal-title-group">
            <div className="locator-modal-badges">
              <span className={`inst-type-badge type-${(item.institution_type || "PSB").toLowerCase()}`}>
                {item.institution_label || item.institution_type}
              </span>
              {item.short_code && <span className="badge-pill">{item.short_code}</span>}
              {item.distance_km != null && (
                <span className="distance-badge">
                  <bdi>{item.distance_km} {t("locator.kmUnit")}</bdi>
                </span>
              )}
            </div>
            <h2>{trText(item.institution_name || item.name)}</h2>
            {item.name !== item.institution_name && (
              <p className="modal-branch-subtitle">
                {t("locator.selectedBranchLabel")} <strong>{trText(item.name)}</strong> — {trText(item.address)}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onClose}
            aria-label={t("locator.closeLabel")}
          >
            <Icon name="close" size={16} />
            <span>{t("locator.closeLabel")}</span>
          </button>
        </header>

        {/* Modal Tabs */}
        <div className="locator-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={modalTab === "overview"}
            className={modalTab === "overview" ? "active" : ""}
            onClick={() => setModalTab("overview")}
          >
            {t("locator.overviewDocsTab")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modalTab === "schemes"}
            className={modalTab === "schemes" ? "active" : ""}
            onClick={() => setModalTab("schemes")}
          >
            {t("locator.schemesProvided")} ({providedSchemes.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modalTab === "branches"}
            className={modalTab === "branches" ? "active" : ""}
            onClick={() => setModalTab("branches")}
          >
            {t("locator.allBranchesTab")} ({allBranches.length})
          </button>
        </div>

        <div className="locator-modal-body">
          {modalTab === "overview" && (
            <div className="modal-overview-grid">
              <div className="modal-info-card">
                <h3>{t("locator.institutionProfile")}</h3>
                <p className="modal-overview-text">{item.overview}</p>

                <dl className="modal-kv-grid">
                  <div>
                    <dt>{t("locator.headquarters")}</dt>
                    <dd>{item.headquarters || t("locator.indiaFallback")}</dd>
                  </div>
                  <div>
                    <dt>{t("locator.processingTime")}</dt>
                    <dd>{item.processing_time || t("locator.defaultProcTime")}</dd>
                  </div>
                  <div>
                    <dt>{t("locator.collateralPolicy")}</dt>
                    <dd>{item.collateral_policy || t("locator.defaultCollateral")}</dd>
                  </div>
                  <div>
                    <dt>{t("locator.helplineHours")}</dt>
                    <dd>{item.helpline_hours || t("locator.defaultHelpline")}</dd>
                  </div>
                  <div>
                    <dt>
                      {item.phone_source === "branch"
                        ? t("locator.branchPhone")
                        : t("locator.tollFreeHelpline")}
                    </dt>
                    <dd className="modal-phone-row">
                      <strong><bdi>{item.phone || item.toll_free_display || "—"}</bdi></strong>
                      {item.tel_href && (
                        <button
                          type="button"
                          className="btn-copy-mini"
                          onClick={() =>
                            onCopyPhone(item.phone || item.toll_free_phone, `modal-${item.id}`)
                          }
                        >
                          {copiedKey === `modal-${item.id}` ? t("locator.copied") : t("locator.copyNumber")}
                        </button>
                      )}
                    </dd>
                  </div>
                  {item.official_url && (
                    <div>
                      <dt>{t("locator.officialWebsite")}</dt>
                      <dd>
                        <a
                          href={item.official_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="modal-ext-link"
                        >
                          <span>{item.official_url}</span>
                          <Icon name="external" size={14} />
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="modal-docs-card">
                <h3>{t("detail.docsTitle")}</h3>
                <ul className="modal-doc-list">
                  {(item.bank_required_documents || []).map((doc, idx) => (
                    <li key={idx}>
                      <Icon name="checkCircle" size={15} />
                      <span>{doc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {modalTab === "schemes" && (
            <div className="modal-schemes-panel">
              <div className="modal-schemes-toolbar">
                <strong>
                  {t("locator.schemesProvided")} ({filteredSchemes.length})
                </strong>
                <div className="modal-search-box">
                  <Icon name="search" size={15} />
                  <input
                    type="text"
                    placeholder={t("locator.filterSchemesPlaceholder")}
                    value={schemeQuery}
                    onChange={(e) => setSchemeQuery(e.target.value)}
                  />
                </div>
              </div>

              {filteredSchemes.length === 0 ? (
                <p className="modal-empty-msg">{t("locator.noSchemesSearchMatch")}</p>
              ) : (
                <div className="modal-schemes-grid">
                  {filteredSchemes.map((s) => (
                    <article key={s.code} className="modal-scheme-card">
                      <div className="modal-scheme-top">
                        <span className="badge-pill">{s.code}</span>
                        <span className={`level-badge-sm ${s.level === "state" ? "state" : "central"}`}>
                          {s.level === "state" ? t("results.stateBadge") : t("results.centralBadge")}
                        </span>
                      </div>
                      <h4>{s.name}</h4>
                      <div className="modal-scheme-meta">
                        <span>
                          {t("compare.interestRate")}: <b><bdi>{s.interest_rate}{t("calc.pctPa")}</bdi></b>
                        </span>
                        <span>
                          {t("compare.maxLoanLimit")}:{" "}
                          <b>
                            <bdi>
                              {formatCompactInr(s.max_loan, t("detail.noUpperCap"), {
                                cr: t("calc.unitCr"),
                                l: t("calc.unitL"),
                              })}
                            </bdi>
                          </b>
                        </span>
                      </div>
                      <Link
                        to={`/scheme/${encodeURIComponent(s.code)}`}
                        className="btn btn-outline btn-sm"
                        onClick={onClose}
                      >
                        <span>{t("locator.viewSchemeArrow")}</span>
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {modalTab === "branches" && (
            <div className="modal-branches-panel">
              {isPortal || allBranches.length === 0 ? (
                <div className="modal-portal-notice">
                  <Icon name="globe" size={24} />
                  <div>
                    <strong>{t("locator.digitalPortalTitle")}</strong>
                    <p>{t("locator.digitalPortalDesc")}</p>
                  </div>
                </div>
              ) : (
                <div className="modal-branches-list">
                  {allBranches.map((br, idx) => (
                    <article key={`${br.branch_name}-${idx}`} className="modal-branch-row">
                      <div className="modal-branch-info">
                        <div className="modal-branch-name-row">
                          <strong>{trText(br.branch_name)}</strong>
                          {br.distance_km != null && (
                            <span className="distance-badge">
                              <bdi>{br.distance_km} {t("locator.kmUnit")}</bdi>
                            </span>
                          )}
                        </div>
                        <p>{trText(br.address)}</p>
                        <small>
                          {[trText(br.district), trText(br.state), br.pin_code].filter(Boolean).join(" • ")}
                        </small>
                      </div>
                      <div className="modal-branch-actions">
                        {(br.tel_href || br.phone) && (
                          <a
                            href={br.tel_href || `tel:${String(br.phone).replace(/[^\d+]/g, "")}`}
                            className="btn btn-outline btn-sm"
                          >
                            <Icon name="phone" size={14} />
                            <span>{t("locator.callLabel")}</span>
                          </a>
                        )}
                        <a
                          href={buildDirectionsUrl(
                            {
                              source: br.source || item.source,
                              directions_url: br.directions_url,
                              lat: br.lat,
                              lng: br.lng,
                              name: br.branch_name,
                              address: br.address,
                            },
                            userCoords
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline btn-sm"
                        >
                          <Icon name="location" size={14} />
                          <span>{t("locator.directions")}</span>
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="locator-modal-footer">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
          >
            <Icon name="location" size={16} />
            <span>{t("locator.getDirectionsMaps")}</span>
          </a>

          {item.tel_href && (
            <a href={item.tel_href} className="btn btn-outline">
              <Icon name="phone" size={16} />
              <span>
                {t("locator.callLabel")} (<bdi>{item.phone || item.toll_free_display}</bdi>)
              </span>
            </a>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSelectAndApply(item)}
          >
            <span>{t("locator.proceedToApplyCode", { code: activeSchemeCode })}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function BranchLocator() {
  const { t, tState, lang } = useI18n();
  const { form, scheme, setScheme, setBranch } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryCode = (searchParams.get("scheme") || "").trim();
  const activeSchemeCode = queryCode || scheme?.code || "";

  const [allSchemes, setAllSchemes] = useState([]);
  const translatedAllSchemes = useTranslatedSchemes(allSchemes);
  const [activeScheme, setActiveScheme] = useState(() =>
    scheme && activeSchemeCode && scheme.code?.toUpperCase() === activeSchemeCode.toUpperCase()
      ? scheme
      : null
  );
  const translatedActiveScheme = useTranslatedScheme(activeScheme);

  // Location & search states: always start clean with pin="" centered on India
  const [pinInput, setPinInput] = useState("");
  const [searchCoords, setSearchCoords] = useState(null); // { lat, lng } if GPS
  const [userPinCoords, setUserPinCoords] = useState(null);
  const [mapTarget, setMapTarget] = useState(INDIA_CENTER);
  const [mapZoom, setMapZoom] = useState(5);
  const [flySeq, setFlySeq] = useState(0);
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [effectiveRadiusKm, setEffectiveRadiusKm] = useState(10);
  const [expandedRadius, setExpandedRadius] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState("");
  const [hasSearchedLocation, setHasSearchedLocation] = useState(false);

  // Results & UI filters
  const [branches, setBranches] = useState([]);
  const [portals, setPortals] = useState([]);
  const [overpassLive, setOverpassLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalItem, setModalItem] = useState(null);
  const [copiedKey, setCopiedKey] = useState("");

  const pinInputRef = useRef(null);
  const markerRefs = useRef({});

  // Load 66 schemes for selector
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

  // Load active scheme details
  useEffect(() => {
    if (!activeSchemeCode) {
      setActiveScheme(null);
      return;
    }
    if (scheme && scheme.code?.toUpperCase() === activeSchemeCode.toUpperCase()) {
      setActiveScheme(scheme);
      return;
    }
    let cancelled = false;
    api
      .schemeDetail(activeSchemeCode)
      .then((res) => {
        if (!cancelled) {
          setActiveScheme(res);
          setScheme(res);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeSchemeCode, scheme, setScheme]);

  const runLiveSearch = useCallback(
    async ({ pin, lat, lng, radius = radiusKm, schemeCode = activeSchemeCode, targetZoom }) => {
      if (!schemeCode) return;
      setLoading(true);
      setError("");
      setHasSearchedLocation(true);
      try {
        const res = await api.liveBanksSearch({
          scheme: schemeCode,
          pin: pin || undefined,
          lat: lat !== undefined ? lat : undefined,
          lng: lng !== undefined ? lng : undefined,
          radius_km: radius,
          lang,
        });
        setBranches(res.branches || []);
        setPortals(res.portals || []);
        setOverpassLive(Boolean(res.overpass_live));
        setEffectiveRadiusKm(res.effective_radius_km || radius);
        setExpandedRadius(Boolean(res.expanded_radius));
        setEmptyMessage(res.empty_message || "");
        if (res.scheme) {
          setActiveScheme(res.scheme);
        }
        const centerLoc = res.center || res.location;
        if (centerLoc?.lat != null && centerLoc?.lng != null) {
          const coords = [centerLoc.lat, centerLoc.lng];
          const isGps = res.location?.source === "gps" || (lat !== undefined && lng !== undefined);
          setUserPinCoords(coords);
          setMapTarget(coords);
          setMapZoom(targetZoom || (isGps ? 14 : 13));
          setFlySeq((s) => s + 1);
          setResolvedLocation(res.location);
        }
      } catch (err) {
        setError(err.body?.detail || err.message || t("locator.loadError"));
      } finally {
        setLoading(false);
      }
    },
    [activeSchemeCode, radiusKm, lang, t]
  );

  // When scheme changes while a location is already searched, re-query for the new scheme; otherwise stay cleanly on India prompt
  useEffect(() => {
    if (!activeSchemeCode) return;
    if (searchCoords) {
      runLiveSearch({
        lat: searchCoords.lat,
        lng: searchCoords.lng,
        radius: radiusKm,
        schemeCode: activeSchemeCode,
        targetZoom: 14,
      });
    } else if (/^[1-9][0-9]{5}$/.test(pinInput.trim())) {
      runLiveSearch({
        pin: pinInput.trim(),
        radius: radiusKm,
        schemeCode: activeSchemeCode,
        targetZoom: 13,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSchemeCode]);

  const handleSchemePick = (code) => {
    if (!code) {
      const next = new URLSearchParams(searchParams);
      next.delete("scheme");
      setSearchParams(next);
      setScheme(null);
      setActiveScheme(null);
      setBranches([]);
      setPortals([]);
      return;
    }
    setSearchParams({ scheme: code });
  };

  const handlePinSearch = (e) => {
    if (e) e.preventDefault();
    const cleaned = pinInput.trim();
    if (!/^[1-9][0-9]{5}$/.test(cleaned)) {
      setError(t("locator.invalidPinError"));
      pinInputRef.current?.focus();
      return;
    }
    // Clear live GPS coordinates so the entered PIN takes strict priority
    setSearchCoords(null);
    runLiveSearch({ pin: cleaned, radius: radiusKm, schemeCode: activeSchemeCode, targetZoom: 13 });
  };

  const handleUseLiveLocation = () => {
    // Clear any typed PIN so PIN state never overrides live GPS coordinates
    setPinInput("");
    if (!navigator.geolocation) {
      setError(t("locator.geoUnsupportedError"));
      pinInputRef.current?.focus();
      return;
    }
    setGpsLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setSearchCoords(coords);
        setUserPinCoords([coords.lat, coords.lng]);
        setMapTarget([coords.lat, coords.lng]);
        setMapZoom(14);
        setFlySeq((s) => s + 1);
        setResolvedLocation({
          lat: coords.lat,
          lng: coords.lng,
          place: t("locator.liveGpsLocation"),
          location_label: t("locator.liveGpsLocation"),
          source: "gps",
        });
        runLiveSearch({
          lat: coords.lat,
          lng: coords.lng,
          radius: radiusKm,
          schemeCode: activeSchemeCode,
          targetZoom: 14,
        });
      },
      () => {
        setGpsLoading(false);
        setError(t("locator.geoBlockedError"));
        pinInputRef.current?.focus();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleRadiusChange = (nextRadius) => {
    setRadiusKm(nextRadius);
    if (!activeSchemeCode) return;
    if (searchCoords) {
      runLiveSearch({
        lat: searchCoords.lat,
        lng: searchCoords.lng,
        radius: nextRadius,
        schemeCode: activeSchemeCode,
        targetZoom: 14,
      });
    } else if (/^[1-9][0-9]{5}$/.test(pinInput.trim())) {
      runLiveSearch({
        pin: pinInput.trim(),
        radius: nextRadius,
        schemeCode: activeSchemeCode,
        targetZoom: 13,
      });
    } else if (resolvedLocation?.pin && /^[1-9][0-9]{5}$/.test(resolvedLocation.pin)) {
      runLiveSearch({
        pin: resolvedLocation.pin,
        radius: nextRadius,
        schemeCode: activeSchemeCode,
        targetZoom: 13,
      });
    }
  };

  const handleCopyPhone = (rawNumber, key) => {
    const clean = String(rawNumber || "").trim();
    if (!clean) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(clean).catch(() => {});
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? "" : prev));
    }, 1800);
  };

  const handleViewOnMap = (item) => {
    if (!isValidCoordPair(item?.lat, item?.lng)) return;
    setSelectedItem(item);
    setMapTarget([item.lat, item.lng]);
    setMapZoom(16);
    setFlySeq((s) => s + 1);
    const marker = markerRefs.current[item.id];
    if (marker && typeof marker.openPopup === "function") {
      setTimeout(() => marker.openPopup(), 450);
    }
  };

  const handleSelectAndApply = (item) => {
    setBranch(item);
    setModalItem(null);
    navigate(
      `/apply?scheme=${encodeURIComponent(activeSchemeCode)}&bank=${encodeURIComponent(item.id)}`
    );
  };

  const combinedItems = useMemo(() => [...branches, ...portals], [branches, portals]);

  const dynamicLocatorTexts = useMemo(() => {
    const out = [];
    if (resolvedLocation) {
      if (resolvedLocation.post_office) out.push(resolvedLocation.post_office);
      if (resolvedLocation.district) out.push(resolvedLocation.district);
      if (resolvedLocation.place) out.push(resolvedLocation.place);
    }
    combinedItems.forEach((item) => {
      if (item.name) out.push(item.name);
      if (item.address) out.push(item.address);
      if (item.institution_name) out.push(item.institution_name);
      if (Array.isArray(item.all_branches)) {
        item.all_branches.forEach((br) => {
          if (br.branch_name) out.push(br.branch_name);
          if (br.address) out.push(br.address);
          if (br.district) out.push(br.district);
          if (br.state) out.push(br.state);
        });
      }
    });
    return out;
  }, [combinedItems, resolvedLocation]);

  const trLocatorText = useTranslatedTexts(dynamicLocatorTexts);

  const typeCounts = useMemo(() => {
    return {
      all: combinedItems.length,
      PSB: combinedItems.filter((i) => i.institution_type === "PSB" || i.institution_type === "RRB").length,
      SCA: combinedItems.filter((i) => i.institution_type === "SCA").length,
      MFI: combinedItems.filter((i) => i.institution_type === "MFI").length,
      PORTAL: combinedItems.filter((i) => i.institution_type === "PORTAL").length,
    };
  }, [combinedItems]);

  const filteredItems = useMemo(() => {
    const kw = keywordFilter.trim().toLowerCase();
    return combinedItems.filter((item) => {
      if (typeFilter === "PSB") {
        if (item.institution_type !== "PSB" && item.institution_type !== "RRB") return false;
      } else if (typeFilter !== "all" && item.institution_type !== typeFilter) {
        return false;
      }
      if (!kw) return true;
      return (
        (item.name || "").toLowerCase().includes(kw) ||
        (item.institution_name || "").toLowerCase().includes(kw) ||
        (item.short_code || "").toLowerCase().includes(kw) ||
        (item.address || "").toLowerCase().includes(kw) ||
        (item.district || "").toLowerCase().includes(kw)
      );
    });
  }, [combinedItems, typeFilter, keywordFilter]);

  const mappableBranches = useMemo(
    () => filteredItems.filter((i) => i.lat != null && i.lng != null),
    [filteredItems]
  );

  // If no scheme is selected -> clean "Select a Scheme First" gate
  if (!activeSchemeCode) {
    return (
      <div className="page-shell">
        <div className="locator-empty-gate">
          <div className="locator-gate-icon">
            <Icon name="bank" size={30} />
          </div>
          <span className="eyebrow">{t("locator.eyebrowGate")}</span>
          <h1>{t("locator.selectSchemeTitle")}</h1>
          <p>{t("locator.selectSchemeDesc")}</p>

          <div className="locator-gate-controls">
            <label htmlFor="gate-scheme-select">{t("locator.gateSelectLabel")}</label>
            <select
              id="gate-scheme-select"
              value=""
              onChange={(e) => handleSchemePick(e.target.value)}
            >
              <option value="">{t("locator.gateSelectPlaceholder")}</option>
              {translatedAllSchemes.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name} ({s.interest_rate}{t("calc.pctPa")})
                </option>
              ))}
            </select>

            <div className="locator-gate-actions">
              <Link to="/form" className="btn btn-primary btn-lg">
                <Icon name="search" size={18} />
                <span>{t("locator.findSchemeFirstBtn")}</span>
              </Link>
              <Link to="/calculator" className="btn btn-outline btn-lg">
                <Icon name="calc" size={18} />
                <span>{t("nav.calculator")}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="locator-page-wrapper">
      {/* Active Scheme Context Banner */}
      <div className="locator-scheme-banner">
        <div className="locator-scheme-banner-left">
          <span className="scheme-banner-eyebrow">
            <Icon name="award" size={14} /> {t("locator.eyebrowActive")}
          </span>
          <h2>
            {t("locator.showingFor")}{" "}
            <strong>
              {translatedActiveScheme?.name || activeSchemeCode} ({activeSchemeCode})
            </strong>
          </h2>
          {translatedActiveScheme?.available_channels?.length > 0 && (
            <div className="locator-channel-pills">
              <span>{t("locator.eligibleChannels")}</span>
              {translatedActiveScheme.available_channels.map((ch) => (
                <span key={ch} className="channel-mini-pill">
                  {t(`channels.${ch}`) !== `channels.${ch}` ? t(`channels.${ch}`) : (CHANNEL_LABELS[ch] || ch)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="locator-scheme-banner-right">
          <select
            aria-label={t("paths.switchSchemeLabel")}
            value={activeSchemeCode}
            onChange={(e) => handleSchemePick(e.target.value)}
          >
            {translatedAllSchemes.map((s) => (
              <option key={s.code} value={s.code}>
                {t("locator.switchSchemePrefix")} {s.code} — {s.name}
              </option>
            ))}
          </select>
          <Link
            to={`/scheme/${encodeURIComponent(activeSchemeCode)}`}
            className="btn btn-outline btn-sm"
          >
            <span>{t("locator.backToScheme", { code: activeSchemeCode })}</span>
          </Link>
        </div>
      </div>

      {/* Top Search & Live GPS Bar */}
      <div className="locator-head-bar">
        <div className="locator-title-copy">
          <span className="eyebrow">{t("locator.liveEyebrow")}</span>
          <h1>{t("locator.title")}</h1>
          <p>
            {resolvedLocation
              ? `${t("locator.withinRadiusChannels", { radius: String(effectiveRadiusKm), code: activeSchemeCode })} • ${
                  `${[
                    trLocatorText(
                      resolvedLocation.post_office || resolvedLocation.district || resolvedLocation.place
                    ),
                    tState(resolvedLocation.state),
                  ]
                    .filter(Boolean)
                    .join(", ")}${resolvedLocation.pin ? ` (${t("locator.pinBadge", { pin: resolvedLocation.pin })})` : ""}` ||
                  trLocatorText(resolvedLocation.location_label || "")
                }`
              : t("locator.promptSearchLocation")}
          </p>
        </div>

        <form className="locator-search-form" onSubmit={handlePinSearch}>
          <div className="search-input-wrap">
            <Icon name="search" size={18} />
            <input
              ref={pinInputRef}
              aria-label={t("locator.pinAriaLabel")}
              placeholder={t("locator.pinInputPlaceholder")}
              value={pinInput}
              maxLength={6}
              onChange={(e) => setPinInput(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            <span>{loading ? t("locator.searchingBtn") : t("locator.searchPinBtn")}</span>
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={gpsLoading || loading}
            onClick={handleUseLiveLocation}
          >
            <Icon name="location" size={17} />
            <span>
              {gpsLoading ? t("locator.detectingGps") : t("locator.useMyLiveLocation")}
            </span>
          </button>
        </form>
      </div>

      {/* Filter Bar: Type Tabs + Search Radius + Keyword Filter */}
      <div className="locator-filter-bar">
        <div className="locator-type-tabs" role="tablist" aria-label={t("locator.filterTypeAria")}>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === "all"}
            className={typeFilter === "all" ? "active" : ""}
            onClick={() => setTypeFilter("all")}
          >
            {t("locator.tabAll", { count: String(typeCounts.all) })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === "PSB"}
            className={typeFilter === "PSB" ? "active" : ""}
            onClick={() => setTypeFilter("PSB")}
          >
            {t("locator.tabPsb", { count: String(typeCounts.PSB) })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === "SCA"}
            className={typeFilter === "SCA" ? "active" : ""}
            onClick={() => setTypeFilter("SCA")}
          >
            {t("locator.tabSca", { count: String(typeCounts.SCA) })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === "MFI"}
            className={typeFilter === "MFI" ? "active" : ""}
            onClick={() => setTypeFilter("MFI")}
          >
            {t("locator.tabMfi", { count: String(typeCounts.MFI) })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === "PORTAL"}
            className={typeFilter === "PORTAL" ? "active" : ""}
            onClick={() => setTypeFilter("PORTAL")}
          >
            {t("locator.tabPortal", { count: String(typeCounts.PORTAL) })}
          </button>
        </div>

        <div className="locator-filter-right">
          <div className="radius-pill-group" role="group" aria-label={t("locator.radiusAria")}>
            <span>{t("locator.radiusLabel")}</span>
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                className={radiusKm === r ? "active" : ""}
                onClick={() => handleRadiusChange(r)}
              >
                <bdi>{r} {t("locator.kmUnit")}</bdi>
              </button>
            ))}
          </div>

          <div className="keyword-filter-wrap">
            <Icon name="search" size={14} />
            <input
              type="text"
              aria-label={t("locator.filterKeywordPlaceholder")}
              placeholder={t("locator.filterKeywordPlaceholder")}
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ margin: "1rem 2rem 0" }} role="alert">
          <Icon name="alert" size={18} />
          <p>{error}</p>
        </div>
      )}

      {/* Split Layout: Leaflet Map on Left, Branch & Portal Cards on Right */}
      <div className="locator-split-layout">
        <div className="locator-map-panel">
          <MapContainer
            center={userPinCoords || INDIA_CENTER}
            zoom={mapZoom}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution="Tiles &copy; Esri &mdash; Source: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
              maxZoom={18}
            />
            <MapViewportController
              target={mapTarget}
              zoom={mapZoom}
              flySeq={flySeq}
              resultsKey={`${branches.length}-${portals.length}`}
            />

            {/* Blue "You are here" Pulse Marker */}
            {userPinCoords && (
              <Marker position={userPinCoords} icon={createUserPulseIcon(t("locator.youAreHere"))}>
                <Popup>
                  <div style={{ padding: "2px 4px" }}>
                    <strong style={{ color: "#1d4ed8" }}>
                      {resolvedLocation?.source === "gps"
                        ? t("locator.youAreHereGps")
                        : t("locator.youAreHere")}
                    </strong>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#475569" }}>
                      {resolvedLocation?.location_label ||
                        resolvedLocation?.place ||
                        t("locator.searchCenter")}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}

            {mappableBranches.map((b) => (
              <Marker
                key={b.id}
                ref={(el) => {
                  if (el) markerRefs.current[b.id] = el;
                }}
                position={[b.lat, b.lng]}
                icon={createBranchIcon(
                  selectedItem?.id === b.id,
                  b.health?.color,
                  b.institution_type
                )}
                eventHandlers={{
                  click: () => setSelectedItem(b),
                }}
              >
                <Popup>
                  <div style={{ padding: "4px", maxWidth: "220px" }}>
                    <strong style={{ fontSize: "13.5px", color: "#0f172a" }}>{trLocatorText(b.name)}</strong>
                    <p style={{ margin: "4px 0", fontSize: "12px", color: "#475569" }}>
                      {trLocatorText(b.address)}
                    </p>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12px" }}>
                      <span style={{ fontWeight: 700, color: "#15803d" }}>
                        <bdi>{t("locator.kmAway", { dist: String(b.distance_km) })}</bdi>
                      </span>
                      <a
                        href={buildDirectionsUrl(b, userPinCoords)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#ea580c", fontWeight: 700 }}
                      >
                        {t("locator.directionsArrow")}
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <div className="map-legend-card">
            <span>
              <i className="status-dot blue-gps" /> {t("locator.youAreHere")}
            </span>
            <span>
              <i className="status-dot good" /> {t("locator.psbBranchLegend")}
            </span>
            <span>
              <i className="status-dot sca-blue" /> {t("locator.scaDeskLegend")}
            </span>
            <span>
              <i className="status-dot saffron-dot" /> {t("locator.selectedLegend")}
            </span>
          </div>
        </div>

        {/* Right Panel: Live Branches + Official Portals */}
        <div className="locator-list-panel">
          <div className="list-summary-bar">
            <div>
              <strong>
                {t("locator.partnersCountTitle", { count: String(filteredItems.length) })}
              </strong>
              <span>
                {t("locator.withinRadiusChannels", {
                  radius: String(effectiveRadiusKm),
                  code: activeSchemeCode,
                })}
              </span>
            </div>
            <span className="live-funds-pill">
              <i className="status-dot-pulse" />
              {overpassLive
                ? t("locator.osmLive")
                : hasSearchedLocation
                  ? t("locator.localSearch")
                  : t("locator.readyBadge")}
            </span>
          </div>

          {expandedRadius && (
            <div className="rank-reason-box" style={{ marginBottom: "12px" }}>
              <Icon name="location" size={15} />
              <div>
                <strong>{t("locator.radiusExpandedTitle", { radius: String(effectiveRadiusKm) })}</strong>
                <p>
                  {t("locator.radiusExpandedDesc", {
                    orig: String(radiusKm),
                    radius: String(effectiveRadiusKm),
                  })}
                </p>
              </div>
            </div>
          )}

          {!hasSearchedLocation && !loading ? (
            <div className="empty-tab-card">
              <p style={{ marginBottom: "12px" }}>
                {t("locator.promptSearchLocation")}
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleUseLiveLocation}
                disabled={gpsLoading}
              >
                <Icon name="location" size={15} />
                <span>{gpsLoading ? t("locator.detectingGps") : t("locator.useMyLiveLocation")}</span>
              </button>
            </div>
          ) : loading ? (
            <div className="tracker-skeleton-card">
              <div className="skeleton-line w-40" />
              <div className="skeleton-line w-80" />
              <div className="skeleton-box" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-tab-card">
              <p>
                {emptyMessage ||
                  t("locator.promptSearchLocation")}
              </p>
              {portals.length > 0 && typeFilter !== "PORTAL" && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ marginTop: "10px" }}
                  onClick={() => setTypeFilter("PORTAL")}
                >
                  <span>{t("locator.viewPortalsBtn", { count: String(portals.length) })}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="branch-cards-stack">
              {filteredItems.map((item, idx) => {
                const isSelected = selectedItem?.id === item.id;
                const isPortal = item.institution_type === "PORTAL";
                const directionsUrl = buildDirectionsUrl(item, userPinCoords);
                const phoneNumber = item.phone || item.toll_free_display || "";

                return (
                  <article
                    key={item.id}
                    className={`bank-card ${isPortal ? "portal-card" : ""} ${
                      idx === 0 && !isPortal ? "ranked-top" : ""
                    } ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedItem(item);
                      if (item.lat != null && item.lng != null) {
                        setMapTarget([item.lat, item.lng]);
                      }
                    }}
                  >
                    <div className="bank-card-top-badges">
                      <span
                        className={`inst-type-badge type-${(
                          item.institution_type || "PSB"
                        ).toLowerCase()}`}
                      >
                        {item.institution_label || item.institution_type}
                      </span>
                      {item.source === "osm_overpass" && (
                        <span className="osm-live-tag">{t("locator.liveOsmTag")}</span>
                      )}
                      {item.provided_schemes?.length > 0 && (
                        <span className="schemes-count-tag">
                          {t("locator.schemesCountTag", { count: String(item.provided_schemes.length) })}
                        </span>
                      )}
                      {item.all_branches?.length > 0 && (
                        <span className="branches-count-tag">
                          {t("locator.branchesCountTag", { count: String(item.all_branches.length) })}
                        </span>
                      )}
                    </div>

                    <div className="bank-card-head">
                      <span className="bank-avatar">
                        <Icon name={isPortal ? "globe" : "bank"} size={20} />
                      </span>
                      <div className="bank-identity">
                        <h2>{trLocatorText(item.name)}</h2>
                        <p>{trLocatorText(item.address)}</p>
                      </div>
                      {item.distance_km != null ? (
                        <span className="distance-badge">
                          <bdi>{item.distance_km} {t("locator.kmUnit")}</bdi>
                        </span>
                      ) : (
                        <span className="distance-badge online">{t("locator.onlineBadge")}</span>
                      )}
                    </div>

                    {/* Phone & Processing Quick Info */}
                    <div className="bank-contact-strip">
                      {phoneNumber && (
                        <div className="phone-info-chip">
                          <Icon name="phone" size={13} />
                          <span className="phone-source-label">
                            {item.phone_source === "branch"
                              ? t("locator.branchPhone")
                              : t("locator.tollFreeHelpline")}
                            :
                          </span>
                          <strong><bdi>{phoneNumber}</bdi></strong>
                          <button
                            type="button"
                            className="btn-copy-mini"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyPhone(phoneNumber, item.id);
                            }}
                          >
                            {copiedKey === item.id ? t("locator.copied") : t("locator.copyNumber")}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="rank-reason-box">
                      <Icon name="checkCircle" size={15} />
                      <div>
                        <strong>{trLocatorText(item.institution_name)}</strong>
                        <p>{item.why}</p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="bank-card-actions">
                      <a
                        className="btn btn-outline btn-sm"
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Icon name="location" size={14} />
                        <span>{t("locator.directions")}</span>
                      </a>

                      {item.lat != null && item.lng != null && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewOnMap(item);
                          }}
                        >
                          <Icon name="search" size={14} />
                          <span>{t("locator.viewOnMap")}</span>
                        </button>
                      )}

                      {item.tel_href && (
                        <a
                          className="btn btn-outline btn-sm"
                          href={item.tel_href}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Icon name="phone" size={14} />
                          <span>
                            {item.phone_source === "branch"
                              ? t("locator.branchPhone")
                              : t("locator.tollFreeHelpline")}
                          </span>
                        </a>
                      )}

                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalItem(item);
                        }}
                      >
                        <span>{t("locator.moreDetails")}</span>
                      </button>

                      {isPortal && item.official_url ? (
                        <a
                          className="btn btn-primary btn-sm"
                          href={item.official_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>{t("locator.openPortal")}</span>
                          <Icon name="external" size={14} />
                        </a>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectAndApply(item);
                          }}
                        >
                          <span>{t("locator.choose")}</span>
                          <Icon name="arrow" size={14} />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rich More Details Modal */}
      {modalItem && (
        <InstitutionDetailsModal
          item={modalItem}
          activeSchemeCode={activeSchemeCode}
          userCoords={userPinCoords}
          onClose={() => setModalItem(null)}
          onSelectAndApply={handleSelectAndApply}
          onCopyPhone={handleCopyPhone}
          copiedKey={copiedKey}
          t={t}
          trText={trLocatorText}
        />
      )}
    </div>
  );
}
