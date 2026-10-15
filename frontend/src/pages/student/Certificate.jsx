import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api.js";
import { ErrorBox, Loading, Page, fmtDate } from "../../components/ui.jsx";

export default function Certificate() {
  const { courseId } = useParams();
  const [cert, setCert] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api(`/courses/${courseId}/certificate`).then(setCert).catch((e) => setError(e.message)); }, [courseId]);

  if (error) return <Page><ErrorBox error={error} /></Page>;
  if (!cert) return <Page><Loading /></Page>;

  return (
    <Page width="xnarrow">
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div className="cert">
          <div style={{ fontSize: 52, marginBottom: 8, position: "relative" }}>🎓</div>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#818cf8", letterSpacing: 3, marginBottom: 8 }}>UNIVERSITY OF CHESTER</p>
          <p className="small muted" style={{ marginBottom: 16 }}>EduAI Adaptive Micro-Course Platform</p>
          <p className="muted" style={{ fontSize: 13 }}>This certifies that</p>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: "8px 0 6px", letterSpacing: ".5px" }}>{cert.name}</h1>
          <p className="muted" style={{ fontSize: 13 }}>has successfully completed the micro-course</p>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#a5b4fc", margin: "8px 0 20px" }}>{cert.course.icon} {cert.course.title}</h2>
          <div className="row" style={{ justifyContent: "center", gap: 12, marginBottom: 22 }}>
            {cert.levels.map((lv) => (
              <div key={lv.number} className="panel" style={{ padding: "10px 14px", minWidth: 110, background: "rgba(255,255,255,.04)" }}>
                <div>✅</div><div className="tiny" style={{ fontWeight: 700 }}>Level {lv.number}</div><div className="tiny muted">{lv.title}</div>
                <div style={{ fontWeight: 800, color: "var(--green)", marginTop: 3 }}>{Math.round(lv.best)}%</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 18, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {[["Levels completed", `${cert.levels.length}/${cert.levels.length}`], ["Average best score", `${cert.average}%`], ["Date achieved", fmtDate(cert.achieved_at, { day: "numeric", month: "long", year: "numeric" })]].map(([l, v]) => (
              <div key={l}><div style={{ fontSize: 17, fontWeight: 800, color: "#a5b4fc", marginBottom: 3 }}>{v}</div><div className="tiny muted">{l}</div></div>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 18 }}>Certificate ID {cert.certificate_id} · EduAI Adaptive Learning Platform</p>
        </div>
        <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
          <Link className="btn bg" to={`/student/courses/${courseId}`}>Back to course →</Link>
          <Link className="btn bg" to="/student">🏠 Dashboard</Link>
        </div>
      </div>
    </Page>
  );
}
