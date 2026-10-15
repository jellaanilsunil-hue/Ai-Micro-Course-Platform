import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api.js";
import { ErrorBox, Loading, MasteryRow, Page, StatTiles, initial, readyBadge } from "../../components/ui.jsx";

/** Learning analytics across the professor's published courses. */
export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [training, setTraining] = useState(false);

  const load = () => api("/professor/analytics").then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const retrain = async () => {
    setTraining(true);
    try { await api("/professor/ml/retrain", { method: "POST" }); await load(); } finally { setTraining(false); }
  };

  if (error) return <Page><ErrorBox error={error} /></Page>;
  if (!data) return <Page><Loading /></Page>;
  const s = data.summary;
  const m = data.model;
  const intentMax = Math.max(1, ...data.chat_intents.map((x) => x.count));
  const wMax = Math.max(...m.feature_importance.map((w) => Math.abs(w.weight)));

  return (
    <Page>
      <Link className="btn bg bs" to="/professor" style={{ marginBottom: 16 }}>← Professor portal</Link>
      <div className="row between" style={{ marginBottom: 18 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>Learning analytics</h1><p className="muted" style={{ fontSize: 14 }}>Your published courses · includes sample pilot learners</p></div>
        <span className="badge b-ok">● Live data</span>
      </div>
      <div style={{ marginBottom: 22 }}>
        <StatTiles items={[
          { v: s.learners, l: "Learners", c: "#3b82f6" },
          { v: s.attempts, l: "Test attempts", c: "#a78bfa" },
          { v: `${s.average_score}%`, l: "Average score", c: "#f59e0b" },
          { v: `${s.pass_rate}%`, l: "Pass rate", c: "#22c55e" },
          { v: s.at_risk, l: "At risk", c: "#ef4444" },
          { v: s.tutor_requests, l: "Tutor requests", c: "#60a5fa" },
        ]} />
      </div>

      {data.courses.map(({ course, levels, learners }) => (
        <div key={course.id} className="card" style={{ marginBottom: 18, padding: 0, overflow: "hidden" }}>
          <div className="hero" style={{ borderRadius: 0, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 28 }}>{course.icon}</span>
            <div><h3 style={{ fontSize: 15, fontWeight: 700 }}>{course.title}</h3><p className="tiny" style={{ color: "rgba(255,255,255,.5)" }}>{levels.length} levels · {learners.length} learners</p></div>
          </div>
          {learners.length ? (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Learner</th>{levels.map((lv) => <th key={lv.id} className="c">L{lv.number}: {lv.title}</th>)}<th className="c">AI readiness</th></tr></thead>
                <tbody>
                  {learners.map((u) => (
                    <tr key={u.id} className={u.status.at_risk ? "risk" : ""}>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          <div className="av" style={{ width: 28, height: 28, fontSize: 12 }}>{initial(u.name)}</div>
                          <div><div style={{ fontWeight: 600 }}>{u.name} {u.sample && <span className="badge b-mute">sample</span>}</div><div className="tiny muted">{u.student_id}</div></div>
                        </div>
                      </td>
                      {u.levels.map((c, j) => (
                        <td key={j} className="c">
                          {c.best == null ? <span style={{ color: "#475569" }}>—</span> : (
                            <><b style={{ color: c.passed ? "var(--green)" : "var(--red)" }}>{Math.round(c.best)}%</b><div className="tiny muted">{c.attempts} attempt{c.attempts > 1 ? "s" : ""}</div></>
                          )}
                        </td>
                      ))}
                      <td className="c">
                        {u.status.done ? <span className="badge b-ok">✓ Complete</span> : u.status.readiness == null ? "—" : (
                          <><span className={`badge ${u.status.at_risk ? "b-bad" : readyBadge(u.status.band)}`}>{Math.round(u.status.readiness * 100)}%{u.status.at_risk ? " · at risk" : ""}</span><div className="tiny muted">for L{u.status.level}</div></>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted small" style={{ padding: 16 }}>No attempts yet.</p>}
        </div>
      ))}
      {!data.courses.length && <div className="card muted center" style={{ padding: 32 }}>Publish a course to see analytics.</div>}

      <div className="two" style={{ marginBottom: 14 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Hardest questions</h3>
          {data.hardest_questions.length ? data.hardest_questions.map((h) => (
            <div key={h.question_id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <div className="row between tiny"><span className="badge b-cat">{h.topic}</span><span style={{ color: h.percent_correct < 50 ? "var(--red-2)" : "var(--amber-2)", fontWeight: 700 }}>{h.percent_correct}% correct · {h.responses} answers</span></div>
              <p className="small" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{h.text}</p>
            </div>
          )) : <p className="small muted">Not enough answers yet.</p>}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Class topic mastery</h3>
          {data.topic_mastery.length ? data.topic_mastery.map((t) => <MasteryRow key={t.topic} topic={`${t.topic} (${t.learners})`} p={t.p_know} labelText={t.label} />) : <p className="small muted">No data yet.</p>}
          <p className="tiny muted">Weakest topics first · Bayesian knowledge tracing averaged across learners.</p>
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>What learners ask the AI tutor</h3>
          {data.chat_intents.length ? data.chat_intents.map((x) => (
            <div key={x.intent} className="hbar"><span>{x.name}</span><div className="bar"><div className="fill" style={{ width: `${(100 * x.count) / intentMax}%` }} /></div><span style={{ fontVariantNumeric: "tabular-nums" }}>{x.count}</span></div>
          )) : <p className="small muted">No tutor use yet.</p>}
          <p className="tiny muted" style={{ marginTop: 6 }}>Intents detected by the NLP classifier.</p>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "18px 0 6px" }}>Pilot usability (SUS)</h3>
          {data.sus.mean != null ? (
            <>
              <p><span style={{ fontSize: 26, fontWeight: 900, color: data.sus.mean >= 68 ? "var(--green)" : "var(--amber)" }}>{data.sus.mean}</span><span className="muted"> / 100 from {data.sus.responses} responses · 68 = average</span></p>
              {data.sus.comments.map((c, i) => <p key={i} className="small muted" style={{ fontStyle: "italic", marginTop: 4 }}>“{c}”</p>)}
            </>
          ) : <p className="small muted">No responses yet.</p>}
        </div>
        <div className="card">
          <div className="row between" style={{ marginBottom: 6 }}><h3 style={{ fontSize: 15, fontWeight: 700 }}>Readiness model</h3>
            <button className="btn bs bv" onClick={retrain} disabled={training}>{training ? "Training…" : "↻ Retrain now"}</button></div>
          <p className="small muted" style={{ marginBottom: 8 }}>{m.algorithm}. Trained on {m.real_samples} real attempts + {m.synthetic_samples} synthetic cold-start learners. Last trained {new Date(m.trained_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.</p>
          <p style={{ marginBottom: 10 }}>Hold-out accuracy <b>{m.metrics.holdout_accuracy}</b> · AUC <b>{m.metrics.holdout_auc}</b>{m.metrics.real_auc != null && <> · AUC on real attempts <b>{m.metrics.real_auc}</b></>}</p>
          <p className="lbl">Feature weights</p>
          {m.feature_importance.map((w) => (
            <div key={w.feature} className="hbar"><span>{w.feature}</span><div className="bar"><div className="fill" style={{ width: `${(100 * Math.abs(w.weight)) / wMax}%`, background: w.weight < 0 ? "var(--red)" : "var(--green)" }} /></div><span style={{ fontVariantNumeric: "tabular-nums" }}>{w.weight > 0 ? "+" : ""}{w.weight}</span></div>
          ))}
          <p className="tiny muted" style={{ marginTop: 6 }}>Green raises the predicted chance of passing; red lowers it.</p>
        </div>
      </div>
    </Page>
  );
}
