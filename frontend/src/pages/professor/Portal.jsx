import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api.js";
import { ErrorBox, Loading, Modal, Page, StatTiles, plural } from "../../components/ui.jsx";

const ICONS = ["🐍", "🧮", "🤖", "📊", "💻", "📈", "🧠", "⚙️", "🔐", "🌐", "📚", "🚀"];

export default function Portal() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", category: "", description: "", icon: "🐍" });
  const [formErr, setFormErr] = useState("");

  const load = () => api("/professor/overview").then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const togglePublish = async (c) => {
    setNotice("");
    try {
      await api(`/professor/courses/${c.id}`, { method: "PUT", body: { is_published: !c.is_published } });
      load();
    } catch (e) {
      setNotice(e.message);
    }
  };
  const create = async () => {
    if (!form.title.trim() || !form.category.trim()) return setFormErr("Enter a title and a category.");
    try {
      const r = await api("/professor/courses", { method: "POST", body: form });
      nav(`/professor/courses/${r.course.id}`);
    } catch (e) {
      setFormErr(e.message);
    }
  };

  if (error) return <Page><ErrorBox error={error} /></Page>;
  if (!data) return <Page><Loading /></Page>;
  const s = data.stats;

  return (
    <Page>
      <div className="row between" style={{ marginBottom: 20 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>Welcome, {data.user.name}</h1><p className="muted" style={{ fontSize: 14 }}>{data.user.department || "University of Chester"} · EduAI Micro-Courses</p></div>
        <div className="row"><Link className="btn bs bv" to="/professor/analytics">📈 Analytics</Link>
          <button className="btn bp bs" onClick={() => { setForm({ title: "", category: "", description: "", icon: "🐍" }); setFormErr(""); setOpen(true); }}>+ New course</button></div>
      </div>
      <StatTiles items={[
        { v: s.courses, l: "My courses", c: "#3b82f6" },
        { v: s.published, l: "Published", c: "#22c55e" },
        { v: s.levels, l: "Levels", c: "#a78bfa" },
        { v: s.learners, l: "Active learners", c: "#f59e0b" },
      ]} />
      {s.at_risk > 0 && (
        <div className="note red" style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span>⚠ <b>{plural(s.at_risk, "learner")}</b> predicted at risk of failing their current level (readiness under 40% after an attempt).</span>
          <Link className="btn bs br" to="/professor/analytics">See who →</Link>
        </div>
      )}
      {notice && <div className="note amber" style={{ marginTop: 14 }}>{notice}</div>}

      <h2 className="sec-h">My courses</h2>
      <div className="grid-cards">
        {data.courses.map((c) => (
          <div className="card" key={c.id}>
            <div className="row between" style={{ marginBottom: 8, alignItems: "flex-start" }}><span style={{ fontSize: 30 }}>{c.icon}</span><span className={`badge ${c.is_published ? "b-ok" : "b-warn"}`}>{c.is_published ? "Published" : "Draft"}</span></div>
            <span className="badge b-cat">{c.category}</span>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "7px 0 3px" }}>{c.title}</h3>
            <p className="small muted" style={{ marginBottom: 10 }}>{plural(c.level_count, "level")} · {plural(c.question_count, "question")} · {plural(c.learners, "learner")}</p>
            <div className="row">
              <Link className="btn bo bs" style={{ flex: 1 }} to={`/professor/courses/${c.id}`}>Manage</Link>
              <button className={`btn bs ${c.is_published ? "bg" : "bgr"}`} style={{ flex: 1 }} onClick={() => togglePublish(c)}>{c.is_published ? "Unpublish" : "Publish"}</button>
            </div>
          </div>
        ))}
        {!data.courses.length && <div className="card muted center">No courses yet — create your first one.</div>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} label="Create course">
        <div className="mdl-h"><h2 style={{ fontSize: 16, fontWeight: 700 }}>Create new course</h2><button className="x" onClick={() => setOpen(false)} aria-label="Close">✕</button></div>
        <div className="field"><label className="lbl" htmlFor="nc-t">Title *</label><input type="text" id="nc-t" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Data Analysis with Python" /></div>
        <div className="field"><label className="lbl" htmlFor="nc-c">Category *</label><input type="text" id="nc-c" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Programming, AI Leadership, Business" /></div>
        <div className="field"><label className="lbl" htmlFor="nc-d">Description</label><textarea id="nc-d" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What students will learn…" /></div>
        <div className="field"><span className="lbl">Icon</span>
          <div className="row" style={{ gap: 6 }}>
            {ICONS.map((ic) => (
              <button key={ic} type="button" aria-pressed={form.icon === ic} onClick={() => setForm({ ...form, icon: ic })}
                style={{ width: 40, height: 40, fontSize: 18, border: `2px solid ${form.icon === ic ? "var(--blue)" : "var(--line)"}`, borderRadius: 9, background: form.icon === ic ? "rgba(37,99,235,.15)" : "var(--panel)", cursor: "pointer" }}>{ic}</button>
            ))}
          </div>
        </div>
        <p className="err">{formErr}</p>
        <div className="row"><button className="btn bg" style={{ flex: 1 }} onClick={() => setOpen(false)}>Cancel</button><button className="btn bp" style={{ flex: 1 }} onClick={create}>Create course</button></div>
      </Modal>
    </Page>
  );
}
