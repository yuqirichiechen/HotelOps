import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../AdminReports/AdminPlaceholder.css';

const AdminShiftNotes = () => {
  const nav = useNavigate();
  return (
    <div className="admin-ph-page">
      <div className="admin-ph-topbar">
        <button className="btn-back" onClick={() => nav('/admin')}>← Home</button>
      </div>
      <div className="admin-ph-card">
        <div className="admin-ph-icon">📝</div>
        <h1 className="admin-ph-title">Shift Notes</h1>
        <p className="admin-ph-sub">
          Author and pin role-targeted handoff notes. Read by staff at sign-in.
        </p>
        <div className="admin-ph-badge">Coming soon</div>
      </div>
    </div>
  );
};

export default AdminShiftNotes;
