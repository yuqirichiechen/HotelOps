import React, { useState, useEffect, useCallback } from 'react';
import WeekView from './WeekView';
import MonthView from './MonthView';
import AssignModal from './AssignModal';
import './Scheduling.css';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const getWeekStart = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
};

const fmtDate = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const SchedulingManager = ({ onBack, onLogout }) => {
  const [view,      setView]      = useState('week');
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const [month,     setMonth]     = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));

  const [schedules,    setSchedules]    = useState([]);
  const [employees,    setEmployees]    = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [templates,    setTemplates]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modal,        setModal]        = useState(null);

  // Load base data once
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/employees').then(r => r.json()),
      fetch('/api/admin/departments').then(r => r.json()),
      fetch('/api/admin/shift-templates').then(r => r.json()),
    ]).then(([emp, dept, tmpl]) => {
      if (emp.success)  setEmployees(emp.employees.filter(e => e.active));
      if (dept.success) setDepartments(dept.departments);
      if (tmpl.success) setTemplates(tmpl.templates);
    });
  }, []);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    let start, end;
    if (view === 'week') {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      start = fmtDate(weekStart);
      end   = fmtDate(weekEnd);
    } else {
      const lastDay = new Date(month.year, month.month + 1, 0).getDate();
      start = `${month.year}-${String(month.month + 1).padStart(2, '0')}-01`;
      end   = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
    const res  = await fetch(`/api/admin/schedule?start=${start}&end=${end}`);
    const data = await res.json();
    if (data.success) setSchedules(data.schedules);
    setLoading(false);
  }, [view, weekStart, month]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  const handleSave = async ({ startTime, endTime, shiftId, notes }) => {
    if (modal?.type === 'assign') {
      const res = await fetch('/api/admin/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:        modal.employee.user_id,
          scheduled_date: fmtDate(modal.date),
          start_time:     startTime,
          end_time:       endTime,
          shift_id:       shiftId || null,
          notes:          notes   || null,
        }),
      });
      const result = await res.json();
      if (!result.success) return result.message;
    } else if (modal?.type === 'edit') {
      const s   = modal.schedule;
      const res = await fetch(`/api/admin/schedule/${s.schedule_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:        s.user_id,
          scheduled_date: s.scheduled_date,
          start_time:     startTime,
          end_time:       endTime,
          shift_id:       shiftId || null,
          notes:          notes   || null,
        }),
      });
      const result = await res.json();
      if (!result.success) return result.message;
    }
    setModal(null);
    loadSchedules();
    return null;
  };

  const handleDelete = async (scheduleId) => {
    await fetch(`/api/admin/schedule/${scheduleId}`, { method: 'DELETE' });
    setModal(null);
    loadSchedules();
  };

  const handleMove = async (scheduleId, newUserId, newDate) => {
    const s = schedules.find(sc => sc.schedule_id === scheduleId);
    if (!s) return;
    await fetch(`/api/admin/schedule/${scheduleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:        newUserId,
        scheduled_date: newDate,
        start_time:     s.start_time,
        end_time:       s.end_time,
        shift_id:       s.shift_id  || null,
        notes:          s.notes     || null,
      }),
    });
    loadSchedules();
  };

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };
  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const prevMonth = () => setMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 });
  const nextMonth = () => setMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 });

  const handleSelectDayFromMonth = (date) => {
    setWeekStart(getWeekStart(date));
    setView('week');
  };

  return (
    <div className="sched-manager">
      <div className="sched-header">
        <div className="sched-header-left">
          <button className="btn-back" onClick={onBack}>← Back</button>
          <h2>Scheduling</h2>
        </div>
        <div className="sched-header-right">
          <div className="sched-view-toggle">
            <button className={`view-btn${view === 'week'  ? ' active' : ''}`} onClick={() => setView('week')}>Week</button>
            <button className={`view-btn${view === 'month' ? ' active' : ''}`} onClick={() => setView('month')}>Month</button>
          </div>
          <button className="btn-logout" onClick={onLogout}>Sign Out</button>
        </div>
      </div>

      <div className="sched-nav-bar">
        <button className="nav-arrow" onClick={view === 'week' ? prevWeek : prevMonth}>‹</button>
        {view === 'week' && (
          <button className="nav-today" onClick={() => setWeekStart(getWeekStart())}>Today</button>
        )}
        <span className="nav-label">
          {view === 'week'
            ? `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`
            : `${MONTH_NAMES[month.month]} ${month.year}`}
        </span>
        <button className="nav-arrow" onClick={view === 'week' ? nextWeek : nextMonth}>›</button>
      </div>

      <div className="sched-content">
        {view === 'week' ? (
          <WeekView
            weekStart={weekStart}
            employees={employees}
            departments={departments}
            schedules={schedules}
            loading={loading}
            onAssign={(emp, date) => setModal({ type: 'assign', employee: emp, date })}
            onEdit={(schedule)    => setModal({ type: 'edit',   schedule })}
            onMove={handleMove}
          />
        ) : (
          <MonthView
            year={month.year}
            month={month.month}
            schedules={schedules}
            loading={loading}
            onSelectDay={handleSelectDayFromMonth}
          />
        )}
      </div>

      {modal && (
        <AssignModal
          modal={modal}
          templates={templates}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default SchedulingManager;
