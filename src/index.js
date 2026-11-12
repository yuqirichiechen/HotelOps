import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './AppErrorBoundary';
import './index.css';
import './darkFixes.css';
import './inntrioApp.css';   // Sprint 28.1: the Inntrio look for the signed-in app

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<AppErrorBoundary><App /></AppErrorBoundary>);
