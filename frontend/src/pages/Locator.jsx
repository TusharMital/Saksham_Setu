import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

L.Icon.Default.mergeOptions({ iconUrl: markerIcon, shadowUrl: markerShadow });

export default function Locator() {
  const { t } = useI18n();
  const { form, scheme, setBranch } = useAppState();
  const [center, setCenter] = useState([26.9124, 75.7873]);
  const [pin, setPin] = useState(form.pin || "302001");
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const load = async (lat, lng) => {
    setCenter([lat, lng]);
    try {
      const data = await api.branches({
        lat,
        lng,
        scheme: scheme?.code || "",
      });
      setBranches(data.branches || []);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load(center[0], center[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section>
      <h1>{t("locator.title")}</h1>
      <div className="actions">
        <button
          className="btn"
          type="button"
          onClick={() => {
            navigator.geolocation.getCurrentPosition(
              (pos) => load(pos.coords.latitude, pos.coords.longitude),
              () => setError("Location was not allowed. Try PIN instead.")
            );
          }}
        >
          {t("locator.useLocation")}
        </button>
        <input aria-label="PIN" value={pin} onChange={(e) => setPin(e.target.value)} style={{ minHeight: 48, padding: 8 }} />
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            try {
              const data = await api.pin(pin);
              load(data.lat, data.lng);
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          {t("locator.usePin")}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="map">
        <MapContainer key={center.join(",")} center={center} zoom={10} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {branches.map((b) => (
            <Marker key={b.name} position={[b.lat, b.lng]}>
              <Popup>
                {b.name} — {b.distance_km} km
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      {branches.map((b) => (
        <article className="card" key={b.name}>
          <h2>
            {b.name} ({b.partner_type})
          </h2>
          <p>
            {b.address} · {b.phone}
          </p>
          <p>{b.why}</p>
          <p>
            {t("locator.quota")}: {b.fund_quota_crore} · {t("locator.npaPct")}: {b.npa_percent} · {b.distance_km} km · score {b.branch_score}
          </p>
          <div className={`health ${b.health.color}`} title={t("locator.health")}>
            <span title={t("locator.funds")} />
            <span title={t("locator.scheme")} />
            <span title={t("locator.npa")} />
          </div>
          <ul className="check-list">
            <li>{t("locator.funds")}: {b.health.funds_available ? "Yes" : "No"}</li>
            <li>{t("locator.scheme")}: {b.health.scheme_supported ? "Yes" : "No"}</li>
            <li>{t("locator.npa")}: {b.health.npa_low ? "Yes" : "No"}</li>
          </ul>
          <p>Schemes: {(b.schemes_supported || []).join(", ")}</p>
          <div className="actions">
            <a
              className="btn"
              href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              {t("locator.directions")}
            </a>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                setBranch(b);
                navigate("/documents");
              }}
            >
              {t("locator.choose")}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
