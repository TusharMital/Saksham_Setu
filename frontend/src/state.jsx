import { createContext, useCallback, useContext, useMemo, useState } from "react";

const KEY = "ss-form";
const VOICE_KEY = "ss-voice-guide";
const empty = {
  full_name: "",
  mobile: "",
  state: "",
  district: "",
  pin: "",
  caste_category: "",
  certificate_type: "",
  certificate_state: "",
  sub_caste: "",
  ews_assets_compliant: false,
  age: "",
  annual_family_income: "",
  applicant_type: "",
  sector: "",
  project_description: "",
  loan_amount: "",
  project_cost: "",
  woman_led: false,
  disability: false,
  sanitation_worker: false,
  skill_certificate: false,
  shg_jlg_member: false,
  jan_dhan: false,
  existing_govt_loan: false,
};

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [form, setForm] = useState(() => {
    try {
      return { ...empty, ...JSON.parse(sessionStorage.getItem(KEY) || "{}") };
    } catch {
      return empty;
    }
  });
  const [result, setResult] = useState(null);
  const [scheme, setScheme] = useState(null);
  const [branch, setBranch] = useState(null);
  const [refNo, setRefNo] = useState("");
  const [sarthiRecommendedChannel, setSarthiRecommendedChannel] = useState(null);
  const [voiceGuideEnabled, setVoiceGuideEnabledState] = useState(() => {
    try {
      return localStorage.getItem(VOICE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const updateForm = (patch) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      sessionStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  const setVoiceGuideEnabled = (val) => {
    setVoiceGuideEnabledState((prev) => {
      const next = typeof val === "function" ? val(prev) : typeof val === "boolean" ? val : !prev;
      try {
        localStorage.setItem(VOICE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const toggleVoiceGuide = (forceState) => {
    setVoiceGuideEnabled((prev) => (typeof forceState === "boolean" ? forceState : !prev));
  };

  const startSarthiPathAdvisor = useCallback((payload) => {
    window.dispatchEvent(
      new CustomEvent("sarthi:start-path-advisor", {
        detail: payload || {},
      })
    );
  }, []);

  const value = useMemo(
    () => ({
      form,
      updateForm,
      result,
      setResult,
      scheme,
      setScheme,
      branch,
      setBranch,
      refNo,
      setRefNo,
      voiceGuideEnabled,
      setVoiceGuideEnabled,
      toggleVoiceGuide,
      sarthiRecommendedChannel,
      setSarthiRecommendedChannel,
      startSarthiPathAdvisor,
    }),
    [form, result, scheme, branch, refNo, voiceGuideEnabled, sarthiRecommendedChannel, startSarthiPathAdvisor]
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  return useContext(AppStateContext);
}
