import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

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

function formatCompactInr(val) {
  if (val === null || val === undefined) return "No cap";
  const n = Number(val);
  if (Number.isNaN(n)) return "—";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function buildDirectionsUrl(item) {
  if (item?.lat != null && item?.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`;
  }
  const query = [item?.name, item?.address].filter(Boolean).join(" ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query || "India")}`;
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

function createUserPulseIcon() {
  return L.divIcon({
    className: "user-gps-pin-wrap",
    html: `<div class="user-gps-pulse-dot" title="You are here"><span class="pulse-ring"></span><span class="core-dot"></span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

function MapViewportController({ target, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (target && target.length === 2 && target[0] != null && target[1] != null) {
      map.flyTo(target, zoom || 13, { duration: 0.9 });
    }
  }, [target, zoom, map]);
  return null;
}

function InstitutionDetailsModal({
  item,
  activeSchemeCode,
  onClose,
  onSelectAndApply,
  onCopyPhone,
  copiedKey,
  t,
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

  if (!item) return null;

  const providedSchemes = Array.isArray(item.provided_schemes) ? item.provided_schemes : [];
  const allBranches = Array.isArray(item.all_branches) ? item.all_branches : [];
  const filteredSchemes = providedSchemes.filter((s) => {
    const q = schemeQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q)
    );
  });

  const isPortal = item.institution_type === "PORTAL";
  const directionsUrl = buildDirectionsUrl(item);

  return (
    <div
      className="locator-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.name} details`}
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
                  <bdi>{item.distance_km} km</bdi>
                </span>
              )}
            </div>
            <h2>{item.institution_name || item.name}</h2>
            {item.name !== item.institution_name && (
              <p className="modal-branch-subtitle">
                Selected Branch: <strong>{item.name}</strong> — {item.address}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onClose}
            aria-label="Close modal"
          >
            <Icon name="close" size={16} />
            <span>Close</span>
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
            Overview & Docs
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
                <h3>Institution Profile</h3>
                <p className="modal-overview-text">{item.overview}</p>

                <dl className="modal-kv-grid">
                  <div>
                    <dt>Headquarters</dt>
                    <dd>{item.headquarters || "India"}</dd>
                  </div>
                  <div>
                    <dt>{t("locator.processingTime")}</dt>
                    <dd>{item.processing_time || "10–15 working days"}</dd>
                  </div>
                  <div>
                    <dt>Collateral Policy</dt>
                    <dd>{item.collateral_policy || "As per scheme & RBI norms"}</dd>
                  </div>
                  <div>
                    <dt>Helpline Hours</dt>
                    <dd>{item.helpline_hours || "Mon–Sat 10:00 AM – 4:00 PM"}</dd>
                  </div>
                  <div>
                    <dt>
                      {item.phone_source === "branch"
                        ? t("locator.branchPhone")
                        : t("locator.tollFreeHelpline")}
                    </dt>
                    <dd className="modal-phone-row">
                      <strong>{item.phone || item.toll_free_display || "—"}</strong>
                      {item.tel_href && (
                        <button
                          type="button"
                          className="btn-copy-mini"
                          onClick={() =>
                            onCopyPhone(item.phone || item.toll_free_phone, `modal-${item.id}`)
                          }
                        >
                          {copiedKey === `modal-${item.id}` ? "Copied!" : t("locator.copyNumber")}
                        </button>
                      )}
                    </dd>
                  </div>
                  {item.official_url && (
                    <div>
                      <dt>Official Website</dt>
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
                <h3>Bank / Portal Required Documents</h3>
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
                    placeholder="Filter schemes by code or name..."
                    value={schemeQuery}
                    onChange={(e) => setSchemeQuery(e.target.value)}
                  />
                </div>
              </div>

              {filteredSchemes.length === 0 ? (
                <p className="modal-empty-msg">No schemes match your search.</p>
              ) : (
                <div className="modal-schemes-grid">
                  {filteredSchemes.map((s) => (
                    <article key={s.code} className="modal-scheme-card">
                      <div className="modal-scheme-top">
                        <span className="badge-pill">{s.code}</span>
                        <span className={`level-badge-sm ${s.level === "state" ? "state" : "central"}`}>
                          {s.level === "state" ? "STATE GOVT" : "CENTRAL GOVT"}
                        </span>
                      </div>
                      <h4>{s.name}</h4>
                      <div className="modal-scheme-meta">
                        <span>
                          Rate: <b>{s.interest_rate}% p.a.</b>
                        </span>
                        <span>
                          Max Loan: <b>{formatCompactInr(s.max_loan)}</b>
                        </span>
                      </div>
                      <Link
                        to={`/scheme/${encodeURIComponent(s.code)}`}
                        className="btn btn-outline btn-sm"
                        onClick={onClose}
                      >
                        <span>View Scheme →</span>
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
                    <strong>24×7 Digital Application Portal</strong>
                    <p>
                      This is an online Government portal with pan-India digital submission. Use the
                      official portal link or toll-free helpline below for assistance.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="modal-branches-list">
                  {allBranches.map((br, idx) => (
                    <article key={`${br.branch_name}-${idx}`} className="modal-branch-row">
                      <div className="modal-branch-info">
                        <div className="modal-branch-name-row">
                          <strong>{br.branch_name}</strong>
                          {br.distance_km != null && (
                            <span className="distance-badge">
                              <bdi>{br.distance_km} km</bdi>
                            </span>
                          )}
                        </div>
                        <p>{br.address}</p>
                        <small>
                          {[br.district, br.state, br.pin_code].filter(Boolean).join(" • ")}
                        </small>
                      </div>
                      <div className="modal-branch-actions">
                        {(br.tel_href || br.phone) && (
                          <a
                            href={br.tel_href || `tel:${String(br.phone).replace(/[^\d+]/g, "")}`}
                            className="btn btn-outline btn-sm"
                          >
                            <Icon name="phone" size={14} />
                            <span>Call</span>
                          </a>
                        )}
                        <a
                          href={buildDirectionsUrl({
                            lat: br.lat,
                            lng: br.lng,
                            name: br.branch_name,
                            address: br.address,
                          })}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline btn-sm"
                        >
                          <Icon name="location" size={14} />
                          <span>Directions</span>
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
                Call ({item.phone || item.toll_free_display})
              </span>
            </a>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSelectAndApply(item)}
          >
            <span>Proceed to Apply ({activeSchemeCode}) →</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function BranchLocator() {
  const { t } = useI18n();
  const { form, scheme, setScheme, setBranch } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryCode = (searchParams.get("scheme") || "").trim();
  const activeSchemeCode = queryCode || scheme?.code || "";

  const [allSchemes, setAllSchemes] = useState([]);
  const [activeScheme, setActiveScheme] = useState(() =>
    scheme && activeSchemeCode && scheme.code?.toUpperCase() === activeSchemeCode.toUpperCase()
      ? scheme
      : null
  );

  // Location & search states
  const [pinInput, setPinInput] = useState(() =>
    /^[1-9][0-9]{5}$/.test(String(form.pin || "").trim()) ? String(form.pin).trim() : ""
  );
  const [searchCoords, setSearchCoords] = useState(null); // { lat, lng } if GPS
  const [userPinCoords, setUserPinCoords] = useState([26.9124, 75.7873]);
  const [mapTarget, setMapTarget] = useState([26.9124, 75.7873]);
  const [mapZoom, setMapZoom] = useState(12);
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [radiusKm, setRadiusKm] = useState(10);

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
    async ({ pin, lat, lng, radius = radiusKm, schemeCode = activeSchemeCode }) => {
      if (!schemeCode) return;
      setLoading(true);
      setError("");
      try {
        const res = await api.liveBanksSearch({
          scheme: schemeCode,
          pin: pin || undefined,
          lat: lat !== undefined ? lat : undefined,
          lng: lng !== undefined ? lng : undefined,
          radius_km: radius,
        });
        setBranches(res.branches || []);
        setPortals(res.portals || []);
        setOverpassLive(Boolean(res.overpass_live));
        if (res.scheme) {
          setActiveScheme(res.scheme);
        }
        if (res.location?.lat != null && res.location?.lng != null) {
          const coords = [res.location.lat, res.location.lng];
          setUserPinCoords(coords);
          setMapTarget(coords);
          setMapZoom(radius >= 25 ? 11 : radius <= 5 ? 14 : 12);
          setResolvedLocation(res.location);
        }
      } catch (err) {
        setError(err.body?.detail || err.message || "Failed to load nearby banks & portals.");
      } finally {
        setLoading(false);
      }
    },
    [activeSchemeCode, radiusKm]
  );

  // Trigger initial search when a scheme becomes active
  useEffect(() => {
    if (!activeSchemeCode) return;
    if (searchCoords) {
      runLiveSearch({
        lat: searchCoords.lat,
        lng: searchCoords.lng,
        radius: radiusKm,
        schemeCode: activeSchemeCode,
      });
    } else {
      const initialPin = /^[1-9][0-9]{5}$/.test(pinInput.trim())
        ? pinInput.trim()
        : "302001";
      runLiveSearch({
        pin: initialPin,
        radius: radiusKm,
        schemeCode: activeSchemeCode,
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
      setError("Please enter a valid 6-digit Indian PIN code (e.g. 335001 or 302001).");
      pinInputRef.current?.focus();
      return;
    }
    setSearchCoords(null);
    runLiveSearch({ pin: cleaned, radius: radiusKm, schemeCode: activeSchemeCode });
  };

  const handleUseLiveLocation = () => {
    if (!navigator.geolocation) {
      setError(
        "Geolocation is not supported by your browser — enter any 6-digit Indian PIN code below to find banks near you."
      );
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
        runLiveSearch({
          lat: coords.lat,
          lng: coords.lng,
          radius: radiusKm,
          schemeCode: activeSchemeCode,
        });
      },
      () => {
        setGpsLoading(false);
        setError(
          "Location permission denied — enter any 6-digit Indian PIN code below to find banks near you"
        );
        pinInputRef.current?.focus();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
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
      });
    } else {
      const activePin = /^[1-9][0-9]{5}$/.test(pinInput.trim()) ? pinInput.trim() : "302001";
      runLiveSearch({
        pin: activePin,
        radius: nextRadius,
        schemeCode: activeSchemeCode,
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
    if (item?.lat == null || item?.lng == null) return;
    setSelectedItem(item);
    setMapTarget([item.lat, item.lng]);
    setMapZoom(15);
    const marker = markerRefs.current[item.id];
    if (marker && typeof marker.openPopup === "function") {
      setTimeout(() => marker.openPopup(), 250);
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
          <span className="eyebrow">SCHEME-DRIVEN PARTNER & PORTAL LOCATOR</span>
          <h1>{t("locator.selectSchemeTitle")}</h1>
          <p>{t("locator.selectSchemeDesc")}</p>

          <div className="locator-gate-controls">
            <label htmlFor="gate-scheme-select">Choose from all 66 Central & State Schemes</label>
            <select
              id="gate-scheme-select"
              value=""
              onChange={(e) => handleSchemePick(e.target.value)}
            >
              <option value="">-- Select a Loan Scheme --</option>
              {allSchemes.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name} ({s.interest_rate}% p.a.)
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
            <Icon name="award" size={14} /> ACTIVE SCHEME CONTEXT
          </span>
          <h2>
            Showing verified partner banks & official portals for:{" "}
            <strong>
              {activeScheme?.name || activeSchemeCode} ({activeSchemeCode})
            </strong>
          </h2>
          {activeScheme?.available_channels?.length > 0 && (
            <div className="locator-channel-pills">
              <span>Eligible Channels:</span>
              {activeScheme.available_channels.map((ch) => (
                <span key={ch} className="channel-mini-pill">
                  {CHANNEL_LABELS[ch] || ch}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="locator-scheme-banner-right">
          <select
            aria-label="Switch scheme"
            value={activeSchemeCode}
            onChange={(e) => handleSchemePick(e.target.value)}
          >
            {allSchemes.map((s) => (
              <option key={s.code} value={s.code}>
                Switch Scheme: {s.code} — {s.name}
              </option>
            ))}
          </select>
          <Link
            to={`/scheme/${encodeURIComponent(activeSchemeCode)}`}
            className="btn btn-outline btn-sm"
          >
            <span>Back to {activeSchemeCode}</span>
          </Link>
        </div>
      </div>

      {/* Top Search & Live GPS Bar */}
      <div className="locator-head-bar">
        <div className="locator-title-copy">
          <span className="eyebrow">OPENSTREETMAP LIVE BRANCH & PORTAL LOCATOR</span>
          <h1>{t("locator.title")}</h1>
          <p>
            {resolvedLocation
              ? `Centered near ${[resolvedLocation.district || resolvedLocation.place, resolvedLocation.state].filter(Boolean).join(", ")}${resolvedLocation.pin ? ` (PIN ${resolvedLocation.pin})` : ""} • ${overpassLive ? "Live OpenStreetMap branches active" : "Directory fallback active"}`
              : t("locator.subtitle")}
          </p>
        </div>

        <form className="locator-search-form" onSubmit={handlePinSearch}>
          <div className="search-input-wrap">
            <Icon name="search" size={18} />
            <input
              ref={pinInputRef}
              aria-label="6-digit Indian PIN code"
              placeholder="Enter 6-digit Indian PIN (e.g. 335001)"
              value={pinInput}
              maxLength={6}
              onChange={(e) => setPinInput(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            <span>{loading ? "Searching..." : t("locator.searchPinBtn")}</span>
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={gpsLoading || loading}
            onClick={handleUseLiveLocation}
          >
            <Icon name="location" size={17} />
            <span>
              {gpsLoading ? "Detecting your live GPS location..." : t("locator.useMyLiveLocation")}
            </span>
          </button>
        </form>
      </div>

      {/* Filter Bar: Type Tabs + Search Radius + Keyword Filter */}
      <div className="locator-filter-bar">
        <div className="locator-type-tabs" role="tablist" aria-label="Filter institutions by type">
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === "all"}
            className={typeFilter === "all" ? "active" : ""}
            onClick={() => setTypeFilter("all")}
          >
            All ({typeCounts.all})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === "PSB"}
            className={typeFilter === "PSB" ? "active" : ""}
            onClick={() => setTypeFilter("PSB")}
          >
            Public Sector Banks (PSB) ({typeCounts.PSB})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === "SCA"}
            className={typeFilter === "SCA" ? "active" : ""}
            onClick={() => setTypeFilter("SCA")}
          >
            State Channelizing Agencies (SCA) ({typeCounts.SCA})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === "MFI"}
            className={typeFilter === "MFI" ? "active" : ""}
            onClick={() => setTypeFilter("MFI")}
          >
            NBFC-MFIs ({typeCounts.MFI})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === "PORTAL"}
            className={typeFilter === "PORTAL" ? "active" : ""}
            onClick={() => setTypeFilter("PORTAL")}
          >
            Official Govt Portals ({typeCounts.PORTAL})
          </button>
        </div>

        <div className="locator-filter-right">
          <div className="radius-pill-group" role="group" aria-label="Search radius">
            <span>Radius:</span>
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                className={radiusKm === r ? "active" : ""}
                onClick={() => handleRadiusChange(r)}
              >
                {r} km
              </button>
            ))}
          </div>

          <div className="keyword-filter-wrap">
            <Icon name="search" size={14} />
            <input
              type="text"
              aria-label="Filter by bank name or locality"
              placeholder="Filter bank or locality..."
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
            center={userPinCoords}
            zoom={mapZoom}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <MapViewportController target={mapTarget} zoom={mapZoom} />

            {/* Blue "You are here" Pulse Marker */}
            {userPinCoords && (
              <Marker position={userPinCoords} icon={createUserPulseIcon()}>
                <Popup>
                  <div style={{ padding: "2px 4px" }}>
                    <strong style={{ color: "#1d4ed8" }}>You are here</strong>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#475569" }}>
                      {resolvedLocation?.place || "Search Center"}
                      {resolvedLocation?.pin ? ` (${resolvedLocation.pin})` : ""}
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
                    <strong style={{ fontSize: "13.5px", color: "#0f172a" }}>{b.name}</strong>
                    <p style={{ margin: "4px 0", fontSize: "12px", color: "#475569" }}>
                      {b.address}
                    </p>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12px" }}>
                      <span style={{ fontWeight: 700, color: "#15803d" }}>
                        {b.distance_km} km away
                      </span>
                      <a
                        href={buildDirectionsUrl(b)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#ea580c", fontWeight: 700 }}
                      >
                        Directions →
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <div className="map-legend-card">
            <span>
              <i className="status-dot blue-gps" /> You are here
            </span>
            <span>
              <i className="status-dot good" /> PSB / Branch
            </span>
            <span>
              <i className="status-dot sca-blue" /> SCA Desk
            </span>
            <span>
              <i className="status-dot saffron-dot" /> Selected
            </span>
          </div>
        </div>

        {/* Right Panel: Live Branches + Official Portals */}
        <div className="locator-list-panel">
          <div className="list-summary-bar">
            <div>
              <strong>
                {filteredItems.length} Partner Banks & Portals
              </strong>
              <span>
                Within {radiusKm} km radius • {activeSchemeCode} eligible channels
              </span>
            </div>
            <span className="live-funds-pill">
              <i className="status-dot-pulse" />
              {overpassLive ? "OSM Live" : "Directory Active"}
            </span>
          </div>

          {loading ? (
            <div className="tracker-skeleton-card">
              <div className="skeleton-line w-40" />
              <div className="skeleton-line w-80" />
              <div className="skeleton-box" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-tab-card">
              <p>
                No banks or portals match the selected filter within {radiusKm} km. Try expanding
                the radius to 25 km or switching to &ldquo;All&rdquo;.
              </p>
            </div>
          ) : (
            <div className="branch-cards-stack">
              {filteredItems.map((item, idx) => {
                const isSelected = selectedItem?.id === item.id;
                const isPortal = item.institution_type === "PORTAL";
                const directionsUrl = buildDirectionsUrl(item);
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
                        <span className="osm-live-tag">Live OSM</span>
                      )}
                      {item.provided_schemes?.length > 0 && (
                        <span className="schemes-count-tag">
                          {item.provided_schemes.length} Schemes
                        </span>
                      )}
                      {item.all_branches?.length > 0 && (
                        <span className="branches-count-tag">
                          {item.all_branches.length} Branches
                        </span>
                      )}
                    </div>

                    <div className="bank-card-head">
                      <span className="bank-avatar">
                        <Icon name={isPortal ? "globe" : "bank"} size={20} />
                      </span>
                      <div className="bank-identity">
                        <h2>{item.name}</h2>
                        <p>{item.address}</p>
                      </div>
                      {item.distance_km != null ? (
                        <span className="distance-badge">
                          <bdi>{item.distance_km} km</bdi>
                        </span>
                      ) : (
                        <span className="distance-badge online">Online</span>
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
                          <strong>{phoneNumber}</strong>
                          <button
                            type="button"
                            className="btn-copy-mini"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyPhone(phoneNumber, item.id);
                            }}
                          >
                            {copiedKey === item.id ? "Copied!" : t("locator.copyNumber")}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="rank-reason-box">
                      <Icon name="checkCircle" size={15} />
                      <div>
                        <strong>{item.institution_name}</strong>
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
                          <span>Open Portal</span>
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
          onClose={() => setModalItem(null)}
          onSelectAndApply={handleSelectAndApply}
          onCopyPhone={handleCopyPhone}
          copiedKey={copiedKey}
          t={t}
        />
      )}
    </div>
  );
}
