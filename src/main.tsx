import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initPrefs } from './prefs/prefs';

// Minimal bootstrap — proves the toolchain builds (Phase 1). The real app shell,
// routing, and store wiring land in Phase 4.
initPrefs();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element (#root) not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
