import { useEffect } from 'react';
import { logout } from './actions';

/** Minutos sin uso tras los que se cierra la sesión y se recarga la app (versión y datos frescos). */
export const IDLE_MINUTES = 15;
const KEY = 'bodegaLV.lastActivity';

/**
 * Cierre de sesión por inactividad. La última actividad se guarda en localStorage para que las pestañas abiertas la compartan,
 * y se revisa también al volver a la app (un celular con la pantalla apagada no ejecuta temporizadores).
 * El carrito del punto de venta se conserva: está guardado por usuario.
 */
export function useIdleLogout(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const limit = IDLE_MINUTES * 60e3;
    let last = Date.now(), done = false;
    const touch = () => { const t = Date.now(); if (t - last > 5000) { last = t; try { localStorage.setItem(KEY, String(t)); } catch { /* nada */ } } };
    try { localStorage.setItem(KEY, String(last)); } catch { /* nada */ }
    const check = () => {
      if (done) return;
      const shared = Number(localStorage.getItem(KEY) || 0);
      if (Date.now() - Math.max(last, shared) < limit) return;
      done = true;
      void logout().finally(() => location.reload());
    };
    const evs = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    const timer = setInterval(check, 30e3);
    return () => { evs.forEach((e) => window.removeEventListener(e, touch, { capture: true })); document.removeEventListener('visibilitychange', onVis); clearInterval(timer); };
  }, [active]);
}
