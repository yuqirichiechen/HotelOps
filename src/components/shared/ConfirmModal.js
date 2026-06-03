import React, { useEffect } from 'react';
import './ConfirmModal.css';

// Sprint 16.7: shared confirm modal. Replaces window.confirm
// across the app — those system dialogs ignore the app's theme
// and look out of place. Same shape as the Sprint-15.5 sheet
// modals (.sheet-modal-*) but lives in shared/ so non-sheet
// surfaces can use it.
//
// Two variants via the `tone` prop:
//   - 'default'  — neutral confirm (e.g., "Apply changes").
//   - 'danger'   — destructive confirm (e.g., "Clock out", "Delete").
//                  Confirm button picks up the red treatment.
//
// Usage pattern:
//   const [confirm, setConfirm] = useState(null);
//   ...
//   setConfirm({
//     title:   'Clock out Maria?',
//     message: 'Their shift will close at the current time.',
//     confirmLabel: 'Clock out',
//     tone:    'danger',
//     onConfirm: async () => { ... },
//   });
//
//   {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
//
// onConfirm can be sync or async. When it returns a promise, the
// confirm button shows a busy state until the promise settles
// (good for "Are you sure?" → API call → close).

const ConfirmModal = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  tone         = 'default', // 'default' | 'danger'
  onConfirm,
  onClose,
}) => {
  const [busy, setBusy] = React.useState(false);

  // Escape closes — same affordance as the sheet modals.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const handleConfirm = async () => {
    if (!onConfirm) { onClose(); return; }
    const result = onConfirm();
    if (result && typeof result.then === 'function') {
      setBusy(true);
      try { await result; }
      finally { setBusy(false); onClose(); }
    } else {
      onClose();
    }
  };

  return (
    <div
      className="confirm-modal-backdrop"
      role="presentation"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={message ? 'confirm-modal-message' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-body">
          <h3 id="confirm-modal-title" className="confirm-modal-title">{title}</h3>
          {message && (
            <p id="confirm-modal-message" className="confirm-modal-message">{message}</p>
          )}
        </div>
        <div className="confirm-modal-actions">
          {/* Sprint 16.7: passing cancelLabel={null} hides the
              cancel button, turning this into a single-button
              alert (the confirm button doubles as "OK"). */}
          {cancelLabel != null && (
            <button
              type="button"
              className="confirm-modal-btn confirm-modal-btn-cancel"
              onClick={onClose}
              disabled={busy}
            >{cancelLabel}</button>
          )}
          <button
            type="button"
            className={`confirm-modal-btn confirm-modal-btn-confirm${tone === 'danger' ? ' is-danger' : ''}`}
            onClick={handleConfirm}
            disabled={busy}
            autoFocus
          >{busy ? '…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
