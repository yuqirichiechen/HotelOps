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
  // Sprint 15.2: admin-defined status codes drive inline pill
  // rendering on cells whose display_text matches an abbreviation
  // (case-insensitive, whole-string). Pulled once on mount.
  const [statusCodes, setStatusCodes] = useState([]);
  // Sprint 15.3: pre-existing shift templates (the GM's saved
  // "9–5 / 11p–7a" presets), dept-scoped, used by the Edit Shift
  // popover's quick-pick pills.
  const [templates, setTemplates] = useState([]);

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

  // Sprint 15.2: status codes load once per mount — they don't
  // change between week navigations, so no point refetching on
  // every reload.
  useEffect(() => {
    let cancelled = false;
    apiFetch('/admin/status-codes').then(({ ok, data }) => {
      if (cancelled) return;
      if (ok && data?.success) setStatusCodes(data.codes || []);
    });
    fetch('/api/admin/shift-templates').then(r => r.json()).then(d => {
      if (cancelled) return;
      if (d?.success) setTemplates(d.templates || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Sprint 15.3: dept_id → templates[]. Saves the popover from
  // re-filtering on every render.
  const templatesByDept = useMemo(() => {
    const m = new Map();
    for (const t of templates) {
      if (!m.has(t.department_id)) m.set(t.department_id, []);
      m.get(t.department_id).push(t);
    }
    return m;
  }, [templates]);

  // Sprint 15.2: abbreviation (upper-cased) → code map for O(1)
  // lookup from the cell renderer.
  const statusByAbbr = useMemo(() => {
    const m = new Map();
    for (const c of statusCodes) {
      m.set(c.abbreviation.trim().toUpperCase(), c);
    }
    return m;
  }, [statusCodes]);

  // Sprint 15.2: pick a contrast-correct foreground for a given
  // hex bg. Simple luminance threshold — good enough for the small
  // palette we ship; can swap for proper APCA later if needed.
  const fgForBg = (hex) => {
    if (!hex || hex.length !== 7) return '#fff';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#1a202c' : '#ffffff';
  };

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

  // Sprint 15.1: per-dept "addable" pool. Each dept gets its own
  // typeahead listing only that dept's active employees who aren't
  // already on the sheet. Replaces the Sprint-14 single-bottom
  // dropdown — scoping the add action to the dept the GM is looking
  // at is one less context switch.
  const addableByDept = useMemo(() => {
    const inSheet = new Set(visibleRows.map(r => r.user_id));
    const byDept = new Map();
    for (const e of employees) {
      if (inSheet.has(e.user_id)) continue;
      const key = e.department_id ?? '__unassigned';
      if (!byDept.has(key)) byDept.set(key, []);
      byDept.get(key).push(e);
    }
    return byDept;
  }, [employees, visibleRows]);

  // Group by department. Order: by dept name, "Unassigned" last.
  // Sprint 15.1: include depts even when they have zero rows yet,
  // as long as they have addable staff — otherwise there'd be no
  // surface for the admin to add the *first* row to that dept.
  // Unassigned only appears when it has actual rows (you can't add
  // a "to Unassigned" row from the typeahead).
  const grouped = useMemo(() => {
    const rowsByDept = new Map();
    for (const r of visibleRows) {
      const key = r.department_id ?? '__unassigned';
      if (!rowsByDept.has(key)) rowsByDept.set(key, []);
      rowsByDept.get(key).push(r);
    }
    const byKey = new Map();
    for (const d of departments) {
      const rows = rowsByDept.get(d.department_id) || [];
      const hasAddable = (addableByDept.get(d.department_id) || []).length > 0;
      if (rows.length === 0 && !hasAddable) continue;
      byKey.set(d.department_id, {
        key:           d.department_id,
        name:          d.name,
        color:         d.color || null,
        department_id: d.department_id,
        rows,
      });
    }
    if (rowsByDept.has('__unassigned')) {
      byKey.set('__unassigned', {
        key:           '__unassigned',
        name:          'Unassigned',
        color:         null,
        department_id: null,
        rows:          rowsByDept.get('__unassigned'),
      });
    }
    const list = [...byKey.values()];
    list.forEach(g => g.rows.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    list.sort((a, b) => {
      if (a.name === 'Unassigned') return  1;
      if (b.name === 'Unassigned') return -1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [visibleRows, departments, addableByDept]);

  // Sprint 15.1: which dept's "+ Add staff" affordance is currently
  // expanded. Only one open at a time — clicking another dept's "+"
  // collapses the previous one. null = none open.
  const [addOpenDept, setAddOpenDept] = useState(null);

  // Sprint 15.3: cell Edit Shift popover. Anchored on desktop,
  // full-bleed bottom-sheet on mobile (<720px). Stores the target
  // cell coordinates + current cell state + draft edits.
  // Shape: null | { user_id, day_of_week, department_id, rect,
  //                 display_text, notes, dayLabel, userName }
  const [editPop, setEditPop] = useState(null);
  const openEditPop = useCallback((row, dayIdx, triggerEl) => {
    const existing = cellMap.get(`${row.user_id}|${dayIdx}`);
    const rect = triggerEl?.getBoundingClientRect();
    setEditPop({
      user_id:       row.user_id,
      day_of_week:   dayIdx,
      department_id: row.department_id,
      rect:          rect ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left } : null,
      display_text:  existing?.display_text || '',
      notes:         existing?.notes || '',
      dayLabel:      DAY_LABELS[dayIdx],
      userName:      row.name,
    });
  }, [cellMap]);
  useEffect(() => {
    if (!editPop) return;
    const onKey = (e) => { if (e.key === 'Escape') setEditPop(null); };
    const onScroll = () => setEditPop(null);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [editPop]);

  // Sprint 15.2: which row's "..." menu is open + its trigger's
  // bounding rect (so the popover can be position:fixed and escape
  // the .sheet-grid-wrap's overflow clipping).
  // Shape: null | { userId, rect: { top, right, bottom, left } }
  const [openRowMenu, setOpenRowMenu] = useState(null);
  useEffect(() => {
    if (!openRowMenu) return;
    const onDocClick = (e) => {
      if (e.target.closest?.('.sheet-row-menu-pop, .sheet-row-menu')) return;
      setOpenRowMenu(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenRowMenu(null);
    };
    const onScroll = () => setOpenRowMenu(null);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openRowMenu]);
  const toggleRowMenu = (userId, triggerEl) => {
    setOpenRowMenu(prev => {
      if (prev?.userId === userId) return null;
      const rect = triggerEl.getBoundingClientRect();
      return {
        userId,
        rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
      };
    });
  };

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

  // Sprint 15.2: remove a user from the sheet entirely. Bulk-deletes
  // every cell they have this week and drops them from the
  // session-added set so the row disappears even if they had no
  // cells (manually-added-but-empty case).
  const removeRow = useCallback(async (userId) => {
    const rowCells = cells.filter(c => c.user_id === userId);
    if (rowCells.length > 0) {
      const cellIds = rowCells.map(c => c.cell_id);
      await Promise.all(rowCells.map(c =>
        apiFetch(`/admin/sheet/cell?week_start=${weekStart}&user_id=${userId}&day_of_week=${c.day_of_week}`, {
          method: 'DELETE',
        })
      ));
      setCells(prev => prev.filter(c => !cellIds.includes(c.cell_id)));
    }
    setAddedUserIds(prev => {
      if (!prev.has(userId)) return prev;
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  }, [cells, weekStart]);

  // Sprint 15.2: copy every cell on a row to the *next* week. Each
  // PUT goes through the standard upsert endpoint so the parser +
  // segments stay in sync. Uses Promise.all — for 7 cells the
  // serial-ization cost isn't worth a bulk endpoint, but if this
  // becomes a common GM action we'll fold it into one.
  const copyRowToNextWeek = useCallback(async (userId) => {
    const rowCells = cells.filter(c => c.user_id === userId);
    if (rowCells.length === 0) return;
    const [y, m, d] = weekStart.split('-').map(Number);
    const nextWeek = localYmd(new Date(y, m - 1, d + 7));
    await Promise.all(rowCells.map(c =>
      apiFetch('/admin/sheet/cell', {
        method: 'PUT',
        body: JSON.stringify({
          week_start:   nextWeek,
          user_id:      userId,
          day_of_week:  c.day_of_week,
          display_text: c.display_text,
          highlight:    c.highlight,
        }),
      })
    ));
  }, [cells, weekStart]);

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
                    No staff or departments yet. Add a department in Settings, then come back to start a row.
                  </td>
                </tr>
              )}
              {grouped.map(group => {
                // Sprint 15.1: addable list for this dept's "+ Add"
                // affordance. Empty when every active employee in the
                // dept is already on the sheet.
                const addable = group.department_id != null
                  ? (addableByDept.get(group.department_id) || [])
                  : [];
                const addOpen = addOpenDept === group.key;
                const dotColor = group.color || 'var(--border)';
                return (
                  <React.Fragment key={group.key}>
                    <tr>
                      <td colSpan={9} className="sheet-dept-row">
                        <div className="sheet-dept-row-inner">
                          <span
                            className="sheet-dept-dot"
                            style={{ background: dotColor }}
                            aria-hidden
                          />
                          <span className="sheet-dept-name">{group.name}</span>
                          <span className="sheet-dept-count">
                            {group.rows.length} staff
                          </span>
                        </div>
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
                                hasNotes={!!cell?.notes}
                                highlight={!!cell?.highlight}
                                published={!!cell?.is_published}
                                statusByAbbr={statusByAbbr}
                                fgForBg={fgForBg}
                                onCommit={(text) => saveCell(row.user_id, idx, text)}
                                onToggleHighlight={
                                  cell ? () => toggleHighlight(cell.cell_id, !cell.highlight) : null
                                }
                                onOpenEdit={(e) => openEditPop(row, idx, e.currentTarget)}
                              />
                            );
                          })}
                          <td className="sheet-cell sheet-cell-actions">
                            {/* Sprint 15.2: per-row "..." menu replaces
                                the standalone publish toggle. Publish
                                state still reads at a glance via the
                                .is-published class on the trigger
                                (chip goes green). The popover renders
                                outside this td (page-root fixed) to
                                escape .sheet-grid-wrap's overflow. */}
                            <button
                              type="button"
                              className={`sheet-row-menu${allPub ? ' is-published' : ''}`}
                              onClick={(e) => toggleRowMenu(row.user_id, e.currentTarget)}
                              title={allPub
                                ? 'Row published. Click for actions.'
                                : 'Row actions'}
                              aria-haspopup="menu"
                              aria-expanded={openRowMenu?.userId === row.user_id}
                            >⋯</button>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Sprint 15.1: per-dept "+ Add staff" affordance.
                        Sits at the end of every dept section (except
                        Unassigned, which isn't an addable target).
                        Collapsed by default — click reveals the
                        dept-scoped typeahead inline. */}
                    {group.department_id != null && (
                      <tr className="sheet-add-row">
                        <td colSpan={9} className="sheet-add-cell">
                          {addOpen ? (
                            <div className="sheet-add-inline">
                              <DropdownSelect
                                value=""
                                placeholder={
                                  addable.length === 0
                                    ? `All ${group.name} staff already on the sheet`
                                    : `Add to ${group.name}…`
                                }
                                options={addable.map(e => ({
                                  value: e.user_id,
                                  label: e.name,
                                }))}
                                onChange={(uid) => {
                                  if (uid) {
                                    addStaffRow(uid);
                                    setAddOpenDept(null);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="sheet-add-cancel"
                                onClick={() => setAddOpenDept(null)}
                              >Cancel</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="sheet-add-btn"
                              onClick={() => setAddOpenDept(group.key)}
                              disabled={addable.length === 0}
                              title={addable.length === 0
                                ? `Every ${group.name} staff member is already on the sheet`
                                : `Add a ${group.name} staff member`}
                            >+ Add to {group.name}</button>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sprint 15.2: page-root row-action popover. Renders outside
          .sheet-grid-wrap so its position:fixed escapes the wrap's
          overflow clipping. Positioned right-aligned to the trigger,
          opening downward; flips above if it would go off-screen. */}
      {openRowMenu && (() => {
        const r = openRowMenu.rect;
        const menuWidth = 220;
        const menuHeight = 200; // approx; only used for flip check
        const flipUp = (r.bottom + menuHeight + 8) > window.innerHeight;
        const top  = flipUp ? Math.max(8, r.top - menuHeight - 6) : (r.bottom + 6);
        const left = Math.min(window.innerWidth - menuWidth - 8, Math.max(8, r.right - menuWidth));
        const row = visibleRows.find(x => x.user_id === openRowMenu.userId);
        if (!row) return null;
        const userId = row.user_id;
        const allPub = rowAllPublished(userId);
        const anyCells = rowAnyCells(userId);
        return (
          <div
            className="sheet-row-menu-pop"
            role="menu"
            style={{ top: `${top}px`, left: `${left}px`, width: `${menuWidth}px` }}
          >
            {anyCells && (
              <button
                type="button"
                role="menuitem"
                className="sheet-row-menu-item"
                onClick={() => { publishRow(userId); setOpenRowMenu(null); }}
              >
                <span className={`sheet-row-menu-dot${allPub ? ' is-published' : ''}`}>
                  {allPub ? '●' : '○'}
                </span>
                {allPub ? 'Unpublish row' : 'Publish row'}
              </button>
            )}
            {anyCells && (
              <button
                type="button"
                role="menuitem"
                className="sheet-row-menu-item"
                onClick={() => { copyRowToNextWeek(userId); setOpenRowMenu(null); }}
              >⎘ Copy row to next week</button>
            )}
            <button
              type="button"
              role="menuitem"
              className="sheet-row-menu-item"
              onClick={() => { setOpenRowMenu(null); goTo('staffDetail', { userId }); }}
            >→ View staff profile</button>
            <button
              type="button"
              role="menuitem"
              className="sheet-row-menu-item sheet-row-menu-danger"
              onClick={() => {
                const n = cells.filter(c => c.user_id === userId).length;
                if (window.confirm(`Remove ${row.name} from this week's sheet? ${n ? `Their ${n} cells will be deleted.` : ''}`)) {
                  removeRow(userId);
                }
                setOpenRowMenu(null);
              }}
            >✕ Remove from sheet</button>
          </div>
        );
      })()}

      {/* Sprint 15.3: page-root cell Edit Shift popover. Anchored on
          desktop, bottom-sheet on mobile. */}
      {editPop && (
        <CellEditPopover
          state={editPop}
          templates={templatesByDept.get(editPop.department_id) || []}
          statusCodes={statusCodes}
          fgForBg={fgForBg}
          onSave={async (next) => {
            const res = await apiFetch('/admin/sheet/cell', {
              method: 'PUT',
              body: JSON.stringify({
                week_start:   weekStart,
                user_id:      editPop.user_id,
                day_of_week:  editPop.day_of_week,
                display_text: next.display_text,
                notes:        next.notes || null,
              }),
            });
            if (res.ok && res.data?.success) {
              applyCellChanges(res.data.cell ? [res.data.cell] : []);
              // When display_text is blank the server returns null —
              // remove the cell from local state in that case.
              if (!res.data.cell) {
                setCells(prev => prev.filter(c =>
                  !(c.user_id === editPop.user_id && c.day_of_week === editPop.day_of_week)
                ));
              }
            }
            setEditPop(null);
          }}
          onClose={() => setEditPop(null)}
        />
      )}
    </div>
  );
};

// Sprint 15.3: cell Edit Shift popover. Two layouts:
//   - desktop (≥720px): anchored to the trigger via position:fixed
//   - mobile (<720px): full-bleed bottom sheet
// Both share the same body — template pills (dept-scoped), status
// code pills (admin-defined), custom text input, notes textarea,
// Save / Cancel. The free-form input is the same one the cell uses
// for fast inline editing, so power users get the same surface in
// both flows.
const CellEditPopover = ({ state, templates, statusCodes, fgForBg, onSave, onClose }) => {
  const [text,  setText]  = useState(state.display_text || '');
  const [notes, setNotes] = useState(state.notes || '');
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 720;

  // Compact pretty-time formatter for template pills. "07:00:00" →
  // "7a", "15:00:00" → "3p", "14:30:00" → "2:30p". Matches the
  // GM's own shorthand in the sheet.
  const fmtT = (t) => {
    if (!t) return '';
    const [hStr, mStr] = String(t).split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const period = h >= 12 ? 'p' : 'a';
    const h12 = h % 12 || 12;
    return m ? `${h12}:${String(m).padStart(2, '0')}${period}` : `${h12}${period}`;
  };
  const templateLabel = (t) => `${fmtT(t.start_time)}-${fmtT(t.end_time)}`;

  // Anchored positioning (desktop). Open below the trigger; flip
  // above when it'd go off-screen. Width fixed at 360px; left
  // aligned to the trigger's left edge but pulled in if it would
  // overflow the viewport.
  const WIDTH = 360;
  const HEIGHT_GUESS = 360;
  let posStyle;
  if (!isMobile && state.rect) {
    const r = state.rect;
    const flipUp = (r.bottom + HEIGHT_GUESS + 8) > window.innerHeight;
    const top  = flipUp ? Math.max(8, r.top - HEIGHT_GUESS - 6) : (r.bottom + 6);
    const left = Math.min(window.innerWidth - WIDTH - 8, Math.max(8, r.left));
    posStyle = { top: `${top}px`, left: `${left}px`, width: `${WIDTH}px` };
  }

  return (
    <>
      <div className="sheet-edit-backdrop" onClick={onClose} role="presentation" />
      <div
        className={`sheet-edit-pop${isMobile ? ' is-mobile' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${state.userName}'s ${state.dayLabel} shift`}
        style={posStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-edit-head">
          <div>
            <div className="sheet-edit-title">Edit Shift</div>
            <div className="sheet-edit-sub">{state.userName} · {state.dayLabel}</div>
          </div>
          <button
            type="button"
            className="sheet-edit-close"
            onClick={onClose}
            aria-label="Close"
          >✕</button>
        </div>

        {templates.length > 0 && (
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-label">Templates</div>
            <div className="sheet-edit-pills">
              {templates.map(t => (
                <button
                  key={t.shift_id}
                  type="button"
                  className={`sheet-edit-pill${text.trim() === templateLabel(t) ? ' is-active' : ''}`}
                  onClick={() => setText(templateLabel(t))}
                  title={t.name || ''}
                >{templateLabel(t)}</button>
              ))}
            </div>
          </div>
        )}

        {statusCodes.length > 0 && (
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-label">Status codes</div>
            <div className="sheet-edit-pills">
              {statusCodes.map(c => {
                const active = text.trim().toUpperCase() === c.abbreviation.toUpperCase();
                return (
                  <button
                    key={c.code_id}
                    type="button"
                    className={`sheet-edit-pill sheet-edit-pill-status${active ? ' is-active' : ''}`}
                    onClick={() => setText(c.abbreviation)}
                    style={{
                      background: c.color,
                      color:      fgForBg(c.color),
                      borderColor: c.color,
                    }}
                    title={c.label}
                  >{c.abbreviation}</button>
                );
              })}
            </div>
          </div>
        )}

        <div className="sheet-edit-section">
          <label className="sheet-edit-section-label" htmlFor="sheet-edit-text">Custom</label>
          <input
            id="sheet-edit-text"
            type="text"
            className="sheet-edit-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. 3p-11p, 9-12 / 4-8, OFF"
            autoFocus={!isMobile}
          />
        </div>

        <div className="sheet-edit-section">
          <label className="sheet-edit-section-label" htmlFor="sheet-edit-notes">
            Note <span className="sheet-edit-counter">{notes.length}/120</span>
          </label>
          <textarea
            id="sheet-edit-notes"
            className="sheet-edit-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 120))}
            placeholder="Add a note for this shift…"
            rows={3}
            maxLength={120}
          />
        </div>

        <div className="sheet-edit-actions">
          <button
            type="button"
            className="sheet-edit-btn sheet-edit-btn-cancel"
            onClick={onClose}
          >Cancel</button>
          <button
            type="button"
            className="sheet-edit-btn sheet-edit-btn-save"
            onClick={() => onSave({ display_text: text.trim(), notes: notes.trim() })}
          >Save</button>
        </div>
      </div>
    </>
  );
};

// Sprint 14 / 15.2: per-cell <td> that lets the admin type a
// free-form shift string. Autosaves on blur or on Enter; Tab moves
// focus to the next cell via the browser's default focus order.
// Doesn't fire a save if the value is unchanged from when the cell
// was focused.
//
// Sprint 15.2 adds status-code pill rendering: when the draft (or
// last-saved value) matches a known status_codes.abbreviation
// (case-insensitive, whole-string), the input is styled as a
// colored pill — admin-defined background + contrast-correct text.
// The input stays an <input> so keyboard editing keeps working;
// only its visual presentation changes.
const ShiftCellInput = ({ value, hasNotes, highlight, published, statusByAbbr, fgForBg, onCommit, onToggleHighlight, onOpenEdit }) => {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
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
  // Match against status code only when the cell is *not* focused.
  // While typing the admin should see what they're typing in normal
  // text, not a half-matched pill flicker.
  const matchedCode = (!focused && statusByAbbr)
    ? statusByAbbr.get((draft || '').trim().toUpperCase())
    : null;
  const classes = [
    'sheet-cell',
    'sheet-cell-input',
    highlight ? 'is-highlight' : '',
    published ? 'is-published' : '',
    matchedCode ? 'is-status' : '',
    hasNotes ? 'has-notes' : '',
  ].filter(Boolean).join(' ');
  const inputStyle = matchedCode
    ? { background: matchedCode.color, color: fgForBg(matchedCode.color), fontWeight: 700 }
    : undefined;
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
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); ref.current?.blur(); }
          if (e.key === 'Escape') {
            setDraft(lastSavedRef.current);
            ref.current?.blur();
          }
        }}
        placeholder="—"
        style={inputStyle}
        title={matchedCode ? matchedCode.label : undefined}
      />
      {/* Sprint 15.3: caret trigger for the Edit Shift popover. The
          input itself stays the fast path (click → focus → type);
          the caret is the thoughtful path that opens the full
          popover with template pills + notes textarea. Visible on
          hover/focus on desktop, always visible on touch (CSS). */}
      {onOpenEdit && (
        <button
          type="button"
          className="sheet-cell-edit"
          onClick={onOpenEdit}
          aria-label="Edit shift"
          tabIndex={-1}
        >▾</button>
      )}
      {/* Sprint 15.3: notes indicator. A small dot in the corner
          when a cell has a note attached, so the GM can scan-spot
          which cells carry extra context. */}
      {hasNotes && <span className="sheet-cell-notes-dot" aria-label="Has note" />}
    </td>
  );
};

export default ShiftSheet;
