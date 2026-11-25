import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useI18n } from "../i18n.jsx";
import { useAppState } from "../state.jsx";
import { speak, cancelSpeech, extractReadableText } from "../speech.js";
import Icon from "./Icon.jsx";
import Sarthi from "./Sarthi.jsx";

export default function Layout({ children }) {
  const { t, toggle, lang, speakLang } = useI18n();
  const { voiceGuideEnabled, toggleVoiceGuide } = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const debounceTimerRef = useRef(null);
  const lastElementRef = useRef(null);
  const activeHighlightRef = useRef(null);
  const isAnnouncingRef = useRef(false);
  const isFirstMountRef = useRef(true);

  const langRef = useRef(lang);
  langRef.current = lang;
  const speakLangRef = useRef(speakLang);
  speakLangRef.current = speakLang;
  const tRef = useRef(t);
  tRef.current = t;

  // Announce short confirmation when turned ON, cancel immediately when turned OFF
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    if (voiceGuideEnabled) {
      isAnnouncingRef.current = true;
      cancelSpeech();
      if (activeHighlightRef.current) {
        activeHighlightRef.current.classList.remove("voice-reading-active");
        activeHighlightRef.current = null;
      }
      speak(tRef.current("nav.voiceGuideAnnounceOn"), speakLangRef.current, {
        onEnd: () => {
          isAnnouncingRef.current = false;
        },
      });
      const timer = setTimeout(() => {
        isAnnouncingRef.current = false;
      }, 4000);
      return () => clearTimeout(timer);
    } else {
      isAnnouncingRef.current = false;
      cancelSpeech();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (activeHighlightRef.current) {
        activeHighlightRef.current.classList.remove("voice-reading-active");
        activeHighlightRef.current = null;
      }
      lastElementRef.current = null;
    }
  }, [voiceGuideEnabled]);

  // Cancel speech and clear highlight when navigating between pages
  useEffect(() => {
    cancelSpeech();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (activeHighlightRef.current) {
      activeHighlightRef.current.classList.remove("voice-reading-active");
      activeHighlightRef.current = null;
    }
    lastElementRef.current = null;
  }, [location.pathname]);

  // Global cursor (mouseover) & focusin listeners for hover-to-speak
  useEffect(() => {
    if (!voiceGuideEnabled) return;

    const handleInteraction = (target) => {
      if (isAnnouncingRef.current) return;
      if (!target || !target.closest) return;

      const el = target.closest(
        "button, a, h1, h2, h3, h4, p, label, input, select, textarea, li, [data-speak]"
      );
      if (!el) return;

      if (
        el.getAttribute("aria-hidden") === "true" &&
        !el.getAttribute("aria-label") &&
        !el.getAttribute("data-speak")
      ) {
        return;
      }

      if (el === lastElementRef.current) return;
      lastElementRef.current = el;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const text = extractReadableText(el, langRef.current);
      if (!text) return;

      debounceTimerRef.current = setTimeout(() => {
        cancelSpeech();

        if (activeHighlightRef.current && activeHighlightRef.current !== el) {
          activeHighlightRef.current.classList.remove("voice-reading-active");
        }

        el.classList.add("voice-reading-active");
        activeHighlightRef.current = el;

        speak(text, speakLangRef.current, {
          onEnd: () => {
            if (activeHighlightRef.current === el) {
              el.classList.remove("voice-reading-active");
              activeHighlightRef.current = null;
            }
          },
        });
      }, 200);
    };

    const onMouseOver = (e) => handleInteraction(e.target);
    const onFocusIn = (e) => handleInteraction(e.target);

    document.addEventListener("mouseover", onMouseOver, { passive: true });
    document.addEventListener("focusin", onFocusIn, { passive: true });

    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("focusin", onFocusIn);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (activeHighlightRef.current) {
        activeHighlightRef.current.classList.remove("voice-reading-active");
        activeHighlightRef.current = null;
      }
      lastElementRef.current = null;
    };
  }, [voiceGuideEnabled]);

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

          {/* Actions: Voice Guide Speaker Toggle, Clean EN / हिं Toggle and Mobile Menu Button */}
          <div className="header-actions">
            <button
              className={`voice-guide-btn ${voiceGuideEnabled ? "active" : ""}`}
              type="button"
              onClick={() => toggleVoiceGuide()}
              aria-pressed={voiceGuideEnabled}
              aria-label={
                voiceGuideEnabled
                  ? t("nav.voiceGuideOffTitle")
                  : t("nav.voiceGuideOnTitle")
              }
              title={
                voiceGuideEnabled
                  ? t("nav.voiceGuideOffTitle")
                  : t("nav.voiceGuideOnTitle")
              }
            >
              <Icon name="speaker" size={17} />
              <span className="voice-guide-label">{t("nav.voiceGuide")}</span>
              <span className="voice-guide-status">
                {voiceGuideEnabled ? t("nav.voiceOn") : t("nav.voiceOff")}
              </span>
            </button>

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
          <p className="footer-disclaimer">{t("footer.disclaimer")}</p>
        </div>
      </footer>

      {/* Floating Sarthi Chatbot Assistant */}
      <Sarthi />
    </div>
  );
}
