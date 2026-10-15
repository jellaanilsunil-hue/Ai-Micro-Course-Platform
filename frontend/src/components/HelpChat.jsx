import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui.jsx";

// Help assistant on the sign-in and registration pages (before login, so it answers
// common questions locally instead of calling the AI tutor API).
const ANSWERS = [
  [/demo|account|credential/, "Demo accounts:\n• Student: alice@chester.ac.uk / Student123!\n• Professor: prof.chen@chester.ac.uk / Prof123!\n\nThe \"Student demo\" and \"Professor demo\" buttons fill these in for you."],
  [/approv|code|admin/, "Only staff should author courses, so new professor accounts start as \"pending\". You get a 6-digit code; an administrator enters it under \"Admin: approve a professor account\" to activate you."],
  [/sign in|log ?in/, "To sign in:\n1. Choose Student or Professor\n2. Enter your email and password\n3. Press \"Sign in\"\n\nProfessor accounts work once an administrator approves them."],
  [/password/, "Passwords need at least 6 characters. Mixing upper case, numbers and symbols makes the strength meter show \"Strong\". Passwords are stored hashed, never in plain text."],
  [/student or|role|professor/, "Students read chapters, take tests and use the AI tutor. Professors create courses, levels and tests and see learning analytics."],
  [/course/, "Four micro-courses:\n🐍 Python Programming\n🧮 Algorithmic Thinking\n🤖 AI Leadership\n📊 Micro MBA Essentials\n\nEach has levels of short chapters followed by a test."],
  [/tutor|chatbot|ai/, "During a test, press \"AI Tutor\" or \"Hint\". The tutor understands requests like \"give me a hint\", \"show me an example\", \"which chapter covers this?\" or \"I'm lost\". Hints get more specific each time, but it never gives the answer away."],
  [/level|pass|test|unlock/, "Each level: read the chapters → take the test → reach the pass mark (60–70%) → the next level unlocks. If you don't pass, re-read the suggested chapters and retry; your best score counts."],
];
const FALLBACK = "I can help with demo accounts, signing in, registering, the four courses, how levels and tests work, and the AI tutor. What would you like to know?";

export default function HelpChat({ context = "login" }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const body = useRef(null);
  const chips = context === "login"
    ? ["Demo accounts", "How do I sign in?", "Which courses exist?", "How does the AI tutor work?"]
    : ["Student or professor?", "Password rules", "Why approval for professors?", "How do levels work?"];

  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight; }, [msgs]);

  const start = () => {
    setMsgs([{ me: false, t: "Hi! I can help with signing in, demo accounts, registering, the courses, tests and the AI tutor. What do you need?" }]);
    setOpen(true);
  };
  const ask = (q) => {
    const v = (q ?? text).trim();
    if (!v) return;
    setText("");
    const reply = (ANSWERS.find(([re]) => re.test(v.toLowerCase())) || [null, FALLBACK])[1];
    setMsgs((m) => [...m, { me: true, t: v }, { me: false, t: reply }]);
  };

  return (
    <>
      <button className="fab" onClick={start} aria-label="Help assistant">💬</button>
      <Modal open={open} onClose={() => setOpen(false)} label="Help assistant" bare>
        <div className="chat-h">
          <div className="row"><div className="av2">💬</div><div><p style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>EduAI Help Assistant</p><p style={{ color: "rgba(255,255,255,.65)", fontSize: 11 }}>{context === "login" ? "Sign-in help" : "Registration help"}</p></div></div>
          <button className="chat-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
        </div>
        <div className="chat-sub">Ask about signing in, registering, courses, tests or the AI tutor.</div>
        <div className="chat-body" ref={body} style={{ height: 230 }}>
          {msgs.map((m, i) => <div key={i} className={`cmsg ${m.me ? "cme" : "cai"}`}>{m.t}</div>)}
        </div>
        <div className="chips">{chips.map((c) => <button key={c} className="chip" onClick={() => ask(c)}>{c}</button>)}</div>
        <div className="chat-in">
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Ask a question…" aria-label="Help question" />
          <button className="btn bp bs" type="button" onClick={() => ask()} aria-label="Send">↑</button>
        </div>
      </Modal>
    </>
  );
}
