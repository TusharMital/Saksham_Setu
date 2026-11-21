import { Link, NavLink } from "react-router-dom";
import { useI18n } from "../i18n.jsx";
import Sarthi from "./Sarthi.jsx";

export default function Layout({ children }) {
  const { t, toggle, lang } = useI18n();
  return (
    <>
      <a className="skip" href="#main">
        {t("nav.skip")}
      </a>
      <div className="banner" role="status">
        {t("demoNotice")}
      </div>
      <header className="header">
        <Link className="brand" to="/">
          <strong>{t("appName")}</strong>
          <span>{t("appNameHi")}</span>
        </Link>
        <nav className="nav" aria-label="Main">
          <NavLink to="/">{t("nav.home")}</NavLink>
          <NavLink to="/form">{t("nav.find")}</NavLink>
          <NavLink to="/calculator">{t("nav.calculator")}</NavLink>
          <NavLink to="/locator">{t("nav.locator")}</NavLink>
          <NavLink to="/track">{t("nav.track")}</NavLink>
          <button className="lang-toggle" type="button" onClick={toggle} aria-label="Language">
            {lang === "en" ? t("langHi") : t("langEn")}
          </button>
        </nav>
      </header>
      <main id="main" className="page">
        {children}
      </main>
      <footer className="app-footer">{t("footer.rights")}</footer>
      <Sarthi />
    </>
  );
}
