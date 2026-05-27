import React, { useEffect, useRef, useState } from 'react';
import './DropdownSelect.css';

// Sprint 13.3: small popover-style dropdown that matches the rest of
// the HotelOps control language (chip-shaped trigger + popover list).
// Native <select> renders with the OS picker, which looks foreign next
// to the chip/pill toolbar; this component matches the StaffManager
// export popover styling so the toolbar reads as one consistent
// control band across Calendar + Staff.
//
// Props:
//   value      — current selection (any primitive)
//   options    — [{ value, label }] (label can be a node)
//   onChange   — (value) => void
//   label      — small uppercase prefix label (optional)
//   placeholder — string shown when value doesn't match any option
//   className  — extra class for the outer wrapper
//   align      — 'left' (default) | 'right'  — menu anchor edge

const DropdownSelect = ({
  value,
  options = [],
  onChange,
  label,
  placeholder = 'Select…',
  className = '',
  align = 'left',
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div
      ref={wrapRef}
      className={`hop-dropdown ${open ? 'is-open' : ''} ${className}`}
    >
      <button
        type="button"
        className="hop-dropdown-button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label && <span className="hop-dropdown-label">{label}</span>}
        <span className="hop-dropdown-current">
          {current ? current.label : placeholder}
        </span>
        <span className="hop-dropdown-chev" aria-hidden>▾</span>
      </button>
      {open && (
        <div
          className={`hop-dropdown-menu hop-dropdown-menu-${align}`}
          role="listbox"
        >
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`hop-dropdown-item${opt.value === value ? ' is-selected' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DropdownSelect;
