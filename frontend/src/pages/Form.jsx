import { useState } from "react";
import { useNavigate } from "react-router-dom";
import HelpField from "../components/HelpField.jsx";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";
import { speak, startMic } from "../speech.js";

const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
];

const DISTRICTS = {
  Rajasthan: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer"],
  "Uttar Pradesh": ["Lucknow", "Varanasi", "Kanpur", "Agra", "Barabanki"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Kanchipuram", "Chengalpattu"],
  Punjab: ["Amritsar", "Ludhiana", "Patiala"],
  Karnataka: ["Bengaluru", "Mysuru"],
  Maharashtra: ["Mumbai", "Pune", "Nagpur"],
  "West Bengal": ["Kolkata", "Howrah"],
  Kerala: ["Thrissur", "Ernakulam", "Thiruvananthapuram"],
};

export default function Form() {
  const { t, speakLang } = useI18n();
  const { form, updateForm, setResult } = useAppState();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [helpPanelOpen, setHelpPanelOpen] = useState(true);
  const [activeHelp, setActiveHelp] = useState({
    name: "annual_family_income",
    label: t("form.annual_family_income"),
    help: t("form.annual_family_income_help"),
    example: t("form.exampleIncome"),
  });
  const navigate = useNavigate();

  const f = (key, vars) => t(`form.${key}`, vars);
  const districts = (DISTRICTS[form.state] || ["Other"]).map((d) => ({ value: d, label: d }));

  const validate = () => {
    const e = {};
    if (step === 1) {
      if (!form.full_name?.trim()) e.full_name = f("required");
      if (!/^[6-9]\d{9}$/.test(String(form.mobile || ""))) e.mobile = f("mobile_error");
      if (!/^\d{6}$/.test(String(form.pin || ""))) e.pin = f("pin_error");
      const age = Number(form.age);
      if (!age || age < 18 || age > 75) e.age = f("age_error");
      if (form.annual_family_income === "" || Number(form.annual_family_income) < 0) {
        e.annual_family_income = f("required");
      }
    }
    if (step === 2) {
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

  const handleFieldFocus = (fieldMeta) => {
    setActiveHelp(fieldMeta);
    if (!helpPanelOpen) setHelpPanelOpen(true);
  };

  const handleHelpSpeak = () => {
    if (!activeHelp) return;
    speak(
      `${activeHelp.label}. ${activeHelp.help || ""} ${
        activeHelp.example ? `Example: ${activeHelp.example}` : ""
      }`,
      speakLang
    );
  };

  const handleHelpMic = () => {
    if (!activeHelp) return;
    startMic((text) => {
      if (text) {
        if (
          activeHelp.name === "annual_family_income" ||
          activeHelp.name === "loan_amount" ||
          activeHelp.name === "age"
        ) {
          const cleaned = text.replace(/[^\d.]/g, "");
          if (cleaned) updateForm({ [activeHelp.name]: cleaned });
        } else {
          updateForm({ [activeHelp.name]: text });
        }
      }
    }, speakLang);
  };

  return (
    <div className="page-shell">
      {/* Title & Eyebrow */}
      <div className="page-title">
        <span className="eyebrow">CHECK ELIGIBILITY</span>
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
          { num: 1, title: f("step1"), sub: "STEP 1" },
          { num: 2, title: f("step2"), sub: "STEP 2" },
          { num: 3, title: f("step3"), sub: "STEP 3" },
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

      {/* 2-Column Layout: Form Card on Left + Dedicated Yellow Help Panel on Right */}
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
                  onFocus={handleFieldFocus}
                  error={errors.full_name}
                />
                <HelpField
                  name="mobile"
                  label={f("mobile")}
                  help={f("mobile_help")}
                  placeholder="10-digit mobile number"
                  value={form.mobile}
                  onChange={(v) => updateForm({ mobile: v })}
                  onFocus={handleFieldFocus}
                  error={errors.mobile}
                />
                <HelpField
                  name="state"
                  label={f("state")}
                  help={f("state_help")}
                  value={form.state}
                  onChange={(v) => updateForm({ state: v, district: (DISTRICTS[v] || ["Other"])[0] })}
                  onFocus={handleFieldFocus}
                  options={STATES.map((s) => ({ value: s, label: s }))}
                />
                <HelpField
                  name="district"
                  label={f("district")}
                  help={f("district_help")}
                  value={form.district}
                  onChange={(v) => updateForm({ district: v })}
                  onFocus={handleFieldFocus}
                  options={districts}
                />
                <HelpField
                  name="pin"
                  label={f("pin")}
                  help={f("pin_help")}
                  placeholder="6-digit postal PIN"
                  value={form.pin}
                  onChange={(v) => updateForm({ pin: v })}
                  onFocus={handleFieldFocus}
                  error={errors.pin}
                />
                <HelpField
                  name="caste_category"
                  label={f("caste_category")}
                  help={f("caste_category_help")}
                  value={form.caste_category}
                  onChange={(v) => updateForm({ caste_category: v })}
                  onFocus={handleFieldFocus}
                  options={["SC", "ST", "OBC", "Other"].map((s) => ({ value: s, label: s }))}
                />
                <HelpField
                  name="age"
                  type="number"
                  label={f("age")}
                  help={f("age_help")}
                  placeholder="e.g. 28"
                  value={form.age}
                  onChange={(v) => updateForm({ age: v })}
                  onFocus={handleFieldFocus}
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
                  onFocus={handleFieldFocus}
                  error={errors.annual_family_income}
                />
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
                  onFocus={handleFieldFocus}
                  options={[
                    { value: "individual", label: f("individual") },
                    { value: "shg", label: f("shg") },
                  ]}
                />
                <HelpField
                  name="sector"
                  label={f("sector")}
                  help={f("sector_help")}
                  value={form.sector}
                  onChange={(v) => updateForm({ sector: v })}
                  onFocus={handleFieldFocus}
                  options={["agriculture", "manufacturing", "trade", "service", "transport", "education"].map((s) => ({
                    value: s,
                    label: f(s),
                  }))}
                />
                <div style={{ gridColumn: "1 / -1" }}>
                  <HelpField
                    name="project_description"
                    label={f("project_description")}
                    help={f("project_description_help")}
                    placeholder="Brief description of enterprise / व्यवसाय का संक्षिप्त विवरण..."
                    value={form.project_description}
                    onChange={(v) => updateForm({ project_description: v })}
                    onFocus={handleFieldFocus}
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
                  onFocus={handleFieldFocus}
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
                  onFocus={handleFieldFocus}
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
                  { key: "woman_led", label: f("woman_led"), help: f("woman_led_help") },
                  { key: "disability", label: f("disability"), help: f("disability_help") },
                  { key: "sanitation_worker", label: f("sanitation_worker"), help: f("sanitation_worker_help") },
                  { key: "skill_certificate", label: f("skill_certificate"), help: f("skill_certificate_help") },
                  { key: "shg_jlg_member", label: f("shg_jlg_member"), help: f("shg_jlg_member_help") },
                  { key: "jan_dhan", label: f("jan_dhan"), help: f("jan_dhan_help") },
                  { key: "existing_govt_loan", label: f("existing_govt_loan"), help: f("existing_govt_loan_help") },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="check-option"
                    onFocus={() => handleFieldFocus({ name: item.key, label: item.label, help: item.help })}
                  >
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

        {/* Dedicated Yellow "Help for this question" Side Panel */}
        <aside className={`help-card ${helpPanelOpen ? "" : "collapsed"}`}>
          <button
            type="button"
            className="help-toggle-btn"
            onClick={() => setHelpPanelOpen(!helpPanelOpen)}
            aria-label={helpPanelOpen ? "Collapse help" : "Expand help"}
          >
            <Icon name={helpPanelOpen ? "close" : "help"} size={18} />
          </button>

          {helpPanelOpen && (
            <div className="help-card-content animate-fade-in">
              <div className="help-title">
                <span className="help-icon-circle">
                  <Icon name="help" size={20} />
                </span>
                <div>
                  <small>{f("helpSideTitle")}</small>
                  <strong>{activeHelp?.label || f("annual_family_income")}</strong>
                </div>
              </div>

              <p className="help-explanation">
                {activeHelp?.help || f("annual_family_income_help")}
              </p>

              {activeHelp?.example && (
                <div className="example-box">
                  <small>{f("helpExample")}</small>
                  <p>{activeHelp.example}</p>
                </div>
              )}

              <div className="help-actions">
                <button type="button" onClick={handleHelpSpeak}>
                  <Icon name="speaker" size={16} />
                  <span>{f("listen")}</span>
                </button>
                <button type="button" onClick={handleHelpMic}>
                  <Icon name="mic" size={16} />
                  <span>{f("mic")}</span>
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
