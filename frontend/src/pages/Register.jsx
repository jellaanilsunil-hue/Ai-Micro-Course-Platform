import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { homePath, useAuth } from "../auth.jsx";
import HelpChat from "../components/HelpChat.jsx";
import { Modal } from "../components/ui.jsx";

const STRENGTH = [["Weak", "#ef4444"], ["Fair", "#f59e0b"], ["Good", "#3b82f6"], ["Strong", "#22c55e"]];
function strength(pw) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return s;
}

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState("student");
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "", student_id: "", department: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // professor awaiting approval
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const s = strength(f.password);

  const submit = async () => {
    setErr("");
    if (f.name.trim().length < 2) return setErr("Enter your full name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return setErr("Enter a valid email address.");
    if (f.password.length < 6) return setErr("Password must be at least 6 characters.");
    if (f.password !== f.confirm) return setErr("The two passwords don't match.");
    if (role === "professor" && !f.department.trim()) return setErr("Enter your department.");
    setBusy(true);
    try {
      const res = await register({ name: f.name.trim(), email: f.email.trim(), password: f.password, role, student_id: f.student_id, department: f.department });
      if (!res.pending) nav(homePath(res.user));
      else setPending({ name: f.name.trim(), email: f.email.trim().toLowerCase(), code: res.approval_code });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const onEnter = (e) => e.key === "Enter" && submit();

  return (
    <section className="pg on" aria-label="Register">
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "30px 16px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <Link to="/" className="logo" style={{ textDecoration: "none" }}><div className="lb">🎓</div><b>EduAI · University of Chester</b></Link>
          <h1 style={{ fontSize: 21, fontWeight: 800, margin: "16px 0 3px" }}>Create your account</h1>
          <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>Join the adaptive micro-course platform</p>
          <div className="seg" role="group" aria-label="Role">
            <button className={role === "student" ? "on" : ""} onClick={() => setRole("student")}>Student</button>
            <button className={role === "professor" ? "on" : ""} onClick={() => setRole("professor")}>Professor</button>
          </div>
          <div className="card">
            <div className="field"><label className="lbl" htmlFor="r-nm">Full name *</label><input type="text" id="r-nm" value={f.name} onChange={set("name")} onKeyDown={onEnter} placeholder="e.g. Alice Johnson" autoComplete="name" /></div>
            <div className="field"><label className="lbl" htmlFor="r-em">Email *</label><input type="email" id="r-em" value={f.email} onChange={set("email")} onKeyDown={onEnter} placeholder="you@chester.ac.uk" autoComplete="email" /></div>
            <div className="g2 field">
              <div><label className="lbl" htmlFor="r-pw">Password *</label><input type="password" id="r-pw" value={f.password} onChange={set("password")} onKeyDown={onEnter} placeholder="Min 6 characters" autoComplete="new-password" /></div>
              <div><label className="lbl" htmlFor="r-pw2">Confirm *</label><input type="password" id="r-pw2" value={f.confirm} onChange={set("confirm")} onKeyDown={onEnter} placeholder="Repeat" autoComplete="new-password" /></div>
            </div>
            {f.password && (
              <div style={{ marginBottom: 10 }}>
                <div className="row" style={{ gap: 3, flexWrap: "nowrap" }}>
                  {[0, 1, 2, 3].map((i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < s ? STRENGTH[s - 1][1] : "rgba(255,255,255,.08)" }} />)}
                </div>
                <span className="tiny" style={{ fontWeight: 700, color: s ? STRENGTH[s - 1][1] : "var(--dim)" }}>{s ? STRENGTH[s - 1][0] : ""}</span>
              </div>
            )}
            <div className="field">
              {role === "student" ? (
                <><label className="lbl" htmlFor="r-sid">Student ID</label><input type="text" id="r-sid" value={f.student_id} onChange={set("student_id")} onKeyDown={onEnter} placeholder="e.g. STU2026001" /></>
              ) : (
                <><label className="lbl" htmlFor="r-dept">Department *</label><input type="text" id="r-dept" value={f.department} onChange={set("department")} onKeyDown={onEnter} placeholder="e.g. Computer Science" /></>
              )}
            </div>
            <p className="err" role="alert">{err}</p>
            <button className="btn bp wide" type="button" onClick={submit} disabled={busy}>{busy ? "Creating account…" : role === "student" ? "Create student account" : "Create professor account"}</button>
          </div>
          <p style={{ textAlign: "center", marginTop: 12, fontSize: 13 }} className="muted">Have an account? <Link className="linkish" to="/">Sign in</Link></p>
        </div>
      </div>
      <HelpChat context="register" />

      <Modal open={!!pending} onClose={() => nav("/", { state: { role: "professor", email: pending.email, notice: "Professor account created. It can sign in once an administrator approves it." } })} label="Professor approval code">
        {pending && (
          <>
            <div style={{ textAlign: "center", marginBottom: 18 }}><div style={{ fontSize: 40, marginBottom: 6 }}>📧</div><h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Professor account pending</h2><p className="small muted">Give this code to your administrator so they can approve your account</p></div>
            <div className="panel" style={{ marginBottom: 14 }}>
              <p className="lbl">Professor</p><p style={{ fontWeight: 600, marginBottom: 10 }}>{pending.name}</p>
              <p className="lbl">Email</p><p style={{ color: "var(--sky)", marginBottom: 12 }}>{pending.email}</p>
              <p className="lbl">Admin verification code</p>
              <div style={{ background: "linear-gradient(135deg,#1e3a8a,#4c1d95)", borderRadius: 10, padding: 14, textAlign: "center" }}><p style={{ fontSize: 34, fontWeight: 900, letterSpacing: 10, color: "#fff", fontFamily: "var(--mono)" }}>{pending.code || "emailed"}</p></div>
            </div>
            <div className="note amber" style={{ marginBottom: 14 }}>In production this code is emailed to the administrator automatically. For the prototype it is shown here.</div>
            <div className="row">
              <button className="btn bg" style={{ flex: 1 }} onClick={() => nav("/", { state: { role: "professor", email: pending.email, notice: "Professor account created. It can sign in once an administrator approves it." } })}>Back to sign in</button>
              <button className="btn bp" style={{ flex: 1 }} onClick={() => nav("/", { state: { role: "professor", email: pending.email, approveCode: pending.code } })}>Approve as admin now</button>
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}
