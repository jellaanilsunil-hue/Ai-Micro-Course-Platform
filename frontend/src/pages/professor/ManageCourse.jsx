import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api.js";
import { ConfirmButton, ErrorBox, Loading, Modal, Page, Toast, plural } from "../../components/ui.jsx";

const newChapter = () => ({ title: "", text: "" });
const newQuestion = () => ({ text: "", options: ["", "", "", ""], correct: 0, chapter: 1, topic: "", hint: "", why: "" });

/** Professor: manage one course — its levels, chapters and tests. */
export default function ManageCourse() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [open, setOpen] = useState(false);

  const load = () => api(`/professor/courses/${courseId}`).then((d) => setCourse(d.course)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [courseId]);

  const delLevel = async (lv) => {
    await api(`/professor/levels/${lv.id}`, { method: "DELETE" });
    setToast(`Level ${lv.number} deleted`);
    load();
  };

  if (error) return <Page><ErrorBox error={error} /></Page>;
  if (!course) return <Page><Loading /></Page>;

  return (
    <Page width="narrow">
      <Link className="btn bg bs" to="/professor" style={{ marginBottom: 13 }}>← Professor portal</Link>
      <div className="hero" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 13, flexWrap: "nowrap" }}>
          <span style={{ fontSize: 40 }}>{course.icon}</span>
          <div><span className={`badge ${course.is_published ? "b-ok" : "b-warn"}`}>{course.is_published ? "Published" : "Draft"}</span>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: "5px 0 2px" }}>{course.title}</h1>
            <p className="small" style={{ color: "rgba(255,255,255,.55)" }}>{plural(course.level_count, "level")} · {plural(course.question_count, "question")} · {course.category}</p></div>
        </div>
      </div>
      <div className="row between" style={{ marginBottom: 12 }}><h2 style={{ fontSize: 16, fontWeight: 700 }}>Levels & tests</h2><button className="btn bp bs" onClick={() => setOpen(true)}>+ Add level</button></div>

      {course.levels.map((lv) => (
        <div className="lvl" key={lv.id}>
          <div className="row" style={{ gap: 11, flexWrap: "nowrap" }}>
            <div className="ch-num" style={{ background: "rgba(59,130,246,.15)", color: "#3b82f6" }}>{lv.number}</div>
            <div style={{ flex: 1, minWidth: 0 }}><h3 style={{ fontSize: 14, fontWeight: 700 }}>Level {lv.number}: {lv.title}</h3>
              <p className="small muted">{plural(lv.chapter_count, "chapter")} · {plural(lv.question_count, "question")} · Pass {lv.pass_mark}%</p></div>
            <ConfirmButton confirmLabel="Click again to delete" onConfirm={() => delLevel(lv)}>Delete</ConfirmButton>
          </div>
          <details style={{ marginTop: 10 }}>
            <summary className="small" style={{ cursor: "pointer", color: "var(--sky)" }}>View chapters & questions</summary>
            <div style={{ marginTop: 8 }}>
              <p className="lbl">Chapters</p>
              <p className="small muted" style={{ marginBottom: 8 }}>{lv.chapters.map((c, j) => `${j + 1}. ${c.title}`).join(" · ")}</p>
              <p className="lbl">Questions</p>
              {lv.questions.map((q, j) => (
                <div key={q.id} className="small" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ whiteSpace: "pre-wrap" }}>{j + 1}. {q.text}</span>
                  <div className="tiny muted">Answer: <b style={{ color: "var(--green-2)" }}>{q.answer}</b> · {q.topic} · {plural(q.hints.length, "hint")} · Chapter {q.chapter + 1}</div>
                </div>
              ))}
            </div>
          </details>
        </div>
      ))}
      {!course.levels.length && <div className="card muted center" style={{ padding: 32 }}>No levels yet — add the first one. Students see the course once you publish it.</div>}

      <AddLevel open={open} onClose={() => setOpen(false)} courseId={course.id} onSaved={() => { setOpen(false); setToast("Level saved"); load(); }} />
      <Toast text={toast} onDone={() => setToast("")} />
    </Page>
  );
}

