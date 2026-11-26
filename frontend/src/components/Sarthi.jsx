import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useI18n } from "../i18n.jsx";
import { useAppState } from "../state.jsx";
import {
  speak,
  cancelSpeech,
  startMic,
  hasSpeechRecognition,
  hasSpeechSynthesis,
  getVoiceStatus,
} from "../speech.js";
import Icon from "./Icon.jsx";

const AUTO_SPEAK_KEY = "ss-sarthi-autospeak";

const CHANNEL_META = {
  pmsuraj: {
    en: "PM-SURAJ National Portal",
    hi: "पीएम-सूरज राष्ट्रीय पोर्टल",
    kind: "online",
  },
  jansamarth: {
    en: "Official JanSamarth Portal",
    hi: "आधिकारिक जनसमर्थ पोर्टल",
    kind: "online",
  },
  kviconline: {
    en: "Official KVIC PMEGP e-Portal",
    hi: "आधिकारिक KVIC PMEGP ई-पोर्टल",
    kind: "online",
  },
  standupmitra: {
    en: "Official Stand-Up Mitra Portal",
    hi: "आधिकारिक स्टैंड-अप मित्र पोर्टल",
    kind: "online",
  },
  state_portal: {
    en: "Official State Govt Portal",
    hi: "आधिकारिक राज्य सरकार पोर्टल",
    kind: "online",
  },
  pmvishwakarma: {
    en: "PM Vishwakarma Portal (via CSC)",
    hi: "पीएम विश्वकर्मा पोर्टल (CSC के माध्यम से)",
    kind: "csc",
  },
  bank: {
    en: "Nearest Partner Bank Branch",
    hi: "नज़दीकी साझेदार बैंक शाखा",
    kind: "branch",
  },
  sca: {
    en: "State Channelising Agency (SCA)",
    hi: "राज्य चैनलाइजिंग एजेंसी (SCA)",
    kind: "branch",
  },
  mfi: {
    en: "Empanelled NBFC-MFI",
    hi: "सूचीबद्ध NBFC-MFI",
    kind: "branch",
  },
};

const ADVISOR_QUESTIONS = {
  1: {
    en: {
      prompt:
        "1/3: Are you comfortable registering and uploading documents online on an official portal, or do you prefer face-to-face help from a bank officer?",
      options: [
        { id: "online", label: "Comfortable applying online" },
        { id: "in_person", label: "Prefer in-person bank help" },
        { id: "either", label: "Either works for me" },
      ],
    },
    hi: {
      prompt:
        "1/3: क्या आप आधिकारिक पोर्टल पर ऑनलाइन पंजीकरण और दस्तावेज़ अपलोड करने में सहज हैं, या बैंक अधिकारी से आमने-सामने मदद लेना पसंद करेंगे?",
      options: [
        { id: "online", label: "ऑनलाइन आवेदन करने में सहज हूँ" },
        { id: "in_person", label: "बैंक में आमने-सामने मदद पसंद है" },
        { id: "either", label: "दोनों में से कोई भी ठीक है" },
      ],
    },
  },
  2: {
    en: {
      prompt:
        "2/3: Do you already have your Aadhaar, PAN, caste/income certificate, and basic project details ready right now?",
      options: [
        { id: "ready", label: "Yes, all documents ready" },
        { id: "missing_few", label: "Missing 1–2 documents" },
        { id: "need_help", label: "Need help preparing them" },
      ],
    },
    hi: {
      prompt:
        "2/3: क्या आपके पास आधार, पैन, जाति/आय प्रमाणपत्र और परियोजना का बुनियादी विवरण अभी तैयार है?",
      options: [
        { id: "ready", label: "हाँ, सभी दस्तावेज़ तैयार हैं" },
        { id: "missing_few", label: "1–2 दस्तावेज़ कम हैं" },
        { id: "need_help", label: "तैयार करने में मदद चाहिए" },
      ],
    },
  },
  3: {
    en: {
      prompt:
        "3/3: Is there a partner bank branch or CSC/SCA center near your PIN code that you can visit easily?",
      options: [
        { id: "nearby", label: "Yes, branch is nearby" },
        { id: "from_home", label: "No, prefer applying from home" },
        { id: "not_sure", label: "Not sure" },
      ],
    },
    hi: {
      prompt:
        "3/3: क्या आपके पिन कोड के पास कोई साझेदार बैंक शाखा या CSC/SCA केंद्र है जहाँ आप आसानी से जा सकते हैं?",
      options: [
        { id: "nearby", label: "हाँ, पास में शाखा है" },
        { id: "from_home", label: "नहीं, घर से आवेदन करना बेहतर है" },
        { id: "not_sure", label: "निश्चित नहीं हूँ" },
      ],
    },
  },
};

