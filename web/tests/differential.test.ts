// @vitest-environment node
/**
 * Prueba diferencial: el dominio TypeScript debe calcular exactamente lo mismo que el prototipo original.
 * Carga bodega-lo-valledor.html (+ assets) en un sandbox de Node con reloj fijo y azar con semilla,
 * toma su estado y compara cálculos y operaciones contra los módulos de src/domain.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { State } from '../src/types/model';
import { ctx } from '../src/domain/ctx';
import { setClock, monthKey, dayKey, DAY } from '../src/domain/format';
import { prodStock, srcStock } from '../src/domain/stock';
import { dayStats, monthStats } from '../src/domain/balance';
import { liqCalc, producerAccount } from '../src/domain/producers';
import { creditBalance, creditTotal } from '../src/domain/credits';
import { moneyEntries, revenueEntries } from '../src/domain/sales';
import { registerSaleCommand, reverseSaleCommand, type SaleDraft } from '../src/domain/workflow';
import { closeShiftCmd, saveMermaCmd, saveReceptionCmd } from '../src/domain/operations';
import { POS_DEFAULT } from '../src/domain/pos';

const ROOT = resolve(__dirname, '../..');
const T0 = new Date('2026-11-07T21:30:00').getTime();

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = vm.Context & { S: State; [k: string]: unknown };
let proto: Ctx;
const clockNow = T0;

function loadPrototype(): Ctx {
  const html = readFileSync(resolve(ROOT, 'bodega-lo-valledor.html'), 'utf8');
  const source = readFileSync(resolve(ROOT, 'assets/transaction-workflow.js'), 'utf8') + '\n' + readFileSync(resolve(ROOT, 'assets/invoice-layout.js'), 'utf8') + '\n' +
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]).join('\n');
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  const root = { innerHTML: '', inert: false, querySelectorAll: () => [] };
  const el = () => ({ classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, removeAttribute() {}, appendChild() {}, addEventListener() {}, remove() {}, style: {}, dataset: {}, querySelector: () => null, querySelectorAll: () => [] });
  class FixedDate extends Date { static override now() { return clockNow; } }
  const math = Object.create(Math) as Math;
  math.random = mulberry32(20261107);
  const context = {
    console, Date: FixedDate, Math: math, Intl, JSON, Map, Set, Number, String, Array, Object, Boolean, RegExp, parseFloat, parseInt, isNaN, setTimeout, clearTimeout,
    localStorage: storage, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    window: { addEventListener() {}, scrollTo() {} },
    document: { addEventListener() {}, querySelector: (s: string) => (s === '#root' ? root : null), querySelectorAll: () => [], createElement: el, body: el(), head: el(), documentElement: { dataset: {} }, getElementById: () => null, activeElement: null },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    URL, Blob: class {}, navigator: {}, globalThis: undefined as unknown,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context as unknown as Ctx;
}
const runProto = <R = unknown>(code: string): R => vm.runInContext(code, proto) as R;
const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x)) as X;

/** Cálculos derivados que muestran Dashboard, Inventario, Balance, Productores y Créditos. */
function derived(S: State, f: { prodStock: (id: string) => number; srcStock: (id: string, s: string) => number; dayStats: (k: string) => unknown; monthStats: (k: string) => unknown; liqCalc: (p: string, d: string, h: string) => unknown; producerAccount: (p: string) => unknown; creditBalance: (c: string) => number; creditTotal: () => number; revenueN: () => number; money: () => Record<string, number> }) {
  const months = [monthKey(clockNow), monthKey(clockNow - 31 * DAY)];
  const days = [0, 1, 2, 6].map((d) => dayKey(clockNow - d * DAY));
  const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'ss' || k === 'fijos' || k === 'vars' ? undefined : v)));
  return {
    stock: Object.fromEntries(S.products.map((p) => [p.sku, [f.prodStock(p.id), f.srcStock(p.id, 'consig'), f.srcStock(p.id, 'directa')]])),
    days: Object.fromEntries(days.map((k) => [k, strip(f.dayStats(k))])),
    months: Object.fromEntries(months.map((k) => [k, strip(f.monthStats(k))])),
    liqs: Object.fromEntries(S.producers.map((p) => [p.id, [f.liqCalc(p.id, '', ''), f.liqCalc(p.id, dayKey(clockNow - 20 * DAY), dayKey(clockNow - 5 * DAY)), f.producerAccount(p.id)]])),
    credit: [S.clients.map((c) => f.creditBalance(c.id)), f.creditTotal()],
    revenueN: f.revenueN(),
    money: f.money(),
  };
}
const tsFns = {
  prodStock: (id: string) => prodStock(id), srcStock: (id: string, s: string) => srcStock(id, s as 'consig'), dayStats, monthStats, liqCalc, producerAccount, creditBalance, creditTotal,
  revenueN: () => revenueEntries().length,
  money: () => moneyEntries().reduce<Record<string, number>>((a, e) => ((a[e.medio] = (a[e.medio] || 0) + e.monto), a), {}),
};
const protoFns = {
  prodStock: (id: string) => runProto<number>(`prodStock(${JSON.stringify(id)})`),
  srcStock: (id: string, s: string) => runProto<number>(`srcStock(${JSON.stringify(id)},${JSON.stringify(s)})`),
  dayStats: (k: string) => runProto(`dayStats(${JSON.stringify(k)})`),
  monthStats: (k: string) => runProto(`monthStats(${JSON.stringify(k)})`),
  liqCalc: (p: string, d: string, h: string) => runProto(`liqCalc(${JSON.stringify(p)},${JSON.stringify(d)},${JSON.stringify(h)})`),
  producerAccount: (p: string) => runProto(`producerAccount(${JSON.stringify(p)})`),
  creditBalance: (c: string) => runProto<number>(`creditBalance(${JSON.stringify(c)})`),
  creditTotal: () => runProto<number>('creditTotal()'),
  revenueN: () => runProto<number>('revenueEntries().length'),
  money: () => runProto<Record<string, number>>("moneyEntries().reduce((a,e)=>(a[e.medio]=(a[e.medio]||0)+e.monto,a),{})"),
};
/** Pone el mismo estado en ambos lados. */
function sync(): void {
  const S = clone(runProto<State>('S'));
  ctx.S = S;
}
const asUser = (id: string) => { runProto(`me=S.users.find(u=>u.id===${JSON.stringify(id)})`); ctx.meId = id; };
const json = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;

