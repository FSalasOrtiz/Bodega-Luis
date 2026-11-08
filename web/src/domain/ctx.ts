import type { PosDraft, State, User } from '../types/model';

/**
 * Contexto de ejecución del dominio.
 * Las funciones de negocio leen `ctx.S` (estado) y `ctx.ui` (borrador del punto de venta), como en el prototipo.
 * Dentro de un comando, `ctx.S` es un borrador de Immer; fuera, es el estado inmutable vigente.
 */
export const ctx: { S: State; meId: string | null; ui: PosDraft } = {
  S: undefined as unknown as State,
  meId: null,
  ui: undefined as unknown as PosDraft,
};

export const me = (): User | null => (ctx.meId ? ctx.S.users.find((u) => u.id === ctx.meId) ?? null : null);
export const isAdmin = (): boolean => me()?.rol === 'admin';
/** Contador(a): perfil de solo lectura; únicamente consulta y descarga boletas y facturas. */
export const isAccountant = (): boolean => me()?.rol === 'contador';
