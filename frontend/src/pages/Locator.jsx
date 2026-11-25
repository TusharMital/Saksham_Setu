import { useEffect, useState, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

L.Icon.Default.mergeOptions({ iconUrl: markerIcon, shadowUrl: markerShadow });

// Helper to pan map smoothly when branch selection changes
function MapRecenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center.length === 2) {
      map.flyTo(center, 13, { duration: 1.2 });
    }
  }, [center, map]);
  return null;
}

export default function Locator() {
  const { t } = useI18n();
  const { form, scheme, setBranch } = useAppState();
  const [center, setCenter] = useState([26.9124, 75.7873]);
  const [pin, setPin] = useState(form.pin || "");
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const loadBranches = async (lat, lng) => {
    setLoading(true);
    setCenter([lat, lng]);
    try {
      const data = await api.branches({
        lat,
        lng,
        scheme: scheme?.code || "",
      });
      setBranches(data.branches || []);
      if (data.branches?.length > 0) {
        setSelectedBranch(data.branches[0]);
      }
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load partner branches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches(center[0], center[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePinSearch = async (e) => {
    if (e) e.preventDefault();
    if (!pin.trim()) return;
    try {
      const data = await api.pin(pin.trim());
      loadBranches(data.lat, data.lng);
    } catch (err) {
      setError(err.message || "Could not find coordinates for this PIN code.");
    }
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => loadBranches(pos.coords.latitude, pos.coords.longitude),
      () => setError("Location access was denied. Please enter a 6-digit PIN code instead.")
    );
  };

  const getHealthScore = (h) => {
    let score = 0;
    if (h.funds_available) score++;
    if (h.scheme_supported) score++;
    if (h.npa_low) score++;
    return score;
  };

  return (
    <div className="locator-page-wrapper">
      {/* Top Header & Search Bar */}
      <div className="locator-head-bar">
        <div className="locator-title-copy">
          <span className="eyebrow">PARTNER BANK LOCATOR</span>
          <h1>{t("locator.title")}</h1>
          <p>{scheme ? `${scheme.code} — ${scheme.name}` : t("locator.subtitle")}</p>
        </div>

        <form className="locator-search-form" onSubmit={handlePinSearch}>
          <div className="search-input-wrap">
            <Icon name="search" size={18} />
            <input
              aria-label="PIN or Area"
              placeholder={t("locator.searchPlaceholder")}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            <span>{loading ? "..." : t("locator.usePin")}</span>
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={handleUseLocation}
            title={t("locator.useLocation")}
          >
            <Icon name="location" size={18} />
          </button>
        </form>
      </div>

      {error ? (
        <div className="error-banner" style={{ margin: "1rem 2rem 0" }}>
          <Icon name="alert" size={18} />
          <p>{error}</p>
        </div>
      ) : null}

      {/* Split Layout: CartoDB Voyager Map on Left, Ranked Bank Cards on Right */}
      <div className="locator-split-layout">
        {/* Real Leaflet Map with CartoDB Voyager TileLayer */}
        <div className="locator-map-panel">
          <MapContainer
            key={center.join(",")}
            center={center}
            zoom={12}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            {/* CartoDB Voyager TileLayer to avoid OSM 403 blocks */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />
            <MapRecenter center={selectedBranch ? [selectedBranch.lat, selectedBranch.lng] : center} />

            {branches.map((b, i) => (
              <Marker
                key={b.name + i}
                position={[b.lat, b.lng]}
                eventHandlers={{
                  click: () => setSelectedBranch(b),
                }}
              >
                <Popup>
                  <div style={{ padding: "4px" }}>
                    <strong style={{ fontSize: "14px", color: "var(--navy)" }}>{b.name}</strong>
                    <p style={{ margin: "4px 0", fontSize: "12px", color: "var(--slate)" }}>{b.address}</p>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--forest)" }}>
                      {b.distance_km} km away
                    </span>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <div className="map-legend-card">
            <strong>{t("locator.health")}</strong>
            <span>
              <i className="status-dot good" /> {t("locator.strong")}
            </span>
            <span>
              <i className="status-dot warn" /> {t("locator.moderate")}
            </span>
            <span>
              <i className="status-dot bad" /> {t("locator.limited")}
            </span>
          </div>
        </div>

        {/* Ranked Bank Cards List */}
        <div className="locator-list-panel">
          <div className="list-summary-bar">
            <div>
              <strong>
                {branches.length} {t("locator.branchesFound")}
              </strong>
              <span>{t("locator.within")}</span>
            </div>
            {branches.length > 0 && (
              <span className="live-funds-pill">
                <i className="status-dot-pulse" /> Live funds confirmed
              </span>
            )}
          </div>

          <div className="branch-cards-stack">
            {branches.map((b, idx) => {
              const score = getHealthScore(b.health);
              const isSelected = selectedBranch?.name === b.name;
              const healthClass = b.health.color === "green" ? "good" : b.health.color === "amber" ? "warn" : "bad";

              return (
                <article
                  key={b.name + idx}
                  className={`bank-card ${idx === 0 ? "ranked-top" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedBranch(b);
                    setCenter([b.lat, b.lng]);
                  }}
                >
                  <div className="rank-badge">#{idx + 1}</div>

                  <div className="bank-card-head">
                    <span className="bank-avatar">
                      <Icon name="bank" size={20} />
                    </span>
                    <div className="bank-identity">
                      <h2>{b.name}</h2>
                      <p>{b.address}</p>
                    </div>
                    <span className="distance-badge">{b.distance_km} km</span>
                  </div>

                  <p className="branch-open-status">
                    <i className="status-dot good" />
                    <span>{t("locator.openUntil")}</span>
                  </p>

                  {/* Animated Health Bar Widget with 3 Status Pills */}
                  <div className="health-widget">
                    <div className="health-title">
                      <span>
                        <i className={`status-dot ${healthClass}`} /> {t("locator.health")}
                      </span>
                      <strong>
                        {score}/3 {score === 3 ? t("locator.strong") : score === 2 ? t("locator.moderate") : t("locator.limited")}
                      </strong>
                    </div>

                    <div className="health-bar-track">
                      <div
                        className={`health-bar-fill ${healthClass}`}
                        style={{ width: `${(score / 3) * 100}%` }}
                      />
                    </div>

                    <div className="health-pills-row">
                      <span className={`status-pill ${b.health.funds_available ? "good" : "bad"}`}>
                        <i /> {t("locator.funds")}
                      </span>
                      <span className={`status-pill ${b.health.scheme_supported ? "good" : "bad"}`}>
                        <i /> {t("locator.scheme")}
                      </span>
                      <span className={`status-pill ${b.health.npa_low ? "good" : "bad"}`}>
                        <i /> {t("locator.npa")}
                      </span>
                    </div>
                  </div>

                  {/* Why it ranked here */}
                  <div className="rank-reason-box">
                    <Icon name="checkCircle" size={16} />
                    <div>
                      <strong>{t("locator.whyRanked")}</strong>
                      <p>{b.why || "Dedicated scheme officer on desk; quota available for new applications."}</p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="bank-card-actions">
                    <a
                      className="btn btn-outline btn-sm"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="location" size={15} />
                      <span>{t("locator.directions")}</span>
                    </a>

                    {b.phone && (
                      <a className="btn btn-outline btn-sm" href={`tel:${b.phone}`}>
                        <Icon name="phone" size={15} />
                        <span>{t("locator.callBranch")}</span>
                      </a>
                    )}

                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBranch(b);
                        navigate("/documents");
                      }}
                    >
                      <span>{t("locator.choose")}</span>
                      <Icon name="arrow" size={15} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
