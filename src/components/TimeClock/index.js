import React, { useState, useEffect } from 'react';
import Keypad from './Keypad';
import EmployeePanel from './EmployeePanel';
import { lookupEmployee, clockIn, clockOut } from '../../services/timeClock';
import './TimeClock.css';

const TimeClock = () => {
  const [phone, setPhone] = useState('');
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState(null);

  const showNotif = (type, text) => {
    setNotif({ type, text });
    setTimeout(() => setNotif(null), 2000);
  };

  const reset = () => {
    setPhone('');
    setEmployee(null);
  };

  const handleKey = (val) => {
    if (val === 'clear') { reset(); return; }
    if (val === 'back')  { setPhone(p => p.slice(0, -1)); return; }
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
      else showNotif('error', res.message);
    });
    return () => { active = false; };
  }, [phone]);

  const handleClockIn = async () => {
    setLoading(true);
    const res = await clockIn(phone);
    setLoading(false);
    if (res.success) { showNotif('success', 'Clocked In!'); setTimeout(reset, 2000); }
    else showNotif('error', res.message);
  };

  const handleClockOut = async () => {
    setLoading(true);
    const res = await clockOut(phone);
    setLoading(false);
    if (res.success) { showNotif('success', 'Clocked Out!'); setTimeout(reset, 2000); }
    else showNotif('error', res.message);
  };

  return (
    <div className="timeclock-page">

      {notif && (
        <div className="notif-overlay" onClick={() => setNotif(null)}>
          <div className={`notif-card notif-${notif.type}`}>
            <div className="notif-icon">
              {notif.type === 'success' ? '✓' : '✕'}
            </div>
            <div className="notif-message">{notif.text}</div>
          </div>
        </div>
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
