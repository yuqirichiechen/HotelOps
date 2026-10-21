// Sprint 23 — while a printable sheet (a portal child of <body> with class `fc-print-root`) is open, mark <body> so the print CSS hides the rest of the
// app. Scoped on purpose: the Reservations print sheet uses its own `is-printing-resn` switch and must not be hidden by this one.
import { useEffect } from 'react';

export default function usePrintSheet() {
  useEffect(() => {
    document.body.classList.add('is-printing-sheet');
    return () => document.body.classList.remove('is-printing-sheet');
  }, []);
}
