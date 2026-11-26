import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import en from "./locales/en.json";
import hi from "./locales/hi.json";
import { api } from "./api.js";

const LANG_STORAGE_KEY = "ss-lang";
const BUNDLE_CACHE_PREFIX = "ss-i18n-bundle-v1-";
const LANGUAGES_CACHE_KEY = "ss-i18n-languages-v1";
const SCHEME_CACHE_PREFIX = "ss-scheme-i18n-v1-";
const TEXT_CACHE_PREFIX = "ss-text-i18n-v1-";

const LOCAL_DICTS = { en, hi };

const FALLBACK_LANGUAGES = [
  {
    code: "en",
    name: "English",
    native_name: "English",
    script: "Latn",
    direction: "ltr",
    speech_locale: "en-IN",
    capabilities: { ui_translation: true, groq_chat: true, browser_tts_hint: true },
  },
  {
    code: "hi",
    name: "Hindi",
    native_name: "हिन्दी",
    script: "Deva",
    direction: "ltr",
    speech_locale: "hi-IN",
    capabilities: { ui_translation: true, groq_chat: true, browser_tts_hint: true },
  },
];

const memoryBundleCache = new Map([
  ["en", en],
  ["hi", hi],
]);

function readCachedBundle(code) {
  if (memoryBundleCache.has(code)) return memoryBundleCache.get(code);
  try {
    const raw = localStorage.getItem(`${BUNDLE_CACHE_PREFIX}${code}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        memoryBundleCache.set(code, parsed);
        return parsed;
      }
    }
  } catch {
    /* ignore storage errors */
  }
  return null;
}

function writeCachedBundle(code, bundle) {
  memoryBundleCache.set(code, bundle);
  try {
    localStorage.setItem(`${BUNDLE_CACHE_PREFIX}${code}`, JSON.stringify(bundle));
  } catch {
    /* ignore quota errors */
  }
}

function lookup(dict, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), dict);
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [languages, setLanguages] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(LANGUAGES_CACHE_KEY) || "null");
      if (Array.isArray(cached) && cached.length > 0) return cached;
    } catch {
      /* ignore */
    }
    return FALLBACK_LANGUAGES;
  });

  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(LANG_STORAGE_KEY) || "en";
    } catch {
      return "en";
    }
  });

  const [dict, setDict] = useState(() => readCachedBundle(lang) || LOCAL_DICTS[lang] || en);
  const [loadingLang, setLoadingLang] = useState(false);
  const activeReqRef = useRef(0);

  // Hydrate 23-language registry from backend on mount
  useEffect(() => {
    let cancelled = false;
    api
      .languages()
      .then((res) => {
        if (cancelled || !Array.isArray(res?.languages) || res.languages.length === 0) return;
        setLanguages(res.languages);
        try {
          localStorage.setItem(LANGUAGES_CACHE_KEY, JSON.stringify(res.languages));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* keep local fallback list */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentLanguageMeta = useMemo(() => {
    return (
      languages.find((l) => l.code === lang) ||
      FALLBACK_LANGUAGES.find((l) => l.code === lang) ||
      FALLBACK_LANGUAGES[0]
    );
  }, [languages, lang]);

  // Apply lang & dir attributes cleanly to <html>
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = currentLanguageMeta.code;
      document.documentElement.dir = currentLanguageMeta.direction || "ltr";
    }
  }, [currentLanguageMeta]);

  const loadLanguageBundle = useCallback(async (code) => {
    const reqId = ++activeReqRef.current;
    const cached = readCachedBundle(code);
    if (cached) {
      setDict(cached);
    }

    if (LOCAL_DICTS[code] && !cached) {
      setDict(LOCAL_DICTS[code]);
    }

    setLoadingLang(!cached);
    try {
      const data = await api.i18nBundle(code);
      if (reqId !== activeReqRef.current) return;
      if (data?.translations) {
        writeCachedBundle(code, data.translations);
        setDict(data.translations);
      }
      if (data?.direction && typeof document !== "undefined") {
        document.documentElement.lang = data.language || code;
        document.documentElement.dir = data.direction;
      }
    } catch {
      if (reqId !== activeReqRef.current) return;
      if (!cached) {
        setDict(LOCAL_DICTS[code] || en);
      }
    } finally {
      if (reqId === activeReqRef.current) {
        setLoadingLang(false);
      }
    }
  }, []);

  // Ensure initially selected non-en/hi language fetches its bundle on mount
  useEffect(() => {
    if (lang !== "en" && lang !== "hi") {
      loadLanguageBundle(lang);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback(
    (code) => {
      const normalized = String(code || "en").trim().toLowerCase();
      setLangState(normalized);
      try {
        localStorage.setItem(LANG_STORAGE_KEY, normalized);
      } catch {
        /* ignore */
      }
      loadLanguageBundle(normalized);
    },
    [loadLanguageBundle]
  );

  const toggle = useCallback(() => {
    setLang(lang === "en" ? "hi" : "en");
  }, [lang, setLang]);

  const value = useMemo(() => {
    const t = (path, vars) => {
      let text = lookup(dict, path);
      if (text == null) text = lookup(en, path);
      if (typeof text !== "string") return text ?? path;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, v);
        });
      }
      return text;
    };

    const tState = (stateName) => {
      if (!stateName) return "";
      const key = String(stateName).trim();
      if (key.toUpperCase() === "ALL") {
        const allVal = lookup(dict, "detail.allIndia") ?? lookup(en, "detail.allIndia");
        return typeof allVal === "string" ? allVal : key;
      }
      const val = lookup(dict, `states.${key}`);
      if (typeof val === "string" && val.trim()) return val;
      return key;
    };

    const tCategory = (cat) => {
      if (!cat) return "";
      const norm = String(cat).trim().toLowerCase();
      const mapKey =
        norm === "sc"
          ? "form.cat_sc"
          : norm === "st"
            ? "form.cat_st"
            : norm === "obc"
              ? "form.cat_obc"
              : norm === "ews"
                ? "form.cat_ews"
                : norm === "general"
                  ? "form.cat_general"
                  : norm === "minority"
                    ? "form.cat_minority"
                    : "";
      if (mapKey) {
        const val = lookup(dict, mapKey) ?? lookup(en, mapKey);
        if (typeof val === "string" && val.trim()) return val;
      }
      return String(cat);
    };

    return {
      lang,
      setLang,
      toggle,
      t,
      tState,
      tCategory,
      dict,
      speakLang: currentLanguageMeta.speech_locale || "en-IN",
      direction: currentLanguageMeta.direction || "ltr",
      languages,
      currentLanguageMeta,
      loadingLang,
    };
  }, [lang, setLang, toggle, dict, currentLanguageMeta, languages, loadingLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

const memorySchemeTransCache = new Map();

function readSchemeTransCache(lang) {
  if (memorySchemeTransCache.has(lang)) return memorySchemeTransCache.get(lang);
  try {
    const raw = localStorage.getItem(`${SCHEME_CACHE_PREFIX}${lang}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        memorySchemeTransCache.set(lang, parsed);
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeSchemeTransCache(lang, entries) {
  const existing = readSchemeTransCache(lang);
  const merged = { ...existing, ...entries };
  memorySchemeTransCache.set(lang, merged);
  try {
    localStorage.setItem(`${SCHEME_CACHE_PREFIX}${lang}`, JSON.stringify(merged));
  } catch {
    /* ignore quota */
  }
  return merged;
}

function mergeSchemeTranslation(scheme, tr) {
  if (!scheme || !tr) return scheme;
  return {
    ...scheme,
    raw_sectors: scheme.raw_sectors || scheme.sectors,
    raw_available_channels: scheme.raw_available_channels || scheme.available_channels,
    name: tr.name || scheme.name,
    agency: tr.agency || scheme.agency,
    govt_level: tr.govt_level || scheme.govt_level,
    state_name: tr.state_name || scheme.state_name,
    overview: tr.overview || scheme.overview,
    description: tr.overview || scheme.description,
    interest_rate_note: tr.interest_rate_note || scheme.interest_rate_note,
    subsidy_margin_note: tr.subsidy_margin_note || scheme.subsidy_margin_note,
    subsidy_note: tr.subsidy_note || tr.subsidy_margin_note || scheme.subsidy_note,
    sectors_localized:
      Array.isArray(tr.sectors) && tr.sectors.length ? tr.sectors : scheme.sectors_localized,
    available_channels_localized:
      Array.isArray(tr.available_channels) && tr.available_channels.length
        ? tr.available_channels
        : scheme.available_channels_localized,
    key_highlights:
      Array.isArray(tr.key_highlights) && tr.key_highlights.length
        ? tr.key_highlights
        : scheme.key_highlights,
    required_documents:
      Array.isArray(tr.required_documents) && tr.required_documents.length
        ? tr.required_documents
        : scheme.required_documents,
    documents:
      Array.isArray(tr.required_documents) && tr.required_documents.length
        ? tr.required_documents
        : scheme.documents,
    important_notes:
      Array.isArray(tr.important_notes) && tr.important_notes.length
        ? tr.important_notes
        : scheme.important_notes,
  };
}

export function useTranslatedSchemes(schemes) {
  const { lang } = useI18n();
  const [transMap, setTransMap] = useState(() =>
    lang === "en" ? {} : readSchemeTransCache(lang)
  );
  const inflightRef = useRef(new Set());

  const codesKey = useMemo(() => {
    if (!Array.isArray(schemes)) return "";
    return schemes
      .map((s) => s?.code)
      .filter(Boolean)
      .join(",");
  }, [schemes]);

  useEffect(() => {
    if (lang === "en" || !codesKey) {
      setTransMap({});
      return;
    }

    const cached = readSchemeTransCache(lang);
    setTransMap(cached);

    const codes = codesKey.split(",").filter(Boolean);
    const missing = codes.filter(
      (c) => !cached[c] && !inflightRef.current.has(`${lang}:${c}`)
    );
    if (missing.length === 0) return;

    let cancelled = false;
    missing.forEach((c) => inflightRef.current.add(`${lang}:${c}`));

    // Fetch in batches of 20 codes to keep response latency snappy
    const batches = [];
    for (let i = 0; i < missing.length; i += 20) {
      batches.push(missing.slice(i, i + 20));
    }

    Promise.all(
      batches.map((batch) =>
        api
          .translateSchemes(lang, batch)
          .then((res) => {
            if (res?.translations && typeof res.translations === "object") {
              const updated = writeSchemeTransCache(lang, res.translations);
              if (!cancelled) {
                setTransMap(updated);
              }
            }
          })
          .catch(() => {
            /* graceful English fallback */
          })
          .finally(() => {
            batch.forEach((c) => inflightRef.current.delete(`${lang}:${c}`));
          })
      )
    );

    return () => {
      cancelled = true;
    };
  }, [lang, codesKey]);

  return useMemo(() => {
    if (!Array.isArray(schemes)) return [];
    if (lang === "en") return schemes;
    return schemes.map((s) => (s?.code ? mergeSchemeTranslation(s, transMap[s.code]) : s));
  }, [schemes, lang, transMap]);
}

export function useTranslatedScheme(scheme) {
  const arr = useMemo(() => (scheme ? [scheme] : []), [scheme]);
  const translated = useTranslatedSchemes(arr);
  return scheme ? translated[0] || scheme : null;
}

const memoryTextTransCache = new Map();

function readTextTransCache(lang) {
  if (memoryTextTransCache.has(lang)) return memoryTextTransCache.get(lang);
  try {
    const raw = localStorage.getItem(`${TEXT_CACHE_PREFIX}${lang}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        memoryTextTransCache.set(lang, parsed);
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeTextTransCache(lang, entries) {
  const existing = readTextTransCache(lang);
  const merged = { ...existing, ...entries };
  memoryTextTransCache.set(lang, merged);
  try {
    localStorage.setItem(`${TEXT_CACHE_PREFIX}${lang}`, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
  return merged;
}

export function useTranslatedTexts(texts) {
  const { lang } = useI18n();
  const [textMap, setTextMap] = useState(() =>
    lang === "en" ? {} : readTextTransCache(lang)
  );
  const inflightTextRef = useRef(new Set());

  const cleanList = useMemo(() => {
    if (!Array.isArray(texts)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of texts) {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }, [texts]);

  const listKey = useMemo(() => cleanList.join("\u0001"), [cleanList]);

  useEffect(() => {
    if (lang === "en" || !listKey) {
      setTextMap({});
      return;
    }
    const cached = readTextTransCache(lang);
    setTextMap(cached);

    const missing = cleanList.filter(
      (txt) => !cached[txt] && !inflightTextRef.current.has(`${lang}:${txt}`)
    );
    if (missing.length === 0) return;

    let cancelled = false;
    missing.forEach((txt) => inflightTextRef.current.add(`${lang}:${txt}`));

    const batches = [];
    for (let i = 0; i < missing.length; i += 40) {
      batches.push(missing.slice(i, i + 40));
    }

    Promise.all(
      batches.map((batch) =>
        api
          .translateTexts(lang, batch)
          .then((res) => {
            if (res?.translations && typeof res.translations === "object") {
              const updated = writeTextTransCache(lang, res.translations);
              if (!cancelled) {
                setTextMap(updated);
              }
            }
          })
          .catch(() => {})
          .finally(() => {
            batch.forEach((txt) => inflightTextRef.current.delete(`${lang}:${txt}`));
          })
      )
    );

    return () => {
      cancelled = true;
    };
  }, [lang, listKey, cleanList]);

  return useCallback(
    (raw) => {
      if (!raw || lang === "en") return raw;
      const key = String(raw).trim();
      return textMap[key] || raw;
    },
    [lang, textMap]
  );
}
