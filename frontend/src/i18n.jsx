import { createContext, useContext, useMemo, useState } from "react";
import en from "./locales/en.json";
import hi from "./locales/hi.json";

const I18nContext = createContext(null);
const DICTS = { en, hi };

function lookup(dict, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), dict);
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("ss-lang") || "en");

  const value = useMemo(() => {
    const dict = DICTS[lang] || en;
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
    const toggle = () => {
      const next = lang === "en" ? "hi" : "en";
      setLang(next);
      localStorage.setItem("ss-lang", next);
    };
    const speakLang = lang === "hi" ? "hi-IN" : "en-IN";
    return { lang, setLang, toggle, t, dict, speakLang };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
