import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { apiFetch } from '../../auth';
import { useView } from '../../shells/ViewContext';
import DropdownSelect from '../../components/shared/DropdownSelect';
import './ShiftSheet.css';

// Sprint 14: Shift Sheet — Excel-style weekly grid for shift
// planning, replacing the side-panel AssignPanel + AssignModal flow
// the GM never used. Rows = staff (grouped by department), columns
// = the 7 days of the week. Each cell is a contenteditable input
// that takes free-form text ("3p-11p", "OFF", "BRK+help") and
// autosaves on blur. Strict typeahead — only existing employees can
// be added to the grid.
//
// What ships in 14: draft-only CRUD (cells live in
// `schedule_sheet_cells` with `is_published = false`). The
// "publish to calendar" workflow + parsed time derivation + the
// calendar overlay + XLSX / PNG export all land in 14.x.

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n) => String(n).padStart(2, '0');
const localYmd = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const mondayOf = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay() || 7;  // Sun=7 (we want Mon=1)
  d.setDate(d.getDate() - (dow - 1));
  return d;
};

const fmtWeekLabel = (weekStart) => {
  const [y, m, d] = weekStart.split('-').map(Number);
  const monday = new Date(y, m - 1, d);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const same = monday.getMonth() === sunday.getMonth();
  const opts = { month: 'short', day: 'numeric' };
  const left  = monday.toLocaleDateString([], opts);
  const right = same
    ? sunday.getDate()
    : sunday.toLocaleDateString([], opts);
  return `${left} — ${right}, ${monday.getFullYear()}`;
};

const dayDate = (weekStart, idx) => {
  const [y, m, d] = weekStart.split('-').map(Number);
  const dt = new Date(y, m - 1, d + idx);
  return dt;
};

