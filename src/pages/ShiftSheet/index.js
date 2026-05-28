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
  // Sprint 15.4: right-rail Week Overview aggregates. Refetched
  // on week change + after publish/unpublish/cell-edit actions.
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  // Sprint 15.5: toolbar tools.
  const [showTemplates,  setShowTemplates]  = useState(false);
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  const [showValidate,   setShowValidate]   = useState(false);
  // Auto-fill suggestions overlay: `${user_id}|${dow}` → text.
  // Empty until the admin runs Auto-Fill. Lives client-side only
  // until "Apply all" pushes the approved set through the bulk
  // endpoint.
  const [autoFillSugg, setAutoFillSugg] = useState(new Map());
  const [autoFillBusy, setAutoFillBusy] = useState(false);
  const [toolError,    setToolError]    = useState(null);

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

  // Sprint 15.4: refetch the right-rail overview on week change.
  // Mutation handlers (publish, cell edit) also call this manually
  // via reloadOverview() so the counts stay live.
  const reloadOverview = useCallback(async () => {
    setOverviewLoading(true);
    const tz = new Date().getTimezoneOffset();
    const { ok, data } = await apiFetch(
      `/admin/sheet/week-overview?week_start=${weekStart}&tz_offset_minutes=${tz}`
    );
    if (ok && data?.success) setOverview(data);
    else                     setOverview(null);
    setOverviewLoading(false);
  }, [weekStart]);
  useEffect(() => { reloadOverview(); }, [reloadOverview]);

  // Sprint 15.5: tool handlers. Each one calls reload() + reloadOverview()
  // after a successful mutation so the sheet + rail stay current.
  const runCopyPrevWeek = useCallback(async (overwrite) => {
    setToolError(null);
    const { ok, data } = await apiFetch('/admin/sheet/copy-from-previous', {
      method: 'POST',
      body: JSON.stringify({ week_start: weekStart, overwrite: !!overwrite }),
    });
    if (!ok || !data?.success) {
      setToolError(data?.message || 'Could not copy previous week.');
      return;
    }
    setShowCopyConfirm(false);
    await reload();
    reloadOverview();
  }, [weekStart, reload, reloadOverview]);

  const runAutoFillPreview = useCallback(async () => {
    setToolError(null);
    setAutoFillBusy(true);
    const tz = new Date().getTimezoneOffset();
    const { ok, data } = await apiFetch(
      `/admin/sheet/auto-fill-preview?tz_offset_minutes=${tz}`,
      { method: 'POST', body: JSON.stringify({ week_start: weekStart }) }
    );
    setAutoFillBusy(false);
    if (!ok || !data?.success) {
      setToolError(data?.message || 'Auto-Fill preview failed.');
      return;
    }
    // Drop suggestions whose cell already has content (empties-only
    // default; admin can flip overwrite at Apply All time).
    const occupied = new Set(cells.filter(c => c.display_text).map(c => `${c.user_id}|${c.day_of_week}`));
    const m = new Map();
    for (const s of (data.suggestions || [])) {
      const key = `${s.user_id}|${s.day_of_week}`;
      if (occupied.has(key)) continue;
      m.set(key, s.display_text);
    }
    setAutoFillSugg(m);
  }, [weekStart, cells]);

  const applyAutoFill = useCallback(async (overwrite) => {
    if (autoFillSugg.size === 0) return;
    setAutoFillBusy(true);
    const suggestions = [...autoFillSugg.entries()].map(([key, display_text]) => {
      const [user_id, dowStr] = key.split('|');
      return { user_id, day_of_week: parseInt(dowStr, 10), display_text };
    });
    const { ok, data } = await apiFetch('/admin/sheet/auto-fill-apply', {
      method: 'POST',
      body: JSON.stringify({ week_start: weekStart, suggestions, overwrite: !!overwrite }),
    });
    setAutoFillBusy(false);
    if (!ok || !data?.success) {
      setToolError(data?.message || 'Auto-Fill apply failed.');
      return;
    }
    setAutoFillSugg(new Map());
    await reload();
    reloadOverview();
  }, [autoFillSugg, weekStart, reload, reloadOverview]);

  const discardAutoFill = () => setAutoFillSugg(new Map());

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
      reloadOverview();
    }
  }, [weekStart, reloadOverview]);

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
    if (res.ok && res.data?.success) {
      applyCellChanges(res.data.cells || []);
      reloadOverview();
    }
  }, [reloadOverview]);

  const publishWeek = useCallback(async (next) => {
    const res = await apiFetch(next ? '/admin/sheet/publish' : '/admin/sheet/unpublish', {
      method: 'POST',
      body: JSON.stringify({ week_start: weekStart }),
    });
    if (res.ok && res.data?.success) {
      applyCellChanges(res.data.cells || []);
      reloadOverview();
    }
  }, [weekStart, reloadOverview]);

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
    reloadOverview();
  }, [cells, weekStart, reloadOverview]);

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

      {/* Sprint 15.5: tool row — Templates / Copy Previous Week /
          Auto-Fill / Validate. Sits between the topbar (week nav +
          export) and the grid. */}
      <div className="sheet-toolbar">
        <button
          type="button"
          className="sheet-tool-btn"
          onClick={() => setShowTemplates(true)}
        >☰ Shift Templates</button>
        <button
          type="button"
          className="sheet-tool-btn"
          onClick={() => { setShowCopyConfirm(true); setToolError(null); }}
        >⎘ Copy Previous Week</button>
        <button
          type="button"
          className="sheet-tool-btn"
          onClick={runAutoFillPreview}
          disabled={autoFillBusy}
        >{autoFillBusy ? '…' : '✨ Auto-Fill'}</button>
        <button
          type="button"
          className="sheet-tool-btn"
          onClick={() => setShowValidate(true)}
        >✓ Validate Schedule</button>
        {toolError && (
          <span className="sheet-tool-err">{toolError}</span>
        )}
      </div>

      {loading && visibleRows.length === 0 ? (
        <div className="sheet-empty">Loading…</div>
      ) : (
        <div className="sheet-layout">
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
                                suggestion={!cell ? autoFillSugg.get(`${row.user_id}|${idx}`) : null}
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
        {/* Sprint 15.4: right-rail Week Overview. Rendered at
            ≥1200px alongside the grid; collapses to a compact
            bottom strip on narrower viewports (CSS-driven). */}
        <SheetOverviewRail
          overview={overview}
          loading={overviewLoading}
        />
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
              reloadOverview();
            }
            setEditPop(null);
          }}
          onClose={() => setEditPop(null)}
        />
      )}

      {/* Sprint 15.5: auto-fill sticky action bar. Visible whenever
          there are pending suggestions; offers Apply all / Discard.
          Includes an "Include existing cells" checkbox per the
          §3 tuning resolution. */}
      {autoFillSugg.size > 0 && (
        <AutoFillBar
          count={autoFillSugg.size}
          busy={autoFillBusy}
          onApply={(includeExisting) => applyAutoFill(includeExisting)}
          onDiscard={discardAutoFill}
        />
      )}

      {/* Sprint 15.5: Shift Templates modal — full CRUD. */}
      {showTemplates && (
        <ShiftTemplatesModal
          templates={templates}
          departments={departments}
          onClose={() => setShowTemplates(false)}
          onRefresh={async () => {
            const d = await fetch('/api/admin/shift-templates').then(r => r.json()).catch(() => null);
            if (d?.success) setTemplates(d.templates || []);
          }}
        />
      )}

      {/* Sprint 15.5: Copy Previous Week confirm dialog. */}
      {showCopyConfirm && (
        <CopyPrevWeekDialog
          weekStart={weekStart}
          onCancel={() => setShowCopyConfirm(false)}
          onConfirm={(overwrite) => runCopyPrevWeek(overwrite)}
        />
      )}

      {/* Sprint 15.5: Validate Schedule modal. Re-uses the
          week-overview conflicts payload. */}
      {showValidate && (
        <ValidateScheduleModal
          overview={overview}
          loading={overviewLoading}
          onClose={() => setShowValidate(false)}
        />
      )}
    </div>
  );
};

