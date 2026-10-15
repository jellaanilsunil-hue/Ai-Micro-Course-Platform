import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { CodeBlock } from "./ui.jsx";

const CHIPS = [
  ["💡 Give me a hint", "Give me a hint"],
  ["😵 I'm completely lost", "I'm completely lost"],
  ["🔍 Show me an example", "Show me an example"],
  ["📖 Which chapter covers this?", "Which chapter covers this?"],
  ["❓ Explain the concept", "Explain the concept"],
  ["🔄 Still stuck — go deeper", "Still stuck — go deeper"],
];

/**
 * AI tutor panel for the test page. Sends each message to the NLP chatbot (POST /api/chat)
 * with the current question, so hints are graded per question and never reveal the answer.
 */
export default function TutorChat({ question, index, onClose, onHint }) {
  const [msgs, setMsgs] = useState([
    { me: false, t: "Hi! I'm your AI tutor. Ask for a hint, an example, an explanation, or which chapter to re-read. I'll guide you — I won't hand you the answer." },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const body = useRef(null);
  const input = useRef(null);

  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight; }, [msgs, busy]);
  useEffect(() => { input.current?.focus(); }, []);

  const send = async (raw) => {
    const msg = (raw ?? text).trim();
    if (!msg || busy) return;
    setText("");
    setMsgs((m) => [...m, { me: true, t: msg }]);
    setBusy(true);
    try {
      const r = await api("/chat", { method: "POST", body: { message: msg, question_id: question.id } });
      setMsgs((m) => [...m, { me: false, t: r.reply, code: r.code, src: r.source }]);
      if (r.hint_level > 0) onHint?.(r.reply);
    } catch (e) {
      setMsgs((m) => [...m, { me: false, t: `Sorry — ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chatbox">
      <div className="chat-h">
        <div className="row"><div className="av2">🤖</div><div><p style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>AI Tutor</p><p style={{ color: "rgba(255,255,255,.65)", fontSize: 11 }}>Helping with Q{index + 1} · {question.topic}</p></div></div>
        <button className="chat-x" onClick={onClose} aria-label="Close tutor">✕</button>
      </div>
      <div className="chat-sub">Graded hints and explanations — it guides your thinking and never gives away the answer.</div>
      <div className="chat-body" ref={body} role="log" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`cmsg ${m.me ? "cme" : "cai"}`}>
            {m.t}
            {m.code && <CodeBlock code={m.code} style={{ margin: "8px 0 0" }} />}
            {m.src && <div className="cmeta">Source: {m.src}</div>}
          </div>
        ))}
        {busy && <div className="cmsg cai typing">Thinking…</div>}
      </div>
      <div className="chips">{CHIPS.map(([label, msg]) => <button key={label} className="chip" onClick={() => send(msg)}>{label}</button>)}</div>
      <div className="chat-in">
        <input ref={input} type="text" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask for a hint or an explanation…" aria-label="Message the tutor" />
        <button className="btn bp bs" type="button" onClick={() => send()} disabled={busy} aria-label="Send">↑</button>
      </div>
    </div>
  );
}
