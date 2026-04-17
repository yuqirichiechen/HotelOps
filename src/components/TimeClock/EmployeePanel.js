import React from 'react';

const formatPhone = (digits) => {
  if (!digits) return '___-___-____';
  const d = digits.padEnd(10, '_');
  return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6,10)}`;
};

const EmployeePanel = ({ phone, employee, loading, onClockIn, onClockOut }) => (
  <div className="employee-panel">
    <h2>Employee Clock In / Out</h2>

    <div className="phone-display">
      <label>Phone Number</label>
      <div className="phone-number">{formatPhone(phone)}</div>
    </div>

    <div className="employee-name-area">
      {loading ? (
        <span className="status-text">Looking up employee...</span>
      ) : employee ? (
        <span className="welcome-text">Welcome, <strong>{employee.name}</strong></span>
      ) : (
        <span className="status-text">Enter your 10-digit phone number</span>
      )}
    </div>

    <div className="clock-buttons">
      <button
        className="btn-clock-in"
        onClick={onClockIn}
        disabled={!employee || loading}
      >
        Clock In
      </button>
      <button
        className="btn-clock-out"
        onClick={onClockOut}
        disabled={!employee || loading}
      >
        Clock Out
      </button>
    </div>
  </div>
);

export default EmployeePanel;
