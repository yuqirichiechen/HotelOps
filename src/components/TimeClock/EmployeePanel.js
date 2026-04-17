import React from 'react';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const PhoneGroups = ({ digits }) => {
  const group = (start, len) =>
    Array.from({ length: len }, (_, i) => ({
      char: digits[start + i] || '·',
      filled: !!digits[start + i],
    }));

  const groups = [group(0, 3), group(3, 3), group(6, 4)];

  return (
    <div className="phone-groups">
      {groups.map((chars, gi) => (
        <div key={gi} className="phone-group-row">
          {chars.map(({ char, filled }, ci) => (
            <span key={ci} className={`pdigit ${filled ? 'pdigit-filled' : ''}`}>
              {char}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

const EmployeePanel = ({ phone, employee, loading }) => (
  <div className="employee-panel">
    <div className="panel-greeting">
      <h2>{greeting()}</h2>
      <p className="panel-subtitle">Enter your phone number</p>
    </div>

    <PhoneGroups digits={phone} />

    <div className="employee-name-area">
      {loading ? (
        <span className="status-text loading-pulse">Looking up…</span>
      ) : employee ? (
        <span className="welcome-text">Welcome, <strong>{employee.name}</strong></span>
      ) : phone.length > 0 ? (
        <span className="status-text">{phone.length} of 10 digits</span>
      ) : (
        <span className="status-text">Use the keypad →</span>
      )}
    </div>
  </div>
);

export default EmployeePanel;
