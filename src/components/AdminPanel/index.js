import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import AdminHome from './AdminHome';
import EmployeeManager from './EmployeeManager';
import EmployeeDetail from './EmployeeDetail';
import SchedulingManager from './Scheduling/index';
import AdminSettings from './AdminSettings';
import Forecasting from '../Forecasting';
import './AdminPanel.css';

// AdminPanel is route-gated by <RequireRole role="admin"> in App.js.
// Logout goes through the AuthProvider.
const AdminPanel = () => {
  const { logout } = useAuth();
  const nav        = useNavigate();
  const [screen, setScreen]           = useState('home');
  const [selectedEmp, setSelectedEmp] = useState(null);

  const handleLogout = async () => {
    await logout();
    nav('/login/admin', { replace: true });
  };

  const handleSelectEmp = (emp) => {
    setSelectedEmp(emp);
    setScreen('employee-detail');
  };

  return (
    <div className="admin-panel">
      {screen === 'employee-detail' && selectedEmp && (
        <EmployeeDetail
          key={selectedEmp.user_id}
          employee={selectedEmp}
          onBack={() => setScreen('employees')}
          onLogout={handleLogout}
        />
      )}
      {screen === 'employees' && (
        <EmployeeManager
          onBack={() => setScreen('home')}
          onSelect={handleSelectEmp}
          onLogout={handleLogout}
        />
      )}
      {screen === 'scheduling' && (
        <SchedulingManager
          onBack={() => setScreen('home')}
          onLogout={handleLogout}
        />
      )}
      {screen === 'settings' && (
        <AdminSettings
          onBack={() => setScreen('home')}
          onLogout={handleLogout}
        />
      )}
      {screen === 'forecasting' && (
        <div style={{ padding: '24px 24px 60px' }}>
          <div className="emp-detail-topbar">
            <button className="btn-back" onClick={() => setScreen('home')}>‹ Back</button>
          </div>
          <Forecasting />
        </div>
      )}
      {screen === 'home' && (
        <AdminHome onNavigate={setScreen} onLogout={handleLogout} />
      )}
    </div>
  );
};

export default AdminPanel;
