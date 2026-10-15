import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Modal } from "../components/ui.jsx";

/** Administrator enters a pending professor's email and 6-digit code to approve the account. */
export default function AdminApproval({ open, onClose, initialEmail = "", initialCode = "", onApproved }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialCode);
  const [msg, setMsg] = useState({ text: "", kind: "" });
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) { setEmail(initialEmail); setCode(initialCode); setMsg({ text: "", kind: "" }); setDone(false); }
  }, [open, initialEmail, initialCode]);

  const approve = async () => {
    if (!email.trim() || !/^\d{6}$/.test(code)) return setMsg({ text: "Enter the email and the 6-digit code.", kind: "" });
    try {
      const r = await api("/auth/approve", { method: "POST", body: { email, code } });
      setMsg({ text: `✅ ${r.message}`, kind: "good" });
      setDone(true);
      onApproved?.(email);
    } catch (e) {
      setMsg({ text: e.message, kind: "" });
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="Approve professor">
      <div className="mdl-h">
        <div><h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>🔐 Admin — approve professor</h2><p className="small muted">Enter the professor's email and 6-digit code</p></div>
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="field"><label className="lbl" htmlFor="ap-email">Professor email</label><input type="email" id="ap-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@chester.ac.uk" /></div>
      <div className="field"><label className="lbl" htmlFor="ap-code">6-digit code</label>
        <input type="text" id="ap-code" inputMode="numeric" maxLength={6} value={code} placeholder="123456"
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && approve()}
          style={{ fontSize: 22, fontWeight: 800, letterSpacing: 8, textAlign: "center", fontFamily: "var(--mono)" }} /></div>
      <p className={`err ${msg.kind}`}>{msg.text}</p>
      <div className="row"><button className="btn bg" style={{ flex: 1 }} onClick={onClose}>{done ? "Close" : "Cancel"}</button>
        <button className="btn bp" style={{ flex: 1 }} onClick={approve} disabled={done}>{done ? "Approved" : "Approve professor"}</button></div>
    </Modal>
  );
}
