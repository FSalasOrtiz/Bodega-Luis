import type { Lot } from '../types/model';
import { gamId, gamProd, kgGam, P } from './catalog';
import { ctx } from './ctx';
import { clp, uid } from './format';
import { prodLots } from './stock';

/* Gamelas de la venta (anónimas): se lleva = gamelas de tomate del carrito + las que sume el vendedor (palta, vacías);
   trae = gamelas que entrega el cliente. Se cobra la diferencia; si trae más, se descuenta de la compra. */
export interface GamCalc { auto: number; extra: number; lleva: number; trae: number; net: number; monto: number }

export function gamAuto(): number {
  return ctx.ui.cart.reduce((a, c) => {
    const p = P(c.prod);
    return a + (p && p.usaGamela && p.unidad === 'gamela' ? c.qty : kgGam(p) ? c.gam || 0 : 0);
  }, 0);
}
export function gamCalc(): GamCalc {
  const auto = gamAuto(), extra = Math.max(0, Math.round(Number(ctx.ui.gamExtra) || 0)), trae = Math.max(0, Math.round(Number(ctx.ui.gamTrae) || 0));
  const lleva = auto + extra, net = lleva - trae;
  return { auto, extra, lleva, trae, net, monto: net * gamProd().precio };
}
export function gamError(g: GamCalc, prodTotal: number): string {
  if (g.net < 0 && -g.monto >= prodTotal)
    return prodTotal ? `Lo que se descuenta por gamelas (${clp(-g.monto)}) tiene que ser menor que la compra (${clp(prodTotal)}).` : 'Para descontar gamelas el cliente tiene que comprar algo.';
  return '';
}
/** Las gamelas que devuelve el cliente vuelven al lote de gamelas más reciente. */
export function gamelaReturnLot(fecha: number): Lot {
  const lots = prodLots(gamId()).filter((l) => l.fecha <= fecha);
  if (lots.length) return lots[lots.length - 1];
  const lot: Lot = { id: uid('l'), rec: '', prod: gamId(), qty: 0, costo: 0, fecha, productor: '', modalidad: 'devolución' };
  ctx.S.lots.push(lot);
  return lot;
}
/** Compra de gamelas: suma stock de envases y queda como gasto variable del mes. */
export function buyGamelas(qty: number, monto: number, fecha: number, user: string, desc: string): void {
  const p = gamProd();
  const lot: Lot = { id: uid('l'), rec: '', prod: p.id, qty, costo: Math.round(monto / qty), fecha, productor: '', modalidad: 'compra' };
  ctx.S.lots.push(lot);
  ctx.S.moves.push({ id: uid('m'), lot: lot.id, prod: p.id, tipo: 'compra gamelas', qty, user, fecha, motivo: desc || '', ref: '' });
  ctx.S.expenses.push({ id: uid('e'), fecha, cat: 'Compra de gamelas', monto, desc: desc || '', cantidad: qty, lot: lot.id });
}
export function kgGamCount(pid: string): { entra: number; sale: number; merma: number; quedan: number } {
  const S = ctx.S;
  const entra = S.receptions.filter((r) => !r.anulada).reduce((n, r) => n + r.lineas.filter((l) => l.prod === pid).reduce((a, l) => a + (l.gamelas || 0), 0), 0);
  const sale = S.sales.filter((s) => s.estado === 'vigente' && !s.reversal?.completedAt).reduce((n, s) => n + s.lineas.filter((l) => l.prod === pid).reduce((a, l) => a + (l.gamelas || 0), 0), 0);
  const merma = S.moves.filter((m) => m.prod === pid && m.tipo === 'merma').reduce((n, m) => n + (m.gamelas || 0), 0);
  return { entra, sale, merma, quedan: entra - sale - merma };
}
export const kgGamTxt = (pid: string): string => {
  const g = kgGamCount(pid);
  return `Gamelas: entraron ${g.entra} · salieron ${g.sale}${g.merma ? ` · merma ${g.merma}` : ''} · quedan ${g.quedan}`;
};
