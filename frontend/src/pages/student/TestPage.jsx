import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api.js";
import TutorChat from "../../components/TutorChat.jsx";
import { ConfirmButton, ErrorBox, Loading } from "../../components/ui.jsx";
import Result from "./Result.jsx";

const DIFF = ["", "Easy", "Medium", "Hard"];
// The hint box shows just the hint itself, without the tutor's conversational lead-in.
const hintOnly = (reply) => (reply.includes("💡 ") ? reply.slice(reply.indexOf("💡 ") + 3) : reply);

/** Level test: one question at a time, hints and AI tutor, then marking and the result screen. */
export default function TestPage() {
  const { levelId } = useParams();
  const nav = useNavigate();
  const [test, setTest] = useState(null);
  const [error, setError] = useState("");
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({});
  const [hints, setHints] = useState({}); // question id -> latest hint text
  const [tutorOpen, setTutorOpen] = useState(false);
  const [warned, setWarned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const started = useRef(Date.now());

  const load = () => {
    setTest(null); setResult(null); setAnswers({}); setHints({}); setI(0); setWarned(false); setTutorOpen(false); setError("");
    started.current = Date.now();
    api(`/levels/${levelId}/test`).then(setTest).catch((e) => setError(e.message));
  };
  useEffect(load, [levelId]);

  if (error) return <main className="wrap xnarrow"><ErrorBox error={error} /><Link className="btn bg bs" to="/student">← Dashboard</Link></main>;
  if (!test) return <Loading />;
  if (result) return <Result result={result} onRetry={load} />;

  const qs = test.questions;
  const q = qs[i];
  const answered = qs.filter((x) => String(answers[x.id] ?? "").trim()).length;
  const isLast = i === qs.length - 1;
  const setAnswer = (v) => setAnswers({ ...answers, [q.id]: v });

  const askHint = async () => {
    try {
      const r = await api("/chat", { method: "POST", body: { message: "Give me a hint", question_id: q.id } });
      setHints((h) => ({ ...h, [q.id]: hintOnly(r.reply) }));
    } catch (e) {
      setHints((h) => ({ ...h, [q.id]: e.message }));
    }
  };

  const next = async () => {
    if (!isLast) return setI(i + 1);
    const missing = qs.length - answered;
    if (missing && !warned) return setWarned(true);
    setBusy(true);
    try {
      const r = await api(`/levels/${levelId}/submit`, {
        method: "POST",
        body: { answers, time_taken_sec: Math.round((Date.now() - started.current) / 1000) },
      });
      setResult(r);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <nav className="top">
        <div className="logo"><div className="lb">🎓</div><b>EduAI</b></div>
        <div className="nav-r"><span className="small muted">{test.course.title} · Level {test.level.number}</span>
          <ConfirmButton className="btn bg bs" confirmLabel="Click again: answers are lost" onConfirm={() => nav(`/student/courses/${test.course.id}`)}>✕ Exit test</ConfirmButton></div>
      </nav>
      <main className="wrap xnarrow">
        <div className="row between" style={{ marginBottom: 12 }}>
          <div><p className="small muted">{test.course.category} · Level {test.level.number} · pass mark {test.level.pass_mark}%</p><h2 style={{ fontSize: 18, fontWeight: 700 }}>{test.level.title} — Test</h2></div>
          <span className="badge b-info" style={{ fontSize: 12, padding: "4px 12px" }}>Q {i + 1} / {qs.length}</span>
        </div>
        <div className="bar" style={{ marginBottom: 10 }}><div className="fill" style={{ width: `${Math.round((answered / qs.length) * 100)}%` }} /></div>
        <div className="qdots" style={{ marginBottom: 12 }} aria-label="Questions">
          {qs.map((x, j) => (
            <button key={x.id} className={`qdot ${String(answers[x.id] ?? "").trim() ? "done" : ""} ${j === i ? "cur" : ""}`} onClick={() => setI(j)} aria-label={`Question ${j + 1}`}>{j + 1}</button>
          ))}
        </div>
        <div className="card" style={{ marginBottom: 12, background: "var(--sunk)", borderColor: "rgba(59,130,246,.2)", padding: "13px 15px" }}>
          <p className="lbl" style={{ color: "var(--sky)" }}>Revision tip</p>
          <p className="small" style={{ color: "#8ea0b8", lineHeight: 1.6 }}>{test.level.tip || "Review the chapters before answering."}</p>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ marginBottom: 8 }}><span className="badge b-cat">{q.topic}</span><span className="badge b-mute">{DIFF[q.difficulty] || ""}</span></div>
          <p className="qtext">{q.text}</p>
          {q.qtype === "mcq" ? (
            <div role="radiogroup">
              {q.options.map((o, j) => (
                <button key={o} className={`opt ${answers[q.id] === o ? "sel" : ""}`} role="radio" aria-checked={answers[q.id] === o} onClick={() => setAnswer(o)}>
                  <span className="k">{"ABCDEFGH"[j]}</span><span>{o}</span>
                </button>
              ))}
            </div>
          ) : (
            <input type="text" value={answers[q.id] ?? ""} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer" aria-label="Your answer" />
          )}
          {hints[q.id] && <div className="hintbox"><p className="lbl" style={{ color: "var(--amber)" }}>Hint</p><p style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{hints[q.id]}</p></div>}
          <div className="row between" style={{ marginTop: 14 }}>
            <div className="row">
              <button className="btn bg bs" style={{ visibility: i === 0 ? "hidden" : "visible" }} onClick={() => setI(i - 1)}>← Back</button>
              <button className="btn bg bs" onClick={askHint}>💡 Hint</button>
              <button className="btn bs bv" onClick={() => setTutorOpen(true)}>🤖 AI Tutor</button>
            </div>
            <button className="btn bp bs" onClick={next} disabled={busy || (!isLast && !String(answers[q.id] ?? "").trim())}>
              {busy ? "Marking…" : isLast ? (warned ? "Submit anyway" : "Submit test") : "Next →"}
            </button>
          </div>
          {warned && answered < qs.length && (
            <p className="err warn">{qs.length - answered} question{qs.length - answered > 1 ? "s are" : " is"} unanswered and will be marked wrong. Use the numbers above to go back, or press "Submit anyway".</p>
          )}
        </div>
        {tutorOpen && <TutorChat question={q} index={i} onClose={() => setTutorOpen(false)} onHint={(t) => setHints((h) => ({ ...h, [q.id]: hintOnly(t) }))} />}
      </main>
    </section>
  );
}
