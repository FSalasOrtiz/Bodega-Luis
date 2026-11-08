import type { Client, Lot, Producer, Product, SaleLine, User } from '../types/model';
import { ctx } from './ctx';
import { lotSrc } from './stock';

export const P = (id: string): Product => ctx.S.products.find((p) => p.id === id) as Product;
export const Popt = (id: string): Product | undefined => ctx.S.products.find((p) => p.id === id);
export const U = (id: string): User | { nombre: string; id?: undefined } =>
  ctx.S.users.find((u) => u.id === id) || { nombre: '—' };
export const PR = (id: string): Producer | { nombre: string; id?: undefined; comision?: undefined; rut?: undefined; fono?: undefined } =>
  ctx.S.producers.find((p) => p.id === id) || { nombre: '—' };
export const CL = (id: string): Client | { id: string; nombre: string; activo: false } =>
  (ctx.S.clients || []).find((c) => c.id === id) || { id, nombre: '(cliente no encontrado)', activo: false };

export const gamProd = (): Product => ctx.S.products.find((p) => p.envase) as Product;
export const gamId = (): string => gamProd().id;
/** La garantía por gamela es siempre $1.000 (los tratos de $500 de Luis quedan fuera del sistema). */
export const GAMELA_PRECIO = 1000;

/** Productos por kilo con gamelas (palta): las gamelas se anotan aparte de los kg. */
export const kgGam = (p: Product | undefined | null): boolean => !!p && p.unidad === 'kg' && !!p.usaGamela && !p.envase;
export const gamInt = (v: unknown): number => {
  const n = Number(String(v ?? '').trim() || 0);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

export const lineName = (l: Pick<SaleLine, 'prod' | 'qty'>): string => {
  const p = Popt(l.prod);
  return p?.envase ? (l.qty < 0 ? 'Devolución de gamelas' : 'Gamelas (garantía)') : p?.nombre || 'Producto';
};

export function productFamilies(): string[] {
  return [...new Set(['Tomate', 'Palta', ...(ctx.S.families || []), ...ctx.S.products.filter((p) => !p.envase).map((p) => p.familia)].filter((f) => f && f !== 'Otros'))];
}
/** La gamela es un producto más en la recepción: se agrega a mano como una línea. */
export const recProducts = (): Product[] => ctx.S.products.filter((x) => x.activo).sort((a, b) => (a.envase ? 1 : 0) - (b.envase ? 1 : 0));

export const COM_DEF = 10;
export const comBase = (): number => {
  const v = Number(ctx.S.cfg.comision);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : COM_DEF;
};
/** La comisión se elige en cada recepción (consignación) y se guarda en el lote. */
export const lotCommission = (l: Lot | undefined): number =>
  l ? (lotSrc(l) === 'consig' ? l.comision ?? PR(l.productor)?.comision ?? ctx.S.cfg.comision : 0) : ctx.S.cfg.comision;
