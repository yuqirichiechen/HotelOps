import React from 'react';
import { useAuth } from '../../auth';
import Home from '../Home';
import FrontDeskSummary from '../../components/FrontDesk/FrontDeskSummary';
import './PortalHome.css';

// Sprint 24: Home inside the staff portal = the original staff dashboard (greeting, clock in/out, this-week hours, recent shifts)
// merged with the front desk's operations block (today's tiles + sellable vs arriving). The ops block is only rendered — and its
// data only requested — for the front-desk role; other employees who use "Staff login" get just their own dashboard until
// more portal content (daily communications, …) arrives.
const PortalHome = () => {
  const { user } = useAuth();
  const frontDesk = !!user && user.role === 'front_desk';
  return (
    <div className={`ph-page${frontDesk ? ' has-ops' : ''}`}>
      {frontDesk && <div className="ph-ops"><FrontDeskSummary /></div>}
      <div className="ph-me"><Home portal /></div>
    </div>
  );
};

export default PortalHome;
