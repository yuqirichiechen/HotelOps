import React, { useState } from 'react';
import AdminLogin from './AdminLogin';
import EmployeeManager from './EmployeeManager';
import './AdminPanel.css';

const AdminPanel = () => {
  const [authed, setAuthed] = useState(!!localStorage.getItem('adminAuth'));

  const handleLoginSuccess = () => {
    localStorage.setItem('adminAuth', '1');
    setAuthed(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('adminAuth');
    setAuthed(false);
  };

  return (
    <div className="admin-panel">
      {authed
        ? <EmployeeManager onLogout={handleLogout} />
        : <AdminLogin onSuccess={handleLoginSuccess} />
      }
    </div>
  );
};

export default AdminPanel;
