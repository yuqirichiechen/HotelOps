// Sprint 26 — the Log Book (replaces the Sprint 10–12 "Logbook" prototype). Dated notes with a priority, a time span, an audience and a lifecycle
// (draft → published → archived).
//   Month page  — Month | List switch, month navigation, an audience filter, four totals, the calendar (a dot per priority + a count per day) and a side summary
//                 of the selected day with "View day notes".
//   Day page    — the notes of one day (filter by priority, sort, previous / next day), and the note form in a panel on the right (New / Edit).
// `apiBase` — '/admin' (managers, dev) or '/frontdesk' (front desk); same handlers, same rights for now. Data is read when a page opens and after each change — no timers.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../auth';
import { useViewOptional } from '../../shells/ViewContext';
import DropdownSelect from '../shared/DropdownSelect';
import NoteForm from './NoteForm';
import { Ic, ActionMenu } from './pickers';
import {
  PRIORITIES, PRIORITY, SORTS, todayYmd, addDays, addMonths, monthStart, monthGrid, monthTitle, longDay, shortDay, midDay, fmtTime,
  notesOnDay, countsOf, calendarNotes, monthCounts, audienceFilter, sortNotes, whenLabel, audienceLabel, touchesRange, monthEnd,
  emptyForm, formFromNote, formToBody, formError,
} from './logbookModel';
import './LogBook.css';

const PRIO_ICON = { high: Ic.Alert, medium: Ic.Flag, general: Ic.Info };
const stampText = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const PrioPill = ({ p }) => { const I = PRIO_ICON[p]; return <span className={`lb-pill lb-p-${p}`}><I size={13} />{PRIORITY[p].label}</span>; };
const Dots = ({ c }) => <span className="lb-dots" aria-hidden="true">{PRIORITIES.filter(p => c[p] > 0).map(p => <i key={p} className={`lb-dot lb-d-${p}`} />)}</span>;

const NoteCard = ({ n, departments, staff, onEdit, onAction, archivedView }) => (
  <article className={`lb-note lb-n-${n.priority}${n.pinned ? ' pinned' : ''}${n.status === 'draft' ? ' draft' : ''}`} data-note={n.id}>
    <div className="lb-note-main">
      <header>
        <PrioPill p={n.priority} />
        <h3>{n.title}</h3>
        {n.pinned && <span className="lb-tag" title="Pinned to the top"><Ic.Pin size={12} />Pinned</span>}
        {n.status === 'draft' && <span className="lb-tag lb-tag-draft">Draft</span>}
        {n.requireAck && <span className="lb-tag" title="Staff will have to acknowledge this note">Needs ack</span>}
        {!n.showOnCalendar && <span className="lb-tag" title="Not shown on the month calendar">Hidden on calendar</span>}
        <span className="lb-note-actions">
          {archivedView
            ? <button type="button" className="lb-btn lb-btn-sm" onClick={() => onAction('restore', n)}><Ic.Restore size={14} />Restore</button>
            : (
              <>
                <button type="button" className="lb-iconbtn" aria-label={`Edit ${n.title}`} title="Edit" onClick={() => onEdit(n)}><Ic.Pencil size={16} /></button>
                <ActionMenu ariaLabel={`More options for ${n.title}`} items={[
                  { label: 'Duplicate', icon: <Ic.Copy size={15} />, onClick: () => onAction('duplicate', n) },
                  { label: n.pinned ? 'Unpin' : 'Pin to top', icon: <Ic.Pin size={15} />, onClick: () => onAction('pin', n) },
                  { label: 'Archive', icon: <Ic.Archive size={15} />, danger: true, onClick: () => onAction('archive', n) },
                ]} />
              </>
            )}
        </span>
      </header>
      <p className="lb-meta"><span><Ic.Calendar size={14} />{whenLabel(n)}</span><span className="lb-aud"><Ic.People size={14} />{audienceLabel(n, departments, staff)}</span></p>
      {n.body && <p className="lb-body">{n.body}</p>}
    </div>
  </article>
);

