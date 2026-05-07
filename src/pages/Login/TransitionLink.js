import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';

// View-Transitions wrapper around react-router's <Link>. When the browser
// supports `document.startViewTransition`, the navigation is wrapped so the
// browser captures before/after snapshots of any element with a
// `view-transition-name` and animates between them. flushSync is required:
// React batches state updates, and without it the navigation's DOM mutation
// would fire after `startViewTransition` already snapshotted the "new" state
// (which would still be the old DOM).
//
// Falls back to a normal <Link> click when the API isn't available — older
// Firefox, etc. The user just gets an instant nav, no error.

export const TransitionLink = ({ to, onClick, children, ...rest }) => {
  const nav = useNavigate();
  const handleClick = (e) => {
    if (onClick) onClick(e);
    if (e.defaultPrevented) return;
    if (typeof document === 'undefined' || !document.startViewTransition) return;
    // Skip modifier-key clicks (cmd/ctrl/shift/alt) so users can still
    // open in new tab / new window via the Link's default behavior.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    document.startViewTransition(() => {
      flushSync(() => nav(to));
    });
  };
  return (
    <Link to={to} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
};

export default TransitionLink;
