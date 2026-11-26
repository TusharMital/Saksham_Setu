import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HelpField from "../components/HelpField.jsx";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

const FALLBACK_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

const DISTRICT_ALIASES = {
  ganganagar: "Sri Ganganagar",
  sriganganagar: "Sri Ganganagar",
  bangalore: "Bengaluru Urban",
  bengaluru: "Bengaluru Urban",
  gurgaon: "Gurugram",
  allahabad: "Prayagraj",
  faizabad: "Ayodhya",
  ahmednagar: "Ahilyanagar",
  osmanabad: "Dharashiv",
  ahmadabad: "Ahmedabad",
  kachchh: "Kutch",
  pondicherry: "Puducherry",
};

function resolveDistrictOption(stateName, rawDistrict, statesMap) {
  const cleaned = String(rawDistrict || "").trim();
  if (!cleaned) return "";
  const list = statesMap[stateName] || [];
  const low = cleaned.toLowerCase();
  const exact = list.find((d) => d.toLowerCase() === low);
  if (exact) return exact;
  const alias = DISTRICT_ALIASES[low];
  if (alias) {
    const matchedAlias = list.find((d) => d.toLowerCase() === alias.toLowerCase());
    if (matchedAlias) return matchedAlias;
    return alias;
  }
  return cleaned;
}

