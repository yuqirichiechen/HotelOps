import React from 'react';
import { useNavigate } from 'react-router-dom';
import Keypad from '../TimeClock/Keypad';
import EmployeePanel from '../TimeClock/EmployeePanel';
import ClockWidget from '../TimeClock/ClockWidget';
import ShiftsCalendar from './ShiftsCalendar';
import { useAuth } from '../../auth';
import '../TimeClock/TimeClock.css';
import './ShiftsView.css';

// Sprint 19.4: the legacy walk-up kiosk used to look an employee up by
// typing a phone number into the unauthenticated POST /api/authenticate
// (removed — it handed out name/role/hire date for any phone number).
// This route already requires a staff login, so the schedule shown is now
// the signed-in staff member's own, taken from the token identity. The
// keypad face stays in the markup (unused) so the flip-card layout/CSS is
// untouched.
const ShiftsView = () => {
  const nav = useNavigate();
  const { user } = useAuth();

  return (
    <div className="timeclock-page sv-page">
      <div className="tc-flip-container">
        <div className="tc-flip-card flipped">

          {/* Front — phone keypad */}
          <div className="tc-face tc-face-front">
            <div className="timeclock-content">
              <EmployeePanel phone="" employee={null} loading={false} />
              <ClockWidget />
              <Keypad onKeyPress={() => {}} />
            </div>
          </div>

          {/* Back — shifts calendar */}
          <div className="tc-face tc-face-back sv-back-face">
            {user && (
              <ShiftsCalendar employee={user} onBack={() => nav('/', { replace: true })} />
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default ShiftsView;