const LogBook = ({ apiBase = '/admin' }) => {
  const view = useViewOptional();
  const today = todayYmd();
  const [mode, setMode] = useState('month');                 // 'month' | 'day'
  const [layout, setLayout] = useState('month');             // the month page: 'month' | 'list'
  const [month, setMonth] = useState(monthStart(today));
  const [selected, setSelected] = useState(today);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stamp, setStamp] = useState(null);
  const [meta, setMeta] = useState({ departments: [], staff: [] });
  const [aud, setAud] = useState('all');
  const [prio, setPrio] = useState('all');
  const [sort, setSort] = useState('time-asc');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState([]);
  const [panel, setPanel] = useState(null);                  // { id, form, dirty, busy, error } — the note form on the day page

  const grid = useMemo(() => monthGrid(month), [month]);
  const load = useCallback(async () => {
    const { ok, data } = await apiFetch(`${apiBase}/logbook/notes?from=${grid.start}&to=${grid.end}`);
    if (ok && data?.success) { setNotes(data.notes || []); setError(null); setStamp(new Date()); } else setError(data?.message || 'Could not load the notes.');
    setLoading(false);
  }, [apiBase, grid.start, grid.end]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    (async () => { const { ok, data } = await apiFetch(`${apiBase}/logbook/audience`); if (ok && data?.success) setMeta({ departments: data.departments || [], staff: data.staff || [] }); })();
  }, [apiBase]);
  useEffect(() => {
    if (mode !== 'day' || !showArchived) { setArchived([]); return undefined; }
    let alive = true;
    (async () => { const { ok, data } = await apiFetch(`${apiBase}/logbook/notes?from=${selected}&to=${selected}&archived=1`); if (alive && ok && data?.success) setArchived(data.notes || []); })();
    return () => { alive = false; };
  }, [apiBase, mode, showArchived, selected, notes]);

  const visible = useMemo(() => audienceFilter(notes, aud), [notes, aud]);
  const goHome = () => view && view.goTo && view.goTo('home');
  const confirmDiscard = () => !(panel && panel.dirty) || window.confirm('Discard the note you are writing?');
  const closePanel = () => { if (confirmDiscard()) setPanel(null); };
  const goDay = (ymd) => { if (!confirmDiscard()) return; setPanel(null); setSelected(ymd); if (!ymd.startsWith(month.slice(0, 7))) setMonth(monthStart(ymd)); };
  const openDay = (ymd, p = 'all') => { setPrio(p); setShowArchived(false); setMode('day'); setSelected(ymd); setMonth(monthStart(ymd)); };
  const backToMonth = () => { if (!confirmDiscard()) return; setPanel(null); setMode('month'); };
  const openNew = (ymd) => { if (mode === 'day' && !confirmDiscard()) return; setMode('day'); setShowArchived(false); setSelected(ymd); setMonth(monthStart(ymd)); setPanel({ id: null, form: emptyForm(ymd), dirty: false, busy: false, error: '' }); };
  const openEdit = (n) => { if (panel && panel.id !== n.id && !confirmDiscard()) return; setPanel({ id: n.id, form: formFromNote(n), dirty: false, busy: false, error: '' }); };
  const setForm = (form) => setPanel(p => ({ ...p, form, dirty: true, error: '' }));

  const save = async (status) => {
    const err = formError(panel.form, status);
    if (err) { setPanel(p => ({ ...p, error: err })); return; }
    setPanel(p => ({ ...p, busy: true, error: '' }));
    const body = JSON.stringify(formToBody(panel.form, status));
    const { ok, data } = panel.id ? await apiFetch(`${apiBase}/logbook/notes/${panel.id}`, { method: 'PUT', body }) : await apiFetch(`${apiBase}/logbook/notes`, { method: 'POST', body });
    if (ok && data?.success) { setPanel(null); await load(); }
    else setPanel(p => ({ ...p, busy: false, error: data?.message || 'Could not save the note' }));
  };
  const act = async (what, n) => {
    const { ok, data } = await apiFetch(`${apiBase}/logbook/notes/${n.id}/${what}`, { method: 'POST', body: JSON.stringify(what === 'pin' ? { pinned: !n.pinned } : {}) });
    if (!(ok && data?.success)) { setError(data?.message || 'That did not work'); return; }
    if (panel && panel.id === n.id && what !== 'pin') setPanel(null);
    await load();
    if (what === 'duplicate') { setPanel({ id: data.note.id, form: formFromNote(data.note), dirty: false, busy: false, error: '' }); }
  };

  const stats = useMemo(() => monthCounts(visible, month), [visible, month]);
  const calVisible = useMemo(() => calendarNotes(visible), [visible]);
  const audOptions = [{ value: 'all', label: 'All audiences' }, { value: 'everyone', label: 'All-staff notes' }, ...meta.departments.map(d => ({ value: `dept:${d.department_id}`, label: d.name }))];
  const statusBadge = <span className="lb-stamp" role="status"><i />{stamp ? `Updated ${stampText(stamp)}` : loading ? 'Loading…' : 'Not loaded'}</span>;

  // ── month page ──
  const sel = countsOf(notesOnDay(calVisible, selected));
  const monthPage = (
    <>
      <header className="lb-head">
        <div>
          <nav className="lb-crumb" aria-label="Breadcrumb"><button type="button" onClick={goHome}>Home</button><span aria-hidden="true">›</span><span>Log Book</span></nav>
          <h1>Log Book</h1>
          <p className="lb-sub">Share important updates and reminders with your team.</p>
        </div>
        <div className="lb-head-r">{statusBadge}<button type="button" className="lb-btn lb-btn-primary" onClick={() => openNew(selected)}><Ic.Plus size={16} />New note</button></div>
      </header>
      <div className="lb-toolbar">
        <div className="lb-seg" role="tablist" aria-label="Page layout">
          <button type="button" role="tab" aria-selected={layout === 'month'} className={layout === 'month' ? 'on' : ''} onClick={() => setLayout('month')}>Month</button>
          <button type="button" role="tab" aria-selected={layout === 'list'} className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')}>List</button>
        </div>
        <div className="lb-monthnav">
          <button type="button" className="lb-iconbtn lb-boxed" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Ic.ChevL size={16} sw={2.4} /></button>
          <b>{monthTitle(month)}</b>
          <button type="button" className="lb-iconbtn lb-boxed" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><Ic.ChevR size={16} sw={2.4} /></button>
          {month !== monthStart(today) && <button type="button" className="lb-btn lb-btn-sm" onClick={() => { setMonth(monthStart(today)); setSelected(today); }}>Today</button>}
        </div>
        <DropdownSelect className="lb-aud-filter" value={aud} options={audOptions} onChange={setAud} align="right" />
      </div>
      <div className="lb-stats" aria-label={`Notes in ${monthTitle(month)}`}>
        {[['high', 'High priority', stats.high], ['medium', 'Medium priority', stats.medium], ['general', 'General', stats.general]].map(([p, label, n]) => { const I = PRIO_ICON[p]; return (
          <div key={p} className={`lb-stat lb-p-${p}`}><span className="lb-stat-icon"><I size={22} /></span><div><strong>{n}</strong><span>{label}</span></div></div>
        ); })}
        <div className="lb-stat lb-p-total"><span className="lb-stat-icon"><Ic.People size={22} /></span><div><strong>{stats.total}</strong><span>Total notes</span></div></div>
      </div>
      {error && <p className="lb-error" role="alert">{error}</p>}
      {layout === 'month' ? (
        <div className="lb-monthbody">
          <div className="lb-cal" role="grid" aria-label={monthTitle(month)}>
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => <div key={d} className="lb-wd" role="columnheader">{d}</div>)}
            {grid.weeks.flat().map(c => {
              const cn = countsOf(notesOnDay(calVisible, c.ymd));
              return (
                <button key={c.ymd} type="button" role="gridcell" data-ymd={c.ymd} aria-selected={c.ymd === selected} aria-label={`${longDay(c.ymd)}, ${cn.total} note${cn.total === 1 ? '' : 's'}`}
                  className={`lb-cell${c.inMonth ? '' : ' out'}${c.ymd === today ? ' today' : ''}${c.ymd === selected ? ' sel' : ''}`} onClick={() => setSelected(c.ymd)} onDoubleClick={() => openDay(c.ymd)}>
                  <b>{c.day}</b>
                  {cn.total > 0 && <span className="lb-cell-n"><Dots c={cn} /><em>{cn.total}</em></span>}
                </button>
              );
            })}
          </div>
          <aside className="lb-side" aria-label="Selected day">
            <h2>{midDay(selected)}</h2>
            <p className="lb-side-n">{sel.total} note{sel.total === 1 ? '' : 's'}</p>
            <ul>
              {PRIORITIES.map(p => { const I = PRIO_ICON[p]; return (
                <li key={p}><button type="button" className={`lb-side-row lb-p-${p}`} disabled={sel[p] === 0} onClick={() => openDay(selected, p)}><span><I size={16} />{PRIORITY[p].label}</span><b>{sel[p]}</b><Ic.ChevR size={14} sw={2.4} /></button></li>
              ); })}
            </ul>
            <button type="button" className="lb-btn lb-btn-primary lb-btn-wide" onClick={() => openDay(selected)}>View day notes<Ic.ChevR size={16} sw={2.4} /></button>
          </aside>
        </div>
      ) : <ListView notes={visible} month={month} departments={meta.departments} staff={meta.staff} q={q} setQ={setQ} prio={prio} setPrio={setPrio} onOpen={(n, ymd) => { openDay(ymd, 'all'); setPanel({ id: n.id, form: formFromNote(n), dirty: false, busy: false, error: '' }); }} />}
      {loading && <p className="lb-muted">Loading the notes…</p>}
    </>
  );

  // ── day page ──
  const dayAll = notesOnDay(visible, selected), dc = countsOf(dayAll);
  const shownBase = showArchived ? archived : dayAll;
  const shown = sortNotes(prio === 'all' ? shownBase : shownBase.filter(n => n.priority === prio), sort, selected);
  const dayPage = (
    <>
      <header className="lb-head">
        <div>
          <nav className="lb-crumb" aria-label="Breadcrumb"><button type="button" onClick={goHome}>Home</button><span aria-hidden="true">›</span><button type="button" onClick={backToMonth}>Log Book</button><span aria-hidden="true">›</span><span>{longDay(selected).replace(/^\w+, /, '')}</span></nav>
          <h1>Log Book</h1>
        </div>
        <div className="lb-head-r">
          {statusBadge}
          <button type="button" className="lb-btn" onClick={backToMonth}><Ic.ChevL size={16} sw={2.4} />Back to calendar</button>
          <button type="button" className="lb-btn" aria-label="Previous day" onClick={() => goDay(addDays(selected, -1))}><Ic.ChevL size={16} sw={2.4} />{shortDay(addDays(selected, -1))}</button>
          <button type="button" className="lb-btn" aria-label="Next day" onClick={() => goDay(addDays(selected, 1))}>{shortDay(addDays(selected, 1))}<Ic.ChevR size={16} sw={2.4} /></button>
          <button type="button" className="lb-btn lb-btn-primary" onClick={() => openNew(selected)}><Ic.Plus size={16} />New note</button>
        </div>
      </header>
      <div className={`lb-daybody${panel ? ' with-panel' : ''}`}>
        <section className="lb-daymain" aria-label={`Notes for ${longDay(selected)}`}>
          <h2 className="lb-daytitle">{longDay(selected)}{selected === today && <span className="lb-today-tag">Today</span>}</h2>
          <div className="lb-filterrow">
            <div className="lb-chips" role="group" aria-label="Filter by priority">
              <button type="button" aria-pressed={prio === 'all'} className={`lb-chip${prio === 'all' ? ' on' : ''}`} onClick={() => setPrio('all')}>All ({dc.total})</button>
              {PRIORITIES.map(p => <button key={p} type="button" aria-pressed={prio === p} className={`lb-chip lb-c-${p}${prio === p ? ' on' : ''}`} onClick={() => setPrio(p)}><i className={`lb-dot lb-d-${p}`} />{PRIORITY[p].label} ({dc[p]})</button>)}
              <button type="button" aria-pressed={showArchived} className={`lb-chip${showArchived ? ' on' : ''}`} onClick={() => setShowArchived(a => !a)}><Ic.Archive size={13} />Archived</button>
            </div>
            <DropdownSelect className="lb-sort" label="Sort" value={sort} options={SORTS} onChange={setSort} align="right" />
          </div>
          {error && <p className="lb-error" role="alert">{error}</p>}
          <div className="lb-list">
            {shown.length === 0 && (
              <div className="lb-empty"><Ic.Calendar size={26} /><p>{showArchived ? 'Nothing archived for this day.' : dc.total === 0 ? 'No notes for this day yet.' : 'No notes match this filter.'}</p>{!showArchived && <button type="button" className="lb-btn lb-btn-primary" onClick={() => openNew(selected)}><Ic.Plus size={16} />New note</button>}</div>
            )}
            {shown.map(n => <NoteCard key={n.id} n={n} departments={meta.departments} staff={meta.staff} onEdit={openEdit} onAction={act} archivedView={showArchived} />)}
          </div>
        </section>
        {panel && <NoteForm form={panel.form} onChange={setForm} mode={panel.id ? 'edit' : 'new'} departments={meta.departments} staff={meta.staff} error={panel.error} busy={panel.busy} onSave={save} onClose={closePanel} />}
      </div>
    </>
  );

  return <div className="lb-page">{mode === 'month' ? monthPage : dayPage}</div>;
};

