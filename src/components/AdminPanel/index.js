import React, { useState } from 'react';
import AdminLogin from './AdminLogin';
import AdminHome from './AdminHome';
import EmployeeManager from './EmployeeManager';
import EmployeeDetail from './EmployeeDetail';
import SchedulingManager from './Scheduling/index';
import './AdminPanel.css';

const AdminPanel = () => {
  const [authed, setAuthed] = useState(!!localStorage.getItem('adminAuth'));
  const [screen, setScreen] = useState('home');
  const [selectedEmp, setSelectedEmp] = useState(null);

  const handleLogout = () => {
    localStorage.removeItem('adminAuth');
    setAuthed(false);
    setScreen('home');
  };

  const handleSelectEmp = (emp) => {
    setSelectedEmp(emp);
    setScreen('employee-detail');
  };

  if (!authed) {
    return (
      <div className="admin-panel">
        <AdminLogin onSuccess={() => { localStorage.setItem('adminAuth', '1'); setAuthed(true); }} />
      </div>
    );
  }

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
      {screen === 'home' && (
        <AdminHome onNavigate={setScreen} onLogout={handleLogout} />
      )}
    </div>
  );
};

export default AdminPanel;
