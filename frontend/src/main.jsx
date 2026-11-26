import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';
import { initFrontendSentry } from './config/sentry.js';

initFrontendSentry();

const PRELOAD_RELOAD_KEY = 'uconext_vite_preload_reloaded_at';
const PRELOAD_RELOAD_COOLDOWN_MS = 15_000;

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    const lastReloadAt = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) || '0');
    if (Date.now() - lastReloadAt > PRELOAD_RELOAD_COOLDOWN_MS) {
      sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()));
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
