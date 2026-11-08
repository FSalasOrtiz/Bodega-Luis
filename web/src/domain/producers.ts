import type { LiqRow, Liquidation } from '../types/model';
import { lotCommission } from './catalog';
import { ctx } from './ctx';
import { dayKey, pctTxt } from './format';
import { revenueEntries } from './sales';

/** Liquidación de consignación de un productor en un periodo. Neto = vendido − comisión. La merma no se paga. */
export function liqCalc(prodId: string, desde: string, hasta: string): Pick<Liquidation, 'by' | 'monto' | 'comision' | 'neto' | 'pct' | 'pcts'> {
  const S = ctx.S;
  const lots = S.lots.filter((l) => l.productor === prodId && l.modalidad === 'consignación' && !S.receptions.find((r) => r.id === l.rec)?.anulada);
  const ids = new Set(lots.map((l) => l.id));
  const inR = (t: number) => (!desde || dayKey(t) >= desde) && (!hasta || dayKey(t) <= hasta);
  const by: Record<string, LiqRow> = {};
  const add = (pid: string) => by[pid] || (by[pid] = { recibido: 0, vendido: 0, monto: 0, merma: 0 });
  const pcts = new Set<number>();
  lots.filter((l) => inR(l.fecha)).forEach((l) => (add(l.prod).recibido += l.qty));
  revenueEntries().filter((s) => inR(s.fecha)).forEach((s) => s.lineas.forEach((ln) => ln.allocs.forEach((a) => {
    if (ids.has(a.lot)) {
      const r = add(ln.prod), pc = a.comision ?? lotCommission(S.lots.find((l) => l.id === a.lot));
      pcts.add(pc);
      r.vendido += a.qty;
      r.monto += (s.entrySign || 1) * Math.round(Math.abs(a.qty) * ln.precio);
      r.comision = (r.comision || 0) + (s.entrySign || 1) * Math.round((Math.round(Math.abs(a.qty) * ln.precio) * pc) / 100);
    }
  })));
  S.moves.filter((m) => m.tipo === 'merma' && ids.has(m.lot) && inR(m.fecha)).forEach((m) => (add(m.prod).merma += -m.qty));
  const monto = Object.values(by).reduce((a, r) => a + r.monto, 0), com = Object.values(by).reduce((n, r) => n + (r.comision || 0), 0);
  return { by, monto, comision: com, neto: monto - com, pct: monto ? Math.round((com / monto) * 1000) / 10 : 0, pcts: [...pcts].sort((a, b) => a - b) };
}
/** Lo del productor se le debe hasta que se marca pagada su liquidación. */
export function producerAccount(pid: string) {
  const L = liqCalc(pid, '', ''), pagado = ctx.S.liqs.filter((l) => l.prod === pid && l.pagada && l.neto > 0).reduce((n, l) => n + l.neto, 0);
  return { vendido: L.monto, comision: L.comision, suParte: L.neto, pagado, debe: L.neto - pagado };
}
export const producersOwed = (): number => ctx.S.producers.reduce((n, p) => n + Math.max(0, producerAccount(p.id).debe), 0);
/** Cada venta guarda su %: si hubo más de uno en el periodo se muestran todos (no un promedio). */
export const liqPctTxt = (L: { pcts?: number[]; pct: number }): string => {
  const p = (L.pcts?.length ? L.pcts : [L.pct]).map(pctTxt);
  return p.length > 1 ? p.slice(0, -1).join(', ') + ' y ' + p[p.length - 1] : p[0];
};
