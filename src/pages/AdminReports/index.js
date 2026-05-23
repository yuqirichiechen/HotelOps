import React from 'react';
import { useView } from '../../shells/ViewContext';
import './AdminPlaceholder.css';

const AdminReports = () => {
  // Sprint 11.2.1: back-to-Home is a view flip, not a URL change.
  const { goTo } = useView();
  return (
    <div className="admin-ph-page">
      <div className="admin-ph-topbar">
        <button className="btn-back" onClick={() => goTo('home')}>← Home</button>
      </div>
      <div className="admin-ph-card">
        <div className="admin-ph-icon">📊</div>
        <h1 className="admin-ph-title">Reports</h1>
        <p className="admin-ph-sub">
          Payroll summaries, attendance reports, and labor-cost rollups will live here.
        </p>
        <div className="admin-ph-badge">Coming soon</div>
      </div>
    </div>
  );
};

export default AdminReports;