const ShiftSheet = () => {
  const { goTo } = useView();
  const [weekStart, setWeekStart]     = useState(() => localYmd(mondayOf(new Date())));
  const [cells, setCells]             = useState([]);
  const [employees, setEmployees]     = useState([]);
  const [departments, setDepartments] = useState([]);
  const [addedUserIds, setAddedUserIds] = useState(new Set());
  const [loading, setLoading]         = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [sheet, emp, dept] = await Promise.all([
      apiFetch(`/admin/sheet/week?week_start=${weekStart}`),
      fetch('/api/admin/employees').then(r => r.json()),
      fetch('/api/admin/departments').then(r => r.json()),
    ]);
    if (sheet.ok && sheet.data?.success) setCells(sheet.data.cells || []);
    if (emp?.success)  setEmployees(emp.employees.filter(e => e.active) || []);
    if (dept?.success) setDepartments(dept.departments || []);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { reload(); }, [reload]);

  // (user_id, day_of_week) → cell
  const cellMap = useMemo(() => {
    const m = new Map();
    for (const c of cells) m.set(`${c.user_id}|${c.day_of_week}`, c);
    return m;
  }, [cells]);

  // Visible rows = staff with at least one cell this week, plus any
  // manually-added-this-session employees who haven't typed yet.
  const visibleRows = useMemo(() => {
    const ids = new Set(cells.map(c => c.user_id));
    addedUserIds.forEach(id => ids.add(id));
    return employees
      .filter(e => ids.has(e.user_id))
      .map(e => ({
        user_id:       e.user_id,
        name:          e.name,
        department_id: e.department_id,
        department:    e.department || departments.find(d => d.department_id === e.department_id)?.name || null,
      }));
  }, [cells, addedUserIds, employees, departments]);

  // Group by department. Order: by dept name, "Unassigned" last.
  const grouped = useMemo(() => {
    const m = new Map();
    for (const r of visibleRows) {
      const key = r.department_id ?? '__unassigned';
      if (!m.has(key)) m.set(key, { name: r.department || 'Unassigned', rows: [] });
      m.get(key).rows.push(r);
    }
    const list = [...m.entries()].map(([key, v]) => ({ key, ...v }));
    list.forEach(g => g.rows.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    list.sort((a, b) => {
      if (a.name === 'Unassigned') return  1;
      if (b.name === 'Unassigned') return -1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [visibleRows]);

  // Pool for the "+ Add staff" dropdown: every active employee
  // *not* already in the sheet (so we don't show duplicates).
  const addablePool = useMemo(() => {
    const inSheet = new Set(visibleRows.map(r => r.user_id));
    return employees.filter(e => !inSheet.has(e.user_id));
  }, [employees, visibleRows]);

  const saveCell = useCallback(async (user_id, day_of_week, displayText) => {
    const res = await apiFetch('/admin/sheet/cell', {
      method: 'PUT',
      body: JSON.stringify({
        week_start: weekStart,
        user_id,
        day_of_week,
        display_text: displayText,
      }),
    });
    if (res.ok && res.data?.success) {
      setCells(prev => {
        const filtered = prev.filter(c => !(c.user_id === user_id && c.day_of_week === day_of_week));
        if (res.data.cell) return [...filtered, res.data.cell];
        return filtered;
      });
    }
  }, [weekStart]);

  const applyCellChanges = (changed) => {
    if (!Array.isArray(changed) || changed.length === 0) return;
    setCells(prev => {
      const map = new Map(prev.map(c => [c.cell_id, c]));
      for (const c of changed) map.set(c.cell_id, c);
      return [...map.values()];
    });
  };

  const toggleHighlight = useCallback(async (cell_id, next) => {
    const res = await apiFetch('/admin/sheet/cell/highlight', {
      method: 'PUT',
      body: JSON.stringify({ cell_id, highlight: next }),
    });
    if (res.ok && res.data?.success) applyCellChanges([res.data.cell]);
  }, []);

  const publishCellIds = useCallback(async (cellIds, next) => {
    if (!cellIds || cellIds.length === 0) return;
    const path = next ? '/admin/sheet/publish' : '/admin/sheet/unpublish';
    const res = await apiFetch(path, {
      method: 'POST',
      body: JSON.stringify({ cell_ids: cellIds }),
    });
    if (res.ok && res.data?.success) applyCellChanges(res.data.cells || []);
  }, []);

  const publishWeek = useCallback(async (next) => {
    const res = await apiFetch(next ? '/admin/sheet/publish' : '/admin/sheet/unpublish', {
      method: 'POST',
      body: JSON.stringify({ week_start: weekStart }),
    });
    if (res.ok && res.data?.success) applyCellChanges(res.data.cells || []);
  }, [weekStart]);

  const addStaffRow = (userId) => {
    setAddedUserIds(prev => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
  };

  // Sprint 14.1: XLSX export mirrors the GM's Excel layout — header
  // row of day-name + day-number, dept section rows in uppercase,
  // staff rows with the display_text per day. Single sheet per
  // workbook; filename includes the week_start date.
  const exportXLSX = useCallback(() => {
    const headerRow = ['Staff', ...DAY_LABELS.map((label, idx) => `${label} ${dayDate(weekStart, idx).getDate()}`)];
    const aoa = [headerRow];
    for (const group of grouped) {
      aoa.push([group.name.toUpperCase(), '', '', '', '', '', '', '']);
      for (const row of group.rows) {
        const cells = DAY_LABELS.map((_, idx) => {
          const c = cellMap.get(`${row.user_id}|${idx}`);
          return c?.display_text || '';
        });
        aoa.push([row.name, ...cells]);
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 22 }, ...Array(7).fill({ wch: 14 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
    XLSX.writeFile(wb, `schedule-${weekStart}.xlsx`);
  }, [weekStart, grouped, cellMap]);

  // Sprint 14.2: PNG export. Snapshots the rendered sheet grid via
  // html2canvas and triggers a download. Captures the .sheet-grid-wrap
  // so headers + dept rows + cells are all in-frame. Pixel ratio is
  // bumped for legibility on Retina (the snapshot is what gets
  // texted/Slacked, not the live DOM).
  const gridRef = useRef(null);
  const [exportingPng, setExportingPng] = useState(false);
  const exportPNG = useCallback(async () => {
    if (!gridRef.current) return;
    setExportingPng(true);
    try {
      const canvas = await html2canvas(gridRef.current, {
        backgroundColor: '#ffffff',
        scale: window.devicePixelRatio > 1 ? 2 : 1.5,
        useCORS: true,
        logging: false,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `schedule-${weekStart}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('[exportPNG]', err);
    } finally {
      setExportingPng(false);
    }
  }, [weekStart]);

  // Per-row publish toggle: collect every cell_id for the row, send
  // them through the bulk endpoint. Computes the *target* flag from
  // whether any cell in the row is still draft (next = true if not
  // already fully published).
  const publishRow = (userId) => {
    const rowCells = cells.filter(c => c.user_id === userId);
    if (rowCells.length === 0) return;
    const allPublished = rowCells.every(c => c.is_published);
    const next = !allPublished;
    publishCellIds(rowCells.map(c => c.cell_id), next);
  };
  const rowAllPublished = (userId) => {
    const rowCells = cells.filter(c => c.user_id === userId);
    return rowCells.length > 0 && rowCells.every(c => c.is_published);
  };
  const rowAnyCells = (userId) =>
    cells.some(c => c.user_id === userId);
  const weekAllPublished = useMemo(
    () => cells.length > 0 && cells.every(c => c.is_published),
    [cells]
  );

  // Week navigation
  const shiftWeek = (delta) => {
    const [y, m, d] = weekStart.split('-').map(Number);
    const dt = new Date(y, m - 1, d + delta * 7);
    setWeekStart(localYmd(dt));
  };
  const goToToday = () => setWeekStart(localYmd(mondayOf(new Date())));

  return (
    <div className="sheet-page">
      <div className="sheet-topbar">
        <div className="sheet-topbar-left">
          <button className="btn-back" onClick={() => goTo('calendar')}>‹ Calendar</button>
          <h2 className="sheet-title">Shift Sheet</h2>
        </div>
        <div className="sheet-topbar-controls">
          <button className="sheet-nav-arrow" onClick={() => shiftWeek(-1)} aria-label="Previous week">‹</button>
          <button className="sheet-nav-today" onClick={goToToday}>Today</button>
          <button className="sheet-nav-arrow" onClick={() => shiftWeek(+1)} aria-label="Next week">›</button>
          <span className="sheet-week-label">{fmtWeekLabel(weekStart)}</span>
          {/* Sprint 14.1: bulk-publish + XLSX export. Publish toggles
              every cell on the current week; XLSX dumps the visible
              grid into a workbook the GM can hand off to payroll. */}
          <button
            type="button"
            className={`sheet-publish-btn${weekAllPublished ? ' is-published' : ''}`}
            onClick={() => publishWeek(!weekAllPublished)}
            disabled={cells.length === 0}
            title={weekAllPublished
              ? 'All cells published — click to unpublish this week'
              : 'Publish every cell on this week to the calendar overlay'}
          >
            {weekAllPublished ? '● Published' : 'Publish week'}
          </button>
          <button
            type="button"
            className="sheet-export-btn"
            onClick={exportXLSX}
            disabled={cells.length === 0}
            title="Download .xlsx"
          >↓ XLSX</button>
          {/* Sprint 14.2: PNG export. Snapshot of the rendered grid,
              handy for Slack / text-message handoffs where opening a
              spreadsheet would be friction. */}
          <button
            type="button"
            className="sheet-export-btn"
            onClick={exportPNG}
            disabled={cells.length === 0 || exportingPng}
            title="Download .png"
          >{exportingPng ? '…' : '↓ PNG'}</button>
        </div>
      </div>

      {loading && visibleRows.length === 0 ? (
        <div className="sheet-empty">Loading…</div>
      ) : (
        <div className="sheet-grid-wrap" ref={gridRef}>
          <table className="sheet-grid">
            <thead>
              <tr>
                <th className="sheet-th sheet-th-staff">Staff</th>
                {DAY_LABELS.map((label, idx) => {
                  const d = dayDate(weekStart, idx);
                  return (
                    <th key={label} className="sheet-th">
                      <div className="sheet-th-dayname">{label}</div>
                      <div className="sheet-th-daynum">{d.getDate()}</div>
                    </th>
                  );
                })}
                {/* Sprint 14.1: trailing column for per-row publish
                    button. Narrower than the day cells. */}
                <th className="sheet-th sheet-th-actions" aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 && (
                <tr>
                  <td colSpan={9} className="sheet-empty-row">
                    No staff on the sheet yet. Use “Add staff” below to start a row.
                  </td>
                </tr>
              )}
              {grouped.map(group => (
                <React.Fragment key={group.key}>
                  <tr>
                    <td colSpan={9} className="sheet-dept-row">
                      {group.name}
                    </td>
                  </tr>
                  {group.rows.map(row => {
                    const allPub = rowAllPublished(row.user_id);
                    const anyCells = rowAnyCells(row.user_id);
                    return (
                      <tr key={row.user_id} className="sheet-row">
                        <td className="sheet-cell sheet-cell-name">{row.name}</td>
                        {DAY_LABELS.map((_, idx) => {
                          const cell = cellMap.get(`${row.user_id}|${idx}`);
                          return (
                            <ShiftCellInput
                              key={idx}
                              value={cell?.display_text || ''}
                              highlight={!!cell?.highlight}
                              published={!!cell?.is_published}
                              onCommit={(text) => saveCell(row.user_id, idx, text)}
                              onToggleHighlight={
                                cell ? () => toggleHighlight(cell.cell_id, !cell.highlight) : null
                              }
                            />
                          );
                        })}
                        <td className="sheet-cell sheet-cell-actions">
                          {anyCells && (
                            <button
                              type="button"
                              className={`sheet-row-publish${allPub ? ' is-published' : ''}`}
                              onClick={() => publishRow(row.user_id)}
                              title={allPub
                                ? 'Row published — click to unpublish'
                                : 'Publish this row to the calendar overlay'}
                            >
                              {allPub ? '●' : '○'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          <div className="sheet-add-staff">
            <span className="sheet-add-staff-label">Add staff</span>
            <DropdownSelect
              value=""
              placeholder={
                addablePool.length === 0
                  ? 'All staff already on the sheet'
                  : 'Pick an employee…'
              }
              options={addablePool.map(e => ({
                value: e.user_id,
                label: `${e.name}${e.department ? ` · ${e.department}` : ''}`,
              }))}
              onChange={(uid) => uid && addStaffRow(uid)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Sprint 14: per-cell <td> that lets the admin type a free-form
// shift string. Autosaves on blur or on Enter; Tab moves focus to
// the next cell via the browser's default focus order. Doesn't fire
// a save if the value is unchanged from when the cell was focused.
const ShiftCellInput = ({ value, highlight, published, onCommit, onToggleHighlight }) => {
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  const lastSavedRef = useRef(value);
  useEffect(() => {
    setDraft(value);
    lastSavedRef.current = value;
  }, [value]);
  const commit = () => {
    const next = draft.trim();
    if (next === lastSavedRef.current) return;
    lastSavedRef.current = next;
    onCommit(next);
  };
  const classes = [
    'sheet-cell',
    'sheet-cell-input',
    highlight ? 'is-highlight' : '',
    published ? 'is-published' : '',
  ].filter(Boolean).join(' ');
  return (
    <td
      className={classes}
      onContextMenu={(e) => {
        // Sprint 14.1: right-click toggles yellow highlight. Long-press
        // on touch devices fires contextmenu too. Only available for
        // cells that exist in the DB (have an onToggleHighlight handler).
        if (onToggleHighlight) {
          e.preventDefault();
          onToggleHighlight();
        }
      }}
    >
      <input
        ref={ref}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); ref.current?.blur(); }
          if (e.key === 'Escape') {
            setDraft(lastSavedRef.current);
            ref.current?.blur();
          }
        }}
        placeholder="—"
      />
    </td>
  );
};

export default ShiftSheet;
