import { useState } from "react";
import { useNavigate } from "react-router-dom";
import HelpField from "../components/HelpField.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

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
  const { t } = useI18n();
  const { form, updateForm, setResult } = useAppState();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const f = (key) => t(`form.${key}`);
  const districts = (DISTRICTS[form.state] || ["Other"]).map((d) => ({ value: d, label: d }));

  const validate = () => {
    const e = {};
    if (step === 1) {
      if (!form.full_name) e.full_name = f("required");
      if (!/^[6-9]\d{9}$/.test(String(form.mobile))) e.mobile = f("mobile_error");
      if (!/^\d{6}$/.test(String(form.pin))) e.pin = f("pin_error");
      const age = Number(form.age);
      if (!age || age < 18 || age > 75) e.age = f("age_error");
      if (form.annual_family_income === "" || Number(form.annual_family_income) < 0) e.annual_family_income = f("required");
    }
    if (step === 2) {
      if (!form.loan_amount || Number(form.loan_amount) <= 0) e.loan_amount = f("required");
      if (!form.project_description) e.project_description = f("required");
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = async () => {
    if (!validate()) return;
    if (step < 3) {
      setStep(step + 1);
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

  return (
    <section>
      <h1>{f("title")}</h1>
      <p>{t("form.step", { n: String(step) })} — {step === 1 ? f("step1") : step === 2 ? f("step2") : f("step3")}</p>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${(step / 3) * 100}%` }} />
      </div>
      {step === 1 && (
        <>
          <HelpField name="full_name" label={f("full_name")} help={f("full_name_help")} value={form.full_name} onChange={(v) => updateForm({ full_name: v })} error={errors.full_name} />
          <HelpField name="mobile" label={f("mobile")} help={f("mobile_help")} value={form.mobile} onChange={(v) => updateForm({ mobile: v })} error={errors.mobile} />
          <HelpField name="state" label={f("state")} help={f("state_help")} value={form.state} onChange={(v) => updateForm({ state: v, district: (DISTRICTS[v] || ["Other"])[0] })} options={STATES.map((s) => ({ value: s, label: s }))} />
          <HelpField name="district" label={f("district")} help={f("district_help")} value={form.district} onChange={(v) => updateForm({ district: v })} options={districts} />
          <HelpField name="pin" label={f("pin")} help={f("pin_help")} value={form.pin} onChange={(v) => updateForm({ pin: v })} error={errors.pin} />
          <HelpField name="caste_category" label={f("caste_category")} help={f("caste_category_help")} value={form.caste_category} onChange={(v) => updateForm({ caste_category: v })} options={["SC", "ST", "OBC", "Other"].map((s) => ({ value: s, label: s }))} />
          <HelpField name="age" type="number" label={f("age")} help={f("age_help")} value={form.age} onChange={(v) => updateForm({ age: v })} error={errors.age} />
          <HelpField name="annual_family_income" type="number" label={f("annual_family_income")} help={f("annual_family_income_help")} value={form.annual_family_income} onChange={(v) => updateForm({ annual_family_income: v })} error={errors.annual_family_income} />
        </>
      )}
      {step === 2 && (
        <>
          <HelpField name="applicant_type" label={f("applicant_type")} help={f("applicant_type_help")} value={form.applicant_type} onChange={(v) => updateForm({ applicant_type: v })} options={[{ value: "individual", label: f("individual") }, { value: "shg", label: f("shg") }]} />
          <HelpField name="sector" label={f("sector")} help={f("sector_help")} value={form.sector} onChange={(v) => updateForm({ sector: v })} options={["agriculture", "manufacturing", "trade", "service", "transport", "education"].map((s) => ({ value: s, label: f(s) }))} />
          <HelpField name="project_description" label={f("project_description")} help={f("project_description_help")} value={form.project_description} onChange={(v) => updateForm({ project_description: v })} textarea error={errors.project_description} />
          <HelpField name="loan_amount" type="number" label={f("loan_amount")} help={f("loan_amount_help")} value={form.loan_amount} onChange={(v) => updateForm({ loan_amount: v })} error={errors.loan_amount} />
          <HelpField name="project_cost" type="number" label={f("project_cost")} help={f("project_cost_help")} value={form.project_cost} onChange={(v) => updateForm({ project_cost: v })} />
        </>
      )}
      {step === 3 && (
        <>
          {["woman_led", "disability", "sanitation_worker", "skill_certificate", "shg_jlg_member", "jan_dhan", "existing_govt_loan"].map((key) => (
            <HelpField key={key} name={key} label={f(key)} help={f(`${key}_help`)} value={!!form[key]} onChange={(v) => updateForm({ [key]: v })} boolean />
          ))}
        </>
      )}
      {errors.submit ? <p className="error">{errors.submit}</p> : null}
      <div className="actions">
        {step > 1 ? (
          <button className="btn" type="button" onClick={() => setStep(step - 1)}>
            {f("back")}
          </button>
        ) : null}
        <button className="btn btn-primary" type="button" onClick={next} disabled={busy}>
          {step < 3 ? f("next") : f("submit")}
        </button>
      </div>
    </section>
  );
}
