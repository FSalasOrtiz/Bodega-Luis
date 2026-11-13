import { toast, toastError } from '../components/toast';
import { closeModal } from '../components/modal';
import { ctx } from '../domain/ctx';
import { store, loadPosDraft, type View } from '../state/store';
import { canSee, homeView } from '../routes/menu';
import { services } from './services';
import { POS_DEFAULT } from '../domain/pos';

/** Ejecuta un comando de negocio y muestra el error como aviso. Devuelve el resultado o undefined si falló. */
export async function exec<T>(fn: () => T, ok?: string | ((r: T) => string)): Promise<T | undefined> {
  try {
    const r = await store.run(fn);
    if (ok) toast(typeof ok === 'function' ? ok(r) : ok);
    return r;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/guardar|conexión|permiso/i.test(m)) toastError(m); else toast(m);
    return undefined;
  }
}

/**
 * Igual que exec, pero indica si el comando se completó (true) o falló (false).
 * Para comandos que no devuelven nada: con exec, éxito y fallo dan ambos undefined
 * y la ventana no se cerraba al confirmar.
 */
export async function execOk(fn: () => unknown, ok?: string): Promise<boolean> {
  return (await exec(() => { fn(); return true as const; }, ok)) === true;
}

const me = () => (ctx.meId ? ctx.S.users.find((u) => u.id === ctx.meId) ?? null : null);

export function go(v: View): void {
  const u = me();
  if (!canSee(u, v)) { toast(u?.rol === 'contador' ? 'Tu perfil solo permite ver el historial de ventas.' : 'Acceso reservado al administrador.'); return; }
  store.setView(v);
  try { sessionStorage.setItem('bodegaLV.view', v); } catch { /* nada */ }
  if (location.hash !== '#/' + v) history.pushState(null, '', '#/' + v);
  window.scrollTo(0, 0);
  document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true });
}

export async function login(usuario: string, clave: string): Promise<void> {
  const id = await services.auth.login(usuario, clave, store.get().S);
  const u = store.get().S.users.find((x) => x.id === id);
  if (!u || !u.activo) { await services.auth.logout(); throw new Error('Usuario o contraseña incorrectos'); }
  store.setSession(id, homeView(u));
  store.setUi(loadPosDraft());
  history.replaceState(null, '', '#/' + homeView(u));
}

export async function logout(): Promise<void> {
  closeModal();
  await services.auth.logout();
  store.setSession(null);
  store.setUi(POS_DEFAULT());
  history.replaceState(null, '', '#/');
}
