# Claude Instructions — Inntrio / HotelOps (Part 7: Sprint 27+)

> **Naming:** the project is *HotelOps* internally; the product brand is **Inntrio** ("in-tree-oh", the
> *io* = input/output in computing and in/out for hotel operations). Code, storage keys (`hotelops-*`),
> repo and docs keep the HotelOps name; screens users see say Inntrio. Logo SVGs: `logo/inntrio/`.
> Parts 1–6 are history (Sprints 1–26.3); read `part6.md`'s newest entries for the current app state.
> Conventions, test notes (`tests/README.md`), env/migration state: see part5 §0.

## Status

| Sprint | Focus | Status |
|--------|-------|--------|
| 27.1   | Inntrio login revamp: property → access method → sign-in / clock (UI only; auth logic unchanged) | **Done** 2026-11-12 (see entry; no migration) |
| 27.1.1 | "Blank screen" after the 27.1 deploy → it was the browser's cache (hard refresh fixed it); an app-wide error boundary + load-failure fallback were added anyway | **Done** 2026-11-12 (frontend only) |
| 27.2   | Login polish: Tiempos fonts, step line removed, top-bar "Secure access" + date/time removed, Snoqualmie Inn logo on the property rows / bar | **Done** 2026-11-12 (frontend only) |

## Sprint logs (newest first)

### 2026-11-12 — Sprint 27.2: login polish

1. **Tiempos fonts.** The Inntrio screens use the app's own fonts (headings `TiemposHeadline` 600, everything else `TiemposText`) instead of the concept's sans. The global element rules do not reach every element, so `Inntrio.css` states the families explicitly under `.in-root`; heading letter-spacing was relaxed for the serif.
2. **Step line removed** (the "1 Property — 2 Access — 3 Sign-in / clock" row) from every screen (`Steps` deleted from `InntrioFrame.js`, CSS removed).
3. **Property logo.** `public/snoqualmieinn.png` (white background, so it sits on a white rounded chip) replaces the generic building tile on the property row and the property bar (`PropertyMark` in `InntrioFrame.js`; a property without `logoUrl` still gets the building tile). Smaller chip on phones so the name does not wrap.
4. **Top bar:** "Secure access" and the date/time removed; only the logo, "PROPERTY MANAGEMENT SYSTEM" and (steps 2-3) "Access options" remain. NOTE: the clock-in card still has its own small "date/time • property" line under the ID field — left in on purpose because it is part of the Clock in / out card; say if it should go too.
Tests: `staffportal` / `devshell` login assertions updated (no step line, no secure-access/time in the top bar, the property logo is shown on the bar and on the picker row). Full regression green; build compiles; screenshots checked at 1440 px and 390 px.

### 2026-11-12 — Sprint 27.1.1: blank screen after the 27.1 deploy

The blank page right after a deploy was the user's **browser cache** (a hard refresh / clearing the cache fixed it) — not a code bug. While investigating I found the app had no error boundary (any render exception = blank page with nothing to report), so I added one regardless: `src/AppErrorBoundary.js` wraps `<App />` in `src/index.js` (panel with the real error + component stack; Reload / Sign out and reload / Copy details), and `public/index.html` shows "Inntrio could not load — try a hard refresh" if nothing has rendered after 10 s. Test: `tests/error-boundary.test.js` (5). Frontend only. Tip for after deploys: hard refresh (Cmd+Shift+R) before assuming something is broken.

### 2026-11-12 — Sprint 27.1: the Inntrio login

