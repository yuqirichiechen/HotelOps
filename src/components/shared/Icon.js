// Sprint 28.8 — THE icon set. Every icon in the app (sidebar, mobile bar, More sheet, cards, buttons, notes …) comes from here, so they are always the same size and
// weight, follow the text colour (dark / light mode, the gold "active" state, danger red …) and need no image files.
//
// Adding an icon = ONE entry in ICONS below (24 × 24 grid, outline, round caps, drawn with the stroke the component sets) — then use  <Icon name="my-icon" />  or, for a
// navigation item, just set  icon: 'my-icon'  on it (AdminShell / StaffPortalShell). An unknown name shows a neutral placeholder (and warns in development) instead of a
// blank gap; tests/icons.test.js fails if a menu item names an icon that does not exist or two items of one menu share an icon.
import React from 'react';

export const ICONS = {
  home: (<><path d="m3 10.5 9-7.5 9 7.5" /><path d="M5 9.2V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.2" /></>),
  users: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" /><path d="M15.6 4.8a3.2 3.2 0 0 1 0 6.2" /><path d="M18.6 14.5A5 5 0 0 1 21.5 19v1" /></>),
  calendar: (<><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M8 2.5v4M16 2.5v4M3 10h18" /></>),
  ticket: (<><path d="M3 9V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5V9a3 3 0 0 0 0 6v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5V15a3 3 0 0 0 0-6Z" /><path d="M14.5 5.5v2M14.5 11v2M14.5 16.5v2" /></>),
  trend: (<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>),
  bed: (<><path d="M3 5v15" /><path d="M3 16h18v4" /><path d="M21 16v-2.5a2.5 2.5 0 0 0-2.5-2.5H11v5" /><circle cx="7" cy="11.5" r="1.8" /></>),
  notebook: (<><path d="M6 3h11.5A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5H6Z" /><path d="M9.5 3v18" /><path d="M13 8h3.5M13 12h3.5" /><path d="M6 3v18" /></>),
  sparkles: (<><path d="M11 3.5l2 5.2 5.2 2-5.2 2-2 5.3-2-5.3-5.2-2 5.2-2Z" /><path d="M19 15.5v4M17 17.5h4" /><path d="M5.5 18.5v2.5M4.25 19.75h2.5" /></>),
  gear: (<><path d="M10.19 5.24L10.51 2.62 L13.49 2.62 L13.81 5.24A7 7 0 0 1 15.50 5.94L15.50 5.94L17.58 4.31 L19.69 6.42 L18.06 8.50A7 7 0 0 1 18.76 10.19L18.76 10.19L21.38 10.51 L21.38 13.49 L18.76 13.81A7 7 0 0 1 18.06 15.50L18.06 15.50L19.69 17.58 L17.58 19.69 L15.50 18.06A7 7 0 0 1 13.81 18.76L13.81 18.76L13.49 21.38 L10.51 21.38 L10.19 18.76A7 7 0 0 1 8.50 18.06L8.50 18.06L6.42 19.69 L4.31 17.58 L5.94 15.50A7 7 0 0 1 5.24 13.81L5.24 13.81L2.62 13.49 L2.62 10.51 L5.24 10.19A7 7 0 0 1 5.94 8.50L5.94 8.50L4.31 6.42 L6.42 4.31 L8.50 5.94A7 7 0 0 1 10.19 5.24Z" /><circle cx="12" cy="12" r="2.8" /></>),
  sliders: (<><path d="M4 7h9.5M17.5 7H20M4 17h2.5M10.5 17H20" /><circle cx="15.5" cy="7" r="2" /><circle cx="8.5" cy="17" r="2" /></>),
  refresh: (<><path d="M20 11a8 8 0 0 0-14.6-4M4.2 3.8v3.6h3.6" /><path d="M4 13a8 8 0 0 0 14.6 4M19.8 20.2v-3.6h-3.6" /></>),
  terminal: (<><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="m7.5 10 3 2.5-3 2.5M13 15h3.5" /></>),
  layers: (<><path d="m12 3 9 5-9 5-9-5Z" /><path d="m3 12.5 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>),
  building: (<><path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21M3 21h18" /><path d="M9 7.5h1.5M13.5 7.5H15M9 11.5h1.5M13.5 11.5H15M10 21v-4h4v4" /></>),
  concierge: (<><path d="M4 18.5h16M5.5 18.5a6.5 6.5 0 0 1 13 0" /><path d="M12 12V8.5M10 8.5h4" /></>),
  broom: (<><path d="M20.5 3.5 12.5 11.5" /><path d="M9.6 9.6l4.8 4.8L11 20H5.2a1 1 0 0 1-.8-1.6Z" /><path d="M8 13l2.6 2.6" /></>),
  wrench: (<><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" /></>),
  utensils: (<><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10" /><path d="M17 21V3c-2.5 1.5-3.5 4-3.5 7.5 0 1.7 1 2.5 3.5 2.5" /></>),
  briefcase: (<><rect x="3" y="7.5" width="18" height="12.5" rx="2.5" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 13h18" /></>),
  moon: (<><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  tag: (<><path d="M3 12.2V4.5A1.5 1.5 0 0 1 4.5 3h7.7a1.5 1.5 0 0 1 1.06.44l7.3 7.3a1.5 1.5 0 0 1 0 2.12l-7.7 7.7a1.5 1.5 0 0 1-2.12 0l-7.3-7.3A1.5 1.5 0 0 1 3 12.2Z" /><circle cx="8" cy="8" r="1.3" /></>),
  lock: (<><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>),
  key: (<><circle cx="8" cy="15" r="4" /><path d="M11 12 20 3M16.5 6.5 19 9M14 9l2 2" /></>),
  shield: (<><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6Z" /><rect x="9" y="10.5" width="6" height="4.5" rx="1" /><path d="M10.2 10.5V9.3a1.8 1.8 0 0 1 3.6 0v1.2" /></>),
  chart: (<><path d="M4 20V10M10 20V4M16 20v-7" /><path d="M21 20H3" /></>),
  banknote: (<><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v.01M18 14.5v.01" /></>),
  ruler: (<><path d="m4.5 15.5 11-11 4 4-11 11Z" /><path d="m8 12 2 2M11 9l1.5 1.5M14 6l2 2" /></>),
  flag: (<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>),
  clipboard: (<><rect x="5" y="4.5" width="14" height="17" rx="2.5" /><path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" /><path d="M9 11h6M9 15h4" /></>),
  edit: (<><path d="M16 4.5 19.5 8 8 19.5l-4.5.5.5-4.5Z" /><path d="M13.5 7 17 10.5" /></>),
  message: (<><path d="M5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4 4v-4h-.5A1.5 1.5 0 0 1 4 14.5v-9A1.5 1.5 0 0 1 5.5 4Z" /></>),
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7.5 8.5 6 8.5-6" /></>),
  pin: (<><path d="M9 3.5h6l-1 6 3 3.5H7l3-3.5Z" /><path d="M12 13v8" /></>),
  paperclip: (<><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L14 7.5" /></>),
  send: (<><path d="M21 3 10.5 13.5" /><path d="M21 3l-6.5 18-4-7.5L3 9.5Z" /></>),
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" /></>),
  equals: (<><path d="M5 9h14M5 15h14" /></>),
  warning: (<><path d="M12 3.8 2.7 19.8h18.6Z" /><path d="M12 10v4.5M12 17.2v.01" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.8v.01" /></>),
  menu: (<><path d="M4 7h16M4 12h16M4 17h16" /></>),
  undo: (<><path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5" /><path d="M4 4v4.5h4.5" /></>),
  signout: (<><path d="m14 7 5 5-5 5M19 12H7M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" /></>),
  bot: (<><rect x="4.5" y="8" width="15" height="11" rx="3" /><path d="M12 8V4.5M12 4.5v.01M9 13v1.5M15 13v1.5M2.5 12.5v3M21.5 12.5v3" /></>),
  download: (<><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" /></>),
  external: (<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>),
  check: (<><path d="m5 12.5 4.5 4.5L19 7.5" /></>),
  close: (<><path d="M6 6l12 12M18 6 6 18" /></>),
  plus: (<><path d="M12 5v14M5 12h14" /></>),
  'chevron-left': (<><path d="m14.5 6-6 6 6 6" /></>),
  'chevron-right': (<><path d="m9.5 6 6 6-6 6" /></>),
  more: (<><circle cx="5.5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18.5" cy="12" r="1" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  timer: (<><circle cx="12" cy="13.5" r="7.5" /><path d="M12 13.5 15 10.5M9.5 3h5" /></>),
  hourglass: (<><path d="M6.5 3h11M6.5 21h11" /><path d="M7.5 3v3.5a4.5 4.5 0 0 0 1.8 3.6L12 12l2.7-1.9a4.5 4.5 0 0 0 1.8-3.6V3" /><path d="M7.5 21v-3.5a4.5 4.5 0 0 1 1.8-3.6L12 12l2.7 1.9a4.5 4.5 0 0 1 1.8 3.6V21" /></>),
  keyboard: (<><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7 14h10" /></>),
  bell: (<><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>),
  eye: (<><path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>),
  user: (<><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>),
  copy: (<><rect x="9" y="9" width="11.5" height="11.5" rx="2.5" /><path d="M15 9V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9" /></>),
  pause: (<><rect x="6.5" y="5" width="3.5" height="14" rx="1" /><rect x="14" y="5" width="3.5" height="14" rx="1" /></>),
  backspace: (<><path d="M9 5h10.5A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-6-7Z" /><path d="m12.5 9.5 5 5M17.5 9.5l-5 5" /></>),
  printer: (<><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="8" rx="2.5" /><path d="M7 14h10v6.5H7Z" /></>),
};

export const ICON_NAMES = Object.keys(ICONS);
export const hasIcon = (name) => Object.prototype.hasOwnProperty.call(ICONS, name);

const Placeholder = <><rect x="4" y="4" width="16" height="16" rx="4" strokeDasharray="3 3" /></>;

/** @param {{name: string, size?: number, stroke?: number, className?: string, title?: string}} props — decorative unless `title` is given. */
const Icon = ({ name, size = 20, stroke = 1.7, className, title, style }) => {
  const known = hasIcon(name);
  if (!known && process.env.NODE_ENV !== 'production') console.warn(`[Icon] unknown icon "${name}" — add it to src/components/shared/Icon.js`);
  return (
    <svg
      className={`ic${className ? ' ' + className : ''}`}
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" focusable="false"
      role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : 'true'} style={style}
    >
      {title ? <title>{title}</title> : null}
      {known ? ICONS[name] : Placeholder}
    </svg>
  );
};

export default Icon;
