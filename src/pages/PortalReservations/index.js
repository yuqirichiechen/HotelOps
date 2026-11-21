import React from 'react';
import FrontDeskSummary from '../../components/FrontDesk/FrontDeskSummary';
import './PortalReservations.css';

// Sprint 24.3 / 29.4: the "Forecast" tab of the staff portal (it was "Reservations" until 29.4; the page key is still `reservations`): today's top cards + rooms to sell (no chart, no guest
// data); dev chooses which cards show (see components/FrontDesk/fdCards.js). It used to be a block on Home; Home is now the person's own hours + timesheet.
const PortalReservations = () => (
  <div className="pr-page"><FrontDeskSummary /></div>
);

export default PortalReservations;
