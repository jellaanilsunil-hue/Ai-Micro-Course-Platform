import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { Bar, ErrorBox, Loading, Page, StatTiles, readyBadge } from "../../components/ui.jsx";

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { api("/dashboard").then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <Page><ErrorBox error={error} /></Page>;
  if (!data) return <Page><Loading /></Page>;

  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const s = data.stats;
  const hasStarted = data.courses.some((c) => c.state !== "not started");

  const openCourse = async (c) => {
    if (!c.enrolled) await api(`/courses/${c.id}/enroll`, { method: "POST" });
    nav(`/student/courses/${c.id}`);
  };
  const followPath = async (p) => {
    if (!p.enrolled) await api(`/courses/${p.course.id}/enroll`, { method: "POST" });
    nav(p.kind === "test" ? `/student/levels/${p.level.id}/test` : `/student/levels/${p.level.id}/chapters?ch=${p.chapter}`);
  };

  return (
    <Page>
      <h1 style={{ fontSize: 23, fontWeight: 800, marginBottom: 2 }}>{greeting}, {user.name.split(" ")[0]} 👋</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>Read chapters → take the level test → unlock the next level</p>
      <StatTiles items={[
        { v: s.courses, l: "Courses", c: "#3b82f6" },
        { v: s.levels_passed, l: "Levels passed", c: "#22c55e" },
        { v: `${s.average_score}%`, l: "Average score", c: "#a78bfa" },
        { v: s.tests_taken, l: "Tests taken", c: "#f59e0b" },
      ]} />

      <h2 className="sec-h">🤖 Your AI learning path</h2>
      <div className="stack">
        {data.path.map((p) => (
          <div key={p.course.id} className="panel" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 26 }}>{p.course.icon}</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontWeight: 700, fontSize: 13 }}>{p.course.title} · Level {p.level.number}: {p.level.title}</p>
              <p className="small muted" style={{ marginTop: 2 }}>{p.action}</p>
            </div>
            <span className={`badge ${readyBadge(p.readiness.band)}`} title="Predicted chance of passing">{Math.round(p.readiness.probability * 100)}% ready</span>
            <button className={`btn bs ${p.kind === "test" || !hasStarted ? "bp" : "bg"}`} onClick={() => followPath(p)}>
              {p.kind === "test" ? "🎯 Take test" : !hasStarted ? "📖 Start reading" : `📖 Chapter ${p.chapter + 1}`}
            </button>
          </div>
        ))}
        {!data.path.length && <div className="panel small muted">You've completed every course — well done!</div>}
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>Recommendations come from your topic mastery (Bayesian knowledge tracing) and a readiness model trained on test outcomes.</p>

      <h2 className="sec-h">Micro-courses</h2>
      <div className="grid-cards">
        {data.courses.map((c) => {
          const done = c.state === "complete";
          const color = done ? "var(--green)" : c.state === "in progress" ? "var(--amber)" : "var(--dim)";
          return (
            <button key={c.id} className="card" style={{ textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit" }} onClick={() => openCourse(c)}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{c.icon}</div>
              <span className="badge b-cat">{c.category}</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "8px 0 4px" }}>{c.title}</h3>
              <p className="small muted" style={{ marginBottom: 11, lineHeight: 1.5 }}>{c.description}</p>
              <div className="row between small muted" style={{ marginBottom: 5 }}>
                <span>{c.level_count} levels · {c.chapter_count} chapters</span>
                <span style={{ fontWeight: 700, color, textTransform: "capitalize" }}>{c.state}</span>
              </div>
              <Bar value={c.progress} color={done ? "var(--green)" : undefined} />
            </button>
          );
        })}
      </div>
    </Page>
  );
}
