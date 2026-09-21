import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from './store';
import { App } from './app/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>
  </StrictMode>,
);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { type: 'classic', updateViaCache: 'none' })
      .catch(() => {
        const banner = document.createElement('div');
        banner.className = 'offline-banner';
        banner.setAttribute('role', 'alert');
        banner.textContent =
          'Offline access and notifications could not start. Reload to try again.';
        document.body.prepend(banner);
      });
  });
}