/** the month page's List layout: every note that touches the month, searchable and filterable by priority */
const ListView = ({ notes, month, departments, staff, q, setQ, prio, setPrio, onOpen }) => {
  const first = month, last = monthEnd(month), needle = q.trim().toLowerCase();
  const rows = notes.filter(n => touchesRange(n, first, last) && (prio === 'all' || n.priority === prio) && (!needle || n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startTime || '').localeCompare(b.startTime || '') || a.title.localeCompare(b.title));
  return (
    <section className="lb-listview" aria-label="Notes list">
      <div className="lb-filterrow">
        <label className="lb-search"><Ic.Search size={16} /><input type="search" value={q} placeholder="Search notes…" aria-label="Search notes" onChange={(e) => setQ(e.target.value)} /></label>
        <div className="lb-chips" role="group" aria-label="Filter by priority">
          <button type="button" aria-pressed={prio === 'all'} className={`lb-chip${prio === 'all' ? ' on' : ''}`} onClick={() => setPrio('all')}>All</button>
          {PRIORITIES.map(p => <button key={p} type="button" aria-pressed={prio === p} className={`lb-chip lb-c-${p}${prio === p ? ' on' : ''}`} onClick={() => setPrio(p)}><i className={`lb-dot lb-d-${p}`} />{PRIORITY[p].label}</button>)}
        </div>
      </div>
      <div className="lb-tablewrap">
        <table className="lb-table">
          <thead><tr><th>When</th><th>Priority</th><th>Title</th><th>For</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="lb-muted">No notes match.</td></tr>}
            {rows.map(n => {
              const day = n.startDate < first ? first : n.startDate;
              return (
                <tr key={n.id} className={`lb-row lb-n-${n.priority}`} onClick={() => onOpen(n, day)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(n, day); }}>
                  <td><b>{n.startDate === n.endDate ? shortDay(n.startDate) : `${shortDay(n.startDate)} – ${shortDay(n.endDate)}`}</b><small>{n.startDate === n.endDate ? (n.allDay ? 'All day' : `${fmtTime(n.startTime)} – ${fmtTime(n.endTime)}`) : ''}</small></td>
                  <td><PrioPill p={n.priority} /></td>
                  <td className="lb-t-title">{n.pinned && <Ic.Pin size={13} />}{n.title}</td>
                  <td>{audienceLabel(n, departments, staff)}</td>
                  <td>{n.status === 'draft' ? <span className="lb-tag lb-tag-draft">Draft</span> : 'Published'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default LogBook;
