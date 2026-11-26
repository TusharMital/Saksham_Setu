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

function getAdvisorQuestion(step, t) {
  if (step === 1) {
    return {
      prompt: t("chat.advisorQ1"),
      options: [
        { id: "online", label: t("chat.advisorQ1OptOnline") },
        { id: "in_person", label: t("chat.advisorQ1OptInPerson") },
        { id: "either", label: t("chat.advisorQ1OptEither") },
      ],
    };
  }
  if (step === 2) {
    return {
      prompt: t("chat.advisorQ2"),
      options: [
        { id: "ready", label: t("chat.advisorQ2OptReady") },
        { id: "missing_few", label: t("chat.advisorQ2OptMissing") },
        { id: "need_help", label: t("chat.advisorQ2OptHelp") },
      ],
    };
  }
  return {
    prompt: t("chat.advisorQ3"),
    options: [
      { id: "nearby", label: t("chat.advisorQ3OptNearby") },
      { id: "from_home", label: t("chat.advisorQ3OptHome") },
      { id: "not_sure", label: t("chat.advisorQ3OptUnsure") },
    ],
  };
}

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

function evaluatePathRecommendation({ schemeCode, schemeName, availableChannels, answers, t }) {
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
  const channelLabel = t(`channelsFull.${chosenKey}`) !== `channelsFull.${chosenKey}`
    ? t(`channelsFull.${chosenKey}`)
    : meta.en;
  const isBranchPath = meta.kind === "branch";

  const a1Text = answers[1]?.label || "";
  const a2Text = answers[2]?.label || "";
  const a3Text = answers[3]?.label || "";

  let reason;
  if (valid.length === 1) {
    reason = t("chat.advisorReasonSingle", {
      scheme: schemeName || schemeCode,
      a1: a1Text,
      a2: a2Text,
      a3: a3Text,
    });
  } else if (isBranchPath) {
    reason = t("chat.advisorReasonBranch", {
      a1: a1Text,
      a2: a2Text,
      a3: a3Text,
    });
  } else {
    reason = t("chat.advisorReasonOnline", {
      scheme: schemeCode,
      a1: a1Text,
      a2: a2Text,
      a3: a3Text,
    });
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
      const q1Copy = getAdvisorQuestion(1, t).prompt;

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
      if (autoSpeak && voiceInfo.available && q1Copy) {
        speakMessage("advisor-q1", q1Copy);
      }

      setTimeout(() => {
        (drawerRef.current || widgetRef.current)?.scrollIntoView?.({
          behavior: "smooth",
          block: "nearest",
        });
      }, 60);
    };

    window.addEventListener("sarthi:start-path-advisor", onStartAdvisor);
    return () => window.removeEventListener("sarthi:start-path-advisor", onStartAdvisor);
  }, [lang, t]);

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
      const qCopy = getAdvisorQuestion(nextStep, t).prompt;
      setAdvisor({
        ...advisor,
        step: nextStep,
        answers: nextAnswers,
        messages: [...nextMessages, { role: "assistant", content: qCopy }],
      });
      if (autoSpeak && voiceInfo.available && qCopy) {
        speakMessage(`advisor-q${nextStep}`, qCopy);
      }
      return;
    }

    const recommendation = evaluatePathRecommendation({
      schemeCode: advisor.schemeCode,
      schemeName: advisor.schemeName,
      availableChannels: advisor.availableChannels,
      answers: nextAnswers,
      t,
    });
    setAdvisor({
      ...advisor,
      step: "done",
      answers: nextAnswers,
      messages: nextMessages,
      recommendation,
    });
    if (autoSpeak && voiceInfo.available && recommendation?.reason) {
      speakMessage("advisor-rec", `${recommendation.channelLabel}. ${recommendation.reason}`);
    }
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
        history: next.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.sig ? { sig: m.sig } : {}),
        })),
        lang,
        language: lang,
      });
      const updated = [
        ...next,
        { role: "assistant", content: data.reply, sig: data.reply_sig },
      ];
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
      setMicNotice(t("chat.micUnsupported"));
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
        messages: {
          unsupported: t("chat.micUnsupported"),
          denied: t("chat.micDenied"),
          noSpeech: t("chat.micNoSpeech"),
          error: t("chat.micError"),
          startError: t("chat.micStartError"),
        },
      }
    );
  };

  const welcomeText = t("chat.welcomeMessage");

  const activeAdvisorQ =
    advisor && advisor.step !== "done"
      ? getAdvisorQuestion(advisor.step, t)
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
                aria-label={autoSpeak ? t("chat.autoSpeakOffAria") : t("chat.autoSpeakOnAria")}
                title={
                  !voiceInfo.available
                    ? t("nav.noVoiceForLang", { lang: currentLanguageMeta.name, locale: speakLang })
                    : autoSpeak
                      ? t("chat.autoSpeakOnTitle")
                      : t("chat.autoSpeakOffTitle")
                }
              >
                <Icon name="speaker" size={15} />
                <span>{autoSpeak ? t("chat.auto") : t("chat.mute")}</span>
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
                  ? `${t("chat.advisorReady")} • ${advisor.schemeCode}`
                  : `${t("chat.advisorQuestionProgress", { step: String(advisor.step) })} • ${advisor.schemeCode}`}
              </span>
              <button
                type="button"
                className="advisor-cancel-link"
                onClick={() => setAdvisor(null)}
              >
                {t("chat.advisorCancel")}
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
                  <div className="advisor-chips-wrap" role="group" aria-label={t("chat.quickReplyAria")}>
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
                        <span>{t("chat.advisorRecTitle")}</span>
                      </div>
                      <h4>{advisor.recommendation.channelLabel}</h4>
                      <p className="sarthi-rec-why-label">{t("chat.advisorWhyLabel")}</p>
                      <p className="sarthi-rec-reason">{advisor.recommendation.reason}</p>
                      <div className="sarthi-rec-card-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleHighlightRecommendation}
                        >
                          <Icon name="checkCircle" size={14} />
                          <span>{t("chat.advisorHighlightBtn")}</span>
                        </button>
                        {advisor.recommendation.isBranchPath && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleFindNearestBranch}
                          >
                            <Icon name="location" size={14} />
                            <span>{t("chat.advisorFindBranchBtn")}</span>
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="advisor-cancel-link advisor-exit-footer"
                        onClick={() => setAdvisor(null)}
                      >
                        {t("chat.advisorCancel")}
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
                        {speakingId === "welcome" ? t("chat.stop") : t("chat.listen")}
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
                          aria-label={speakingId === i ? t("chat.stop") : t("chat.replay")}
                        >
                          <Icon name={speakingId === i ? "close" : "speaker"} size={13} />{" "}
                          {speakingId === i ? t("chat.stop") : t("chat.replay")}
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
                      {t("chat.suggestedQuestions")}
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
              aria-label={recording ? t("chat.stopMicAria") : t("chat.startMicAria")}
              title={recording ? t("chat.stopMicTitle") : t("chat.speakLocaleTitle", { locale: speakLang })}
            >
              <Icon name="mic" size={18} />
            </button>
            <input
              aria-label={t("chat.placeholder")}
              placeholder={recording ? t("chat.listening") : t("chat.placeholder")}
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
              {!voiceInfo.available
                ? t("chat.voicePlaybackUnavailable", { lang: currentLanguageMeta.native_name })
                : ""}
            </small>
          </div>
        </section>
      ) : null}
    </div>
  );
}
