import { useEffect } from 'react';
import { ModalHost } from '../components/modal';
import { Toast } from '../components/toast';
import { me } from '../domain/ctx';
import { store, useApp, type View } from '../state/store';
import { canSee, homeView } from '../routes/menu';
import { logout } from './actions';
import { Login } from '../features/auth/Login';
import { Shell } from '../features/shell/Shell';
import { Dashboard } from '../features/dashboard/Dashboard';
import { Pos } from '../features/pos/Pos';
import { Reception } from '../features/reception/Reception';
import { Inventory } from '../features/inventory/Inventory';
import { Sales } from '../features/sales/Sales';
import { Cash } from '../features/cash/Cash';
import { Credits } from '../features/credits/Credits';
import { Producers } from '../features/producers/Producers';
import { Balance } from '../features/balance/Balance';
import { Users } from '../features/users/Users';

const VIEWS: Record<View, () => React.JSX.Element> = { dash: Dashboard, pos: Pos, rec: Reception, inv: Inventory, sales: Sales, caja: Cash, credits: Credits, prod: Producers, bal: Balance, users: Users };

/** Ruta protegida: si el rol no tiene acceso al módulo, vuelve a su módulo inicial. */
function routeFromHash(): View | null {
  const v = location.hash.replace(/^#\/?/, '') as View;
  return v in VIEWS ? v : null;
}

export function App() {
  const { ready, meId, view } = useApp();
  // botón atrás del navegador / teléfono
  useEffect(() => {
    const onPop = () => { const v = routeFromHash(); const u = me(); if (v && u && canSee(u, v)) store.setView(v); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // si el usuario fue desactivado o cambió de rol mientras estaba conectado
  useEffect(() => {
    const u = me();
    if (meId && (!u || !u.activo)) { void logout(); return; }
    if (u && !canSee(u, view)) store.setView(homeView(u));
  });
  if (!ready) return <div className="login"><div className="box"><p className="muted" role="status">Cargando…</p></div></div>;
  const u = me();
  if (!u) return <><Login /><ModalHost /><Toast /></>;
  const V = VIEWS[canSee(u, view) ? view : homeView(u)];
  return <><Shell><V key={view} /></Shell><ModalHost /><Toast /></>;
}
export { routeFromHash };
