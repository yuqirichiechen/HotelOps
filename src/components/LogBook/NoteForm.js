// Sprint 26 — the note form (right-hand panel of the day page): priority · title · from / to (date + time, or all day) · intended for (everyone, departments,
// selected staff) · description · show on calendar / require acknowledgment / pin · Save draft / Publish. Controlled by the page (`form`, `onChange`).
import React, { useMemo, useState } from 'react';
import { Ic, DateField, TimeField } from './pickers';
import { PRIORITIES, PRIORITY, MAX_TITLE, MAX_BODY, TIME_SLOTS } from './logbookModel';

const PRIO_ICON = { high: Ic.Alert, medium: Ic.Flag, general: Ic.Info };
const Switch = ({ on, onClick, label, icon }) => (
  <button type="button" role="switch" aria-checked={on} className="lb-switchrow" onClick={onClick}>{icon}<span>{label}</span><i className={`lb-switch${on ? ' on' : ''}`}><b /></i></button>
);
/** 09:00 + 60 min → 10:00 (stops at 23:45) */
const plus = (hhmm, mins) => { const i = TIME_SLOTS.indexOf(hhmm); return TIME_SLOTS[Math.min(95, (i < 0 ? 36 : i) + mins / 15)]; };

const NoteForm = ({ form, onChange, mode, departments, staff, error, busy, onSave, onClose }) => {
  const [q, setQ] = useState('');
  const set = (patch) => onChange({ ...form, ...patch });
  const setStart = (patch) => {
    const next = { ...form, ...patch };
    if (next.endDate < next.startDate) next.endDate = next.startDate;
    if (!next.allDay && next.endDate === next.startDate && next.endTime <= next.startTime) next.endTime = plus(next.startTime, 60);
    onChange(next);
  };
  const setEnd = (patch) => { const next = { ...form, ...patch }; if (next.endDate < next.startDate) next.startDate = next.endDate; onChange(next); };
  const toggle = (key, v) => set({ [key]: form[key].includes(v) ? form[key].filter(x => x !== v) : [...form[key], v] });
  const byId = useMemo(() => new Map(staff.map(s => [s.user_id, s])), [staff]);
  const matches = useMemo(() => { const n = q.trim().toLowerCase(); return staff.filter(s => !n || s.name.toLowerCase().includes(n) || (s.department || '').toLowerCase().includes(n)).slice(0, 60); }, [staff, q]);
  const published = form.status === 'published' && mode === 'edit';
  return (
    <section className="lb-panel lb-form" aria-label={mode === 'edit' ? 'Edit note' : 'New note'}>
      <header className="lb-panel-head">
        <span className="lb-panel-icon"><Ic.Pencil size={20} /></span>
        <h2>{mode === 'edit' ? 'Edit note' : 'New note'}</h2>
        <button type="button" className="lb-iconbtn" aria-label="Close" onClick={onClose}><Ic.X size={18} /></button>
      </header>

      <div className="lb-fgroup"><span className="lb-flabel">Priority</span>
        <div className="lb-prio-pick" role="radiogroup" aria-label="Priority">
          {PRIORITIES.map(p => { const I = PRIO_ICON[p]; return <button key={p} type="button" role="radio" aria-checked={form.priority === p} className={`lb-pp lb-p-${p}${form.priority === p ? ' on' : ''}`} onClick={() => set({ priority: p })}><I size={16} />{PRIORITY[p].label}</button>; })}
        </div>
      </div>

      <label className="lb-fgroup"><span className="lb-flabel">Title <i>*</i></span>
        <input className="lb-input" type="text" value={form.title} maxLength={MAX_TITLE} placeholder="e.g. Staff meeting" aria-label="Title" onChange={(e) => set({ title: e.target.value })} />
      </label>

      <div className="lb-fgroup"><span className="lb-flabel">From <i>*</i></span>
        <div className="lb-row2">
          <DateField value={form.startDate} ariaLabel="From date" onChange={(v) => setStart({ startDate: v })} />
          <TimeField value={form.startTime} ariaLabel="From time" disabled={form.allDay} onChange={(v) => setStart({ startTime: v })} />
        </div>
      </div>
      <div className="lb-fgroup"><span className="lb-flabel">To <i>*</i></span>
        <div className="lb-row2">
          <DateField value={form.endDate} ariaLabel="To date" onChange={(v) => setEnd({ endDate: v })} />
          <TimeField value={form.endTime} ariaLabel="To time" disabled={form.allDay} onChange={(v) => set({ endTime: v })} />
        </div>
        <Switch on={form.allDay} onClick={() => set({ allDay: !form.allDay })} label="All day" icon={<Ic.Clock size={16} />} />
      </div>

      <div className="lb-fgroup"><span className="lb-flabel">Intended for <i>*</i></span>
        <div className="lb-aud-pick" role="radiogroup" aria-label="Intended for">
          {[['all', 'All staff', Ic.People], ['departments', 'Departments', Ic.People], ['staff', 'Selected staff', Ic.People]].map(([v, label, I]) => (
            <button key={v} type="button" role="radio" aria-checked={form.audienceMode === v} className={form.audienceMode === v ? 'on' : ''} onClick={() => set({ audienceMode: v })}><I size={16} />{label}</button>
          ))}
        </div>
        {form.audienceMode === 'departments' && (
          <div className="lb-chips" aria-label="Departments">
            {departments.length === 0 && <small className="lb-muted">No departments yet.</small>}
            {departments.map(d => <button key={d.department_id} type="button" aria-pressed={form.departments.includes(d.department_id)} className={`lb-chip${form.departments.includes(d.department_id) ? ' on' : ''}`} onClick={() => toggle('departments', d.department_id)}>{d.name}</button>)}
          </div>
        )}
        {form.audienceMode === 'staff' && (
          <div className="lb-staffpick">
            <div className="lb-chips" aria-label="Chosen staff">
              {form.staff.length === 0 && <small className="lb-muted">Nobody chosen yet.</small>}
              {form.staff.map(id => <span key={id} className="lb-chip on lb-chip-x">{(byId.get(id) || { name: 'Staff member' }).name}<button type="button" aria-label={`Remove ${(byId.get(id) || { name: 'staff member' }).name}`} onClick={() => toggle('staff', id)}><Ic.X size={12} sw={2.6} /></button></span>)}
            </div>
            <input className="lb-input" type="search" value={q} placeholder="Search by name or department…" aria-label="Search staff" onChange={(e) => setQ(e.target.value)} />
            <ul className="lb-stafflist" aria-label="Staff list">
              {matches.length === 0 && <li className="lb-muted">No one matches.</li>}
              {matches.map(s => (
                <li key={s.user_id}><label><input type="checkbox" checked={form.staff.includes(s.user_id)} onChange={() => toggle('staff', s.user_id)} aria-label={`${s.name} gets this note`} /><span>{s.name}<small>{s.department || '—'}</small></span></label></li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <label className="lb-fgroup"><span className="lb-flabel">Description <i>*</i><small>{form.body.length} / {MAX_BODY}</small></span>
        <textarea className="lb-input lb-text" rows={5} value={form.body} maxLength={MAX_BODY} placeholder="What does the team need to know?" aria-label="Description" onChange={(e) => set({ body: e.target.value })} />
      </label>

      <div className="lb-switches">
        <Switch on={form.showOnCalendar} onClick={() => set({ showOnCalendar: !form.showOnCalendar })} label="Show on calendar" icon={<Ic.Calendar size={16} />} />
        <Switch on={form.requireAck} onClick={() => set({ requireAck: !form.requireAck })} label="Require acknowledgment" icon={<Ic.Check size={16} />} />
        <Switch on={form.pinned} onClick={() => set({ pinned: !form.pinned })} label="Pin to top" icon={<Ic.Pin size={16} />} />
      </div>

      {error && <p className="lb-error" role="alert">{error}</p>}
      <div className="lb-actions">
        {!published && <button type="button" className="lb-btn" disabled={busy} onClick={() => onSave('draft')}>Save draft</button>}
        <button type="button" className="lb-btn lb-btn-primary" disabled={busy} onClick={() => onSave('published')}><Ic.Send size={16} />{published ? 'Save changes' : 'Publish note'}</button>
      </div>
    </section>
  );
};

export default NoteForm;
