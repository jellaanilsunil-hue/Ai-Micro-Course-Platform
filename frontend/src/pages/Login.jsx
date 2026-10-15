import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { homePath, useAuth } from "../auth.jsx";
import HelpChat from "../components/HelpChat.jsx";
import AdminApproval from "./AdminApproval.jsx";

const FEATURES = [
  ["📖", "Chapter-by-chapter learning", "Short readings with worked examples"],
  ["🎯", "Level-gated tests", "Reach the pass mark to unlock the next level"],
  ["🤖", "AI tutor", "Graded hints that never give the answer away"],
  ["📈", "Adaptive learning path", "Knowledge tracing + a readiness model guide what to do next"],
];

export function Brand() {
  return (
    <div className="row" style={{ marginBottom: 38, gap: 10 }}>
      <div className="lb" style={{ width: 40, height: 40, fontSize: 18 }}>🎓</div>
      <div><p style={{ fontWeight: 800, fontSize: 17 }}>EduAI Micro-Courses</p><p className="tiny muted">University of Chester</p></div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState(location.state?.role || "student");
  const [email, setEmail] = useState(location.state?.email || "");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState({ text: location.state?.notice || "", kind: location.state?.notice ? "warn" : "" });
  const [busy, setBusy] = useState(false);
  const [adminOpen, setAdminOpen] = useState(!!location.state?.approveCode);

  const fill = (e, p, r) => { setRole(r); setEmail(e); setPassword(p); setMsg({ text: "", kind: "" }); };

  const submit = async () => {
    if (!email.trim() || !password) return setMsg({ text: "Enter your email and password.", kind: "" });
    setBusy(true);
    try {
      const u = await login(email.trim(), password, role);
      nav(homePath(u));
    } catch (e) {
      setMsg({ text: e.message, kind: e.data?.pending ? "warn" : "" });
    } finally {
      setBusy(false);
    }
  };
  const onEnter = (e) => e.key === "Enter" && submit();

  return (
    <section className="pg on" aria-label="Sign in">
      <div className="login-grid">
        <div className="login-side">
          <Brand />
          <h2 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, marginBottom: 11 }}>Short courses that adapt<br /><span className="grad-text">to how you learn</span></h2>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 26, maxWidth: "46ch" }}>Programming, Algorithmic Thinking, AI Leadership and the Micro MBA. Read → Test → Get AI hints → Level up.</p>
          {FEATURES.map(([e, t, d]) => (
            <div className="feat" key={t}><div className="ic">{e}</div><div><p style={{ color: "var(--ink-2)", fontWeight: 700, fontSize: 13 }}>{t}</p><p className="tiny muted">{d}</p></div></div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "30px 16px" }}>
          <div style={{ width: "100%", maxWidth: 360 }}>
            <h1 style={{ fontSize: 21, fontWeight: 800, marginBottom: 3 }}>Sign in</h1>
            <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>Choose your role and enter your details</p>
            <div className="seg" role="group" aria-label="Role">
              <button className={role === "student" ? "on" : ""} onClick={() => setRole("student")}>Student</button>
              <button className={role === "professor" ? "on" : ""} onClick={() => setRole("professor")}>Professor</button>
            </div>
            <div className="field"><label className="lbl" htmlFor="l-em">Email</label><input type="email" id="l-em" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter} placeholder="you@chester.ac.uk" autoComplete="email" /></div>
            <div className="field"><label className="lbl" htmlFor="l-pw">Password</label><input type="password" id="l-pw" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter} placeholder="Enter password" autoComplete="current-password" /></div>
            <p className={`err ${msg.kind}`} role="alert">{msg.text}</p>
            <div className="note green" style={{ marginBottom: 10 }}>🔐 <b>Secure sign-in</b> — passwords are stored hashed on the server and every request carries a signed token. Professors need administrator approval.</div>
            <button className="btn bp wide" style={{ padding: 11 }} type="button" onClick={submit} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            <p style={{ textAlign: "center", marginTop: 12, fontSize: 13 }} className="muted">No account? <Link className="linkish" to="/register">Register</Link></p>
            <div className="note blue" style={{ marginTop: 16 }}>
              <p className="lbl" style={{ color: "var(--sky-2)" }}>Demo accounts</p>
              <div className="row">
                <button className="btn bs" style={{ flex: 1, background: "rgba(59,130,246,.15)", color: "var(--sky-2)" }} onClick={() => fill("alice@chester.ac.uk", "Student123!", "student")}>Student demo</button>
                <button className="btn bs bv" style={{ flex: 1 }} onClick={() => fill("prof.chen@chester.ac.uk", "Prof123!", "professor")}>Professor demo</button>
              </div>
              <p className="tiny" style={{ marginTop: 6, color: "var(--dim)" }}>alice@chester.ac.uk / Student123! · prof.chen@chester.ac.uk / Prof123!</p>
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #1a2540", textAlign: "center" }}>
              <button className="linkish dim" onClick={() => setAdminOpen(true)}>🔐 Admin: approve a professor account</button>
            </div>
          </div>
        </div>
      </div>
      <HelpChat context="login" />
      <AdminApproval open={adminOpen} onClose={() => setAdminOpen(false)} initialEmail={location.state?.email || ""}
        initialCode={location.state?.approveCode || ""} onApproved={(e) => { setRole("professor"); setEmail(e); setMsg({ text: "Professor approved — enter the password to sign in.", kind: "good" }); }} />
    </section>
  );
}