function normalizeAvailableChannels(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const list = [];
  for (const item of raw) {
    const key = typeof item === "string" ? item : item?.key;
    if (key && CHANNEL_META[key] && !seen.has(key)) {
      seen.add(key);
      list.push(key);
    }
  }
  return list;
}

function classifyAdvisorText(step, text) {
  const q = (text || "").toLowerCase();
  if (step === 1) {
    if (/(bank|branch|face|person|offline|officer|help|बैंक|शाखा|मदद|आमने)/i.test(q)) {
      return "in_person";
    }
    if (/(online|portal|digital|self|internet|ऑनलाइन|पोर्टल)/i.test(q)) {
      return "online";
    }
    return "either";
  }
  if (step === 2) {
    if (/(help|prepare|need|no|नहीं|मदद|तैयार करने)/i.test(q)) {
      return "need_help";
    }
    if (/(missing|1|2|some|few|कम|अधूरे)/i.test(q)) {
      return "missing_few";
    }
    if (/(yes|ready|all|have|हाँ|तैयार)/i.test(q)) {
      return "ready";
    }
    return "missing_few";
  }
  if (/(home|no|far|online|नहीं|घर|दूर)/i.test(q)) {
    return "from_home";
  }
  if (/(yes|near|nearby|branch|csc|sca|visit|हाँ|पास)/i.test(q)) {
    return "nearby";
  }
  return "not_sure";
}

function evaluatePathRecommendation({ schemeCode, schemeName, availableChannels, answers, lang }) {
  const valid = normalizeAvailableChannels(availableChannels);
  const purePortals = valid.filter((k) => CHANNEL_META[k].kind === "online");
  const cscPortal = valid.includes("pmvishwakarma") ? ["pmvishwakarma"] : [];
  const onlineChannels = [...purePortals, ...cscPortal];
  const inPersonChannels = valid.filter((k) => CHANNEL_META[k].kind === "branch");

  const q1 = answers[1]?.id || "either";
  const q2 = answers[2]?.id || "ready";
  const q3 = answers[3]?.id || "not_sure";

  let onlineScore = 0;
  let inPersonScore = 0;

  if (q1 === "online") onlineScore += 3;
  else if (q1 === "in_person") inPersonScore += 3;
  else {
    onlineScore += 1;
    inPersonScore += 1;
  }

  if (q2 === "ready") onlineScore += 2;
  else if (q2 === "missing_few") inPersonScore += 1;
  else inPersonScore += 2;

  if (q3 === "from_home") onlineScore += 3;
  else if (q3 === "nearby") inPersonScore += 2;
  else onlineScore += 1;

  let chosenKey = valid[0] || "bank";
  if (valid.length > 1) {
    if (onlineScore >= inPersonScore && onlineChannels.length > 0) {
      chosenKey = q3 === "from_home" && purePortals.length > 0 ? purePortals[0] : onlineChannels[0];
    } else if (inPersonChannels.length > 0) {
      if (inPersonChannels.includes("bank")) chosenKey = "bank";
      else if (inPersonChannels.includes("sca")) chosenKey = "sca";
      else chosenKey = inPersonChannels[0];
    } else if (onlineChannels.length > 0) {
      chosenKey = onlineChannels[0];
    }
  }

  const meta = CHANNEL_META[chosenKey] || CHANNEL_META.bank;
  const isHi = lang === "hi";
  const channelLabel = isHi ? meta.hi : meta.en;
  const isBranchPath = meta.kind === "branch";

  const a1Text = answers[1]?.label || "";
  const a2Text = answers[2]?.label || "";
  const a3Text = answers[3]?.label || "";

  let reason;
  if (isHi) {
    if (valid.length === 1) {
      reason = `${schemeName || schemeCode} के लिए यह एकमात्र आधिकारिक और सत्यापित आवेदन माध्यम है। आपके जवाबों ("${a1Text}", "${a2Text}", "${a3Text}") के अनुसार यही सबसे सुगम और सुरक्षित रास्ता है।`;
    } else if (isBranchPath) {
      reason = `आपने "${a1Text}", "${a2Text}", और "${a3Text}" चुना है — इसलिए नज़दीकी अधिकारी से मिलकर दस्तावेज़ सत्यापित कराना और आवेदन जमा करना आपके लिए सबसे आसान रहेगा।`;
    } else {
      reason = `आपने "${a1Text}", "${a2Text}", और "${a3Text}" चुना है — इसलिए सीधे आधिकारिक पोर्टल से डिजिटल आवेदन करना सबसे तेज़ और सरल रास्ता है।`;
    }
  } else {
    if (valid.length === 1) {
      reason = `This is the verified official channel available for ${schemeName || schemeCode}. Based on your answers ("${a1Text}", "${a2Text}", and "${a3Text}"), following this path directly avoids delays.`;
    } else if (isBranchPath) {
      reason = `Because you chose "${a1Text}", "${a2Text}", and "${a3Text}", getting face-to-face guidance from a loan officer will help verify your papers smoothly and avoid portal rejections.`;
    } else {
      reason = `Because you chose "${a1Text}", "${a2Text}", and "${a3Text}", submitting directly through the official digital portal is the fastest, smoothest option for ${schemeCode}.`;
    }
  }

  return {
    channelKey: chosenKey,
    channelLabel,
    isBranchPath,
    reason,
  };
}

