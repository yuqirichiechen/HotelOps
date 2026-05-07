import React, { useState } from 'react';
import { findConflicts } from './AssignPanel';

const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const fmtDate = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatTime = (timeStr) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour   = h % 12 || 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, '0')}${period}`;
};

const AssignModal = ({ modal, templates, schedules = [], onSave, onDelete, onClose }) => {
  const isEdit   = modal.type === 'edit';
  const schedule = isEdit ? modal.schedule : null;

  const displayName = isEdit ? schedule.employee_name : modal.employee.name;
  const displayDate = isEdit
    ? new Date(schedule.scheduled_date + 'T00:00:00')
    : new Date(modal.date);
  const deptId = isEdit ? schedule.department_id : modal.employee.department_id;

  const deptTemplates = templates.filter(t => t.department_id === deptId);

  const [startTime,      setStartTime]      = useState(isEdit ? schedule.start_time.slice(0, 5) : '');
  const [endTime,        setEndTime]        = useState(isEdit ? schedule.end_time.slice(0, 5)   : '');
  const [notes,          setNotes]          = useState(isEdit ? (schedule.notes || '') : '');
  const [error,          setError]          = useState('');
  const [saving,         setSaving]         = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [conflicts,      setConflicts]      = useState(null); // null = unchecked; [] = clear; [...] = warn

  const applyTemplate = (tmpl) => {
    setStartTime(tmpl.start_time.slice(0, 5));
    setEndTime(tmpl.end_time.slice(0, 5));
    setError('');
    setConflicts(null);
  };

  const proceedSave = async () => {
    setSaving(true);
    const msg = await onSave({ startTime, endTime, notes });
    setSaving(false);
    if (msg) setError(msg);
  };

  const handleSave = async () => {
    if (!startTime) { setError('Start time is required'); return; }
    if (!endTime)   { setError('End time is required');   return; }
    if (endTime <= startTime) { setError('End must be after start'); return; }

    // Pre-flight conflict check (warn-but-allow). For edit mode, exclude
    // the shift being edited so it doesn't conflict with itself.
    const userId  = isEdit ? schedule.user_id        : modal.employee.user_id;
    const dateIso = isEdit ? schedule.scheduled_date : fmtDate(modal.date);
    const c = findConflicts({
      userId,
      dates: [dateIso],
      startTime,
      endTime,
      excludeId: isEdit ? schedule.schedule_id : null,
      schedules,
    });
    if (c.length > 0) {
      setConflicts(c);
      return;
    }
    proceedSave();
  };

  const handleSaveAnyway = () => { setConflicts(null); proceedSave(); };
  const handleCancelConflict = () => setConflicts(null);

  const handleDelete = async () => {
    setSaving(true);
    await onDelete(schedule.schedule_id);
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{isEdit ? 'Edit Shift' : 'Assign Shift'}</h3>
            <p className="modal-subtitle">
              {displayName} · {DAY_NAMES[displayDate.getDay()]}, {MONTH_SHORT[displayDate.getMonth()]} {displayDate.getDate()}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {deptTemplates.length > 0 && (
          <div className="modal-templates">
            <div className="modal-section-label">Quick Templates</div>
            <div className="modal-template-row">
              {deptTemplates.map(t => (
                <button key={t.shift_id} className="template-pill" onClick={() => applyTemplate(t)}>
                  {t.name
                    ? `${t.name} (${formatTime(t.start_time)}–${formatTime(t.end_time)})`
                    : `${formatTime(t.start_time)}–${formatTime(t.end_time)}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="modal-body">
          <div className="modal-time-row">
            <div className="admin-field">
              <label>Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={e => { setStartTime(e.target.value); setError(''); }}
              />
            </div>
            <div className="admin-field">
              <label>End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={e => { setEndTime(e.target.value); setError(''); }}
              />
            </div>
          </div>

          <div className="admin-field">
            <label>Notes (optional)</label>
            <textarea
              className="modal-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Cover for Alice, training shift…"
            />
          </div>

          {error && <div className="admin-error">{error}</div>}

          {conflicts && conflicts.length > 0 && (
            <div className="ap-conflict modal-conflict">
              <div className="ap-conflict-head">
                ⚠ Overlaps {conflicts.length === 1 ? 'an existing shift' : `${conflicts.length} existing shifts`}
              </div>
              <ul className="ap-conflict-list">
                {conflicts.slice(0, 3).map(c => (
                  <li key={c.schedule_id}>
                    {formatTime(c.start_time.slice(0,5))}–{formatTime(c.end_time.slice(0,5))}
                  </li>
                ))}
                {conflicts.length > 3 && <li>…and {conflicts.length - 3} more</li>}
              </ul>
              <div className="ap-conflict-help">
                Hotels run 24/7 — overlaps are sometimes intentional. Save anyway?
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {isEdit && !confirmDelete && (
            <button className="btn-remove-shift" onClick={() => setConfirmDelete(true)}>
              Remove Shift
            </button>
          )}
          {isEdit && confirmDelete && (
            <div className="delete-confirm-inline">
              <span>Remove this shift?</span>
              <button className="btn-cancel-small" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn-confirm-delete" onClick={handleDelete} disabled={saving}>
                {saving ? 'Removing…' : 'Confirm'}
              </button>
            </div>
          )}
          {!confirmDelete && conflicts && conflicts.length > 0 && (
            <>
              <button className="btn-cancel-small" onClick={handleCancelConflict}>Cancel</button>
              <button
                className="btn-save ap-submit-warn"
                onClick={handleSaveAnyway}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save anyway'}
              </button>
            </>
          )}
          {!confirmDelete && (!conflicts || conflicts.length === 0) && (
            <button
              className="btn-save"
              onClick={handleSave}
              disabled={!startTime || !endTime || saving}
            >
              {saving ? 'Saving…' : isEdit ? 'Update Shift' : 'Assign Shift'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssignModal;
