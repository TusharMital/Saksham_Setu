import { createContext, useContext, useMemo, useState } from "react";

const KEY = "ss-form";
const empty = {
  full_name: "",
  mobile: "",
  state: "Rajasthan",
  district: "Jaipur",
  pin: "302001",
  caste_category: "SC",
  age: 32,
  annual_family_income: 300000,
  applicant_type: "individual",
  sector: "trade",
  project_description: "",
  loan_amount: 80000,
  project_cost: 100000,
  woman_led: true,
  disability: false,
  sanitation_worker: false,
  skill_certificate: false,
  shg_jlg_member: false,
  jan_dhan: true,
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

  const updateForm = (patch) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      sessionStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  const value = useMemo(
    () => ({ form, updateForm, result, setResult, scheme, setScheme, branch, setBranch, refNo, setRefNo }),
    [form, result, scheme, branch, refNo]
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  return useContext(AppStateContext);
}
