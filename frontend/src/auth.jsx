import { createContext, useContext, useEffect, useState } from "react";
import { api, setToken } from "./api.js";

// Keeps the signed-in user. The token is kept in localStorage so a refresh keeps you signed in.
const AuthContext = createContext(null);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const t = store.get("eduai.token");
    if (!t) return null;
    setToken(t);
    try { return JSON.parse(store.get("eduai.user")); } catch { return null; }
  });

  const signIn = ({ token, user }) => {
    setToken(token);
    store.set("eduai.token", token);
    store.set("eduai.user", JSON.stringify(user));
    setUser(user);
    return user;
  };
  const logout = () => {
    setToken(null);
    store.del("eduai.token");
    store.del("eduai.user");
    setUser(null);
  };

  useEffect(() => {
    window.addEventListener("session-expired", logout);
    return () => window.removeEventListener("session-expired", logout);
  }, []);

  const login = async (email, password, role) => signIn(await api("/auth/login", { method: "POST", body: { email, password, role } }));
  const register = async (payload) => {
    const res = await api("/auth/register", { method: "POST", body: payload });
    return res.token ? { user: signIn(res) } : res; // professors get { pending, approval_code }
  };

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const homePath = (user) => (!user ? "/" : user.role === "professor" ? "/professor" : "/student");
