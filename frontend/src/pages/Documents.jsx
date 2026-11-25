import { useState } from "react";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useAppState } from "../state.jsx";
import { useI18n } from "../i18n.jsx";

export default function Documents() {
  const { t } = useI18n();
  const { form, scheme, branch, setRefNo, refNo } = useAppState();
  const [ifsc, setIfsc] = useState("");
  const [udyam, setUdyam] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const isEws = form.caste_category === "EWS" || form.certificate_type === "ews_cert";
  const categoryDoc = isEws
    ? {
        id: "ews_cert",
        label: "EWS Income & Asset Certificate (Tehsildar/SDM, valid FY)",
        hint: "Issued by Tehsildar/SDM/DM under DoPT OM 2019",
      }
    : {
        id: "caste",
        label: "SC Caste Certificate (State-notified)",
        hint: "Issued by competent revenue authority under Article 341",
      };

  const defaultDocs = [
    { id: "aadhaar", label: "Aadhaar card / Identity Proof", hint: "Original + 1 self-attested photocopy" },
    categoryDoc,
    { id: "income", label: "Income certificate / declaration", hint: "Last financial year / ITR or Tehsildar certificate" },
    { id: "statement", label: "Last 6 months bank statement", hint: "Showing active transaction turnover" },
    { id: "report", label: "Detailed business project report", hint: "Pre-filled template available for download" },
    { id: "photo", label: "Passport-size photographs (2)", hint: "Recent color photographs" },
  ];

  const rawSchemeDocs = scheme?.required_documents?.length ? scheme.required_documents : scheme?.documents;
  const docList = rawSchemeDocs?.length
    ? rawSchemeDocs.map((d, i) => {
        const label =
          isEws && /^caste certificate$/i.test(d.trim())
            ? "EWS Income & Asset Certificate (Tehsildar/SDM, valid FY)"
            : d;
        return { id: `doc_${i}`, label, hint: "Required for scheme/bank verification" };
      })
    : defaultDocs;

  const [checkedMap, setCheckedMap] = useState({});

  const toggleDoc = (id) => {
    setCheckedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const doneCount = docList.filter((d) => checkedMap[d.id]).length;
  const isComplete = doneCount === docList.length;
  const pct = Math.round((doneCount / (docList.length || 1)) * 100);

  const saveApplication = async () => {
    if (!form.full_name?.trim()) {
      setMsg(t("docs.needProfile"));
      return;
    }
    setBusy(true);
    try {
      const data = await api.createApplication({
        ...form,
        applicant_name: form.full_name.trim(),
        scheme_code: scheme?.code || "General",
        partner: branch?.name || "To be chosen",
        partner_details: { IFSC: ifsc, Udyam: udyam },
        checklist: docList.map((d) => d.label),
        partner_block: branch ? `${branch.name}, ${branch.address}, ${branch.phone}` : "To be chosen",
        emi_summary: form.loan_amount
          ? `Amount ₹${Number(form.loan_amount).toLocaleString("en-IN")} at ${scheme?.interest_rate || 6.5}%`
          : "See calculator",
      });
      setRefNo(data.ref_no);
      setMsg(`${t("docs.save")}: ${data.ref_no}`);
    } catch (e) {
      setMsg(e.message || "Failed to create application reference.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell">
      {/* Title */}
      <div className="page-title">
        <span className="eyebrow">DOCUMENT HELPER</span>
        <h1>{t("docs.title")}</h1>
        <p>
          {scheme ? `${scheme.code} — ${scheme.name}` : "Selected Scheme"} •{" "}
          {branch ? branch.name : "Partner Bank"}
        </p>
      </div>

      {/* Progress Card with Celebratory State */}
      <div className={`doc-progress ${isComplete ? "is-complete" : ""}`}>
        <div className="progress-label-row">
          <span>{t("docs.readyCount", { done: String(doneCount), total: String(docList.length) })}</span>
          <strong className={isComplete ? "complete-text" : ""}>
            {isComplete ? t("docs.celebrateTitle") : t("docs.percentComplete", { pct: String(pct) })}
          </strong>
        </div>
        <div className="progress-bar-track">
          <div
            className={`progress-bar-fill ${isComplete ? "glow-complete" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {isComplete ? (
          <div className="celebration-badge animate-bounce-in">
            <span className="confetti-emoji">🎉</span>
            <strong>{t("docs.celebrateMsg")}</strong>
          </div>
        ) : (
          <p>{t("docs.completeMore")}</p>
        )}
      </div>

      {/* 2-Column Split: Checklist on Left + PDF Card on Right */}
      <div className="documents-layout">
        {/* Left Side: Checklist Card */}
        <section className="checklist-card">
          <div className="checklist-head">
            <div>
              <h2>{t("docs.checklist")}</h2>
              <p>Tap an item when you have collected the physical document.</p>
            </div>
            <button
              type="button"
              className="print-btn-link"
              onClick={() => window.print()}
            >
              <Icon name="download" size={16} />
              <span>{t("docs.printList")}</span>
            </button>
          </div>

          <div className="doc-items-stack">
            {docList.map((d) => {
              const isChecked = !!checkedMap[d.id];
              return (
                <label
                  key={d.id}
                  className={`doc-item-row ${isChecked ? "checked" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleDoc(d.id)}
                  />
                  <span className="checkbox-wrap">
                    <i className="check-box-icon">
                      <Icon name="check" size={16} />
                    </i>
                    <div className="doc-text">
                      <strong>{d.label}</strong>
                      <small>{d.hint}</small>
                    </div>
                  </span>
                  {isChecked && (
                    <span className="item-ready-tag">
                      <Icon name="checkCircle" size={14} /> Ready
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {/* Partner & Bank Specific Section */}
          <div className="bank-fields-box">
            <span className="bank-avatar-sm">
              <Icon name="bank" size={20} />
            </span>
            <div className="bank-fields-body">
              <h3>{t("docs.extra")}</h3>
              <div className="form-grid" style={{ marginTop: "10px" }}>
                <div className="field">
                  <label htmlFor="doc_ifsc" style={{ fontSize: "13px" }}>{t("docs.ifsc")}</label>
                  <div className="input-wrap">
                    <input
                      id="doc_ifsc"
                      placeholder="e.g. SBIN0001234"
                      value={ifsc}
                      onChange={(e) => setIfsc(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="doc_udyam" style={{ fontSize: "13px" }}>{t("docs.udyam")}</label>
                  <div className="input-wrap">
                    <input
                      id="doc_udyam"
                      placeholder="e.g. UDYAM-RJ-00-12345"
                      value={udyam}
                      onChange={(e) => setUdyam(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {msg ? (
            <div className="success-banner" style={{ marginTop: "1.25rem" }}>
              <Icon name="checkCircle" size={18} />
              <p>{msg}</p>
            </div>
          ) : null}

          <div style={{ marginTop: "1.5rem" }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={saveApplication}
              disabled={busy}
            >
              <span>{busy ? "Saving..." : t("docs.save")}</span>
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </section>

        {/* Right Side: Visual PDF Download Card */}
        <aside className="pdf-card">
          <div className="pdf-preview-canvas">
            <div className="pdf-page-sheet">
              <span className="pdf-header-brand">
                <i>स</i>
                <strong>SAKSHAM SETU</strong>
              </span>
              <h3>Business Project Report</h3>
              <small>NATIONAL CONCESSIONAL CREDIT GATEWAY</small>
              <div className="pdf-lines-preview">
                <i />
                <i style={{ width: "70%" }} />
                <i />
                <i />
                <i style={{ width: "55%" }} />
              </div>
              <div className="pdf-sample-stamp">OFFICIAL DEMO</div>
            </div>
          </div>

          <div className="pdf-info-body">
            <span className="eyebrow">{t("docs.downloadCard")}</span>
            <h2>Business Project Report</h2>
            <p>{t("docs.templateSubtitle")}</p>

            <a
              className={`btn btn-primary full ${isComplete ? "btn-celebrate-pulse" : ""}`}
              href={refNo ? api.pdfUrl(refNo) : "#"}
              onClick={(e) => {
                if (!refNo) {
                  e.preventDefault();
                  saveApplication();
                }
              }}
            >
              <Icon name="download" size={18} />
              <span>{isComplete ? t("docs.readyBadge") : t("docs.download")}</span>
            </a>

            <small className="pdf-safe-note">
              <Icon name="checkCircle" size={14} /> {t("docs.safeNotice")}
            </small>
          </div>
        </aside>
      </div>
    </div>
  );
}
