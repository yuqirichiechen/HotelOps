import React, { createContext, useCallback, useContext, useState } from 'react';

// Sprint 11.2.1: the staff + admin app shells are single-URL containers.
// `/:tenant/staff` and `/:tenant/admin` never change after login;
// internal navigation between sub-pages (Home → Timesheet, Staff →
// StaffDetail, Calendar → Notes, …) happens in React state, not in the
// URL. ViewContext owns that state and exposes a `goTo(name, params)`
// helper that pages call instead of `useNavigate()`.
//
// A `view` is `{ name: string, params: object }`. The shell's render
// table maps `name` → component; `params` flow through as props. Sub-
// views like `staffDetail` use params to carry per-row identifiers
// (`{ userId }`) the way URL params used to.

const ViewContext = createContext(null);

export const ViewProvider = ({ initialView = 'home', children }) => {
  const [view, setViewRaw] = useState({ name: initialView, params: {} });

  const goTo = useCallback((name, params = {}) => {
    setViewRaw({ name, params });
    // Reset scroll on view change — sub-page transitions used to do
    // this implicitly through full-page navigations.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0 });
  }, []);

  return (
    <ViewContext.Provider value={{ view, goTo }}>
      {children}
    </ViewContext.Provider>
  );
};

export const useView = () => {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error('useView must be used inside a <ViewProvider>');
  return ctx;
};
