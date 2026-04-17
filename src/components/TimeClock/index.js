import React, { useState, useEffect } from 'react';
import Keypad from './Keypad';
import EmployeePanel from './EmployeePanel';
import { lookupEmployee, clockIn, clockOut } from '../../services/timeClock';
import './TimeClock.css';

const TimeClock = () => {
  const [phone, setPhone] = useState('');
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  const reset = () => {
    setPhone('');
    setEmployee(null);
  };

  const handleKey = (val) => {
    if (val === 'clear') { reset(); return; }
    if (val === 'back') { setPhone(p => p.slice(0, -1)); return; }
    setPhone(p => p.length < 10 ? p + val : p);
  };

  useEffect(() => {
    if (phone.length !== 10) { setEmployee(null); return; }
    let active = true;
    setLoading(true);
    lookupEmployee(phone).then(res => {
      if (!active) return;
      setLoading(false);
      if (res.success) setEmployee(res.employee);
      else showToast('error', res.message);
    });
    return () => { active = false; };
  }, [phone]);

  const handleClockIn = async () => {
    setLoading(true);
    const res = await clockIn(phone);
    setLoading(false);
    if (res.success) { showToast('success', 'Clocked in!'); setTimeout(reset, 2000); }
    else showToast('error', res.message);
  };

  const handleClockOut = async () => {
    setLoading(true);
    const res = await clockOut(phone);
    setLoading(false);
    if (res.success) { showToast('success', 'Clocked out!'); setTimeout(reset, 2000); }
    else showToast('error', res.message);
  };

  return (
    <div className="timeclock-page">
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.text}</div>
      )}
      <div className="timeclock-content">
        <EmployeePanel
          phone={phone}
          employee={employee}
          loading={loading}
          onClockIn={handleClockIn}
          onClockOut={handleClockOut}
        />
        <Keypad onKeyPress={handleKey} />
      </div>
    </div>
  );
};

export default TimeClock;
