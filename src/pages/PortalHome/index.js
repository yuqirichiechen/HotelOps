import React from 'react';
import Home from '../Home';
import Timesheet from '../Timesheet';
import { usePortalPreview } from '../../shells/PortalPreview';
import './PortalHome.css';

// Sprint 24.3: Home inside the staff portal = the person's own working hours — the dashboard (greeting, this-week hours, recent shifts) with
// the timesheet (week navigator, total worked, daily chart, daily breakdown) added underneath. There is no separate Timesheet page and no
// CSV export. Clocking in / out is not here (that is the Clock in door). The front desk's forecast tiles moved to the Reservations tab.
// A dev previewing the front-desk view has no hours of their own, so they get a note instead of empty cards.
const PortalHome = () => {
  const preview = usePortalPreview();
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
  return (
    <div className="ph-page">
      <div className="ph-me"><Home variant="dashboard" /></div>
      <div className="ph-timesheet"><Timesheet /></div>
    </div>
  );
};

export default PortalHome;
