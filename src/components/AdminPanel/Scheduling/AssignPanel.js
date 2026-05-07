import React, { useEffect, useMemo, useState } from 'react';

// Sprint 8.1: docked side panel for rapid shift assignment. Right-side
// drawer on desktop, full-width bottom sheet on mobile (<720px). Stays
// open after submit so the admin can rapidly add many shifts in one
// session — only the staff selection and notes reset on save; times,
// mode, and date range are retained.
//
// Two modes:
//   - Single: one staff × one date × one start/end → one POST.
//   - Recurring: one staff × multiple dates (computed from from/to/daysOfWeek)
//     × one start/end → N POSTs in a loop.
//
// Conflict detection (warn-but-allow per Sprint 8 plan) lands in 8.3.

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const fmtDate = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Map JS getDay() (Sun=0..Sat=6) to our Mon=0..Sun=6 indexing.
const dayIndex = (d) => (d.getDay() + 6) % 7;

// Compute the list of dates to schedule given a recurring spec.
// Inputs: ISO from, ISO to, Set of selected dayOfWeek indices (Mon=0..Sun=6).
// Output: array of YYYY-MM-DD strings, inclusive of both ends.
export const computeRecurringDates = (fromIso, toIso, selectedDays) => {
  if (!fromIso || !toIso) return [];
  const start = new Date(fromIso + 'T00:00:00');
  const end   = new Date(toIso   + 'T00:00:00');
  if (end < start) return [];
  const out = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    if (selectedDays.has(dayIndex(d))) out.push(fmtDate(d));
  }
  return out;
};