// Sprint 15.5: sticky bottom bar that appears while there are
// pending auto-fill suggestions. Two actions: Apply all (with an
// "Include existing cells" override per §3 tuning) and Discard.
const AutoFillBar = ({ count, busy, onApply, onDiscard }) => {
  const [includeExisting, setIncludeExisting] = useState(false);
  return (
    <div className="sheet-autofill-bar" role="status">
      <span className="sheet-autofill-bar-count">
        <strong>{count}</strong> Auto-Fill suggestion{count === 1 ? '' : 's'} ready
      </span>
      <label className="sheet-autofill-bar-check">
        <input
          type="checkbox"
          checked={includeExisting}
          onChange={(e) => setIncludeExisting(e.target.checked)}
        />
        <span>Include existing cells (overwrite)</span>
      </label>
      <button
        type="button"
        className="sheet-tool-btn sheet-autofill-discard"
        onClick={onDiscard}
        disabled={busy}
      >Discard</button>
      <button
        type="button"
        className="sheet-tool-btn sheet-autofill-apply"
        onClick={() => onApply(includeExisting)}
        disabled={busy}
      >{busy ? '…' : 'Apply all'}</button>
    </div>
  );
};

// Sprint 15.5: Shift Templates modal — CRUD over the existing
// `shifts` table (which the GET endpoint exposes as
// "templates"). Each template is dept-scoped + has a start/end
// time the popover (15.3) renders as a quick-pick pill.
const ShiftTemplatesModal = ({ templates, departments, onClose, onRefresh }) => {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);
  const blank = { name: '', department_id: departments[0]?.department_id || '', start_time: '09:00', end_time: '17:00' };
  const [draft, setDraft] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const fmtT = (t) => t ? String(t).slice(0, 5) : '';

  const submit = async () => {
    if (!draft.name.trim() || !draft.department_id || !draft.start_time || !draft.end_time) {
      setErr('Name, department, start, and end are all required.');
      return;
    }
    setBusy(true); setErr(null);
    const path = editingId
      ? `/admin/shift-templates/${editingId}`
      : '/admin/shift-templates';
    const { ok, data } = await apiFetch(path, {
      method: editingId ? 'PATCH' : 'POST',
      body: JSON.stringify({
        name:          draft.name.trim(),
        department_id: draft.department_id,
        start_time:    draft.start_time,
        end_time:      draft.end_time,
      }),
    });
    setBusy(false);
    if (!ok || !data?.success) {
      setErr(data?.message || 'Save failed.');
      return;
    }
    setDraft(blank);
    setEditingId(null);
    await onRefresh();
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    setBusy(true); setErr(null);
    const { ok, data } = await apiFetch(`/admin/shift-templates/${t.shift_id}`, { method: 'DELETE' });
    setBusy(false);
    if (!ok || !data?.success) {
      setErr(data?.message || 'Delete failed.');
      return;
    }
    await onRefresh();
  };

  return (
    <div className="sheet-modal-backdrop" onClick={onClose} role="presentation">
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-modal-head">
          <h3>Shift Templates</h3>
          <button type="button" className="sheet-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-modal-body">
          <p className="sheet-modal-help">
            Templates show up as quick-pick pills in the Edit Shift popover, dept-scoped to the row.
          </p>

          {templates.length === 0 ? (
            <div className="sheet-overview-empty">No templates yet — add one below.</div>
          ) : (
            <ul className="sheet-tpl-list">
              {templates.map(t => (
                <li key={t.shift_id} className="sheet-tpl-row">
                  <span className="sheet-tpl-name">{t.name}</span>
                  <span className="sheet-tpl-dept">{t.department_name}</span>
                  <span className="sheet-tpl-time">{fmtT(t.start_time)} – {fmtT(t.end_time)}</span>
                  <button
                    type="button"
                    className="settings-dept-btn"
                    onClick={() => {
                      setEditingId(t.shift_id);
                      setDraft({
                        name:          t.name,
                        department_id: t.department_id,
                        start_time:    fmtT(t.start_time),
                        end_time:      fmtT(t.end_time),
                      });
                    }}
                    disabled={busy}
                  >Edit</button>
                  <button
                    type="button"
                    className="settings-dept-btn settings-dept-btn-danger"
                    onClick={() => remove(t)}
                    disabled={busy}
                  >Delete</button>
                </li>
              ))}
            </ul>
          )}

          <div className="sheet-tpl-form">
            <div className="sheet-tpl-form-title">
              {editingId ? 'Edit template' : 'Add template'}
            </div>
            <div className="sheet-tpl-form-row">
              <input
                type="text"
                className="sheet-edit-input"
                value={draft.name}
                onChange={(e) => setDraft(s => ({ ...s, name: e.target.value }))}
                placeholder="Name (e.g. Front Desk AM)"
              />
            </div>
            <div className="sheet-tpl-form-row">
              <select
                className="sheet-edit-input"
                value={draft.department_id}
                onChange={(e) => setDraft(s => ({ ...s, department_id: e.target.value }))}
              >
                {departments.map(d => (
                  <option key={d.department_id} value={d.department_id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="sheet-tpl-form-row sheet-tpl-form-times">
              <input
                type="time"
                className="sheet-edit-input"
                value={draft.start_time}
                onChange={(e) => setDraft(s => ({ ...s, start_time: e.target.value }))}
              />
              <span>to</span>
              <input
                type="time"
                className="sheet-edit-input"
                value={draft.end_time}
                onChange={(e) => setDraft(s => ({ ...s, end_time: e.target.value }))}
              />
            </div>
            <div className="sheet-tpl-form-actions">
              {editingId && (
                <button
                  type="button"
                  className="sheet-edit-btn sheet-edit-btn-cancel"
                  onClick={() => { setEditingId(null); setDraft(blank); }}
                  disabled={busy}
                >Cancel edit</button>
              )}
              <button
                type="button"
                className="sheet-edit-btn sheet-edit-btn-save"
                onClick={submit}
                disabled={busy}
              >{editingId ? 'Save changes' : '+ Add template'}</button>
            </div>
          </div>

          {err && <div className="sheet-modal-err">{err}</div>}
        </div>
      </div>
    </div>
  );
};

// Sprint 15.5: Copy Previous Week confirm dialog. Warns about
// overwrite + offers an opt-in "Include existing cells" toggle.
const CopyPrevWeekDialog = ({ weekStart, onCancel, onConfirm }) => {
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  // Pretty-print the source week ("week of <prev Monday>") for the
  // confirm dialog's body so the GM has zero ambiguity about what
  // they're about to copy from.
  const [y, m, d] = weekStart.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 7);
  const prevLabel = `${prev.toLocaleString('en-US', { month: 'short' })} ${prev.getDate()}`;
  return (
    <div className="sheet-modal-backdrop" onClick={onCancel} role="presentation">
      <div className="sheet-modal sheet-modal-narrow" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-modal-head">
          <h3>Copy Previous Week</h3>
          <button type="button" className="sheet-modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="sheet-modal-body">
          <p>
            Copy every cell from the week of <strong>{prevLabel}</strong> into this week as fresh drafts.
          </p>
          <label className="sheet-autofill-bar-check">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            <span>Include existing cells (overwrite this week's edits)</span>
          </label>
          <div className="sheet-edit-actions">
            <button
              type="button"
              className="sheet-edit-btn sheet-edit-btn-cancel"
              onClick={onCancel}
              disabled={busy}
            >Cancel</button>
            <button
              type="button"
              className="sheet-edit-btn sheet-edit-btn-save"
              onClick={async () => { setBusy(true); await onConfirm(overwrite); setBusy(false); }}
              disabled={busy}
            >{busy ? '…' : 'Copy'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Sprint 15.5: Validate Schedule modal — surfaces the
// week-overview conflicts list. v1 only includes the
// self-overlap rule (15.4 server-side); future sprints may
// add cross-cell + min/max-hours / break-missing checks.
const ValidateScheduleModal = ({ overview, loading, onClose }) => {
  const dayShort = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const conflicts = overview?.conflicts || [];
  return (
    <div className="sheet-modal-backdrop" onClick={onClose} role="presentation">
      <div className="sheet-modal sheet-modal-narrow" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-modal-head">
          <h3>Validate Schedule</h3>
          <button type="button" className="sheet-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-modal-body">
          {loading ? (
            <div className="sheet-overview-empty">Checking…</div>
          ) : conflicts.length === 0 ? (
            <div className="sheet-validate-clean">
              <div className="sheet-validate-clean-icon">✓</div>
              <div className="sheet-validate-clean-title">No conflicts detected</div>
              <div className="sheet-validate-clean-sub">Every published cell parses cleanly.</div>
            </div>
          ) : (
            <>
              <p>
                <strong>{conflicts.length}</strong> conflict{conflicts.length === 1 ? '' : 's'} found.
              </p>
              <ul className="sheet-overview-list">
                {conflicts.map(c => (
                  <li key={c.cell_id} className="sheet-overview-list-item">
                    <span className="sheet-overview-list-pri">{c.user_name}</span>
                    <span className="sheet-overview-list-sec">{dayShort[c.day_of_week]}</span>
                    <span className="sheet-overview-list-meta sheet-overview-list-danger">
                      Overlapping segments — "{c.display_text}"
                    </span>
                  </li>
                ))}
              </ul>
              <p className="sheet-modal-help">
                Open each cell's Edit popover to fix the time ranges.
              </p>
            </>
          )}
        </div>
      </div>
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
// Sprint 15.4: right-rail Week Overview surface. Renders five
// collapsible cards (Coverage Score, Department Coverage, Open
// Shifts, Conflicts, Unpublished Changes). On viewports < 1200px
// the rail collapses into a horizontal strip showing just the
// headline counts — full detail panels reachable by tapping a
// strip chip on mobile.
const SheetOverviewRail = ({ overview, loading }) => {
  // Collapsed-state per card. Coverage + dept coverage default
  // open; the lists default closed so the rail stays scannable
  // unless the admin asks for detail.
  const [openCard, setOpenCard] = useState({
    coverage:    true,
    dept:        true,
    open_shifts: false,
    conflicts:   false,
    unpublished: false,
  });
  const toggle = (k) => setOpenCard(s => ({ ...s, [k]: !s[k] }));

  if (loading && !overview) {
    return <aside className="sheet-overview-rail is-loading">Loading overview…</aside>;
  }
  if (!overview) {
    return <aside className="sheet-overview-rail is-empty">Overview unavailable.</aside>;
  }

  const score = overview.coverage_score;
  const scoreColor = score == null ? '#a0aec0'
    : score >= 90 ? '#38a169'
    : score >= 70 ? '#dd6b20'
    : '#c53030';
  const scoreLabel = score == null ? 'No baseline yet'
    : score >= 90 ? 'Good coverage'
    : score >= 70 ? 'Watch tight days'
    : 'Under-covered';

  const datasetMsg = overview.dataset_warning === 'low_sample'
    ? 'Dataset is small — coverage targets may be inaccurate until more weeks of clock data accumulate.'
    : overview.dataset_warning === 'regime_change'
    ? 'Recent scheduling pattern looks different from the older history; baseline auto-trimmed to the recent stable window.'
    : null;

  const dayShort = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  return (
    <aside className="sheet-overview-rail">
      {/* Compact strip — visible <1200px only via CSS. Counts only. */}
      <div className="sheet-overview-strip">
        <div className="sheet-overview-strip-cell" title={scoreLabel}>
          <span className="sheet-overview-strip-num" style={{ color: scoreColor }}>
            {score == null ? '—' : `${score}%`}
          </span>
          <span className="sheet-overview-strip-lbl">Coverage</span>
        </div>
        <div className="sheet-overview-strip-cell">
          <span className="sheet-overview-strip-num">{overview.open_shifts.length}</span>
          <span className="sheet-overview-strip-lbl">Open</span>
        </div>
        <div className="sheet-overview-strip-cell">
          <span className="sheet-overview-strip-num">{overview.conflicts.length}</span>
          <span className="sheet-overview-strip-lbl">Conflicts</span>
        </div>
        <div className="sheet-overview-strip-cell">
          <span className="sheet-overview-strip-num">{overview.unpublished_changes_count}</span>
          <span className="sheet-overview-strip-lbl">Unpublished</span>
        </div>
      </div>

      {/* Coverage Score card */}
      <section className="sheet-overview-card">
        <button
          type="button"
          className="sheet-overview-card-head"
          onClick={() => toggle('coverage')}
          aria-expanded={openCard.coverage}
        >
          <span>Coverage Score</span>
          <span className="sheet-overview-card-chev">{openCard.coverage ? '▴' : '▾'}</span>
        </button>
        {openCard.coverage && (
          <div className="sheet-overview-card-body">
            <div className="sheet-overview-score">
              <div className="sheet-overview-score-num" style={{ color: scoreColor }}>
                {score == null ? '—' : `${score}%`}
              </div>
              <div className="sheet-overview-score-label" style={{ color: scoreColor }}>
                {scoreLabel}
              </div>
            </div>
            {datasetMsg && (
              <div className="sheet-overview-dataset-warning">{datasetMsg}</div>
            )}
            {overview.meta?.history_weeks && (
              <div className="sheet-overview-meta">
                Baseline: last {overview.meta.history_weeks} weeks of clock data
              </div>
            )}
          </div>
        )}
      </section>

      {/* Department Coverage card */}
      <section className="sheet-overview-card">
        <button
          type="button"
          className="sheet-overview-card-head"
          onClick={() => toggle('dept')}
          aria-expanded={openCard.dept}
        >
          <span>Department Coverage</span>
          <span className="sheet-overview-card-chev">{openCard.dept ? '▴' : '▾'}</span>
        </button>
        {openCard.dept && (
          <div className="sheet-overview-card-body">
            {overview.dept_coverage.length === 0 && (
              <div className="sheet-overview-empty">No departments configured.</div>
            )}
            {overview.dept_coverage.map(d => {
              const pct = d.pct;
              const barColor = pct == null ? '#a0aec0'
                : pct >= 90 ? '#38a169'
                : pct >= 70 ? '#dd6b20'
                : '#c53030';
              const width = pct == null ? 0 : Math.min(100, pct);
              return (
                <div key={d.department_id} className="sheet-overview-dept">
                  <div className="sheet-overview-dept-head">
                    <span
                      className="sheet-overview-dept-dot"
                      style={{ background: d.color || 'var(--border)' }}
                      aria-hidden
                    />
                    <span className="sheet-overview-dept-name">{d.name}</span>
                    <span className="sheet-overview-dept-pct" style={{ color: barColor }}>
                      {pct == null ? 'no baseline' : `${pct}%`}
                    </span>
                  </div>
                  <div className="sheet-overview-dept-bar">
                    <div
                      className="sheet-overview-dept-fill"
                      style={{ width: `${width}%`, background: barColor }}
                    />
                  </div>
                  {d.has_baseline && (
                    <div className="sheet-overview-dept-meta">
                      {d.planned_hours}h planned · {d.target_hours}h target
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Open Shifts card */}
      <section className="sheet-overview-card">
        <button
          type="button"
          className="sheet-overview-card-head"
          onClick={() => toggle('open_shifts')}
          aria-expanded={openCard.open_shifts}
        >
          <span>Open Shifts</span>
          <span className="sheet-overview-card-count">{overview.open_shifts.length}</span>
          <span className="sheet-overview-card-chev">{openCard.open_shifts ? '▴' : '▾'}</span>
        </button>
        {openCard.open_shifts && (
          <div className="sheet-overview-card-body">
            {overview.open_shifts.length === 0 ? (
              <div className="sheet-overview-empty">No uncovered slots this week.</div>
            ) : (
              <ul className="sheet-overview-list">
                {overview.open_shifts.map((s, i) => (
                  <li key={`${s.department_id}-${s.day_of_week}-${i}`} className="sheet-overview-list-item">
                    <span className="sheet-overview-list-pri">{s.department_name}</span>
                    <span className="sheet-overview-list-sec">{dayShort[s.day_of_week]}</span>
                    <span className="sheet-overview-list-meta">~{s.target_hours}h</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Conflicts card */}
      <section className="sheet-overview-card">
        <button
          type="button"
          className="sheet-overview-card-head"
          onClick={() => toggle('conflicts')}
          aria-expanded={openCard.conflicts}
        >
          <span>Conflicts</span>
          <span className={`sheet-overview-card-count${overview.conflicts.length > 0 ? ' is-danger' : ''}`}>
            {overview.conflicts.length}
          </span>
          <span className="sheet-overview-card-chev">{openCard.conflicts ? '▴' : '▾'}</span>
        </button>
        {openCard.conflicts && (
          <div className="sheet-overview-card-body">
            {overview.conflicts.length === 0 ? (
              <div className="sheet-overview-empty">No conflicts detected.</div>
            ) : (
              <ul className="sheet-overview-list">
                {overview.conflicts.map(c => (
                  <li key={c.cell_id} className="sheet-overview-list-item">
                    <span className="sheet-overview-list-pri">{c.user_name}</span>
                    <span className="sheet-overview-list-sec">{dayShort[c.day_of_week]}</span>
                    <span className="sheet-overview-list-meta sheet-overview-list-danger">
                      overlapping segments — "{c.display_text}"
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Unpublished Changes card */}
      <section className="sheet-overview-card">
        <button
          type="button"
          className="sheet-overview-card-head"
          onClick={() => toggle('unpublished')}
          aria-expanded={openCard.unpublished}
        >
          <span>Unpublished Changes</span>
          <span className={`sheet-overview-card-count${overview.unpublished_changes_count > 0 ? ' is-accent' : ''}`}>
            {overview.unpublished_changes_count}
          </span>
          <span className="sheet-overview-card-chev">{openCard.unpublished ? '▴' : '▾'}</span>
        </button>
        {openCard.unpublished && (
          <div className="sheet-overview-card-body">
            <div className="sheet-overview-empty">
              {overview.unpublished_changes_count === 0
                ? 'Every cell on the sheet matches what is on the calendar overlay.'
                : `${overview.unpublished_changes_count} cell${overview.unpublished_changes_count === 1 ? '' : 's'} edited since last publish. Use "Publish week" or per-row publish to push them.`}
            </div>
          </div>
        )}
      </section>
    </aside>
  );
};

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
const ShiftCellInput = ({ value, hasNotes, highlight, published, suggestion, statusByAbbr, fgForBg, onCommit, onToggleHighlight, onOpenEdit }) => {
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
  // Sprint 15.5: render a ghost suggestion when the cell is empty
  // *and* the parent has an auto-fill suggestion at this slot. Once
  // the admin types anything, the draft is non-empty so the ghost
  // visual detaches automatically.
  const showSuggestion = !!suggestion && (draft || '').trim() === '';
  const classes = [
    'sheet-cell',
    'sheet-cell-input',
    highlight ? 'is-highlight' : '',
    published ? 'is-published' : '',
    matchedCode ? 'is-status' : '',
    hasNotes ? 'has-notes' : '',
    showSuggestion ? 'has-suggestion' : '',
  ].filter(Boolean).join(' ');
  const inputStyle = matchedCode
    ? { background: matchedCode.color, color: fgForBg(matchedCode.color), fontWeight: 700 }
    : undefined;
  return (
    <td
      className={classes}
      data-suggestion={showSuggestion ? suggestion : undefined}
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
