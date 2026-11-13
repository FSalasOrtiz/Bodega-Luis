import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/app.css';
import { App } from './app/App';
import { bootstrap } from './app/bootstrap';
import { store } from './state/store';
import { installTableLabels } from './utils/tableLabels';

const root = createRoot(document.getElementById('root')!);
root.render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>);
installTableLabels();
if (import.meta.env.VITE_E2E === 'true') void import('./app/testBridge').then((m) => m.installTestBridge());
bootstrap().catch((e) => {
  console.error(e);
  root.render(<div className="login"><div className="box"><h2>No se pudo iniciar</h2><p className="err" role="alert">{e instanceof Error ? e.message : String(e)}</p><button className="btn pri" onClick={() => location.reload()}>Reintentar</button></div></div>);
});
// estado de conexión (aviso en pantalla)
window.addEventListener('online', () => store.setOnline(true));
window.addEventListener('offline', () => store.setOnline(false));
