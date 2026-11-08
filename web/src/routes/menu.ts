import type { Rol, User } from '../types/model';
import type { View } from '../state/store';

/* Navegación por rol. La ruta protegida se valida aquí (UI) y, en producción, también en las reglas de Firestore. */
export interface MenuItem { id: View; t: string; tv?: string; i: string; e: string; admin?: boolean; roles?: Rol[] }
export const MENU: MenuItem[] = [
  { id: 'dash', t: 'Dashboard', i: 'dash', admin: true, e: '📊' },
  { id: 'pos', t: 'Punto de venta', i: 'pos', e: '🛒' },
  { id: 'rec', t: 'Recepción / Merma', i: 'rec', e: '🚚' },
  { id: 'inv', t: 'Inventario', i: 'inv', e: '📦' },
  { id: 'sales', t: 'Historial', tv: 'Historial', i: 'sales', e: '🧾', roles: ['admin', 'vendedor', 'contador'] },
  { id: 'caja', t: 'Cierre de caja', i: 'bal', e: '💵' },
  { id: 'credits', t: 'Créditos', i: 'coin', e: '🪙', roles: ['admin', 'vendedor'] },
  { id: 'prod', t: 'Productores', i: 'prod', admin: true, e: '🧑‍🌾' },
  { id: 'bal', t: 'Balance', i: 'bal', admin: true, e: '⚖️' },
  { id: 'users', t: 'Usuarios y ajustes', i: 'users', admin: true, e: '👥' },
];
export const ROLE_LABEL: Record<Rol, string> = { admin: 'Administrador', vendedor: 'Vendedor', contador: 'Contador(a) · solo lectura' };
export const homeView = (u: Pick<User, 'rol'>): View => (u.rol === 'admin' ? 'dash' : u.rol === 'contador' ? 'sales' : 'pos');
export const menuFor = (u: User | null): MenuItem[] =>
  !u ? [] : MENU.filter((m) => (m.roles ? m.roles.includes(u.rol) : u.rol !== 'contador' && (!m.admin || u.rol === 'admin')));
export const canSee = (u: User | null, v: View): boolean => menuFor(u).some((m) => m.id === v);
export const bottomNav = (u: User): View[] => (u.rol === 'admin' ? ['dash', 'pos', 'rec', 'inv', 'sales'] : u.rol === 'contador' ? ['sales'] : ['pos', 'rec', 'inv', 'sales', 'caja']);
export const bottomLabel = (id: View, u: User): string =>
  id === 'rec' ? 'Recepción' : id === 'sales' ? (u.rol === 'vendedor' ? 'Mis ventas' : 'Ventas') : id === 'dash' ? 'Inicio' : id === 'pos' ? 'Vender' : id === 'caja' ? 'Caja' : MENU.find((m) => m.id === id)!.t;
