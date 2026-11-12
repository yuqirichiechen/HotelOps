// Sprint 27.1.1 — the app had no error boundary, so ANY exception while rendering (a bad API shape, a browser quirk, a stale cached bundle) unmounted the
// whole tree and left a blank page with nothing to report. This shows what happened, and offers a reload or a clean sign-out (clears the saved token
// and the remembered view so a broken saved state cannot keep crashing the page). Plain inline styles on purpose: it must not depend on any app CSS.
import React from 'react';

const STORAGE_KEYS = ['hotelops-token', 'hotelops-staff-entry'];

export const resetAndReload = () => {
  try { STORAGE_KEYS.forEach(k => localStorage.removeItem(k)); sessionStorage.clear(); } catch { /* storage unavailable */ }
  window.location.assign('/');
};

export const describeError = (error, info) => {
  const msg = String((error && (error.stack || error.message)) || error || 'Unknown error');
  const where = info && info.componentStack ? `\n\nComponent stack:${info.componentStack}` : '';
  return `${msg}${where}`.slice(0, 2500);
};

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, info: null, copied: false }; }

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error('[AppErrorBoundary]', error, info && info.componentStack);
  }

  copy = async () => {
    try { await navigator.clipboard.writeText(describeError(this.state.error, this.state.info)); this.setState({ copied: true }); } catch { /* clipboard unavailable */ }
  };

  render() {
    const { error, info, copied } = this.state;
    if (!error) return this.props.children;
    const btn = { font: 'inherit', fontSize: 14, fontWeight: 650, padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,.35)', background: 'rgba(255,255,255,.08)', color: '#fff', cursor: 'pointer' };
    return (
      <div role="alert" style={{ minHeight: '100vh', boxSizing: 'border-box', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b1a2e', color: '#f4f0e6', fontFamily: 'Inter, -apple-system, "Segoe UI", sans-serif' }}>
        <div style={{ width: 'min(680px, 100%)' }}>
          <div style={{ fontSize: 12, letterSpacing: '.2em', color: '#dfc184', fontWeight: 700 }}>INNTRIO</div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 26, fontFamily: 'inherit' }}>Something went wrong on this page</h1>
          <p style={{ margin: '0 0 16px', color: '#bed0e3', lineHeight: 1.5 }}>Your data is safe. Try reloading; if it keeps happening, sign out and back in, and send the details below to the developer.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <button type="button" style={{ ...btn, background: '#dfc184', color: '#11263e', border: '1px solid #f4dca5' }} onClick={() => window.location.reload()}>Reload</button>
            <button type="button" style={btn} onClick={resetAndReload}>Sign out and reload</button>
            <button type="button" style={btn} onClick={this.copy}>{copied ? 'Copied ✓' : 'Copy details'}</button>
          </div>
          <pre style={{ margin: 0, padding: 14, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.45, borderRadius: 10, background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.14)', color: '#fecaca' }}>{describeError(error, info)}</pre>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
