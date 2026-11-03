import { createContext, useContext } from 'react';

// Sprint 24.3: lets a DEV session look at the staff portal exactly as a front-desk employee sees it, without signing in as one.
// The AdminShell renders <StaffPortalShell preview={{ bar }} /> for "View as → Front desk"; the portal reads this context to
//   • treat the viewer as Front Desk (the dev token is accepted by /api/frontdesk/* on the server),
//   • show the dev's view-switch bar at the top of the page,
//   • not ask for a person's own hours / clock data (a dev has none).
export const PortalPreviewContext = createContext(null);
export const usePortalPreview = () => useContext(PortalPreviewContext);
