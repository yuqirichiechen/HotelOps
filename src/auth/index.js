// Client-side auth: context + provider, useAuth hook, RequireRole route guard,
// and a fetch wrapper that auto-attaches the Authorization header.
//
// Token lives in localStorage as 'hotelops-token'. The provider validates it
// on mount by calling /api/me and pulls the canonical user record.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const TOKEN_KEY = 'hotelops-token';
const API       = process.env.REACT_APP_API_URL || '/api';

// ── apiFetch ────────────────────────────────────────────────────────────────
// Thin wrapper. Returns { ok, status, data }. Body is whatever the caller
// passes (we set Content-Type to JSON when a body is present).

export const apiFetch = async (path, opts = {}) => {
  const token   = localStorage.getItem(TOKEN_KEY);
  const headers = {
    ...(opts.headers || {}),
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token     ? { Authorization: `Bearer ${token}` }   : {}),
  };
  let res, data = null;
  try {
    res = await fetch(`${API}${path}`, { ...opts, headers });
  } catch {
    return { ok: false, status: 0, data: { message: 'Cannot reach server' } };
  }
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, data };
};

// ── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    const { ok, data } = await apiFetch('/me');
    if (ok && data?.success) {
      setUser(data.user);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loginStaff = async (phone, pin) => {
    const { ok, data } = await apiFetch('/auth/staff/login', {
      method: 'POST',
      body:   JSON.stringify({ phone, pin: pin || undefined }),
    });
    if (!ok || !data?.success) {
      return {
        success: false,
        message: data?.message || 'Login failed',
        pin_required: !!data?.pin_required,
      };
    }
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return { success: true, user: data.user };
  };

  const loginAdmin = async (username, password) => {
    const { ok, data } = await apiFetch('/auth/admin/login', {
      method: 'POST',
      body:   JSON.stringify({ username, password }),
    });
    if (!ok || !data?.success) {
      return { success: false, message: data?.message || 'Login failed' };
    }
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return { success: true, user: data.user };
  };

  const logout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  const setPin = async (pin) => {
    const { ok, data } = await apiFetch('/auth/staff/set-pin', {
      method: 'POST',
      body:   JSON.stringify({ pin }),
    });
    if (ok && data?.success) {
      await refresh(); // clears pin_must_set
      return { success: true };
    }
    return { success: false, message: data?.message || 'Could not set PIN' };
  };

  const value = { user, loading, loginStaff, loginAdmin, logout, setPin, refresh };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

// ── RequireRole ─────────────────────────────────────────────────────────────
// Usage:
//   <Route element={<RequireRole role="staff" />}> ... </Route>
//   <Route element={<RequireRole role="admin" />}> ... </Route>
//
// Accepts a single role string:
//   "staff" — any non-admin authed user (employee | front_desk)
//   "admin" — admin only
//   "any"   — just authed

export const RequireRole = ({ role = 'any', children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!user) {
    const target = role === 'admin' ? '/login/admin' : '/login/staff';
    return <Navigate to={target} replace state={{ from: location }} />;
  }

  const isAdmin = user.role === 'admin';
  const ok =
    role === 'any' ||
    (role === 'admin' && isAdmin) ||
    (role === 'staff' && !isAdmin);

  if (!ok) {
    return <Navigate to={isAdmin ? '/admin' : '/'} replace />;
  }

  return children;
};

// ── RedirectIfAuthed ────────────────────────────────────────────────────────
// Wraps a login page so already-authed users don't see it.

export const RedirectIfAuthed = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  return children;
};
