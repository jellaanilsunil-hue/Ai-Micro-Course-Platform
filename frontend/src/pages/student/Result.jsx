import { Link } from "react-router-dom";
import { MasteryRow, Page, Readiness } from "../../components/ui.jsx";

/** Result screen after a test is marked. */
export default function Result({ result: r, onRetry }) {
  const passed = r.passed;
  const course = r.course;
  const level = r.level;
  const icon = passed ? (r.course_completed ? "🎓" : "🎉") : r.accuracy >= r.pass_mark - 15 ? "💪" : "📚";

  return (
    <Page width="xnarrow">
      <div className="card center">
        <div style={{ fontSize: 52, marginBottom: 6 }}>{icon}</div>
        <h2 style={{ fontSize: 21, fontWeight: 800, marginBottom: 3 }}>{passed ? "Level passed!" : "Keep practising!"}</h2>
        <div style={{ fontSize: 48, fontWeight: 900, margin: "6px 0", color: passed ? "var(--green)" : "var(--red)", fontVariantNumeric: "tabular-nums" }}>{Math.round(r.accuracy)}%</div>
        <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>{r.correct} of {r.total} correct · pass mark {r.pass_mark}% · {r.attempt.hints_used} hint{r.attempt.hints_used === 1 ? "" : "s"} used</p>
        <div style={{ maxWidth: 280, margin: "0 auto 16px" }}><div className="bar"><div className="fill" style={{ width: `${r.accuracy}%`, background: passed ? "var(--green)" : "var(--red)" }} /></div></div>
        <div className={`note ${passed ? "green" : "red"}`} style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
          {passed ? (r.next_level ? `✓ Level ${r.next_level.number}: "${r.next_level.title}" is now unlocked!` : `🎓 Course complete — all levels mastered!`)
            : `✗ You need ${r.pass_mark}% to pass. Re-read the chapters below, then retry.`}
        </div>

        <div className="panel" style={{ textAlign: "left", marginBottom: 16 }}>
          <p className="lbl" style={{ color: "var(--lav)" }}>🤖 AI recommendation</p>
          {r.recommendation ? <Readiness r={r.recommendation} label={passed ? `Readiness for Level ${r.recommendation_for}` : "Readiness for your retake"} />
            : <p className="small">You have finished every level in this course.</p>}
          {r.weak_chapters.length > 0 && (
            <>
              <p className="small" style={{ margin: "10px 0 6px" }}>Re-read these chapters — they cover the questions you missed:</p>
              <div className="row">
                {r.weak_chapters.map((c) => <Link key={c.index} className="btn bg bs" to={`/student/levels/${level.id}/chapters?ch=${c.index}`}>📖 Ch {c.index + 1}: {c.title}</Link>)}
              </div>
            </>
          )}
          <p className="small" style={{ margin: "12px 0 6px" }}>Topic mastery after this test</p>
          {r.mastery.map((m) => <MasteryRow key={m.topic} topic={m.topic} p={m.p_know} labelText={m.label} />)}
        </div>

        <div style={{ textAlign: "left", marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Answer breakdown</p>
          {!passed && <p className="tiny muted" style={{ marginBottom: 8 }}>Correct answers are revealed once you pass, so your retake still tests real understanding.</p>}
          {r.feedback.map((f, i) => (
            <div key={f.question_id} className={`note ${f.correct ? "green" : "red"}`} style={{ marginBottom: 6, color: "inherit" }}>
              <p className="small" style={{ fontWeight: 700, color: f.correct ? "var(--green-2)" : "var(--red-2)" }}>Q{i + 1}: {f.correct ? "Correct" : "Incorrect"} · {f.topic}</p>
              <p className="small" style={{ color: "#a5b4c8", whiteSpace: "pre-wrap" }}>{f.text}</p>
              <p className="tiny muted" style={{ marginTop: 3 }}>Your answer: {f.your_answer || "—"}{passed && !f.correct ? ` · Correct: ${f.correct_answer}` : ""}</p>
              {!f.correct && f.explanation && <p className="tiny" style={{ color: "#a5b4c8", marginTop: 3 }}>{f.explanation} 📖 Chapter {f.chapter + 1}</p>}
            </div>
          ))}
        </div>

        <div className="row" style={{ justifyContent: "center" }}>
          {passed ? (
            <>
              {r.next_level && <Link className="btn bp bs" to={`/student/levels/${r.next_level.id}/chapters`}>Start Level {r.next_level.number} →</Link>}
              {r.course_completed && <Link className="btn bs bv" to={`/student/courses/${course.id}/certificate`}>🎓 View certificate</Link>}
              <Link className="btn bg bs" to={`/student/courses/${course.id}`}>Back to course</Link>
              <Link className="btn bgr bs" to="/student">🏠 Dashboard</Link>
            </>
          ) : (
            <>
              <button className="btn bo bs" onClick={onRetry}>Retry test</button>
              <Link className="btn bg bs" to={`/student/levels/${level.id}/chapters`}>Re-read chapters</Link>
              <Link className="btn bp bs" to={`/student/courses/${course.id}`}>Back to course</Link>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
