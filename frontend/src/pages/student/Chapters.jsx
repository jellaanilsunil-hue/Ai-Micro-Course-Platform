import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api.js";
import { ChapterBody, ErrorBox, Loading, Page, Readiness } from "../../components/ui.jsx";

/** Chapter reader: tabs across the top, one chapter at a time, test button after the last chapter. */
export default function Chapters() {
  const { levelId } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [level, setLevel] = useState(null);
  const [error, setError] = useState("");
  const [read, setRead] = useState(() => new Set());
  const i = Math.max(0, parseInt(params.get("ch") || "0", 10) || 0);

  useEffect(() => { api(`/levels/${levelId}`).then((d) => setLevel(d.level)).catch((e) => setError(e.message)); }, [levelId]);
  useEffect(() => { setRead((r) => new Set(r).add(i)); window.scrollTo(0, 0); }, [i]);

  if (error) return <Page><ErrorBox error={error} /></Page>;
  if (!level) return <Page><Loading /></Page>;

  const chapters = level.chapters;
  const idx = Math.min(i, chapters.length - 1);
  const ch = chapters[idx];
  const last = idx === chapters.length - 1;
  const go = (n) => setParams({ ch: String(n) });

  return (
    <Page width="" >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <Link className="btn bg bs" to={`/student/courses/${level.course.id}`}>← Levels</Link>
          <span className="small muted">{level.course.title} · Level {level.number}: {level.title}</span>
        </div>
        <div className="tabs" role="tablist">
          {chapters.map((c, j) => (
            <button key={j} role="tab" aria-selected={j === idx} className={`tab ${j === idx ? "on" : ""} ${read.has(j) && j !== idx ? "read" : ""}`} onClick={() => go(j)}>
              {j + 1}. {c.title}
            </button>
          ))}
        </div>
        <article className="card chap" style={{ marginBottom: 16, minHeight: 300, padding: "22px 24px" }}>
          <p className="lbl" style={{ color: "var(--sky)" }}>Chapter {idx + 1} of {chapters.length}</p>
          <h2>{ch.title}</h2>
          <ChapterBody blocks={ch.blocks} />
        </article>
        <div className="row between">
          <button className="btn bg bs" style={{ visibility: idx === 0 ? "hidden" : "visible" }} onClick={() => go(idx - 1)}>← Previous</button>
          <span className="small muted">{read.size} of {chapters.length} read</span>
          {!last ? <button className="btn bp bs" onClick={() => go(idx + 1)}>Next chapter →</button> : <span style={{ width: 90 }} />}
        </div>
        {last && (
          <div style={{ marginTop: 18 }}>
            <div className="hero center" style={{ border: "1px solid rgba(59,130,246,.3)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Ready to test your knowledge?</h3>
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>You've reached the last chapter of this level.</p>
              <div style={{ maxWidth: 420, margin: "0 auto 14px", textAlign: "left" }}><Readiness r={level.readiness} /></div>
              <button className="btn bp" style={{ padding: "11px 28px" }} onClick={() => nav(`/student/levels/${level.id}/test`)}>Start level test →</button>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
