import React from 'react';

const Keypad = ({ onKeyPress }) => (
  <div className="keypad">
    {[['1','2','3'],['4','5','6'],['7','8','9']].map((row, i) => (
      <div className="keypad-row" key={i}>
        {row.map(n => (
          <button key={n} className="keypad-btn" onClick={() => onKeyPress(n)}>{n}</button>
        ))}
      </div>
    ))}
    <div className="keypad-row">
      <button className="keypad-btn clear-btn" onClick={() => onKeyPress('clear')}>Clear</button>
      <button className="keypad-btn" onClick={() => onKeyPress('0')}>0</button>
      <button className="keypad-btn back-btn" onClick={() => onKeyPress('back')}>⌫</button>
    </div>
  </div>
);

export default Keypad;