**Frontend only, no migration.** New brand + new login workflow; the auth/redirect logic of every screen is unchanged.
**Brand.** The product is **Inntrio** (internally still HotelOps — see the naming note at the top of this file and in `claude-instructions.md`). The 4 SVGs from `logo/inntrio/` are copied to `public/inntrio/` and used as `<img>` (they all reuse the gradient id `g1`, so they must NOT be inlined side by side). The login uses `Inntrio-logo-dark.svg` (white + gold) with a gold "PROPERTY OPERATIONS, REFINED" line; the navy / light variants and the two tagline variants are there for later. Browser tab title is now "Inntrio" (and the meta description). The HotelOps PNG/SVG logo files and `HotelOpsLogo.js` are no longer used by any screen (left in place; `Login.css` is still imported by `Home` and `SetPin`).
**Workflow** (design: `logo/inntrio/inntrio_interactive_login_concept.html` + the desktop / mobile mockups; always dark navy + gold, does not follow the app theme):
1. `/` — **Select a property** (`TenantPicker.js`): search, property rows (name, location, Active pill, preselected when there is one), gold Continue → `/:slug/login`. With `kind="dev"` (the `/dev` route) Continue → `/:slug/admin` as before.
2. `/:slug/login` — **How would you like to continue?** (`TenantLogin.js`): four choices — Clock in / out (highlighted), Staff sign-in, Manager sign-in, Developer sign-in — under a property bar with "Change property" (→ `/`).
3. The chosen screen, still internal state (URL stays `/:slug/login`):
   - **Clock in / out** (`StaffLogin.js`): the numpad. All old logic kept (identifier validation per enabled methods, PIN field appears when the server asks, ABC letters keyboard only when usernames are allowed and not hidden, touch lock, the language-cycling headline). **One gold Continue button** (decided: no separate Clock out; the existing clock page after sign-in is where clocking happens).
   - **Staff sign-in** (`StaffPortalLogin.js`): identifier + optional PIN (show/hide eye) → `/:slug/staff` (same endpoint, same pin_must_set / deep-link rules).
   - **Manager sign-in** (`AdminLogin.js`): username + password → `/:slug/admin`.
   - **Developer sign-in** (`DevLogin.js`): now one of the access choices; after signing in it goes **straight to `/:slug/admin`** (the property is already chosen) instead of the old second property picker.
   "Back to access options" and the top-bar "Access options" return to step 2.
**Routing details.** `?mode=clockin|staff|admin|dev` on `/:slug/login` opens a screen directly (an unknown value = the chooser); nothing is remembered between visits. The clock-in door (`ClockInShell` idle sign-out and `Home`'s auto sign-out) now returns to `/:slug/login?mode=clockin`, so the kiosk lands on the keypad as before; Settings / manager sign-outs return to the chooser. The old `/login/dev` URL (also `RequireDev`'s redirect) redirects to `/:slug/login?mode=dev`.
**Not carried over from the mockups (no backend behind them):** "Remember me" and "Forgot password?" on the sign-in cards; the Clock out button; "Setup" properties other than a status field on `KNOWN_TENANTS` (`location`, `status` were added there). The dev setting `staff_login_layout` (hardcode / fluid) no longer has an effect — the new layout is responsive CSS. The tenant logo (`snoqualmieinn.png`) is no longer shown on the login (the mockups use an icon tile).
**Files:** new `src/pages/Login/{Inntrio.css, InntrioFrame.js, InntrioIcons.js, SignInScreen.js}`; rewritten `TenantPicker, TenantLogin, StaffLogin, StaffPortalLogin, AdminLogin, DevLogin`; deleted `LoginModeSwitch.js`; edited `App.js` (`DevLoginRedirect`), `Home/index.js`, `ClockInShell.js`, `config/tenant.js`, `public/index.html`; `public/inntrio/*.svg`.
**Tests:** `staffportal` login section rewritten (28 tests: chooser, numpad keypad / ABC / PIN flow, PC staff form, every screen reaches every other, `?mode=`, kiosk return path, same-credentials-different-door, deep links), `devshell` (dev sign-in goes to the property shell, picker with Continue). Full regression green; build compiles. Screenshots checked at 1440×900 and 390 px against the mockups. NOTE: `staffportal.test.js` is date-fragile (hard-coded week of 2026-11-02, see 26.2) — it passes with the clock pinned to Nov 4.
**Open / ideas:** a machine-tablet login that keeps itself signed in (the user's next idea for the kiosk); the square i/o app icon for the tab / PWA icon (only the 4 wordmark SVGs exist); rebranding the manager / staff shells' own headers.

<!-- Append new sprint entries above this line, newest first. -->
