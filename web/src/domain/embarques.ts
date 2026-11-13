import type { Fuente, Lot } from '../types/model';
import { P, Popt } from './catalog';
import { ctx } from './ctx';
import { fdate } from './format';
import { lotStock, prodLots, srcLots } from './stock';

/*
 * Embarques: cada recepción deja un lote por producto, y ese lote es el "embarque".
 * - Se numeran por producto en orden de llegada (Embarque 1, 2, 3…); el número no cambia aunque se agoten los anteriores.
 * - Cada embarque puede tener un precio propio. Si no lo tiene, se vende al precio general del producto.
 * - En el punto de venta y en la merma, el usuario elige de qué embarque sale (el sistema no decide por él).
 */

export const findLot = (id: string | undefined): Lot | undefined => (id ? ctx.S.lots.find((l) => l.id === id) : undefined);

/** Precio de venta del embarque: el propio, o el general del producto. */
export const lotPrice = (l: Lot): number => (Number.isSafeInteger(l.precio) && (l.precio as number) > 0 ? (l.precio as number) : Popt(l.prod)?.precio ?? 0);
export const hasOwnPrice = (l: Lot): boolean => Number.isSafeInteger(l.precio) && (l.precio as number) > 0;

/** Número de embarque dentro del producto (solo cuentan los lotes que vienen de una recepción). 0 = ajuste sin recepción. */
export function embNum(l: Lot): number {
  if (!l.rec) return 0;
  return prodLots(l.prod).filter((x) => x.rec).findIndex((x) => x.id === l.id) + 1;
}
export const embName = (l: Lot): string => (embNum(l) ? `Embarque ${embNum(l)}` : 'Ajuste de stock');
/** "Embarque 3 · 08-11-2026" */
export const embLabel = (l: Lot): string => `${embName(l)} · ${fdate(l.fecha)}`;

/** Embarques con stock (del más antiguo al más nuevo), opcionalmente de un solo origen. */
export const openEmbarques = (pid: string, src?: Fuente, until = Infinity): Lot[] =>
  (src ? srcLots(pid, src) : prodLots(pid)).filter((l) => lotStock(l.id, until) > 1e-9);

/** Precios distintos entre los embarques con stock (ordenados de menor a mayor). */
export function openPrices(pid: string, src?: Fuente): number[] {
  return [...new Set(openEmbarques(pid, src).map(lotPrice))].sort((a, b) => a - b);
}
/** Precio a mostrar del producto: uno solo, o el rango si sus embarques con stock tienen precios distintos. */
export function priceRange(pid: string, src?: Fuente): [number, number] {
  const ps = Popt(pid)?.envase ? [] : openPrices(pid, src);
  const one = ps.length ? ps[0] : P(pid).precio;
  return [one, ps.length ? ps[ps.length - 1] : one];
}

/** Precio normal de una línea de venta: el del embarque elegido o, sin embarque, el general del producto. */
export function lineBasePrice(c: { prod: string; lot?: string }): number {
  const p = Popt(c.prod);
  if (!p) return 0;
  const l = !p.envase ? findLot(c.lot) : undefined;
  return l && l.prod === p.id ? lotPrice(l) : p.precio;
}
