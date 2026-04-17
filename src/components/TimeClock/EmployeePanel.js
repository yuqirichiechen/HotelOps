import React from 'react';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return  'Good evening';
};

const formatPhone = (digits) => {
  if (!digits) return '___  ___  ____';
  const d = digits.padEnd(10, '_');
  return `${d.slice(0,3)}  ${d.slice(3,6)}  ${d.slice(6,10)}`;
};

const EmployeePanel = ({ phone, employee, loading }) => (
  <div className="employee-panel">
    <div className="panel-greeting">
      <h2>{greeting()}</h2>
      <p className="panel-subtitle">Enter your phone number to continue</p>
    </div>

    <div className="phone-display">
      <label>Phone Number</label>
      <div className="phone-number">{formatPhone(phone)}</div>
    </div>

    <div className="employee-name-area">
      {loading ? (
        <span className="status-text loading-pulse">Looking up…</span>
      ) : employee ? (
        <span className="welcome-text">Welcome, <strong>{employee.name}</strong></span>
      ) : (
        <span className="status-text">
          {phone.length > 0 ? `${phone.length} / 10 digits` : 'Use the keypad on the right'}
        </span>
      )}
    </div>
  </div>
);

export default EmployeePanel;
