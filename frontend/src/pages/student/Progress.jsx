import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api.js";
import { Bar, ErrorBox, Loading, MasteryRow, Page, fmtDate, initial } from "../../components/ui.jsx";

export default function Progress() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/progress").then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <Page><ErrorBox error={error} /></Page>;
  if (!data) return <Page><Loading /></Page>;
  const { user, stats } = data;

  return (
    <Page width="narrow">
      <Link className="btn bg bs" to="/student" style={{ marginBottom: 16 }}>← Dashboard</Link>
      <div className="hero" style={{ marginBottom: 22 }}>
        <div className="row" style={{ gap: 18, flexWrap: "nowrap" }}>
          <div className="av" style={{ width: 64, height: 64, fontSize: 26, fontWeight: 900 }}>{initial(user.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800 }}>{user.name}</h1>
            <p className="small" style={{ color: "rgba(255,255,255,.55)", marginBottom: 10 }}>{user.email} · Student ID: {user.student_id || "N/A"}</p>
            <div className="row" style={{ gap: 18 }}>
              {[["Levels passed", `${stats.levels_passed}/${stats.levels_total}`], ["Average score", `${stats.average_score}%`], ["Tests taken", stats.tests_taken], ["Hints used", stats.hints_used]].map(([l, v]) => (
                <div key={l}><div style={{ fontSize: 18, fontWeight: 800, color: "var(--sky)" }}>{v}</div><div className="tiny" style={{ color: "rgba(255,255,255,.45)" }}>{l}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <h2 className="sec-h" style={{ marginTop: 0 }}>Progress & topic mastery</h2>
      {data.courses.map((c) => {
        const done = c.state === "complete";
        return (
          <div className="card" key={c.id} style={{ marginBottom: 12 }}>
            <div className="row" style={{ gap: 12, marginBottom: 12, flexWrap: "nowrap" }}>
              <span style={{ fontSize: 28 }}>{c.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row between"><h3 style={{ fontSize: 14, fontWeight: 700 }}>{c.title}</h3>
                  <span className="small" style={{ fontWeight: 700, color: done ? "var(--green)" : c.levels_passed ? "var(--amber)" : "var(--dim)" }}>{done ? "✓ Complete" : c.levels_passed ? `${c.levels_passed}/${c.level_count} passed` : "Not started"}</span></div>
                <div style={{ marginTop: 6 }}><Bar value={c.progress} color={done ? "var(--green)" : undefined} /></div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 7, marginBottom: c.mastery.length ? 14 : 0 }}>
              {c.levels.map((lv) => (
                <div key={lv.id} className="panel center" style={{ padding: 9, borderColor: lv.passed ? "rgba(34,197,94,.25)" : lv.best_accuracy != null ? "rgba(245,158,11,.25)" : undefined }}>
                  <div style={{ fontSize: 16 }}>{lv.passed ? "✅" : lv.best_accuracy != null ? "⚠️" : "🔒"}</div>
                  <div className="tiny" style={{ fontWeight: 700 }}>Level {lv.number}</div>
                  <div className="tiny muted">{lv.title}</div>
                  {lv.best_accuracy != null && <div style={{ fontSize: 12, fontWeight: 800, color: lv.passed ? "var(--green)" : "var(--amber)", marginTop: 3 }}>{Math.round(lv.best_accuracy)}%</div>}
                </div>
              ))}
            </div>
            {c.mastery.length > 0 && <><p className="lbl">Topic mastery (knowledge tracing)</p>{c.mastery.map((m) => <MasteryRow key={m.topic} topic={m.topic} p={m.p_know} labelText={m.label} />)}</>}
            {done && <div style={{ textAlign: "right", marginTop: 10 }}><Link className="btn bp bs" to={`/student/courses/${c.id}/certificate`}>🎓 View certificate</Link></div>}
          </div>
        );
      })}

      <h2 className="sec-h">Test history</h2>
      {data.attempts.length ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Date</th><th>Course</th><th>Level</th><th className="c">Score</th><th className="c">Result</th><th className="c">Hints</th><th className="c">Time</th></tr></thead>
              <tbody>
                {data.attempts.map((a) => (
                  <tr key={a.id}>
                    <td className="small muted">{fmtDate(a.created_at)}</td>
                    <td>{a.course_icon} {a.course_title}</td>
                    <td className="muted">L{a.level_number}: {a.level_title}</td>
                    <td className="c" style={{ fontWeight: 800, color: a.passed ? "var(--green)" : "var(--red)" }}>{Math.round(a.accuracy)}%</td>
                    <td className="c"><span className={`badge ${a.passed ? "b-ok" : "b-bad"}`}>{a.passed ? "Passed" : "Not passed"}</span></td>
                    <td className="c">{a.hints_used}</td>
                    <td className="c small muted">{Math.floor(a.time_taken_sec / 60)}m {a.time_taken_sec % 60}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <div className="card muted center" style={{ padding: 32 }}>No tests yet. Start a course to see your history here.</div>}
    </Page>
  );
}
