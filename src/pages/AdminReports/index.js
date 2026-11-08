import React from 'react';
import LogBook from '../../components/LogBook';

// Sprint 26: the admin "Logbook" surface (view='reports') is now the new Log Book (month calendar + day page + note form). It replaces the Sprint 12.1
// prototype built on the old handoff notes. File path stays at `pages/AdminReports/` because the AdminShell maps view='reports' here.
const AdminReports = () => <LogBook apiBase="/admin" />;

export default AdminReports;
