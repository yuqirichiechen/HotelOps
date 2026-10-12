// Small "i" button that opens a popover with the explanation of how a number is worked out.
// Front desk / housekeeping don't need the method on the page itself — it's one tap away.
import React, { useEffect, useRef, useState } from 'react';

const InfoTip = ({ title, children, label = 'How is this worked out?', align = 'left' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span className="fb-infotip" ref={ref}>
      <button type="button" className="fb-infotip-btn" aria-label={label} aria-expanded={open} title={label} onClick={() => setOpen(o => !o)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open && (
        <div className={`fb-infotip-pop fb-infotip-${align}`} role="dialog" aria-label={title || label}>
          {title && <strong className="fb-infotip-title">{title}</strong>}
          <div className="fb-infotip-body">{children}</div>
        </div>
      )}
    </span>
  );
};

export default InfoTip;
