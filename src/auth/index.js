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

  if (process.env.NODE_ENV === 'development') {
    // Single-line trace so the network panel and the console agree.
    // eslint-disable-next-line no-console
    console.debug(
      `[apiFetch] ${opts.method || 'GET'} ${path}`,
      'token:', token ? `${token.slice(0, 12)}…` : 'NONE'
    );
  }

  let res, data = null;
  try {
    res = await fetch(`${API}${path}`, { ...opts, headers });
  } catch {
    return { ok: false, status: 0, data: { message: 'Cannot reach server' } };
  }
  try { data = await res.json(); } catch { /* non-JSON */ }

  // 401 means the token is missing/invalid/expired. Clear it and notify
  // anything listening (AuthProvider) so the user gets a clean kick to
  // /login instead of a silent dashboard with cryptic errors.
  if (res.status === 401) {
    if (token) localStorage.removeItem(TOKEN_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:expired', {
        detail: { path, hadToken: !!token },
      }));
    }
  }

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

  // If any apiFetch elsewhere hits 401 (stale/missing/expired token), it
  // dispatches 'auth:expired'. We clear local user state so RequireRole
  // bounces the next render to /login rather than letting components show
  // empty dashboards with cryptic "missing token" banners.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const loginStaff = async (identifier, pin) => {
    const { ok, data } = await apiFetch('/auth/staff/login', {
      method: 'POST',
      body:   JSON.stringify({ identifier, pin: pin || undefined }),
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

  const changePin = async (currentPin, newPin) => {
    const { ok, data } = await apiFetch('/auth/staff/change-pin', {
      method: 'POST',
      body:   JSON.stringify({ currentPin, newPin }),
    });
    if (ok && data?.success) {
      await refresh();
      return { success: true };
    }
    return { success: false, message: data?.message || 'Could not change PIN' };
  };

  const value = { user, loading, loginStaff, loginAdmin, logout, setPin, changePin, refresh };
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
    // Sprint 11.2: both roles funnel to `/` (the picker). After the
    // user picks a property + signs in, the per-tenant login page
    // routes them to the right post-auth destination, and the
    // `from` state below preserves the originally-requested URL
    // across the redirect for the standard "you tried to deep-link,
    // sign in then we'll take you there" flow.
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  const isAdmin = user.role === 'admin';
  const ok =
    role === 'any' ||
    (role === 'admin' && isAdmin) ||
    (role === 'staff' && !isAdmin);

  if (!ok) {
    // Sprint 11.2.1: wrong role for this surface — send them to
    // their own shell. Per-tenant slug comes from localStorage
    // (set on login); fall back to `/` if missing.
    const slug = typeof window !== 'undefined'
      ? localStorage.getItem('hotelops-tenant-slug')
      : null;
    if (slug) {
      return <Navigate to={isAdmin ? `/${slug}/admin` : `/${slug}/staff`} replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children;
};

// ── RedirectIfAuthed ────────────────────────────────────────────────────────
// Wraps a login page so already-authed users don't see it.

export const RedirectIfAuthed = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    // Sprint 11.2.1: authed users on the login page get bounced to
    // their per-tenant shell.
    const slug = typeof window !== 'undefined'
      ? localStorage.getItem('hotelops-tenant-slug')
      : null;
    if (slug) {
      return <Navigate to={user.role === 'admin' ? `/${slug}/admin` : `/${slug}/staff`} replace />;
    }
    return <Navigate to="/" replace />;
  }
  return children;
};
