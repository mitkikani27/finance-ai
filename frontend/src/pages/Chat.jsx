import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";

const SUGGESTIONS = [
  "Is month ki income kitni hai?",
  "5000 income add karo",
  "500 food mein kharcha hua",
  "Is month kitna kharch hua?",
  "Predict next month's expenses",
  "Meri savings kaisi hai?",
  "Health score batao",
  "Budget status dikhao",
];

export default function Chat() {
  const { push } = useToast();
  const { lang } = useLang();

  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [micStatus, setMicStatus] = useState("idle"); // idle | listening | error

  const recRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const supported =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    api("/api/chat/history")
      .then(setMsgs)
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;

    setInput("");

    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);

    try {
      const r = await api("/api/chat", {
        method: "POST",
        body: { message: q },
      });

      setMsgs((m) => [...m, { role: "assistant", content: r.reply }]);
      speak(r.reply);
    } catch (e) {
      push(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;

    const clean = text.replace(/[⚠️📈📉🔮❤️🏆🧭🚨🛡️✨✅💸🎉📊💡🛡💼🎯]/gu, "");

    const u = new SpeechSynthesisUtterance(clean);
    u.lang =
      lang === "hi" ? "hi-IN" : lang === "gu" ? "gu-IN" : "en-IN";
    u.rate = 1.0;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function toggleVoice() {
    // Stop if already listening
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      setMicStatus("idle");
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SR) {
      push(
        "🎤 Voice sirf Chrome ya Edge browser mein kaam karta hai. Firefox mein nahi chalta.",
        "error"
      );
      return;
    }

    // Check mic permission first
    if (navigator.permissions) {
      navigator.permissions.query({ name: "microphone" }).then((perm) => {
        if (perm.state === "denied") {
          push(
            "🎤 Mic permission blocked hai! Browser mein mic allow karo:\n" +
            "Address bar ke paas 🔒 icon → Microphone → Allow",
            "error"
          );
          setMicStatus("error");
          return;
        }
        _startRecording(SR);
      }).catch(() => {
        _startRecording(SR);
      });
    } else {
      _startRecording(SR);
    }
  }

  function _startRecording(SR) {
    const rec = new SR();

    // Set language for recognition
    rec.lang =
      lang === "hi" ? "hi-IN" : lang === "gu" ? "gu-IN" : "en-IN";

    rec.continuous = false;
    rec.interimResults = true; // Show live text while speaking

    let finalTranscript = "";

    rec.onstart = () => {
      setListening(true);
      setMicStatus("listening");
      finalTranscript = "";
    };

    rec.onresult = (e) => {
      let interim = "";
      finalTranscript = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interim += t;
        }
      }

      // Show live text in input box
      setInput(finalTranscript || interim);
    };

    rec.onend = () => {
      setListening(false);
      setMicStatus("idle");

      const txt = finalTranscript.trim();
      if (txt) {
        // Auto-send after voice input
        setTimeout(() => {
          send(txt);
        }, 300);
      }
    };

    rec.onerror = (e) => {
      setListening(false);
      setMicStatus("error");

      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        push(
          "🎤 Mic access nahi mila! Browser settings mein mic allow karo.",
          "error"
        );
      } else if (e.error === "no-speech") {
        push("Kuch suna nahi — dobara bolo.", "error");
      } else if (e.error === "network") {
        push("Network error — internet connection check karo.", "error");
      } else if (e.error === "aborted") {
        // User stopped, no error needed
      } else {
        push(`Mic error: ${e.error} — dobara try karo.`, "error");
      }
    };

    recRef.current = rec;

    try {
      rec.start();
    } catch (err) {
      push("Mic busy hai — ek second baad try karo.", "error");
      setListening(false);
      setMicStatus("idle");
    }
  }

  // Mic button color/style based on status
  const micStyle =
    micStatus === "listening"
      ? { borderColor: "var(--danger)", color: "var(--danger)", animation: "pulse 1s infinite" }
      : micStatus === "error"
      ? { borderColor: "orange", color: "orange" }
      : {};

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-7.5rem)] flex flex-col">

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-11 h-11 rounded-2xl grid place-items-center text-2xl"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
        >
          🤖
        </div>
        <div>
          <h1 className="text-[18px] font-extrabold leading-tight">
            FinMate AI Assistant
          </h1>
          <div className="muted text-[12px] flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full pulse"
              style={{ background: "var(--accent)" }}
            />
            Real data se answers · Income/Expense add karo seedha baat karke ·{" "}
            Voice {supported ? "ready 🎙️" : "unavailable"}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="card flex-1 overflow-y-auto !p-4 space-y-3">

        {msgs.length === 0 && !busy && (
          <div className="text-center pt-6">
            <div className="text-4xl mb-3">👋</div>
            <div className="font-bold text-[15px]">
              Namaste! Seedha bolo ya type karo
            </div>
            <div className="muted text-[12.5px] mt-1 mb-5">
              Income/expense add karna ho, balance dekhna ho, forecast chahiye — sab AI se puchho!
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="btn btn-sm"
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed fade-up ${
                m.role === "user" ? "" : "glass"
              }`}
              style={
                m.role === "user"
                  ? { background: "var(--accent-2)", color: "#fff" }
                  : { border: "1px solid var(--border)" }
              }
            >
              {m.role === "assistant" && (
                <div
                  className="text-[10.5px] font-bold mb-1"
                  style={{ color: "var(--accent)" }}
                >
                  FINMATE AI
                </div>
              )}

              <span className="whitespace-pre-wrap">{m.content}</span>

              {m.role === "assistant" && (
                <button
                  className="mt-1.5 text-[11px] opacity-60 hover:opacity-100 block"
                  title="Read aloud"
                  onClick={() => speak(m.content)}
                >
                  🔊 sunao
                </button>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div
              className="glass rounded-2xl px-4 py-3 border"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="pulse">🤖 soch raha hun aapke numbers ke baare mein…</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input area */}
      <div className="mt-3 flex gap-2 relative">

        {/* Listening indicator floating above input */}
        {listening && (
          <div
            className="absolute -top-9 left-0 right-0 text-center text-[12px] font-semibold px-3 py-1 rounded-full"
            style={{ background: "var(--danger)", color: "#fff" }}
          >
            🎤 Sun raha hun… bolo, automatically send ho jayega!
          </div>
        )}

        {/* Mic button */}
        <button
          className="btn shrink-0"
          onClick={toggleVoice}
          title={
            !supported
              ? "Voice sirf Chrome/Edge mein available hai"
              : listening
              ? "Bol rahe ho… click karke band karo"
              : "Voice input — click karke bolo"
          }
          disabled={!supported}
          style={micStyle}
        >
          {listening ? (
            <span>⏹ band karo</span>
          ) : (
            <span>🎙️ voice</span>
          )}
        </button>

        <input
          ref={inputRef}
          className="input flex-1"
          placeholder={
            listening
              ? "🎤 Sun raha hun… (bolo, auto-send hoga)"
              : 'Likho ya bolo: "5000 income add karo" · "is month ka kharcha dikhao"'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
        />

        <button
          className="btn btn-primary shrink-0"
          onClick={() => send()}
          disabled={busy || !input.trim()}
        >
          Send ➤
        </button>
      </div>

      <p className="muted text-[10.5px] mt-2 text-center">
        🎙️ Voice: Web Speech API (Chrome/Edge) · 🧠 AI brain: FastAPI + OpenAI GPT-4o-mini · Actions: income/expense add seedhe chat se
      </p>
    </div>
  );
}
