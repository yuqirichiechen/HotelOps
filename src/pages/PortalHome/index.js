import React from 'react';
import { useAuth } from '../../auth';
import Timesheet from '../Timesheet';
import { useT } from '../../i18n';
import { usePortalPreview } from '../../shells/PortalPreview';
import './PortalHome.css';

// Sprint 24.4: the staff portal's Home = the person's own working hours, laid out as
//   greeting
//   [ This week ] [ Total worked (week on screen) ] [ Recent shifts ]      ← one row (inside <Timesheet/>)
//   Timeline: week navigator → Daily totals (chart) → Daily breakdown
// No clocking here (that is the Clock in door), no separate Timesheet page, no CSV export. A dev previewing the front-desk view has no hours of
// their own, so they get a note instead of empty cards.
const greetingFor = (h) => (h >= 5 && h < 12 ? 'greeting.morning' : h >= 12 && h < 18 ? 'greeting.afternoon' : 'greeting.evening');

const PortalHome = () => {
  const preview = usePortalPreview();
  const { user } = useAuth();
  const t = useT();
  if (preview) {
    return (
      <div className="ph-page">
        <div className="ph-preview-note" role="note">
          <strong>Front desk view (preview)</strong>
          <span>Here staff see their own working hours and timesheet. A dev has no clock entries, so nothing is shown — use Reservations and Housekeeping in the menu to check what the front desk uses.</span>
        </div>
      </div>
    );
  }
  const now = new Date();
  const firstName = (user?.name || '').split(' ')[0];
  return (
    <div className="ph-page">
      <div className="ph-greet">
        <div className="ph-eyebrow">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <h1 className="ph-title">{t(greetingFor(now.getHours()))}{firstName ? `, ${firstName}` : ''}.</h1>
      </div>
      <Timesheet />
    </div>
  );
};

export default PortalHome;
