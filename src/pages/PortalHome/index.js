import React from 'react';
import { useAuth, isFrontDesk } from '../../auth';
import Home from '../Home';
import FrontDeskSummary from '../../components/FrontDesk/FrontDeskSummary';
import './PortalHome.css';

// Sprint 24 / 24.1: Home inside the staff portal = the staff dashboard (greeting, this-week hours, recent shifts — no clocking, that is
// the Clock in door) merged with the front desk's operations block (today's tiles + sellable vs arriving). The ops block is only
// rendered — and its data only requested — for the Front Desk department; other employees get just their dashboard until more
// portal content (daily communications, …) arrives.
const PortalHome = () => {
  const { user } = useAuth();
  const frontDesk = isFrontDesk(user);
  return (
    <div className={`ph-page${frontDesk ? ' has-ops' : ''}`}>
      {frontDesk && <div className="ph-ops"><FrontDeskSummary /></div>}
      <div className="ph-me"><Home variant="dashboard" /></div>
    </div>
  );
};

export default PortalHome;
