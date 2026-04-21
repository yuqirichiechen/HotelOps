import React, { useState, useEffect } from 'react';
import Keypad from '../TimeClock/Keypad';
import EmployeePanel from '../TimeClock/EmployeePanel';
import ClockWidget from '../TimeClock/ClockWidget';
import ShiftsCalendar from './ShiftsCalendar';
import { lookupEmployee } from '../../services/timeClock';
import '../TimeClock/TimeClock.css';
import './ShiftsView.css';

const ShiftsView = () => {
  const [phone,    setPhone]    = useState('');
  const [employee, setEmployee] = useState(null);
  const [flipped,  setFlipped]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [notif,    setNotif]    = useState(null);

  const showNotif = (type, text) => {
    setNotif({ type, text });
    setTimeout(() => setNotif(null), 2200);
  };

  const reset = () => {
    setFlipped(false);
    setTimeout(() => { setPhone(''); setEmployee(null); }, 480);
  };

  const handleKey = (val) => {
    if (flipped) return;
    if (val === 'clear') { setPhone(''); setEmployee(null); return; }
    if (val === 'back')  { setPhone(p => p.slice(0, -1)); return; }
    setPhone(p => p.length < 10 ? p + val : p);
  };

  useEffect(() => {
    if (phone.length !== 10) { if (!flipped) setEmployee(null); return; }
    let active = true;
    setLoading(true);
    lookupEmployee(phone).then(res => {
      if (!active) return;
      setLoading(false);
      if (res.success) {
        setEmployee(res.employee);
        setFlipped(true);
      } else {
        showNotif('error', res.message || 'Employee not found');
      }
    });
    return () => { active = false; };
  }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="timeclock-page sv-page">
      {notif && (
        <div className="notif-overlay" onClick={() => setNotif(null)}>
          <div className={`notif-card notif-${notif.type}`}>
            <div className="notif-icon">{notif.type === 'success' ? '✓' : '✕'}</div>
            <div className="notif-message">{notif.text}</div>
          </div>
        </div>
      )}

      <div className="tc-flip-container">
        <div className={`tc-flip-card${flipped ? ' flipped' : ''}`}>

          {/* Front — phone keypad */}
          <div className="tc-face tc-face-front">
            <div className="timeclock-content">
              <EmployeePanel phone={phone} employee={employee} loading={loading} />
              <ClockWidget />
              <Keypad onKeyPress={handleKey} />
            </div>
          </div>

          {/* Back — shifts calendar */}
          <div className="tc-face tc-face-back sv-back-face">
            {employee && (
              <ShiftsCalendar employee={employee} onBack={reset} />
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default ShiftsView;
