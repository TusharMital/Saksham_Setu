import { useState } from "react";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

export default function Documents() {
  const { t } = useI18n();
  const { form, scheme, branch, setRefNo, refNo } = useAppState();
  const [ifsc, setIfsc] = useState("");
  const [udyam, setUdyam] = useState("");
  const [msg, setMsg] = useState("");

  const save = async () => {
    try {
      const data = await api.createApplication({
        ...form,
        applicant_name: form.full_name,
        scheme_code: scheme?.code || "MCF",
        partner: branch?.name || "To be chosen",
        partner_details: { IFSC: ifsc, Udyam: udyam },
        checklist: scheme?.documents || [],
        partner_block: branch ? `${branch.name}, ${branch.address}, ${branch.phone}` : "",
        emi_summary: `Amount Rs ${form.loan_amount} at ${scheme?.interest_rate || "—"}%`,
      });
      setRefNo(data.ref_no);
      setMsg(`${t("docs.save")}: ${data.ref_no}`);
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <section>
      <h1>{t("docs.title")}</h1>
      <p>
        {scheme?.code} · {branch?.name || "—"}
      </p>
      <ul>
        {(scheme?.documents || ["Caste certificate", "Aadhaar", "Address proof"]).map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <h2>{t("docs.extra")}</h2>
      <label>
        {t("docs.ifsc")}
        <input value={ifsc} onChange={(e) => setIfsc(e.target.value)} />
      </label>
      <label>
        {t("docs.udyam")}
        <input value={udyam} onChange={(e) => setUdyam(e.target.value)} />
      </label>
      <div className="actions">
        <button className="btn" type="button" onClick={save}>
          {t("docs.save")}
        </button>
        {refNo ? (
          <a className="btn btn-primary" href={api.pdfUrl(refNo)}>
            {t("docs.download")}
          </a>
        ) : null}
      </div>
      {msg ? <p>{msg}</p> : null}
    </section>
  );
}
