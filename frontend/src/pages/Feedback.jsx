import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { homePath, useAuth } from "../auth.jsx";
import { Page } from "../components/ui.jsx";

// System Usability Scale (Brooke, 1996), used for the pilot evaluation.
const SUS = [
  "I think that I would like to use this platform frequently.",
  "I found the platform unnecessarily complex.",
  "I thought the platform was easy to use.",
  "I think I would need technical support to be able to use this platform.",
  "I found the various functions were well integrated.",
  "I thought there was too much inconsistency in this platform.",
  "I would imagine that most people would learn to use this platform very quickly.",
  "I found the platform very cumbersome to use.",
  "I felt very confident using the platform.",
  "I needed to learn a lot of things before I could get going.",
];

export default function Feedback() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [answers, setAnswers] = useState(Array(10).fill(0));
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [score, setScore] = useState(null);

  const submit = async () => {
    const left = answers.filter((v) => !v).length;
    if (left) return setErr(`Answer all ten statements (${left} left).`);
    try {
      const r = await api("/feedback", { method: "POST", body: { responses: answers, comment } });
      setScore(r.sus_score);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <Page width="xnarrow">
      <button className="btn bg bs" onClick={() => nav(-1)} style={{ marginBottom: 16 }}>← Back</button>
      <div className="card">
        {score !== null ? (
          <div className="center" style={{ padding: 12 }}>
            <div style={{ fontSize: 44 }}>🙏</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: "8px 0" }}>Thank you!</h2>
            <p className="muted">Your usability score is <b style={{ color: "var(--sky)" }}>{score}</b> / 100 (68 is the industry average). It feeds into the pilot evaluation of this platform.</p>
            <div className="row" style={{ justifyContent: "center", marginTop: 16 }}><button className="btn bp" onClick={() => nav(homePath(user))}>Back to {user.role === "professor" ? "portal" : "dashboard"}</button></div>
          </div>
        ) : (
          <>
            <p className="lbl" style={{ color: "var(--lav)" }}>Pilot evaluation</p>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>How usable is EduAI?</h1>
            <p className="muted small" style={{ marginBottom: 16 }}>System Usability Scale · 1 = strongly disagree, 5 = strongly agree</p>
            {SUS.map((s, i) => (
              <fieldset key={i} style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
                <legend style={{ fontSize: 13, fontWeight: 600 }}>{i + 1}. {s}</legend>
                <div className="likert">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button key={v} type="button" className={answers[i] === v ? "on" : ""} aria-pressed={answers[i] === v} onClick={() => setAnswers(answers.map((a, j) => (j === i ? v : a)))}>{v}</button>
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="field"><label className="lbl" htmlFor="fb-c">Anything else? (optional)</label><textarea id="fb-c" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
            <p className="err">{err}</p>
            <button className="btn bp" onClick={submit}>Submit feedback</button>
          </>
        )}
      </div>
    </Page>
  );
}
