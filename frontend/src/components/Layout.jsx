import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useI18n } from "../i18n.jsx";
import { useAppState } from "../state.jsx";
import {
  speak,
  cancelSpeech,
  extractReadableText,
  getVoiceStatus,
  hasSpeechSynthesis,
} from "../speech.js";
import Icon from "./Icon.jsx";
import Sarthi from "./Sarthi.jsx";

export default function Layout({ children }) {
  const {
    t,
    lang,
    setLang,
    speakLang,
    languages,
    currentLanguageMeta,
    loadingLang,
  } = useI18n();
  const { voiceGuideEnabled, toggleVoiceGuide } = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [langQuery, setLangQuery] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceInfo, setVoiceInfo] = useState(() => getVoiceStatus(speakLang));
  const [liveStatus, setLiveStatus] = useState("");

  const langPickerRef = useRef(null);
  const langSearchRef = useRef(null);
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

  const location = useLocation();

  // Monitor browser voices availability (including async voiceschanged event)
  useEffect(() => {
    const refresh = () => setVoiceInfo(getVoiceStatus(speakLang));
    refresh();
    if (!hasSpeechSynthesis()) return undefined;
    const synth = window.speechSynthesis;
    const onVoicesChanged = () => refresh();
    synth.addEventListener?.("voiceschanged", onVoicesChanged);
    return () => {
      synth.removeEventListener?.("voiceschanged", onVoicesChanged);
    };
  }, [speakLang]);

  // Close language picker on outside click or Escape
  useEffect(() => {
    if (!langOpen) return undefined;
    const onPointerDown = (e) => {
      if (langPickerRef.current && !langPickerRef.current.contains(e.target)) {
        setLangOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setLangOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [langOpen]);

  useEffect(() => {
    if (langOpen) {
      setTimeout(() => langSearchRef.current?.focus(), 20);
    } else {
      setLangQuery("");
    }
  }, [langOpen]);

  const stopAllSpeech = () => {
    cancelSpeech();
    setIsSpeaking(false);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (activeHighlightRef.current) {
      activeHighlightRef.current.classList.remove("voice-reading-active");
      activeHighlightRef.current = null;
    }
  };

  // Announce confirmation when Voice Guide is turned ON; cancel when turned OFF
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    if (voiceGuideEnabled) {
      const status = getVoiceStatus(speakLangRef.current);
      setVoiceInfo(status);
      if (!status.supported) {
        setLiveStatus("Browser speech synthesis is not supported on this device.");
        return;
      }
      if (!status.available) {
        setLiveStatus(
          `No browser voice installed for ${currentLanguageMeta.name} (${speakLangRef.current}). Text remains available.`
        );
        return;
      }
      isAnnouncingRef.current = true;
      cancelSpeech();
      if (activeHighlightRef.current) {
        activeHighlightRef.current.classList.remove("voice-reading-active");
        activeHighlightRef.current = null;
      }
      setLiveStatus("");
      speak(tRef.current("nav.voiceGuideAnnounceOn"), speakLangRef.current, {
        onStart: () => setIsSpeaking(true),
        onEnd: () => {
          isAnnouncingRef.current = false;
          setIsSpeaking(false);
        },
        onNoVoice: () => {
          isAnnouncingRef.current = false;
          setIsSpeaking(false);
          setLiveStatus(
            `No browser voice installed for ${currentLanguageMeta.name} (${speakLangRef.current}).`
          );
        },
      });
      const timer = setTimeout(() => {
        isAnnouncingRef.current = false;
      }, 4000);
      return () => clearTimeout(timer);
    } else {
      isAnnouncingRef.current = false;
      stopAllSpeech();
      lastElementRef.current = null;
      setLiveStatus("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceGuideEnabled]);

  // Cancel speech and clear highlight on route change
  useEffect(() => {
    stopAllSpeech();
    lastElementRef.current = null;
  }, [location.pathname]);

  // Global hover (mouseover), keyboard focus (focusin), and touch tap (touchend) reader
  useEffect(() => {
    if (!voiceGuideEnabled) return undefined;

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

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      const text = extractReadableText(el, langRef.current);
      if (!text) return;

      debounceTimerRef.current = setTimeout(() => {
        cancelSpeech();
        if (activeHighlightRef.current && activeHighlightRef.current !== el) {
          activeHighlightRef.current.classList.remove("voice-reading-active");
        }
        el.classList.add("voice-reading-active");
        activeHighlightRef.current = el;

        const res = speak(text, speakLangRef.current, {
          onStart: () => setIsSpeaking(true),
          onEnd: () => {
            setIsSpeaking(false);
            if (activeHighlightRef.current === el) {
              el.classList.remove("voice-reading-active");
              activeHighlightRef.current = null;
            }
          },
          onNoVoice: () => {
            setIsSpeaking(false);
            if (activeHighlightRef.current === el) {
              el.classList.remove("voice-reading-active");
              activeHighlightRef.current = null;
            }
            setLiveStatus(
              `No browser voice installed for ${speakLangRef.current}.`
            );
          },
        });
        if (!res.spoken) {
          setIsSpeaking(false);
        }
      }, 180);
    };

    const onMouseOver = (e) => handleInteraction(e.target);
    const onFocusIn = (e) => handleInteraction(e.target);
    const onTouchEnd = (e) => {
      lastElementRef.current = null;
      handleInteraction(e.target);
    };

    document.addEventListener("mouseover", onMouseOver, { passive: true });
    document.addEventListener("focusin", onFocusIn, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("touchend", onTouchEnd);
      stopAllSpeech();
      lastElementRef.current = null;
    };
  }, [voiceGuideEnabled]);

  const filteredLanguages = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.native_name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
    );
  }, [languages, langQuery]);

  const voiceUnavailableNotice =
    !voiceInfo.supported
      ? "Speech not supported in this browser"
      : !voiceInfo.available
        ? `No browser voice for ${currentLanguageMeta.name} (${speakLang})`
        : "";

  const voiceBtnTitle = voiceUnavailableNotice
    ? voiceUnavailableNotice
    : voiceGuideEnabled
      ? t("nav.voiceGuideOffTitle")
      : t("nav.voiceGuideOnTitle");

  const navItems = [
    { to: "/", label: t("nav.home"), icon: "home" },
    { to: "/form", label: t("nav.find"), icon: "search" },
    { to: "/calculator", label: t("nav.calculator"), icon: "calc" },
    { to: "/documents", label: t("nav.documents"), icon: "document" },
    { to: "/track", label: t("nav.track"), icon: "track" },
  ];

  return (
    <div className="app-layout">
      <a className="skip" href="#main">
        {t("nav.skip")}
      </a>

      {/* Accessible aria-live region for voice capability / status updates */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus || (voiceGuideEnabled && voiceUnavailableNotice) || ""}
      </div>

      {/* Single-Row Sticky Header */}
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

          {/* Desktop / Mobile Navigation */}
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

          {/* Actions: Voice Guide + Quick Stop + 23-Language Picker + Mobile Menu */}
          <div className="header-actions">
            <button
              className={`voice-guide-btn ${voiceGuideEnabled ? "active" : ""} ${
                !voiceInfo.available ? "voice-unavailable" : ""
              }`}
              type="button"
              onClick={() => toggleVoiceGuide()}
              aria-pressed={voiceGuideEnabled}
              aria-label={voiceBtnTitle}
              title={voiceBtnTitle}
            >
              <Icon name="speaker" size={17} />
              <span className="voice-guide-label">{t("nav.voiceGuide")}</span>
              <span className="voice-guide-status">
                {!voiceInfo.available
                  ? "N/A"
                  : voiceGuideEnabled
                    ? t("nav.voiceOn")
                    : t("nav.voiceOff")}
              </span>
            </button>

            {isSpeaking && (
              <button
                type="button"
                className="voice-stop-btn"
                onClick={stopAllSpeech}
                aria-label="Stop speaking"
                title="Stop speaking"
              >
                <Icon name="close" size={14} />
                <span>Stop</span>
              </button>
            )}

            {/* Searchable 23-Language Picker */}
            <div className="lang-picker" ref={langPickerRef}>
              <button
                className="language-btn"
                type="button"
                onClick={() => setLangOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={langOpen}
                aria-label={`Select language. Current: ${currentLanguageMeta.native_name} (${currentLanguageMeta.name})`}
                title={voiceUnavailableNotice ? `${currentLanguageMeta.name} • ${voiceUnavailableNotice}` : currentLanguageMeta.name}
              >
                <Icon name="globe" size={16} />
                <span className="active-lang" dir={currentLanguageMeta.direction}>
                  {loadingLang ? "..." : currentLanguageMeta.native_name}
                </span>
                <Icon name="chevronDown" size={14} />
              </button>

              {langOpen && (
                <div className="lang-dropdown" role="dialog" aria-label="Language selection">
                  <div className="lang-search-wrap">
                    <Icon name="search" size={15} />
                    <input
                      ref={langSearchRef}
                      type="text"
                      value={langQuery}
                      onChange={(e) => setLangQuery(e.target.value)}
                      placeholder="Search 23 languages..."
                      aria-label="Search language"
                    />
                  </div>
                  <ul className="lang-options-list" role="listbox" aria-label="Supported languages">
                    {filteredLanguages.length === 0 ? (
                      <li className="lang-empty">No matching language</li>
                    ) : (
                      filteredLanguages.map((item) => {
                        const selected = item.code === lang;
                        return (
                          <li key={item.code} role="option" aria-selected={selected}>
                            <button
                              type="button"
                              className={`lang-option-btn ${selected ? "selected" : ""}`}
                              onClick={() => {
                                setLang(item.code);
                                setLangOpen(false);
                              }}
                            >
                              <span className="lang-option-text">
                                <strong dir={item.direction}>{item.native_name}</strong>
                                <small> — {item.name}</small>
                              </span>
                              {selected && <Icon name="check" size={15} />}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              )}
            </div>

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
