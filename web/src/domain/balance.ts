import type { Expense, FixedExpense, RevenueEntry } from '../types/model';
import { lotCommission, P, Popt } from './catalog';
import { ctx } from './ctx';
import { dayKey, monthKey } from './format';
import { moneyEntries, revenueEntries } from './sales';
import { lotSrc } from './stock';

/* Ingresos de la bodega: de lo vendido en consignación solo cuenta la comisión; el resto es del productor.
   Lo de compra directa cuenta completo. Lo usan Dashboard, Cierre de caja y Balance. */
export interface Income {
  ventas: number; n: number; anul: number; propias: number; costoVendido: number; consig: number; comision: number;
  gamVend: number; gamVendN: number; gamCob: number; gamCobN: number; gamDev: number; gamDevN: number;
  byProd: Record<string, { qty: number; monto: number }>; ingresos: number; deProductores: number;
}
export function incomeOf(entries: RevenueEntry[]): Income {
  const lot = Object.fromEntries(ctx.S.lots.map((l) => [l.id, l]));
  const r: Income = { ventas: 0, n: 0, anul: 0, propias: 0, costoVendido: 0, consig: 0, comision: 0, gamVend: 0, gamVendN: 0, gamCob: 0, gamCobN: 0, gamDev: 0, gamDevN: 0, byProd: {}, ingresos: 0, deProductores: 0 };
  entries.forEach((s) => {
    r.ventas += s.total;
    if (s.entrySign !== -1) r.n++; else r.anul++;
    s.lineas.forEach((ln) => {
      const b = r.byProd[ln.prod] || (r.byProd[ln.prod] = { qty: 0, monto: 0 });
      b.qty += ln.qty; b.monto += ln.subtotal;
      if (Popt(ln.prod)?.envase) {
        r.gamVend += ln.subtotal; r.gamVendN += ln.qty;
        if (ln.qty * (s.entrySign || 1) > 0) { r.gamCob += ln.subtotal; r.gamCobN += ln.qty; } else { r.gamDev -= ln.subtotal; r.gamDevN -= ln.qty; }
        return;
      }
      ln.allocs.forEach((a) => {
        const l = lot[a.lot], m = (s.entrySign || 1) * Math.round(Math.abs(a.qty) * ln.precio);
        if (lotSrc(l) === 'consig') { r.consig += m; r.comision += (s.entrySign || 1) * Math.round((Math.abs(m) * (a.comision ?? lotCommission(l))) / 100); }
        else { r.propias += m; r.costoVendido += (s.entrySign || 1) * Math.round(Math.abs(a.qty) * (a.costo ?? l?.costo ?? 0)); }
      });
    });
  });
  r.ingresos = r.propias + r.comision + r.gamVend;
  r.deProductores = r.consig - r.comision;
  return r;
}

export function dayStats(key: string) {
  const ss = revenueEntries().filter((s) => dayKey(s.fecha) === key);
  let gam = 0, kgs = 0;
  ss.forEach((s) => s.lineas.forEach((l) => (l.unidad === 'kg' ? (kgs += l.qty) : (gam += l.qty))));
  const inc = incomeOf(ss);
  return { ss, total: ss.reduce((a, s) => a + s.total, 0), n: ss.filter((s) => s.entrySign !== -1).length, anul: ss.filter((s) => s.entrySign === -1).length, gam, kgs, ingresos: inc.ingresos, comision: inc.comision, consig: inc.consig, deProductores: inc.deProductores };
}
export const sumMoneyDay = (key: string, medio: string): number =>
  moneyEntries().filter((e) => dayKey(e.fecha) === key && e.medio === medio).reduce((n, e) => n + e.monto, 0);

export const FIX_CATS = ['Arriendo', 'Sueldos', 'Luz y agua', 'Internet / teléfono', 'Patente', 'Otros fijos'];
export const VAR_CATS = ['Compra de gamelas', 'Flete', 'Combustible', 'Mantención', 'Bolsas / insumos', 'Otros'];
export const fixedFor = (mk: string): FixedExpense[] => ctx.S.fixed.filter((f) => f.desde <= mk && (!f.hasta || f.hasta >= mk));
export const varFor = (mk: string): Expense[] => ctx.S.expenses.filter((e) => monthKey(e.fecha) === mk);

export interface MonthStats extends Income {
  mk: string; merma: Record<string, number>; compras: number; fijos: FixedExpense[]; vars: Expense[]; gamComp: number; gamCompN: number;
  tFijos: number; tVars: number; egresos: number; bolsillo: number; devolucionesPendientes: number;
}
export function monthStats(mk: string): MonthStats {
  const S = ctx.S;
  const inc = incomeOf(revenueEntries().filter((s) => monthKey(s.fecha) === mk));
  const merma: Record<string, number> = {};
  S.moves.filter((m) => m.tipo === 'merma' && monthKey(m.fecha) === mk).forEach((m) => (merma[m.prod] = (merma[m.prod] || 0) - m.qty));
  const compras = S.receptions.filter((x) => !x.anulada && x.modalidad === 'compra' && monthKey(x.fecha) === mk).reduce((a, x) => a + x.lineas.reduce((b, l) => b + l.qty * l.costo, 0), 0);
  const fijos = fixedFor(mk), vars = varFor(mk);
  const gamComp = vars.filter((e) => e.cantidad).reduce((a, e) => a + e.monto, 0), gamCompN = vars.filter((e) => e.cantidad).reduce((a, e) => a + (e.cantidad || 0), 0);
  const tFijos = fijos.reduce((a, f) => a + f.monto, 0), tVars = vars.reduce((a, e) => a + e.monto, 0);
  const egresos = compras + tFijos + tVars;
  return { ...inc, mk, merma, compras, fijos, vars, gamComp, gamCompN, tFijos, tVars, egresos, bolsillo: inc.ingresos - egresos,
    devolucionesPendientes: (S.refunds || []).filter((x) => x.state !== 'confirmada_manual').reduce((n, x) => n + x.amount, 0) };
}
export function unitTotals(st: Income): Record<string, { qty: number; unidad: string }> {
  const u: Record<string, { qty: number; unidad: string }> = {};
  Object.entries(st.byProd).forEach(([pid, b]) => {
    const p = P(pid), k = p.envase ? 'Gamelas (envase)' : p.familia;
    const x = u[k] || (u[k] = { qty: 0, unidad: p.unidad });
    x.qty += b.qty;
  });
  return u;
}
export const anulTxt = (n: number): string => (n ? ` · ${n} anulada${n > 1 ? 's' : ''}` : '');
