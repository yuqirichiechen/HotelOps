import React, { useState, useEffect } from 'react';

const toRad = (deg) => (deg * Math.PI) / 180;
const hand  = (deg, len) => ({
  x: 100 + len * Math.sin(toRad(deg)),
  y: 100 - len * Math.cos(toRad(deg)),
});

const ClockWidget = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const s = now.getSeconds();
  const m = now.getMinutes();
  const h = now.getHours() % 12;

  const secDeg  = s * 6;
  const minDeg  = m * 6  + s * 0.1;
  const hourDeg = h * 30 + m * 0.5;

  const hr  = hand(hourDeg, 48);
  const mn  = hand(minDeg,  65);
  const sc  = hand(secDeg,  72);

  const digitalTime = now.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
  const digitalDate = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="clock-widget">
      <svg viewBox="0 0 200 200" className="analog-clock" aria-label={digitalTime}>

        {/* Face */}
        <circle cx="100" cy="100" r="96" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />

        {/* Hour marks */}
        {Array.from({ length: 12 }, (_, i) => {
          const a   = i * 30;
          const big = i % 3 === 0;
          const r1  = big ? 76 : 80;
          const r2  = 91;
          const p1  = hand(a, r1);
          const p2  = hand(a, r2);
          return (
            <line
              key={i}
              x1={p1.x} y1={p1.y}
              x2={p2.x} y2={p2.y}
              stroke="#1a365d"
              strokeWidth={big ? 2.5 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Minute marks */}
        {Array.from({ length: 60 }, (_, i) => {
          if (i % 5 === 0) return null;
          const a  = i * 6;
          const p1 = hand(a, 85);
          const p2 = hand(a, 91);
          return (
            <line
              key={i}
              x1={p1.x} y1={p1.y}
              x2={p2.x} y2={p2.y}
              stroke="#cbd5e0"
              strokeWidth="0.8"
              strokeLinecap="round"
            />
          );
        })}

        {/* Hour hand */}
        <line x1="100" y1="100" x2={hr.x} y2={hr.y}
          stroke="#1a365d" strokeWidth="5.5" strokeLinecap="round" />

        {/* Minute hand */}
        <line x1="100" y1="100" x2={mn.x} y2={mn.y}
          stroke="#2d3748" strokeWidth="3" strokeLinecap="round" />

        {/* Second hand — tail + needle */}
        <line
          x1={hand(secDeg + 180, 18).x} y1={hand(secDeg + 180, 18).y}
          x2={sc.x} y2={sc.y}
          stroke="#e53e3e" strokeWidth="1.5" strokeLinecap="round"
        />

        {/* Centre cap */}
        <circle cx="100" cy="100" r="5"   fill="#1a365d" />
        <circle cx="100" cy="100" r="2.5" fill="white"   />
      </svg>

      <div className="clock-digital">{digitalTime}</div>
      <div className="clock-date">{digitalDate}</div>
    </div>
  );
};

export default ClockWidget;
