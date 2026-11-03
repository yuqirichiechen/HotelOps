import React from 'react';
import FrontDeskSummary from '../../components/FrontDesk/FrontDeskSummary';
import './PortalReservations.css';

// Sprint 24.3: the "Reservations" tab of the staff portal (Front Desk only): today's five tiles + "Sellable vs arriving" (no chart, no guest data).
// It used to be a block on Home; Home is now the person's own hours + timesheet.
const PortalReservations = () => (
  <div className="pr-page"><FrontDeskSummary /></div>
);

export default PortalReservations;
