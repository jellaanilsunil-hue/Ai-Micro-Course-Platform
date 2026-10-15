import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api.js";
import { Bar, ErrorBox, Loading, Page, readyBadge } from "../../components/ui.jsx";

export default function CoursePage() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        let c = (await api(`/courses/${courseId}`)).course;
        if (!c.enrolled) { // opening a course enrols the student, as in the EduAI design
          await api(`/courses/${courseId}/enroll`, { method: "POST" });
          c = (await api(`/courses/${courseId}`)).course;
        }
        setCourse(c);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [courseId]);

  if (error) return <Page><ErrorBox error={error} /></Page>;
  if (!course) return <Page><Loading /></Page>;

  return (
    <Page width="narrow">
      <Link className="btn bg bs" to="/student" style={{ marginBottom: 14 }}>← All courses</Link>
      <div className="hero" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 15, flexWrap: "nowrap" }}>
          <span style={{ fontSize: 44 }}>{course.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="badge" style={{ background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.75)" }}>{course.category}</span>
            <h1 style={{ fontSize: 19, fontWeight: 800, margin: "6px 0 3px" }}>{course.title}</h1>
            <p style={{ color: "rgba(255,255,255,.6)", fontSize: 13, marginBottom: 10 }}>{course.description}</p>
            <div className="row">
              <span className="small" style={{ color: "rgba(255,255,255,.65)" }}>{course.levels_passed}/{course.level_count} levels passed</span>
              <div style={{ flex: 1, maxWidth: 170 }}><Bar value={course.progress} color="rgba(255,255,255,.55)" /></div>
              {course.state === "complete" && <Link className="btn bs bv" to={`/student/courses/${course.id}/certificate`}>🎓 Certificate</Link>}
            </div>
          </div>
        </div>
      </div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Course levels</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Read the chapters, then pass the test to unlock the next level. The AI readiness score predicts your chance of passing.</p>

      {course.levels.map((lv) => {
        const passed = lv.status === "passed";
        const locked = lv.status === "locked";
        const circle = passed ? ["rgba(34,197,94,.15)", "#22c55e", "✓"] : locked ? ["rgba(255,255,255,.04)", "#475569", "🔒"] : ["rgba(59,130,246,.15)", "#3b82f6", lv.number];
        return (
          <div key={lv.id} className={`lvl ${passed ? "passed" : locked ? "locked" : ""}`}>
            <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
              <div className="ch-num" style={{ background: circle[0], color: circle[1] }}>{circle[2]}</div>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ marginBottom: 3 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700 }}>Level {lv.number}: {lv.title}</h3>
                  {passed ? <span className="badge b-ok">Passed</span> : lv.attempts ? <span className="badge b-warn">Attempted</span> : null}
                </div>
                <p className="small muted">{lv.chapter_count} chapters · {lv.question_count} questions · Pass mark {lv.pass_mark}%{lv.best_accuracy != null && ` · Best ${Math.round(lv.best_accuracy)}%`}</p>
              </div>
            </div>
            <div style={{ marginTop: 11 }}>
              {locked ? (
                <span className="small" style={{ color: "#475569" }}>🔒 Pass the previous level to unlock</span>
              ) : (
                <div className="row">
                  <Link className="btn bg bs" to={`/student/levels/${lv.id}/chapters`}>📖 Read chapters</Link>
                  <Link className={`btn bs ${passed ? "bg" : "bp"}`} to={`/student/levels/${lv.id}/test`}>{passed ? "Retake test" : lv.attempts ? "Retry test" : "Take test"}</Link>
                  {lv.readiness && <span className={`badge ${readyBadge(lv.readiness.band)}`}>🤖 {Math.round(lv.readiness.probability * 100)}% ready</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {!course.levels.length && <div className="card muted center">No levels yet.</div>}
    </Page>
  );
}