const AssignPanel = ({ open, employees, departments, templates, onClose, onSubmit, prefill }) => {
  // ── form state ──────────────────────────────────────────────────────────
  const [userId,     setUserId]     = useState('');
  const [mode,       setMode]       = useState('single'); // 'single' | 'recurring'
  const [date,       setDate]       = useState(fmtDate(today()));
  const [fromDate,   setFromDate]   = useState(fmtDate(today()));
  const [toDate,     setToDate]     = useState(fmtDate(addDays(today(), 6)));
  const [daysOfWeek, setDaysOfWeek] = useState(() => new Set([0, 1, 2, 3, 4])); // Mon-Fri
  const [startTime,  setStartTime]  = useState('09:00');
  const [endTime,    setEndTime]    = useState('17:00');
  const [templateId, setTemplateId] = useState('');
  const [notes,      setNotes]      = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [lastResult, setLastResult] = useState(null); // { ok, fail, message }

  // Apply prefill (e.g. when WeekView empty cell is clicked) once per change.
  useEffect(() => {
    if (!prefill) return;
    if (prefill.userId) setUserId(prefill.userId);
    if (prefill.date)   { setDate(fmtDate(prefill.date)); setMode('single'); }
  }, [prefill]);

  // ── derived ─────────────────────────────────────────────────────────────
  // Group employees by department for the <select> — much easier to scan
  // than a flat alphabetical list of 30+ staff.
  const empsByDept = useMemo(() => {
    const m = new Map();
    departments.forEach(d => m.set(d.department_id, { name: d.name, list: [] }));
    m.set('__none__', { name: 'Unassigned', list: [] });
    employees.forEach(e => {
      const key = e.department_id ?? '__none__';
      const bucket = m.get(key);
      if (bucket) bucket.list.push(e);
    });
    return [...m.values()].filter(d => d.list.length > 0);
  }, [employees, departments]);

  const selectedEmp = useMemo(
    () => employees.find(e => e.user_id === userId) || null,
    [employees, userId]
  );

  // Templates filtered by the selected staff's department (if any) — a
  // housekeeping shift template doesn't belong on a front-desk staff.
  const visibleTemplates = useMemo(() => {
    if (!selectedEmp) return [];
    return templates.filter(t => t.department_id === selectedEmp.department_id);
  }, [templates, selectedEmp]);

  const recurringDates = useMemo(
    () => mode === 'recurring' ? computeRecurringDates(fromDate, toDate, daysOfWeek) : [],
    [mode, fromDate, toDate, daysOfWeek]
  );
  const dateCount = mode === 'single' ? 1 : recurringDates.length;

  // ── handlers ────────────────────────────────────────────────────────────
  const applyTemplate = (id) => {
    setTemplateId(id);
    if (!id) return;
    const t = templates.find(tt => String(tt.shift_id) === String(id));
    if (t) {
      setStartTime(t.start_time.slice(0, 5));
      setEndTime  (t.end_time  .slice(0, 5));
    }
  };

  const toggleDay = (idx) => {
    setDaysOfWeek(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const validate = () => {
    if (!userId)              return 'Select a staff member.';
    if (!startTime)           return 'Start time required.';
    if (!endTime)             return 'End time required.';
    if (endTime <= startTime) return 'End time must be after start time.';
    if (mode === 'single' && !date) return 'Date required.';
    if (mode === 'recurring') {
      if (!fromDate || !toDate)         return 'From and To dates required.';
      if (daysOfWeek.size === 0)        return 'Pick at least one day of the week.';
      if (recurringDates.length === 0)  return 'No matching dates in that range — check the day selection.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    setSaving(true);
    setLastResult(null);

    const dates = mode === 'single' ? [date] : recurringDates;
    const result = await onSubmit({
      userId, dates, startTime, endTime,
      shiftId: templateId || null,
      notes:   notes      || null,
    });
    setSaving(false);
    setLastResult(result);

    if (result.ok > 0) {
      // Reset the rapid-add fields. Keep times/mode/range so admin can keep
      // adding similar shifts for other staff.
      setUserId('');
      setNotes('');
      setTemplateId('');
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Scrim — covers the page behind the panel. Click to close. */}
      <div className="assign-panel-scrim" onClick={onClose} aria-hidden />

      <aside className="assign-panel" role="dialog" aria-label="Assign shifts">
        <div className="assign-panel-head">
          <h3 className="assign-panel-title">Assign shifts</h3>
          <button type="button" className="assign-panel-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="assign-panel-body" onSubmit={handleSubmit}>
          {/* Staff (department-grouped) */}
          <div className="ap-field">
            <label className="ap-label">Staff *</label>
            <select className="ap-input" value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">Select staff…</option>
              {empsByDept.map(g => (
                <optgroup key={g.name} label={g.name}>
                  {g.list.map(emp => (
                    <option key={emp.user_id} value={emp.user_id}>{emp.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Mode toggle */}
          <div className="ap-field">
            <label className="ap-label">Schedule mode</label>
            <div className="ap-mode-toggle">
              <button
                type="button"
                className={`ap-mode-btn ${mode === 'single' ? 'is-active' : ''}`}
                onClick={() => setMode('single')}
              >Single date</button>
              <button
                type="button"
                className={`ap-mode-btn ${mode === 'recurring' ? 'is-active' : ''}`}
                onClick={() => setMode('recurring')}
              >Recurring</button>
            </div>
          </div>

          {/* Single-date fields */}
          {mode === 'single' && (
            <div className="ap-field">
              <label className="ap-label">Date *</label>
              <input
                type="date"
                className="ap-input"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          )}

          {/* Recurring fields */}
          {mode === 'recurring' && (
            <>
              <div className="ap-row">
                <div className="ap-field">
                  <label className="ap-label">From *</label>
                  <input type="date" className="ap-input" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                </div>
                <div className="ap-field">
                  <label className="ap-label">To *</label>
                  <input type="date" className="ap-input" value={toDate} onChange={e => setToDate(e.target.value)} />
                </div>
              </div>

              <div className="ap-field">
                <label className="ap-label">Days of week *</label>
                <div className="ap-dow">
                  {DAY_LETTERS.map((letter, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`ap-dow-btn ${daysOfWeek.has(i) ? 'is-active' : ''}`}
                      onClick={() => toggleDay(i)}
                      aria-pressed={daysOfWeek.has(i)}
                    >{letter}</button>
                  ))}
                </div>
                <div className="ap-dow-preview">
                  {recurringDates.length > 0
                    ? `${recurringDates.length} shift${recurringDates.length === 1 ? '' : 's'} will be created`
                    : 'No matching dates in that range'}
                </div>
              </div>
            </>
          )}

          {/* Time */}
          <div className="ap-row">
            <div className="ap-field">
              <label className="ap-label">Start *</label>
              <input type="time" className="ap-input" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="ap-field">
              <label className="ap-label">End *</label>
              <input type="time" className="ap-input" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Template (filtered by staff's department) */}
          {selectedEmp && visibleTemplates.length > 0 && (
            <div className="ap-field">
              <label className="ap-label">Template (optional)</label>
              <select className="ap-input" value={templateId} onChange={e => applyTemplate(e.target.value)}>
                <option value="">— None —</option>
                {visibleTemplates.map(t => (
                  <option key={t.shift_id} value={t.shift_id}>
                    {t.name} · {t.start_time.slice(0,5)}–{t.end_time.slice(0,5)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="ap-field">
            <label className="ap-label">Notes (optional)</label>
            <textarea
              className="ap-input ap-textarea"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything special about this shift?"
            />
          </div>

          {error && <div className="ap-error">{error}</div>}

          {lastResult && (
            <div className={`ap-result ${lastResult.fail > 0 ? 'is-warn' : 'is-ok'}`}>
              {lastResult.ok > 0 && <>✓ Added {lastResult.ok} shift{lastResult.ok === 1 ? '' : 's'}</>}
              {lastResult.fail > 0 && (
                <div className="ap-result-detail">
                  {lastResult.fail} failed{lastResult.message ? ` — ${lastResult.message}` : ''}
                </div>
              )}
            </div>
          )}

          <button type="submit" className="ap-submit" disabled={saving || dateCount === 0}>
            {saving
              ? 'Saving…'
              : dateCount > 1
                ? `Add ${dateCount} shifts`
                : 'Add shift'}
          </button>
        </form>
      </aside>
    </>
  );
};

export default AssignPanel;
