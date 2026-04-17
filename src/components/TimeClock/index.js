import React, { useState, useEffect } from 'react';
import Keypad from './Keypad';
import EmployeePanel from './EmployeePanel';
import DashboardFace from './DashboardFace';
import { lookupEmployee, clockIn, clockOut, fetchHistory } from '../../services/timeClock';
import './TimeClock.css';

const TimeClock = () => {
  const [phone,      setPhone]      = useState('');
  const [employee,   setEmployee]   = useState(null);
  const [history,    setHistory]    = useState([]);
  const [histLoad,   setHistLoad]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [flipped,    setFlipped]    = useState(false);
  const [notif,      setNotif]      = useState(null);

  const showNotif = (type, text) => {
    setNotif({ type, text });
    setTimeout(() => setNotif(null), 2200);
  };

  const reset = () => {
    setFlipped(false);
    setTimeout(() => {
      setPhone('');
      setEmployee(null);
      setHistory([]);
    }, 480);
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
        setHistLoad(true);
        fetchHistory(phone).then(data => {
          if (!active) return;
          setHistory(data.entries || []);
          setHistLoad(false);
        });
      } else {
        showNotif('error', res.message);
      }
    });
    return () => { active = false; };
  }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClockIn = async () => {
    setLoading(true);
    const res = await clockIn(phone);
    setLoading(false);
    if (res.success) {
      showNotif('success', 'Clocked In!');
      setTimeout(reset, 2200);
    } else {
      showNotif('error', res.message);
    }
  };

  const handleClockOut = async () => {
    setLoading(true);
    const res = await clockOut(phone);
    setLoading(false);
    if (res.success) {
      showNotif('success', 'Clocked Out!');
      setTimeout(reset, 2200);
    } else {
      showNotif('error', res.message);
    }
  };

  return (
    <div className="timeclock-page">
      {notif && (
        <div className="notif-overlay" onClick={() => setNotif(null)}>
          <div className={`notif-card notif-${notif.type}`}>
            <div className="notif-icon">{notif.type === 'success' ? '✓' : '✕'}</div>
            <div className="notif-message">{notif.text}</div>
          </div>
        </div>
      )}

      <div className="tc-flip-container">
        <div className={`tc-flip-card ${flipped ? 'flipped' : ''}`}>

          {/* Front — keypad */}
          <div className="tc-face tc-face-front">
            <div className="timeclock-content">
              <EmployeePanel phone={phone} employee={employee} loading={loading} />
              <Keypad onKeyPress={handleKey} />
            </div>
          </div>

          {/* Back — personal dashboard */}
          <div className="tc-face tc-face-back">
            {employee && (
              <DashboardFace
                employee={employee}
                entries={history}
                histLoading={histLoad}
                loading={loading}
                onClockIn={handleClockIn}
                onClockOut={handleClockOut}
                onBack={reset}
              />
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default TimeClock;
