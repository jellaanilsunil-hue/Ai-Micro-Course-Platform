// Small shared building blocks used across pages.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const initial = (name = "?") => (String(name).replace(/^(Dr|Prof|Professor|Mr|Mrs|Ms)\.?\s+/i, "")[0] || "?").toUpperCase();
export const fmtDate = (iso, opts = { day: "numeric", month: "short" }) => (iso ? new Date(iso).toLocaleDateString("en-GB", opts) : "—");

/** Sticky top bar shown on every signed-in page. */
export function TopNav({ right }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isProf = user?.role === "professor";
  const signOut = () => { logout(); nav("/"); };
  return (
    <nav className="top">
      <Link to={isProf ? "/professor" : "/student"} className="logo" style={{ textDecoration: "none" }}>
        <div className="lb">🎓</div><b>EduAI</b><span className="role-tag">{isProf ? "Professor" : "Student"}</span>
      </Link>
      <div className="nav-r">
        {right}
        {isProf ? (
          <>
            <Link className="btn bg bs" to="/professor">Portal</Link>
            <Link className="btn bs bv" to="/professor/analytics">📈 Analytics</Link>
          </>
        ) : (
          <>
            <Link className="btn bg bs" to="/student">Courses</Link>
            <Link className="btn bs bv" to="/student/progress">📊 My progress</Link>
          </>
        )}
        <Link className="btn bg bs" to="/feedback">⭐ Feedback</Link>
        <span className="small muted who-name">{user?.name}</span>
        <div className="av" aria-hidden="true" style={isProf ? { background: "linear-gradient(135deg,#7c3aed,#db2777)" } : undefined}>{initial(user?.name)}</div>
        <button className="btn br bs" onClick={signOut}>Sign out</button>
      </div>
    </nav>
  );
}

/** Page shell: top nav + centred column. */
export function Page({ width = "", children, navRight }) {
  return (
    <>
      <TopNav right={navRight} />
      <main className={`wrap ${width}`}>{children}</main>
    </>
  );
}

export function Loading() {
  return <div className="page-loading" role="status">Loading…</div>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="error-box" role="alert">{error}</div>;
}

export function StatTiles({ items }) {
  return (
    <div className="grid-stats">
      {items.map((s) => (
        <div className="stat" key={s.l}><div className="v" style={{ color: s.c }}>{s.v}</div><div className="l">{s.l}</div></div>
      ))}
    </div>
  );
}

export function Bar({ value, color }) {
  return <div className="bar"><div className="fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, ...(color ? { background: color } : {}) }} /></div>;
}

/** ML readiness: predicted chance of passing the level. */
export function Readiness({ r, label = "AI readiness — predicted chance of passing" }) {
  if (!r) return null;
  return (
    <div className={`ready r-${r.band}`}>
      <div className="pct">{Math.round(r.probability * 100)}%</div>
      <div><p className="tiny muted">{label}</p><p style={{ fontSize: 13 }}>{r.advice}</p></div>
    </div>
  );
}

export const readyBadge = (band) => (band === "ready" ? "b-ok" : band === "almost" ? "b-warn" : "b-bad");

export function MasteryRow({ topic, p, labelText }) {
  const cls = p >= 0.8 ? "m-mastered" : p >= 0.5 ? "m-developing" : "m-needs";
  const word = labelText || (p >= 0.8 ? "mastered" : p >= 0.5 ? "developing" : "needs work");
  return (
    <div className="mrow">
      <div className="row between"><span>{topic}</span><span className={cls}>{Math.round(p * 100)}% · {word}</span></div>
      <Bar value={p * 100} />
    </div>
  );
}

/** Dialog with a dimmed backdrop; closes on Escape or a click outside. */
export function Modal({ open, onClose, children, wide, label, bare }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="mw on" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`mdl ${wide ? "wide" : ""}`} style={bare ? { padding: 0, overflow: "hidden", maxWidth: 420 } : undefined}>{children}</div>
    </div>
  );
}

/** Two-step button: first click arms it, second click within 4 s runs the action. */
export function ConfirmButton({ onConfirm, children, confirmLabel = "Click again to confirm", className = "btn br bs" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`${className}${armed ? " armed" : ""}`} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmLabel : children}
    </button>
  );
}

export function Toast({ text, onDone }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [text, onDone]);
  return text ? <div className="toast" role="status">{text}</div> : null;
}

/** Minimal Python-style syntax highlighting for code samples (no external library). */
const TOKEN = /(#[^\n]*)|(f?"[^"\n]*"|f?'[^'\n]*')|\b(def|return|if|elif|else|for|while|in|import|from|as|class|try|except|finally|with|break|continue|True|False|None|and|or|not|lambda|yield|pass|raise)\b|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)(?=\()/g;
export function CodeBlock({ code, style }) {
  const parts = [];
  let last = 0;
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code))) {
    if (m.index > last) parts.push(code.slice(last, m.index));
    const cls = m[1] ? "cm" : m[2] ? "st" : m[3] ? "kw" : m[4] ? "nm" : "fn";
    parts.push(<span key={m.index} className={cls}>{m[0]}</span>);
    last = TOKEN.lastIndex;
  }
  parts.push(code.slice(last));
  return <div className="codeblock" style={style}>{parts}</div>;
}

/** Renders a chapter's blocks: ["h"|"p"|"code"|"tip"|"warn"|"ok", text]. */
export function ChapterBody({ blocks = [] }) {
  return blocks.map(([kind, text], i) => {
    if (kind === "h") return <h3 key={i}>{text}</h3>;
    if (kind === "code") return <CodeBlock key={i} code={text} />;
    if (kind === "tip" || kind === "warn" || kind === "ok")
      return <div key={i} className={`callout ${kind}`}>{{ tip: "💡", warn: "⚠", ok: "✓" }[kind]} {text}</div>;
    return <p key={i}>{text}</p>;
  });
}