export default function Form() {
  const { t, lang } = useI18n();
  const { form, updateForm, setResult } = useAppState();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState("");
  const [statesMap, setStatesMap] = useState({});
  const [pinBusy, setPinBusy] = useState(false);
  const [pinInfo, setPinInfo] = useState(null);
  const [selectedPostOffice, setSelectedPostOffice] = useState("");
  const [pinNote, setPinNote] = useState("");
  const pinReqRef = useRef(0);
  const lastPinFetchedRef = useRef("");
  const navigate = useNavigate();

  const f = (key, vars) => t(`form.${key}`, vars);
  const selectPlaceholder = { value: "", label: f("selectOption") };

  // Fetch all 28 States + 8 UTs and their districts from backend
  useEffect(() => {
    let cancelled = false;
    api
      .districts()
      .then((res) => {
        if (!cancelled && res?.states && typeof res.states === "object") {
          setStatesMap(res.states);
        }
      })
      .catch(() => {
        /* keep fallback state names */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stateNames = Object.keys(statesMap).length
    ? Object.keys(statesMap).sort((a, b) => a.localeCompare(b))
    : FALLBACK_STATES;

  const districts = (() => {
    if (!form.state) return [{ value: "", label: f("selectStateFirst") }];
    const base = [...(statesMap[form.state] || [])];
    const hasDistrict =
      form.district && base.some((d) => d.toLowerCase() === String(form.district).toLowerCase());
    if (form.district && form.district !== "Other" && !hasDistrict) {
      base.unshift(form.district);
    }
    const opts = base.map((d) => ({ value: d, label: d }));
    if (!base.includes("Other")) {
      opts.push({ value: "Other", label: f("otherOption") });
    }
    return [selectPlaceholder, ...opts];
  })();

  // Auto-lookup 6-digit Indian PIN code (India Post API + local/prefix fallback)
  useEffect(() => {
    const cleanPin = String(form.pin || "").trim();
    if (!/^[1-9]\d{5}$/.test(cleanPin)) {
      lastPinFetchedRef.current = "";
      setPinInfo(null);
      setSelectedPostOffice("");
      setPinNote("");
      return;
    }
    if (lastPinFetchedRef.current === cleanPin) return;

    const timer = setTimeout(() => {
      const reqId = ++pinReqRef.current;
      lastPinFetchedRef.current = cleanPin;
      setPinBusy(true);
      setPinNote("");

      api
        .pinLookup(cleanPin)
        .then((res) => {
          if (reqId !== pinReqRef.current) return;
          setPinInfo(res);
          setSelectedPostOffice(res.post_offices?.[0] || "");
          const targetState = res.state || "";
          const targetDistrict = resolveDistrictOption(targetState, res.district, statesMap);
          const patch = {};
          if (targetState) patch.state = targetState;
          if (targetDistrict) patch.district = targetDistrict;
          if (Object.keys(patch).length > 0) {
            updateForm(patch);
          }
        })
        .catch((err) => {
          if (reqId !== pinReqRef.current) return;
          lastPinFetchedRef.current = "";
          setPinInfo(null);
          setSelectedPostOffice("");
          setPinNote(err.body?.detail || "Could not auto-detect this PIN; please select State & District manually.");
        })
        .finally(() => {
          if (reqId === pinReqRef.current) {
            setPinBusy(false);
          }
        });
    }, 150);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pin, statesMap]);

  const validate = () => {
    const e = {};
    if (step === 1) {
      if (!form.full_name?.trim()) e.full_name = f("required");
      if (!/^[6-9]\d{9}$/.test(String(form.mobile || ""))) e.mobile = f("mobile_error");
      if (!form.state) e.state = f("required");
      if (!form.district) e.district = f("required");
      if (!/^[1-9]\d{5}$/.test(String(form.pin || ""))) e.pin = f("pin_error");
      if (!form.caste_category) e.caste_category = f("required");
      const age = Number(form.age);
      if (!age || age < 18 || age > 75) e.age = f("age_error");
      if (form.annual_family_income === "" || Number(form.annual_family_income) < 0) {
        e.annual_family_income = f("required");
      }
    }
    if (step === 2) {
      if (!form.applicant_type) e.applicant_type = f("required");
      if (!form.sector) e.sector = f("required");
      if (!form.loan_amount || Number(form.loan_amount) <= 0) e.loan_amount = f("required");
      if (!form.project_description?.trim()) e.project_description = f("required");
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = async () => {
    if (!validate()) return;
    if (step < 3) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        age: Number(form.age),
        annual_family_income: Number(form.annual_family_income),
        loan_amount: Number(form.loan_amount),
        project_cost: Number(form.project_cost || form.loan_amount),
        lang,
      };
      const data = await api.recommend(payload);
      setResult(data);
      navigate("/results");
    } catch (err) {
      setErrors({ submit: err.body?.detail || err.message });
    } finally {
      setBusy(false);
    }
  };

  const runCategoryVerify = async () => {
    if (!form.state || !form.caste_category) return;
    setVerifyBusy(true);
    setVerifyError("");
    try {
      const res = await api.verifyCategory({
        loan_state: form.state,
        certificate_state: form.certificate_state || form.state,
        category: form.caste_category,
        certificate_type: form.certificate_type || "none",
        sub_caste: form.sub_caste || "",
        annual_income: form.annual_family_income === "" ? null : Number(form.annual_family_income),
        ews_assets_compliant:
          form.caste_category === "EWS" || form.certificate_type === "ews_cert"
            ? !!form.ews_assets_compliant
            : true,
        lang,
      });
      setVerifyResult(res);
    } catch (err) {
      setVerifyError(err.body?.detail || err.message || f("verifyFailed"));
    } finally {
      setVerifyBusy(false);
    }
  };

  useEffect(() => {
    if (form.state && form.caste_category && form.certificate_type) {
      runCategoryVerify();
    } else {
      setVerifyResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.state,
    form.caste_category,
    form.certificate_type,
    form.certificate_state,
    form.sub_caste,
    form.annual_family_income,
    form.ews_assets_compliant,
    lang,
  ]);

  return (
    <div className="page-shell">
      {/* Title & Eyebrow */}
      <div className="page-title">
        <span className="eyebrow">{f("eyebrow")}</span>
        <h1>{f("title")}</h1>
        <p>{f("subtitle")}</p>
      </div>

      {/* 3-Step Interactive Stepper */}
      <nav className="stepper" aria-label="Form Progress Stepper">
        <div className="stepper-track-line" aria-hidden="true">
          <div
            className="stepper-track-fill"
            style={{ width: step === 1 ? "0%" : step === 2 ? "50%" : "100%" }}
          />
        </div>
        {[
          { num: 1, title: f("step1"), sub: f("stepLabel", { n: "1" }) },
          { num: 2, title: f("step2"), sub: f("stepLabel", { n: "2" }) },
          { num: 3, title: f("step3"), sub: f("stepLabel", { n: "3" }) },
        ].map((s) => (
          <div
            key={s.num}
            className={`step ${step > s.num ? "done" : ""} ${step === s.num ? "current" : ""}`}
            onClick={() => {
              if (s.num < step) setStep(s.num);
            }}
          >
            <span className="step-circle">
              {step > s.num ? <Icon name="check" size={17} /> : s.num}
            </span>
            <div className="step-label-col">
              <small>{s.sub}</small>
              <strong>{s.title}</strong>
            </div>
          </div>
        ))}
      </nav>

      {/* Clean Centered Form Card */}
      <div className="form-layout">
        <section className="form-card">
          {/* Step 1: Personal & Income */}
          {step === 1 && (
            <div className="step-pane animate-fade-in">
              <div className="card-heading">
                <span className="number">1</span>
                <div>
                  <h2>{f("step1")}</h2>
                  <p>{f("step1Sub")}</p>
                </div>
              </div>

              <div className="form-grid">
                <HelpField
                  name="full_name"
                  label={f("full_name")}
                  help={f("full_name_help")}
                  placeholder="As on Aadhaar card / आधार कार्ड अनुसार"
                  value={form.full_name}
                  onChange={(v) => updateForm({ full_name: v })}
                  error={errors.full_name}
                />
                <HelpField
                  name="mobile"
                  label={f("mobile")}
                  help={f("mobile_help")}
                  placeholder="10-digit mobile number"
                  value={form.mobile}
                  onChange={(v) => updateForm({ mobile: v })}
                  error={errors.mobile}
                />
                <div>
                  <HelpField
                    name="pin"
                    label={f("pin")}
                    help={f("pin_help")}
                    placeholder="6-digit postal PIN (e.g. 302001)"
                    value={form.pin}
                    onChange={(v) => updateForm({ pin: v })}
                    error={errors.pin}
                  />
                  {pinBusy && <p className="pin-lookup-hint">{f("pinLookingUp")}</p>}
                  {!pinBusy && pinNote && <p className="pin-lookup-hint">{pinNote}</p>}
                  {!pinBusy && pinInfo && (
                    <div className="pin-match-badge" role="status">
                      <div className="pin-match-row">
                        <Icon name="checkCircle" size={15} />
                        <span>
                          <strong>
                            {selectedPostOffice || pinInfo.post_offices?.[0] || pinInfo.district}
                          </strong>
                          {pinInfo.block && pinInfo.block !== pinInfo.district
                            ? `, ${pinInfo.block}`
                            : ""}
                          {pinInfo.district ? `, ${pinInfo.district}` : ""}
                          {pinInfo.state ? ` (${pinInfo.state})` : ""}
                        </span>
                      </div>
                      {pinInfo.post_offices?.length > 1 && (
                        <div className="pin-match-row">
                          <label htmlFor="pin-po-select" style={{ fontSize: "12px", fontWeight: 600 }}>
                            {f("kasbaLabel")}
                          </label>
                          <select
                            id="pin-po-select"
                            className="pin-po-select"
                            value={selectedPostOffice}
                            onChange={(e) => setSelectedPostOffice(e.target.value)}
                          >
                            {pinInfo.post_offices.map((po) => (
                              <option key={po} value={po}>
                                {po}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <HelpField
                  name="state"
                  label={f("state")}
                  help={f("state_help")}
                  value={form.state}
                  onChange={(v) => updateForm({ state: v, district: "" })}
                  options={[selectPlaceholder, ...stateNames.map((s) => ({ value: s, label: s }))]}
                  error={errors.state}
                />
                <HelpField
                  name="district"
                  label={f("district")}
                  help={f("district_help")}
                  value={form.district}
                  onChange={(v) => updateForm({ district: v })}
                  options={districts}
                  error={errors.district}
                />
                <HelpField
                  name="caste_category"
                  label={f("caste_category")}
                  help={f("caste_category_help")}
                  value={form.caste_category}
                  onChange={(v) => updateForm({ caste_category: v })}
                  options={[selectPlaceholder, ...["SC", "ST", "OBC", "EWS", "General", "Minority"].map((s) => ({ value: s, label: s }))]}
                  error={errors.caste_category}
                />
                <HelpField
                  name="age"
                  type="number"
                  label={f("age")}
                  help={f("age_help")}
                  placeholder="e.g. 28"
                  value={form.age}
                  onChange={(v) => updateForm({ age: v })}
                  error={errors.age}
                />
                <HelpField
                  name="annual_family_income"
                  type="number"
                  label={f("annual_family_income")}
                  help={f("annual_family_income_help")}
                  suffix="₹"
                  placeholder="e.g. 300000"
                  example={f("exampleIncome")}
                  value={form.annual_family_income}
                  onChange={(v) => updateForm({ annual_family_income: v })}
                  error={errors.annual_family_income}
                />
                <HelpField
                  name="certificate_type"
                  label={f("certificate_type")}
                  help={f("certificate_type_help")}
                  value={form.certificate_type}
                  onChange={(v) => updateForm({ certificate_type: v })}
                  options={[
                    selectPlaceholder,
                    { value: "sc_cert", label: f("cert_sc") },
                    { value: "ews_cert", label: f("cert_ews") },
                    { value: "st_cert", label: f("cert_st") },
                    { value: "obc_cert", label: f("cert_obc") },
                    { value: "none", label: f("cert_none") },
                  ]}
                />
                <HelpField
                  name="certificate_state"
                  label={f("certificate_state")}
                  help={f("certificate_state_help")}
                  value={form.certificate_state}
                  onChange={(v) => updateForm({ certificate_state: v })}
                  options={[selectPlaceholder, ...stateNames.map((s) => ({ value: s, label: s }))]}
                />
                <div style={{ gridColumn: "1 / -1" }}>
                  <HelpField
                    name="sub_caste"
                    label={f("sub_caste")}
                    help={f("sub_caste_help")}
                    placeholder="e.g., Meghwal, Dhobi, Mahar, Jatav"
                    value={form.sub_caste}
                    onChange={(v) => updateForm({ sub_caste: v })}
                  />
                </div>
              </div>

              {(form.caste_category === "EWS" || form.certificate_type === "ews_cert") && (
                <div className="ews-assets-check">
                  <label className="check-option">
                    <input
                      type="checkbox"
                      checked={!!form.ews_assets_compliant}
                      onChange={(e) => updateForm({ ews_assets_compliant: e.target.checked })}
                    />
                    <span>
                      <i className="check-box-icon">
                        <Icon name="check" size={16} />
                      </i>
                      <strong>{f("ews_assets_confirm")}</strong>
                    </span>
                  </label>
                </div>
              )}

              <div className="category-verify-box">
                <div className="verify-actions-row">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={runCategoryVerify}
                    disabled={verifyBusy || !form.state || !form.caste_category}
                  >
                    <Icon name="checkCircle" size={17} />
                    <span>{verifyBusy ? f("verifying") : f("verifyBtn")}</span>
                  </button>
                </div>

                {verifyError && (
                  <div className="error-banner">
                    <Icon name="alert" size={18} />
                    <p>{verifyError}</p>
                  </div>
                )}

                {verifyResult && (
                  <div
                    className={`verify-result-card ${
                      verifyResult.status === "verified_sc" ||
                      verifyResult.status === "ews_verified_non_nsfdc" ||
                      verifyResult.status === "verified_non_nsfdc"
                        ? "good"
                        : verifyResult.status === "state_mismatch_warning" ||
                            verifyResult.status === "document_missing"
                          ? "warn"
                          : "bad"
                    }`}
                    role="status"
                  >
                    <div className="verify-result-head">
                      <strong>
                        {verifyResult.status === "verified_sc"
                          ? f("verifyStatusVerifiedSc")
                          : verifyResult.status === "state_mismatch_warning"
                            ? f("verifyStatusStateMismatch")
                            : verifyResult.status === "not_notified_in_state"
                              ? f("verifyStatusNotNotified")
                              : verifyResult.status === "ews_verified_non_nsfdc"
                                ? f("verifyStatusEwsVerified")
                                : verifyResult.status === "ews_ineligible"
                                  ? f("verifyStatusEwsIneligible")
                                  : verifyResult.status === "document_category_mismatch"
                                    ? f("verifyStatusDocMismatch")
                                    : verifyResult.status === "document_missing"
                                      ? f("verifyStatusCertRequired")
                                      : f("verifyStatusNonNsfdc")}
                      </strong>
                      <span
                        className={`status-tag ${
                          verifyResult.valid
                            ? "good"
                            : verifyResult.status === "state_mismatch_warning" ||
                                verifyResult.status === "document_missing"
                              ? "amber"
                              : "bad"
                        }`}
                      >
                        {verifyResult.nsfdc_eligible
                          ? f("verifyTagNsfdc")
                          : verifyResult.ews_eligible
                            ? f("verifyTagEws")
                            : f("verifyTagCheck")}
                      </span>
                    </div>
                    <p>{verifyResult.message}</p>
                    <small className="verify-citation">{f("verifyRuleLabel")} {verifyResult.citation}</small>
                    <p className="verify-next-step">
                      <strong>{f("verifyNextStepLabel")}</strong> {verifyResult.next_step}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Business & Loan Requirement */}
          {step === 2 && (
            <div className="step-pane animate-fade-in">
              <div className="card-heading">
                <span className="number">2</span>
                <div>
                  <h2>{f("step2")}</h2>
                  <p>{f("step2Sub")}</p>
                </div>
              </div>

              <div className="form-grid">
                <HelpField
                  name="applicant_type"
                  label={f("applicant_type")}
                  help={f("applicant_type_help")}
                  value={form.applicant_type}
                  onChange={(v) => updateForm({ applicant_type: v })}
                  options={[
                    selectPlaceholder,
                    { value: "individual", label: f("individual") },
                    { value: "shg", label: f("shg") },
                  ]}
                  error={errors.applicant_type}
                />
                <HelpField
                  name="sector"
                  label={f("sector")}
                  help={f("sector_help")}
                  value={form.sector}
                  onChange={(v) => updateForm({ sector: v })}
                  options={[
                    selectPlaceholder,
                    ...["agriculture", "manufacturing", "trade", "service", "transport", "education"].map((s) => ({
                      value: s,
                      label: f(s),
                    })),
                  ]}
                  error={errors.sector}
                />
                <div style={{ gridColumn: "1 / -1" }}>
                  <HelpField
                    name="project_description"
                    label={f("project_description")}
                    help={f("project_description_help")}
                    placeholder="Brief description of enterprise / व्यवसाय का संक्षिप्त विवरण..."
                    value={form.project_description}
                    onChange={(v) => updateForm({ project_description: v })}
                    textarea
                    error={errors.project_description}
                  />
                </div>
                <HelpField
                  name="loan_amount"
                  type="number"
                  label={f("loan_amount")}
                  help={f("loan_amount_help")}
                  suffix="₹"
                  placeholder="e.g. 800000"
                  example={f("exampleLoan")}
                  value={form.loan_amount}
                  onChange={(v) => updateForm({ loan_amount: v })}
                  error={errors.loan_amount}
                />
                <HelpField
                  name="project_cost"
                  type="number"
                  label={f("project_cost")}
                  help={f("project_cost_help")}
                  suffix="₹"
                  placeholder="e.g. 1000000"
                  value={form.project_cost}
                  onChange={(v) => updateForm({ project_cost: v })}
                />
              </div>
            </div>
          )}

          {/* Step 3: Special Eligibility Checkboxes */}
          {step === 3 && (
            <div className="step-pane animate-fade-in">
              <div className="card-heading">
                <span className="number">3</span>
                <div>
                  <h2>{f("step3")}</h2>
                  <p>{f("step3Sub")}</p>
                </div>
              </div>

              <div className="check-grid">
                {[
                  { key: "woman_led", label: f("woman_led") },
                  { key: "disability", label: f("disability") },
                  { key: "sanitation_worker", label: f("sanitation_worker") },
                  { key: "skill_certificate", label: f("skill_certificate") },
                  { key: "shg_jlg_member", label: f("shg_jlg_member") },
                  { key: "jan_dhan", label: f("jan_dhan") },
                  { key: "existing_govt_loan", label: f("existing_govt_loan") },
                ].map((item) => (
                  <label key={item.key} className="check-option">
                    <input
                      type="checkbox"
                      checked={!!form[item.key]}
                      onChange={(e) => updateForm({ [item.key]: e.target.checked })}
                    />
                    <span>
                      <i className="check-box-icon">
                        <Icon name="check" size={16} />
                      </i>
                      <strong>{item.label}</strong>
                    </span>
                  </label>
                ))}
              </div>

              <div className="info-box">
                <Icon name="help" size={20} />
                <p>
                  <strong>{f("whyAskThis")}</strong>
                  <small>{f("whyAskThisDesc")}</small>
                </p>
              </div>
            </div>
          )}

          {/* Submission Errors if any */}
          {errors.submit ? (
            <div className="error-banner" style={{ marginTop: "1.5rem" }}>
              <Icon name="alert" size={18} />
              <p>{errors.submit}</p>
            </div>
          ) : null}

          {/* Form Footer with Tactile Buttons */}
          <div className="form-footer">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => (step > 1 ? setStep(step - 1) : navigate("/"))}
            >
              ← {step > 1 ? f("back") : t("nav.home")}
            </button>

            <span className="save-status">
              <Icon name="checkCircle" size={16} /> {f("progressSaved")}
            </span>

            <button
              className="btn btn-primary"
              type="button"
              onClick={handleNext}
              disabled={busy}
            >
              <span>{busy ? "..." : step < 3 ? f("next") : f("submit")}</span>
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
