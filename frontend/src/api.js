// Thin wrapper around fetch: adds the login token and turns API errors into thrown Errors.
const BASE = import.meta.env.VITE_API_URL || "";

let token = null;
export function setToken(t) {
  token = t;
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const OFFLINE = "Can't reach the backend server. Make sure the \"EduAI backend (Flask)\" window is open and shows \"Running on http://127.0.0.1:5000\".";
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(OFFLINE);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  // The Vite dev proxy answers 500/502/504 with no JSON body when Flask isn't running
  if (!data && res.status >= 500) throw new Error(OFFLINE);
  data = data || {};
  if (res.status === 401 && token && path !== "/auth/login") {
    window.dispatchEvent(new Event("session-expired"));
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
