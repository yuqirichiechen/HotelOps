// Sprint 27.8 — the tab icon follows the mode: the white Inntrio mark (`inntrio-icon-dark.svg`) in dark mode, the navy one (`inntrio-icon-light.svg`) in light mode.
// The <link rel="icon"> is REPLACED (not just re-pointed) because Safari ignores a changed href on an existing link.
export const FAVICON = { dark: '/inntrio/inntrio-icon-dark.svg', light: '/inntrio/inntrio-icon-light.svg' };

/** @param {'dark'|'light'} mode */
export const setFavicon = (mode) => {
  if (typeof document === 'undefined') return;
  const href = mode === 'light' ? FAVICON.light : FAVICON.dark;
  const cur = document.querySelector('link[rel="icon"]');
  if (cur && cur.getAttribute('href') === href) return;
  const link = document.createElement('link');
  link.rel = 'icon'; link.type = 'image/svg+xml'; link.href = href;
  if (cur && cur.parentNode) cur.parentNode.replaceChild(link, cur); else document.head.appendChild(link);
};

/** the sign-in screens (`/`, `/:slug/login`, `/login/dev`) show the LOGIN theme; everywhere else the app's own theme applies */
export const isLoginPath = (pathname) => pathname === '/' || /\/login(\/|$)/.test(pathname);