export default function Sarthi() {
  const { t, lang, speakLang, currentLanguageMeta } = useI18n();
  const { setSarthiRecommendedChannel } = useAppState();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [typing, setTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micNotice, setMicNotice] = useState("");
  const [advisor, setAdvisor] = useState(null);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      return localStorage.getItem(AUTO_SPEAK_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [speakingId, setSpeakingId] = useState(null);
  const [voiceInfo, setVoiceInfo] = useState(() => getVoiceStatus(speakLang));

  const widgetRef = useRef(null);
  const drawerRef = useRef(null);
  const chatLogRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [history, typing, open, advisor]);

  useEffect(() => {
    const onStartAdvisor = (event) => {
      const detail = event?.detail || {};
      const schemeCode = detail.schemeCode || "";
      const schemeName = detail.schemeName || schemeCode;
      const availableChannels = normalizeAvailableChannels(detail.availableChannels);
      const q1Copy = (lang === "hi" ? ADVISOR_QUESTIONS[1].hi : ADVISOR_QUESTIONS[1].en).prompt;

      cancelSpeech();
      setSpeakingId(null);
      setMicNotice("");
      setInput("");
      setOpen(true);
      setAdvisor({
        schemeCode,
        schemeName,
        availableChannels,
        step: 1,
        answers: {},
        messages: [{ role: "assistant", content: q1Copy }],
        recommendation: null,
      });

      setTimeout(() => {
        (drawerRef.current || widgetRef.current)?.scrollIntoView?.({
          behavior: "smooth",
          block: "nearest",
        });
      }, 60);
    };

    window.addEventListener("sarthi:start-path-advisor", onStartAdvisor);
    return () => window.removeEventListener("sarthi:start-path-advisor", onStartAdvisor);
  }, [lang]);

  useEffect(() => {
    const refresh = () => setVoiceInfo(getVoiceStatus(speakLang));
    refresh();
    if (!hasSpeechSynthesis()) return undefined;
    const synth = window.speechSynthesis;
    synth.addEventListener?.("voiceschanged", refresh);
    return () => synth.removeEventListener?.("voiceschanged", refresh);
  }, [speakLang]);

  useEffect(() => {
    if (!open) {
      cancelSpeech();
      setSpeakingId(null);
    }
  }, [open]);

  const toggleAutoSpeak = () => {
    setAutoSpeak((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUTO_SPEAK_KEY, String(next));
      } catch {
        /* ignore */
      }
      if (!next) {
        cancelSpeech();
        setSpeakingId(null);
      }
      return next;
    });
  };

  const speakMessage = (id, text) => {
    if (speakingId === id) {
      cancelSpeech();
      setSpeakingId(null);
      return;
    }
    const res = speak(text, speakLang, {
      onStart: () => setSpeakingId(id),
      onEnd: () => setSpeakingId((curr) => (curr === id ? null : curr)),
      onNoVoice: () => setSpeakingId(null),
    });
    if (!res.spoken) {
      setSpeakingId(null);
    }
  };

  const handleAdvisorAnswer = (optionLabel, optionId) => {
    if (!advisor || advisor.step === "done") return;
    const currentStep = advisor.step;
    const resolvedId = optionId || classifyAdvisorText(currentStep, optionLabel);
    const nextAnswers = {
      ...advisor.answers,
      [currentStep]: { id: resolvedId, label: optionLabel },
    };
    const nextMessages = [...advisor.messages, { role: "user", content: optionLabel }];

    if (currentStep < 3) {
      const nextStep = currentStep + 1;
      const qCopy = (lang === "hi" ? ADVISOR_QUESTIONS[nextStep].hi : ADVISOR_QUESTIONS[nextStep].en).prompt;
      setAdvisor({
        ...advisor,
        step: nextStep,
        answers: nextAnswers,
        messages: [...nextMessages, { role: "assistant", content: qCopy }],
      });
      return;
    }

    const recommendation = evaluatePathRecommendation({
      schemeCode: advisor.schemeCode,
      schemeName: advisor.schemeName,
      availableChannels: advisor.availableChannels,
      answers: nextAnswers,
      lang,
    });
    setAdvisor({
      ...advisor,
      step: "done",
      answers: nextAnswers,
      messages: nextMessages,
      recommendation,
    });
  };

  const handleHighlightRecommendation = () => {
    if (!advisor?.recommendation) return;
    setSarthiRecommendedChannel({
      schemeCode: advisor.schemeCode,
      channelKey: advisor.recommendation.channelKey,
      ts: Date.now(),
    });
    setOpen(false);
  };

  const handleFindNearestBranch = () => {
    if (!advisor?.schemeCode) return;
    if (advisor.recommendation) {
      setSarthiRecommendedChannel({
        schemeCode: advisor.schemeCode,
        channelKey: advisor.recommendation.channelKey,
        ts: Date.now(),
      });
    }
    setOpen(false);
    navigate(`/locator?scheme=${encodeURIComponent(advisor.schemeCode)}`);
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message) return;
    if (advisor && advisor.step !== "done") {
      setInput("");
      setMicNotice("");
      handleAdvisorAnswer(message, classifyAdvisorText(advisor.step, message));
      return;
    }
    if (advisor && advisor.step === "done") {
      setAdvisor(null);
    }
    setMicNotice("");
    const next = [...history, { role: "user", content: message }];
    setHistory(next);
    setInput("");
    setTyping(true);
    try {
      const data = await api.chat({
        message,
        history: next.slice(-6),
        lang,
        language: lang,
      });
      const updated = [...next, { role: "assistant", content: data.reply }];
      setHistory(updated);
      if (autoSpeak && voiceInfo.available && data.reply) {
        speakMessage(updated.length - 1, data.reply);
      }
    } catch (e) {
      const body = e.body || {};
      setHistory([...next, { role: "assistant", content: body.message || e.message }]);
    } finally {
      setTyping(false);
    }
  };

  const handleMic = () => {
    if (recording && recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore */
      }
      setRecording(false);
      return;
    }

    if (!hasSpeechRecognition()) {
      setMicNotice("Voice input is not supported in this browser. Please type your question.");
      return;
    }

    setMicNotice("");
    setRecording(true);
    recRef.current = startMic(
      (transcript, errMsg) => {
        setRecording(false);
        if (errMsg) {
          setMicNotice(errMsg);
          return;
        }
        if (transcript) {
          setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
        }
      },
      speakLang,
      {
        onEnd: () => setRecording(false),
      }
    );
  };

  const welcomeText =
    lang === "hi"
      ? "नमस्ते! मैं सारथी हूँ। मैं आपको योजनाएँ खोजने, आवश्यक दस्तावेज़ समझने और ऋण आवेदन में सहायता कर सकता हूँ।"
      : "Namaste! I’m Sarthi, your GovTech scheme advisor. Ask me anything about loans, subsidies, documents, or bank branches.";

  const isHi = lang === "hi";
  const activeAdvisorQ =
    advisor && advisor.step !== "done"
      ? isHi
        ? ADVISOR_QUESTIONS[advisor.step]?.hi
        : ADVISOR_QUESTIONS[advisor.step]?.en
      : null;

  return (
    <div ref={widgetRef} className={`chatbot-widget ${open ? "open" : ""}`}>
      {/* Floating Action Button (FAB) */}
      <button
        className="chat-fab"
        type="button"
        aria-label={open ? t("chat.close") : t("chat.open")}
        onClick={() => setOpen(!open)}
      >
        <span className="fab-pulse-ring" aria-hidden="true" />
        <span className="fab-icon">
          <Icon name={open ? "close" : "bot"} size={24} />
        </span>
        <span className="fab-copy">
          <strong>{t("chat.open")}</strong>
          <small>{t("chat.subtitle")}</small>
        </span>
      </button>

      {/* Floating Chat Drawer Panel */}
      {open ? (
        <section ref={drawerRef} className="chat-drawer" aria-label={t("chat.title")}>
          <header className="chat-head">
            <span className="bot-avatar">
              <Icon name="bot" size={22} />
            </span>
            <div className="bot-meta">
              <strong>{t("chat.title")}</strong>
              <small>
                <i className="online-dot" />{" "}
                <span dir={currentLanguageMeta.direction}>{currentLanguageMeta.native_name}</span>
              </small>
            </div>
            <div className="chat-head-actions">
              <button
                type="button"
                className={`autospeak-btn ${autoSpeak ? "active" : ""}`}
                onClick={toggleAutoSpeak}
                aria-pressed={autoSpeak}
                aria-label={autoSpeak ? "Turn off auto-speak" : "Turn on auto-speak"}
                title={
                  !voiceInfo.available
                    ? `No browser voice for ${currentLanguageMeta.name} (${speakLang})`
                    : autoSpeak
                      ? "Auto-speak ON (click to disable)"
                      : "Auto-speak OFF (click to enable)"
                }
              >
                <Icon name="speaker" size={15} />
                <span>{autoSpeak ? "Auto" : "Mute"}</span>
              </button>
              <button
                type="button"
                className="clear-btn"
                onClick={() => {
                  cancelSpeech();
                  setSpeakingId(null);
                  setHistory([]);
                  setAdvisor(null);
                }}
                aria-label={t("chat.clear")}
                title={t("chat.clear")}
              >
                <Icon name="refresh" size={16} />
              </button>
              <button
                type="button"
                className="close-btn"
                onClick={() => setOpen(false)}
                aria-label={t("chat.close")}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          </header>

          {advisor && (
            <div className="sarthi-advisor-bar">
              <span className="advisor-progress-pill">
                {advisor.step === "done"
                  ? isHi
                    ? `सुझाव तैयार • ${advisor.schemeCode}`
                    : `Recommendation Ready • ${advisor.schemeCode}`
                  : isHi
                    ? `प्रश्न ${advisor.step} / 3 • ${advisor.schemeCode}`
                    : `Question ${advisor.step} of 3 • ${advisor.schemeCode}`}
              </span>
              <button
                type="button"
                className="advisor-cancel-link"
                onClick={() => setAdvisor(null)}
              >
                {isHi ? "रद्द करें / सामान्य चैट" : "Cancel / Exit Advisor"}
              </button>
            </div>
          )}

          <div className="chat-body" ref={chatLogRef}>
            {advisor ? (
              <>
                {advisor.messages.map((m, i) => (
                  <div key={i} className={`chat-bubble-row ${m.role === "user" ? "user-row" : "bot-row"}`}>
                    <div className={`chat-bubble ${m.role === "user" ? "user-bubble" : "bot-bubble"}`}>
                      <p>{m.content}</p>
                    </div>
                  </div>
                ))}

                {activeAdvisorQ && (
                  <div className="advisor-chips-wrap" role="group" aria-label="Quick-reply options">
                    {activeAdvisorQ.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className="advisor-chip-btn"
                        onClick={() => handleAdvisorAnswer(opt.label, opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                {advisor.step === "done" && advisor.recommendation && (
                  <div className="chat-bubble-row bot-row">
                    <div className="sarthi-rec-card">
                      <div className="sarthi-rec-head">
                        <Icon name="sparkles" size={16} />
                        <span>
                          {isHi ? "सारथी का अनुशंसित रास्ता" : "Sarthi Recommended Option"}
                        </span>
                      </div>
                      <h4>{advisor.recommendation.channelLabel}</h4>
                      <p className="sarthi-rec-why-label">
                        {isHi ? "यह रास्ता आपके लिए सबसे आसान क्यों है:" : "Why this path is smoothest for you:"}
                      </p>
                      <p className="sarthi-rec-reason">{advisor.recommendation.reason}</p>
                      <div className="sarthi-rec-card-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleHighlightRecommendation}
                        >
                          <Icon name="checkCircle" size={14} />
                          <span>
                            {isHi ? "अनुशंसित विकल्प हाइलाइट करें" : "Highlight Recommended Option"}
                          </span>
                        </button>
                        {advisor.recommendation.isBranchPath && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleFindNearestBranch}
                          >
                            <Icon name="location" size={14} />
                            <span>
                              {isHi ? "नज़दीकी शाखा खोजें →" : "Find Nearest Branch →"}
                            </span>
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="advisor-cancel-link advisor-exit-footer"
                        onClick={() => setAdvisor(null)}
                      >
                        {isHi ? "रद्द करें / सामान्य सारथी चैट पर जाएँ" : "Cancel / Exit Advisor"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="chat-welcome">
                  <div className="bot-msg">
                    <p>{welcomeText}</p>
                    {voiceInfo.available && (
                      <button
                        type="button"
                        className="speech-listen-btn"
                        onClick={() => speakMessage("welcome", welcomeText)}
                      >
                        <Icon name={speakingId === "welcome" ? "close" : "speaker"} size={14} />{" "}
                        {speakingId === "welcome" ? "Stop" : lang === "hi" ? "सुनें" : "Listen"}
                      </button>
                    )}
                  </div>
                </div>

                {history.map((m, i) => (
                  <div key={i} className={`chat-bubble-row ${m.role === "user" ? "user-row" : "bot-row"}`}>
                    <div className={`chat-bubble ${m.role === "user" ? "user-bubble" : "bot-bubble"}`}>
                      <p>{m.content}</p>
                      {m.role === "assistant" && voiceInfo.available && (
                        <button
                          type="button"
                          className="speech-listen-btn"
                          onClick={() => speakMessage(i, m.content)}
                          aria-label={speakingId === i ? "Stop reading message" : "Replay message aloud"}
                        >
                          <Icon name={speakingId === i ? "close" : "speaker"} size={13} />{" "}
                          {speakingId === i ? "Stop" : "Replay"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {typing && (
                  <div className="chat-bubble-row bot-row">
                    <div className="chat-bubble bot-bubble typing-bubble">
                      <span className="dot" />
                      <span className="dot" />
                      <span className="dot" />
                    </div>
                  </div>
                )}

                {history.length === 0 && (
                  <div className="chat-suggestions-box">
                    <span className="suggestions-label">
                      {lang === "hi" ? "सुझाए गए प्रश्न:" : "Suggested Questions:"}
                    </span>
                    {[t("chat.suggest1"), t("chat.suggest2"), t("chat.suggest3")].map((s) => (
                      <button key={s} className="suggestion-pill" type="button" onClick={() => send(s)}>
                        <span>{s}</span>
                        <Icon name="chevron" size={14} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {micNotice && (
            <div className="chat-mic-notice" role="status">
              <small>{micNotice}</small>
            </div>
          )}

          <form
            className="chat-input-bar"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <button
              type="button"
              className={`chat-mic-btn ${recording ? "recording" : ""}`}
              onClick={handleMic}
              aria-label={recording ? "Stop voice recording" : "Start voice input"}
              title={recording ? "Tap to stop listening" : `Speak (${speakLang})`}
            >
              <Icon name="mic" size={18} />
            </button>
            <input
              aria-label={t("chat.placeholder")}
              placeholder={recording ? "Listening..." : t("chat.placeholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="chat-send-btn" type="submit" disabled={!input.trim()}>
              <Icon name="send" size={18} />
            </button>
          </form>

          <div className="chat-disclaimer">
            <small>
              {t("chat.note")}
              {!voiceInfo.available ? ` • Voice playback unavailable for ${currentLanguageMeta.name}` : ""}
            </small>
          </div>
        </section>
      ) : null}
    </div>
  );
}