function AddLevel({ open, onClose, courseId, onSaved }) {
  const [f, setF] = useState({ title: "", pass_mark: 60, tip: "" });
  const [chapters, setChapters] = useState([newChapter()]);
  const [questions, setQuestions] = useState([newQuestion(), newQuestion(), newQuestion()]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) { setF({ title: "", pass_mark: 60, tip: "" }); setChapters([newChapter()]); setQuestions([newQuestion(), newQuestion(), newQuestion()]); setErr(""); }
  }, [open]);

  const setCh = (i, k, v) => setChapters(chapters.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const setQ = (i, k, v) => setQuestions(questions.map((q, j) => (j === i ? { ...q, [k]: v } : q)));
  const setOpt = (i, o, v) => setQuestions(questions.map((q, j) => (j === i ? { ...q, options: q.options.map((x, n) => (n === o ? v : x)) } : q)));

  const save = async () => {
    setErr("");
    const chs = chapters.filter((c) => c.title.trim() || c.text.trim());
    const qs = questions.filter((q) => q.text.trim());
    if (!f.title.trim()) return setErr("Enter a level title.");
    if (!chs.length) return setErr("Add at least one chapter so students have something to read.");
    if (!qs.length) return setErr("Add at least one question.");
    try {
      await api(`/professor/courses/${courseId}/levels`, {
        method: "POST",
        body: {
          title: f.title, pass_mark: Number(f.pass_mark), tip: f.tip, chapters: chs,
          questions: qs.map((q) => ({
            text: q.text, options: q.options.map((o) => o.trim()), answer: q.options[q.correct].trim(), chapter: Number(q.chapter) - 1,
            topic: q.topic || f.title, hints: q.hint ? [q.hint] : [], explanation: q.why || `Review ${chs[Math.max(0, Number(q.chapter) - 1)]?.title || "the chapters"}.`, difficulty: 2,
          })),
        },
      });
      onSaved();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} wide label="Add level">
      <div className="mdl-h"><h2 style={{ fontSize: 16, fontWeight: 700 }}>Add level</h2><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="field" style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 9 }}>
        <div><label className="lbl" htmlFor="al-t">Level title *</label><input type="text" id="al-t" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Working with Data" /></div>
        <div><label className="lbl" htmlFor="al-pm">Pass mark %</label><input type="number" id="al-pm" min={0} max={100} value={f.pass_mark} onChange={(e) => setF({ ...f, pass_mark: e.target.value })} /></div>
      </div>
      <div className="field"><label className="lbl" htmlFor="al-tip">Revision tip shown during the test</label><input type="text" id="al-tip" value={f.tip} onChange={(e) => setF({ ...f, tip: e.target.value })} placeholder="e.g. Focus on chapter 2 — reading CSV files" /></div>

      <p className="lbl" style={{ marginTop: 6 }}>Chapters</p>
      {chapters.map((c, i) => (
        <div className="qform" key={i}>
          <p className="small" style={{ fontWeight: 700, color: "var(--sky)", marginBottom: 8 }}>Chapter {i + 1}</p>
          <input type="text" value={c.title} onChange={(e) => setCh(i, "title", e.target.value)} placeholder="Chapter title" style={{ marginBottom: 6 }} aria-label={`Chapter ${i + 1} title`} />
          <textarea rows={4} value={c.text} onChange={(e) => setCh(i, "text", e.target.value)} placeholder="Chapter text. Separate paragraphs with a blank line. Start a paragraph with 4 spaces to show it as code." aria-label={`Chapter ${i + 1} text`} />
        </div>
      ))}
      <button className="btn bg bs" onClick={() => setChapters([...chapters, newChapter()])} style={{ marginBottom: 14 }}>+ Add chapter</button>

      <p className="lbl">Test questions</p>
      {questions.map((q, i) => (
        <div className="qform" key={i}>
          <p className="small" style={{ fontWeight: 700, color: "var(--sky)", marginBottom: 8 }}>Question {i + 1}</p>
          <input type="text" value={q.text} onChange={(e) => setQ(i, "text", e.target.value)} placeholder="Question text" style={{ marginBottom: 8 }} aria-label={`Question ${i + 1} text`} />
          <div className="g2" style={{ marginBottom: 8 }}>
            {q.options.map((o, n) => <input key={n} type="text" value={o} onChange={(e) => setOpt(i, n, e.target.value)} placeholder={`Option ${"ABCD"[n]}`} aria-label={`Option ${"ABCD"[n]}`} />)}
          </div>
          <div className="g2" style={{ marginBottom: 8 }}>
            <label className="small muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>Correct
              <select value={q.correct} onChange={(e) => setQ(i, "correct", Number(e.target.value))}>{"ABCD".split("").map((L, n) => <option key={L} value={n}>{L}</option>)}</select></label>
            <label className="small muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>Chapter
              <input type="number" min={1} max={chapters.length} value={q.chapter} onChange={(e) => setQ(i, "chapter", e.target.value)} style={{ padding: "6px 8px" }} /></label>
          </div>
          <div className="g2">
            <input type="text" value={q.topic} onChange={(e) => setQ(i, "topic", e.target.value)} placeholder="Topic (e.g. Loops)" aria-label="Topic" />
            <input type="text" value={q.hint} onChange={(e) => setQ(i, "hint", e.target.value)} placeholder="Hint for the tutor" aria-label="Hint" />
          </div>
          <input type="text" value={q.why} onChange={(e) => setQ(i, "why", e.target.value)} placeholder="Concept explanation (shown after marking — don't include the answer)" style={{ marginTop: 6 }} aria-label="Explanation" />
        </div>
      ))}
      <button className="btn bg bs" onClick={() => setQuestions([...questions, newQuestion()])} style={{ marginBottom: 12 }}>+ Add question</button>
      <p className="err">{err}</p>
      <div className="row"><button className="btn bg" style={{ flex: 1 }} onClick={onClose}>Cancel</button><button className="btn bp" style={{ flex: 1 }} onClick={save}>Save level</button></div>
    </Modal>
  );
}
