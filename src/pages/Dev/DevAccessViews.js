// Sprint 28.10 — Dev → Platform: the "Views" that departments use, and the switch that lets admins choose a department's view.
// A VIEW is a name + the staff-portal pages it switches on. The pages themselves are hardcoded (server/access.js lists them); dev composes views from them here.
// A department uses one view (Settings → Departments) and everyone in it inherits it; a department with no view sees Home only. Dev always picks the view; admins only
// while the switch below is on (off by default — turn it on while admins need to change things, then lock it again).
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../auth';
import Icon from '../../components/shared/Icon';

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

const PageChecks = ({ catalog, value, onChange, name }) => (
  <div className="dv-pagechecks" role="group" aria-label={`Pages for ${name}`}>
    {catalog.map(p => (
      <label key={p.key} className={`dv-pagecheck${value.includes(p.key) ? ' on' : ''}`} title={p.note}>
        <input type="checkbox" checked={value.includes(p.key)} onChange={() => onChange(value.includes(p.key) ? value.filter(k => k !== p.key) : [...value, p.key])} />
        <Icon name={value.includes(p.key) ? 'check' : 'plus'} size={14} /> {p.label}
      </label>
    ))}
  </div>
);

const ViewRow = ({ view, catalog, onSaved, onRemoved }) => {
  const [name, setName] = useState(view.name);
  const [pages, setPages] = useState(view.pages || []);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== view.name || !sameSet(pages, view.pages || []);
  const save = async () => {
    setBusy(true); setMsg(null);
    const { ok, data } = await apiFetch(`/admin/access-views/${view.view_id}`, { method: 'PATCH', body: JSON.stringify({ name, pages }) });
    setBusy(false);
    if (ok && data?.success) { setMsg({ ok: true, text: 'Saved — people see the change when they next sign in' }); onSaved(data.view); } else setMsg({ ok: false, text: (data && data.message) || 'Could not save' });
  };
  const remove = async () => {
    setBusy(true); setMsg(null);
    const { ok, data } = await apiFetch(`/admin/access-views/${view.view_id}`, { method: 'DELETE' });
    setBusy(false);
    if (ok && data?.success) onRemoved(view.view_id); else setMsg({ ok: false, text: (data && data.message) || 'Could not delete' });
  };
  const using = (view.departments || []).map(d => d.name);
  return (
    <div className="dv-view" data-view={view.name}>
      <div className="dv-view-head">
        <input className="dv-input" value={name} onChange={e => setName(e.target.value)} aria-label={`Name of view ${view.name}`} maxLength={60} />
        <small className="dv-muted">{using.length ? `Used by ${using.join(', ')}` : 'Not used by any department yet'}</small>
      </div>
      <PageChecks catalog={catalog} value={pages} onChange={setPages} name={view.name} />
      <div className="dv-view-actions">
        <button type="button" className="dv-btn dv-btn-primary" onClick={save} disabled={busy || !dirty || !name.trim()}>Save view</button>
        <button type="button" className="dv-btn" onClick={remove} disabled={busy} aria-label={`Delete view ${view.name}`}>Delete</button>
        {msg && <small role="status" className={msg.ok ? 'dv-ok' : 'dv-error'}>{msg.text}</small>}
      </div>
    </div>
  );
};

const AccessViewsCard = () => {
  const [state, setState] = useState({ loading: true, views: [], pages: [], adminMaySetView: false, error: '' });
  const [draft, setDraft] = useState({ name: '', pages: [] });
  const [msg, setMsg] = useState(null);
  const [switchMsg, setSwitchMsg] = useState(null);
  const load = useCallback(async () => {
    const { ok, data } = await apiFetch('/admin/access-views');
    if (ok && data?.success) setState({ loading: false, views: data.views || [], pages: data.pages || [], adminMaySetView: !!data.adminMaySetView, error: '' });
    else setState(s => ({ ...s, loading: false, error: (data && data.message) || 'Could not load the views' }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    const next = !state.adminMaySetView; setSwitchMsg(null);
    const { ok, data } = await apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ access_admin_sets_view: next ? 'true' : 'false' }) });
    if (ok && data?.success) { setState(s => ({ ...s, adminMaySetView: next })); setSwitchMsg({ ok: true, text: next ? 'Admins can now choose a department’s view.' : 'Locked — only dev can choose a department’s view.' }); } else setSwitchMsg({ ok: false, text: (data && data.message) || 'Could not save' });
  };
  const create = async () => {
    setMsg(null);
    const { ok, data } = await apiFetch('/admin/access-views', { method: 'POST', body: JSON.stringify({ name: draft.name, pages: draft.pages }) });
    if (ok && data?.success) { setDraft({ name: '', pages: [] }); setMsg({ ok: true, text: `Created “${data.view.name}”` }); load(); } else setMsg({ ok: false, text: (data && data.message) || 'Could not create the view' });
  };

  if (state.loading) return <section className="dv-card" aria-label="Views"><h2>Views</h2><p className="dv-muted">Loading…</p></section>;
  return (
    <section className="dv-card" aria-label="Views">
      <h2>Views — staff pages by department</h2>
      <p className="dv-muted">A view is a named set of staff-portal pages (Home is always there). Each department uses one view in Settings → Departments and everyone in it gets those pages; a department with no view sees Home only. The pages themselves are built into the app — a brand-new page needs a code change — so a view only decides who sees which. Changes reach people at their next sign-in.</p>
      {state.error && <p className="dv-error" role="alert">{state.error}</p>}

      <div className="dv-switchrow">
        <button type="button" role="switch" aria-checked={state.adminMaySetView} aria-label="Let admins choose a department’s view" className={`dv-switch${state.adminMaySetView ? ' on' : ''}`} onClick={toggle}>
          <span className="dv-switch-track"><span className="dv-switch-knob" /></span>
          Let admins choose a department’s view
        </button>
        <small className="dv-muted">{state.adminMaySetView ? 'ON — admins can pick any existing view for a department (they still cannot create or edit views). Turn it off again when they are done.' : 'OFF (default) — only dev can pick; admins see each department’s view read-only and new departments start as Home only.'}</small>
        {switchMsg && <small role="status" className={switchMsg.ok ? 'dv-ok' : 'dv-error'}>{switchMsg.text}</small>}
      </div>

      <div className="dv-viewlist">
        {state.views.length === 0 && <p className="dv-muted">No views yet — create one below.</p>}
        {state.views.map(v => (
          <ViewRow key={v.view_id} view={v} catalog={state.pages}
            onSaved={(nv) => setState(s => ({ ...s, views: s.views.map(x => (x.view_id === nv.view_id ? { ...x, name: nv.name, pages: nv.pages } : x)) }))}
            onRemoved={(id) => setState(s => ({ ...s, views: s.views.filter(x => x.view_id !== id) }))} />
        ))}
      </div>

      <div className="dv-view dv-view-new" aria-label="New view">
        <div className="dv-view-head"><input className="dv-input" value={draft.name} placeholder="New view name, e.g. Housekeeping" onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} aria-label="New view name" maxLength={60} /></div>
        <PageChecks catalog={state.pages} value={draft.pages} onChange={(pages) => setDraft(d => ({ ...d, pages }))} name="the new view" />
        <div className="dv-view-actions">
          <button type="button" className="dv-btn dv-btn-primary" onClick={create} disabled={!draft.name.trim()}>Create view</button>
          {msg && <small role="status" className={msg.ok ? 'dv-ok' : 'dv-error'}>{msg.text}</small>}
        </div>
      </div>
    </section>
  );
};

export default AccessViewsCard;
