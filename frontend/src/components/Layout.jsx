import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useI18n } from "../i18n.jsx";
import Icon from "./Icon.jsx";
import Sarthi from "./Sarthi.jsx";

export default function Layout({ children }) {
  const { t, toggle, lang } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { to: "/", label: t("nav.home"), icon: "home" },
    { to: "/form", label: t("nav.find"), icon: "search" },
    { to: "/calculator", label: t("nav.calculator"), icon: "calc" },
    { to: "/locator", label: t("nav.locator"), icon: "bank" },
    { to: "/apply", label: t("nav.paths"), icon: "building" },
    { to: "/documents", label: t("nav.documents"), icon: "document" },
    { to: "/track", label: t("nav.track"), icon: "track" },
  ];

  return (
    <div className="app-layout">
      <a className="skip" href="#main">
        {t("nav.skip")}
      </a>

      {/* Top Demo Data Strip with gentle amber pulse */}
      <aside className="demo-strip" role="status" aria-label="Prototype Notice">
        <span className="demo-badge">
          <i className="demo-dot" />
          DEMO DATA
        </span>
        <p>{t("demoNotice")}</p>
      </aside>

      {/* Single-Row White Header */}
      <header className="header">
        <div className="header-inner">
          <Link className="brand" to="/" onClick={() => setMenuOpen(false)} aria-label="Saksham Setu Home">
            <span className="brand-mark" aria-hidden="true">
              <span>स</span>
            </span>
            <span className="brand-copy">
              <strong>{t("appName")}</strong>
              <small>{t("appNameHi")}</small>
            </span>
          </Link>

          {/* Desktop Navigation with Icon + Text & Active Saffron Underline */}
          <nav className={`nav ${menuOpen ? "open" : ""}`} aria-label="Main Navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                onClick={() => setMenuOpen(false)}
              >
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Actions: Clean EN / हिं Toggle and Mobile Menu Button */}
          <div className="header-actions">
            <button
              className="language-btn"
              type="button"
              onClick={toggle}
              aria-label={`Current language: ${lang}. Click to toggle English and Hindi.`}
              title="Switch language / भाषा बदलें"
            >
              <span className={lang === "en" ? "active-lang" : "dim-lang"}>EN</span>
              <span className="lang-sep">/</span>
              <span className={lang === "hi" ? "active-lang" : "dim-lang"}>हिं</span>
            </button>

            <button
              className="menu-btn"
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              <Icon name={menuOpen ? "close" : "menu"} size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <main id="main" className="main-content">
        {children}
      </main>

      {/* Institutional Public-Interest Footer */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="brand-mark sm" aria-hidden="true">
              <span>स</span>
            </span>
            <div className="footer-brand-text">
              <strong>{t("appName")}</strong>
              <small>{t("appNameHi")} • {t("nav.brandTagline")}</small>
            </div>
          </div>

          <div className="footer-links">
            <Link to="/form">{t("nav.find")}</Link>
            <Link to="/calculator">{t("nav.calculator")}</Link>
            <Link to="/locator">{t("nav.locator")}</Link>
            <Link to="/apply">{t("nav.paths")}</Link>
            <Link to="/documents">{t("nav.documents")}</Link>
            <Link to="/track">{t("nav.track")}</Link>
          </div>

          <p className="footer-note">{t("footer.rights")}</p>
        </div>
      </footer>

      {/* Floating Sarthi Chatbot Assistant */}
      <Sarthi />
    </div>
  );
}