beforeAll(() => {
  setClock(() => clockNow);
  proto = loadPrototype();
  runProto('ensureWorkflowState()');
  ctx.ui = POS_DEFAULT();
  sync();
});

describe('Dominio TS ≡ prototipo', () => {
  it('genera datos de demostración válidos en el prototipo', () => {
    expect(ctx.S.sales.length).toBeGreaterThan(500);
    expect(ctx.S.moves.length).toBeGreaterThan(1000);
  });

  it('cálculos derivados idénticos (stock por origen, días, meses, liquidaciones, créditos, dinero)', () => {
    expect(json(derived(ctx.S, tsFns))).toEqual(json(derived(ctx.S, protoFns)));
  });

  it('venta con pago mixto, gamelas y precio vigente: misma venta, mismos lotes FIFO y mismo stock', () => {
    asUser('u2');
    const S = ctx.S;
    const p = S.products.find((x) => x.sku === 'TOM-C9')!, g = S.products.find((x) => x.envase)!;
    const draft: SaleDraft = { key: 'venta:diff:1', user: 'u2', items: [{ prod: p.id, qty: 3, src: 'consig', precio: p.precio }, { prod: g.id, qty: 2, precio: g.precio }], documento: 'boleta', receptor: null,
      payments: [{ medio: 'efectivo', monto: 30000 }, { medio: 'transferencia', monto: 3 * p.precio + 2 * g.precio - 30000 }], total: 3 * p.precio + 2 * g.precio, gamelas: { lleva: 3, trae: 1 }, clienteNombre: '', creditReq: '', paymentConfirmed: true };
    const a = runProto<{ total: number; lineas: unknown[]; pagos: { medio: string; monto: number }[] }>(`registerSaleCommand(${JSON.stringify(draft)})`);
    const b = registerSaleCommand(draft);
    const pick = (s: { total: number; lineas: unknown[]; pagos: { medio: string; monto: number }[] }) => ({ total: s.total, lineas: json(s.lineas), pagos: s.pagos.map((x) => [x.medio, x.monto]) });
    expect(pick(b as never)).toEqual(pick(a));
    expect(prodStock(p.id)).toBe(runProto(`prodStock(${JSON.stringify(p.id)})`));
    // reintento con la misma clave: no duplica
    const n = ctx.S.sales.length;
    registerSaleCommand(draft);
    expect(ctx.S.sales.length).toBe(n);
  });

  it('anulación de una venta nueva con devolución de stock y compensación', () => {
    sync();
    asUser('u1');
    const sid = ctx.S.sales[ctx.S.sales.length - 1].id;
    runProto(`reverseSaleCommand(${JSON.stringify(sid)},'Cliente devolvió',true)`);
    reverseSaleCommand(sid, 'Cliente devolvió', true);
    const sa = runProto<State['sales'][number]>(`S.sales.find(s=>s.id===${JSON.stringify(sid)})`), sb = ctx.S.sales.find((s) => s.id === sid)!;
    expect([sb.estado, sb.reversal?.state, sb.saleState]).toEqual([sa.estado, sa.reversal?.state, sa.saleState]);
    expect(ctx.S.refunds.length).toBe(runProto<number>('S.refunds.length'));
    expect(json(derived(ctx.S, tsFns))).toEqual(json(derived(ctx.S, protoFns)));
  });

  it('recepción, merma FIFO y cierre de caja dan los mismos resultados', () => {
    sync();
    asUser('u3');
    const p = ctx.S.products.find((x) => x.sku === 'TOM-C8')!;
    // recepción
    runProto(`recForm={productor:'pr1',modalidad:'consignación',lineas:[{prod:${JSON.stringify(p.id)},qty:'12',costo:''}]};toast=()=>{};recDoc=()=>{};saveRec()`);
    saveReceptionCmd({ productor: 'pr1', modalidad: 'consignación', lineas: [{ prod: p.id, qty: '12', costo: '' }] });
    expect(prodStock(p.id)).toBe(runProto(`prodStock(${JSON.stringify(p.id)})`));
    // merma de 5 (FIFO por lotes de consignación)
    runProto(`mermaF={prod:${JSON.stringify(p.id)},qty:'5',src:'consig'};saveMerma()`);
    saveMermaCmd(p.id, 'consig', '5', '');
    const mermas = (mv: State['moves']) => mv.filter((m) => m.tipo === 'merma').slice(-3).map((m) => [m.lot, m.qty]);
    expect(mermas(ctx.S.moves)).toEqual(mermas(runProto<State['moves']>('S.moves')));
    // cierre de turno de Samuel (todas sus ventas sin cerrar)
    runProto(`document.querySelector=(s)=>s==='#opening'?{value:'5000'}:s==='#dec'?{value:'123456'}:null;closeShift()`);
    closeShiftCmd('5000', '123456');
    const pc = runProto<State['closures'][number]>('S.closures.at(-1)'), tc = ctx.S.closures[ctx.S.closures.length - 1];
    const keys = ['esperado', 'declarado', 'transf', 'tarjeta', 'fiado', 'diferencia', 'netoEfectivo', 'vendido', 'consig', 'comision', 'deProductores', 'propias', 'gamelas'];
    expect(keys.map((k) => tc[k])).toEqual(keys.map((k) => (pc as unknown as Record<string, unknown>)[k]));
    expect(tc.ventas.length).toBe(pc.ventas.length);
  });
});
