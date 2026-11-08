import { isDraft, original } from 'immer';
import type { Fuente, Lot, Move, Product } from '../types/model';
import { ctx } from './ctx';
import { round2 } from './format';

/* Stock por lotes (libro de movimientos): el stock nunca se edita a mano, es la suma de movimientos. */

type Acc = { sum: number; max: number };
interface StockIdx { lot: Map<string, Acc>; prod: Map<string, Acc> }
const idxCache = new WeakMap<readonly Move[], StockIdx>();
const add = (m: Map<string, Acc>, k: string, mv: Move) => {
  const a = m.get(k);
  if (a) { a.sum += mv.qty; if (mv.fecha > a.max) a.max = mv.fecha; } else m.set(k, { sum: mv.qty, max: mv.fecha });
};
function build(moves: readonly Move[]): StockIdx {
  let idx = idxCache.get(moves);
  if (!idx) {
    idx = { lot: new Map(), prod: new Map() };
    for (const mv of moves) { add(idx.lot, mv.lot, mv); add(idx.prod, mv.prod, mv); }
    idxCache.set(moves, idx);
  }
  return idx;
}
/** Índice del estado base + movimientos agregados dentro del comando en curso (borrador de Immer). */
function stockIndex(): { base: StockIdx; extra: Move[] } {
  const moves = ctx.S.moves;
  if (isDraft(moves)) {
    const base = original(moves) as Move[] | undefined;
    return { base: base ? build(base) : { lot: new Map(), prod: new Map() }, extra: moves.slice(base ? base.length : 0) };
  }
  return { base: build(moves), extra: [] };
}
function sumBy(key: 'lot' | 'prod', id: string, until: number): number {
  const moves = ctx.S.moves;
  // Estado mutable fuera de un comando (generación de datos de demostración): cálculo directo, sin caché.
  if (!isDraft(moves) && !Object.isFrozen(moves)) return moves.reduce((acc, m) => (m[key] === id && m.fecha <= until ? acc + m.qty : acc), 0);
  const { base, extra } = stockIndex();
  const a = base[key].get(id);
  let max = a?.max ?? -Infinity;
  for (const m of extra) if (m[key] === id && m.fecha > max) max = m.fecha;
  if (until >= max) {
    let s = a?.sum ?? 0;
    for (const m of extra) if (m[key] === id) s += m.qty;
    return s;
  }
  // corte histórico (datos de demostración): recorre los movimientos
  return ctx.S.moves.reduce((acc, m) => (m[key] === id && m.fecha <= until ? acc + m.qty : acc), 0);
}

export const lotStock = (id: string, until = Infinity): number => sumBy('lot', id, until);
export const prodStock = (id: string, until = Infinity): number => sumBy('prod', id, until);
export const prodLots = (id: string): Lot[] => ctx.S.lots.filter((l) => l.prod === id).sort((a, b) => a.fecha - b.fecha);

/* Dos stocks separados por producto: lo que entró en consignación y lo que entró como compra directa.
   Los ajustes y lotes sin productor cuentan como compra directa, salvo que el lote diga otra cosa (fuente). */
export const SRC_LBL: Record<Fuente, string> = { consig: 'Consignación', directa: 'Compra directa' };
export const isFuente = (v: unknown): v is Fuente => v === 'consig' || v === 'directa';
export const lotSrc = (l: Lot | undefined | null): Fuente => l?.fuente || (l?.modalidad === 'consignación' ? 'consig' : 'directa');
export const srcLots = (pid: string, src?: Fuente): Lot[] => prodLots(pid).filter((l) => !src || lotSrc(l) === src);
/** Recorre los movimientos en su orden original (dentro de un comando: base congelada + movimientos nuevos). */
function reduceMoves(fn: (acc: number, m: Move) => number): number {
  const moves = ctx.S.moves;
  if (isDraft(moves)) {
    const base = (original(moves) as Move[] | undefined) || [];
    let acc = base.reduce(fn, 0);
    for (const m of moves.slice(base.length)) acc = fn(acc, m);
    return acc;
  }
  return moves.reduce(fn, 0);
}
export const srcStock = (pid: string, src?: Fuente, until = Infinity): number => {
  if (!src) return prodStock(pid, until);
  // mismo orden de suma que el prototipo (evita diferencias de redondeo en kg)
  const ids = new Set(srcLots(pid, src).map((l) => l.id));
  return reduceMoves((a, m) => (ids.has(m.lot) && m.fecha <= until ? a + m.qty : a));
};

/** Productos por kilo: lo vendido por sobre el stock registrado queda como ajuste (balanza). */
export const scaleOver = (p: Product | undefined, avail: number, qty: number): number =>
  p && p.unidad === 'kg' && !p.envase && qty > Math.max(0, avail) + 1e-9 ? round2(qty - Math.max(0, avail)) : 0;

/** Primero en entrar, primero en salir. */
export function fifo(prodId: string, qty: number, until = Infinity): { lot: string; qty: number }[] | null {
  const out: { lot: string; qty: number }[] = [];
  let rest = qty;
  for (const l of prodLots(prodId)) {
    if (rest <= 1e-9) break;
    const s = lotStock(l.id, until);
    if (s <= 1e-9) continue;
    const take = Math.min(s, rest);
    out.push({ lot: l.id, qty: take });
    rest -= take;
  }
  return rest > 1e-9 ? null : out;
}
/** FIFO con reservas compartidas entre líneas repetidas de una misma venta. */
export function reserveFifo(prodId: string, qty: number, until: number, reserved: Map<string, number>, src?: Fuente): { lot: string; qty: number }[] | null {
  const out: { lot: string; qty: number }[] = [];
  let rest = qty;
  for (const lot of src ? srcLots(prodId, src) : prodLots(prodId)) {
    if (rest <= 1e-9) break;
    const available = lotStock(lot.id, until) - (reserved.get(lot.id) || 0);
    if (available <= 1e-9) continue;
    const take = Math.min(rest, available);
    out.push({ lot: lot.id, qty: take });
    reserved.set(lot.id, (reserved.get(lot.id) || 0) + take);
    rest -= take;
  }
  return rest > 1e-9 ? null : out;
}
