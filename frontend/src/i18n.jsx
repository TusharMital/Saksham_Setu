import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import en from "./locales/en.json";
import hi from "./locales/hi.json";
import { api } from "./api.js";

const LANG_STORAGE_KEY = "ss-lang";
const BUNDLE_CACHE_PREFIX = "ss-i18n-bundle-v1-";
const LANGUAGES_CACHE_KEY = "ss-i18n-languages-v1";

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

    return {
      lang,
      setLang,
      toggle,
      t,
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
