import type { State } from '../types/model';
import { COM_DEF, gamId, gamProd, P } from './catalog';
import { ctx } from './ctx';
import { creditBalance } from './credits';
import { DAY, monthKey, now, pad2, round2, uid } from './format';
import { buyGamelas } from './gamelas';
import { lineTotal, makeSale } from './sales';
import { lotStock, prodStock } from './stock';
import { ensureWorkflowState } from './workflow';

/** Contraseña inicial de todos los usuarios (decisión del cliente, 07-11-2026). Cada uno la cambia al implementar el sistema. */
export const INITIAL_PASSWORD = '111111';

export const emptyState = (): State => ({
  cfg: { nombre: 'LMA Agro Comercial SpA', rut: '78.402.234-K', giro: 'Frutas, verduras y abarrotes', direccion: 'Av. Cerrillos 4030', comuna: 'Cerrillos', telefonoEmisor: '+56956109092', comision: COM_DEF, inicioJornada: 0 },
  users: [
    { id: 'u1', nombre: 'Luis', usuario: 'luis', rol: 'admin', turno: '-', clave: INITIAL_PASSWORD, activo: true },
    // turnos de Gonzalo y Samuel por confirmar con Luis
    { id: 'u2', nombre: 'Gonzalo', usuario: 'gonzalo', rol: 'vendedor', turno: 'noche', clave: INITIAL_PASSWORD, activo: true },
    { id: 'u3', nombre: 'Samuel', usuario: 'samuel', rol: 'vendedor', turno: 'mañana', clave: INITIAL_PASSWORD, activo: true },
    { id: 'u4', nombre: 'Génesis', usuario: 'genesis', rol: 'contador', turno: '-', clave: INITIAL_PASSWORD, activo: true },
  ],
  products: [], producers: [], receptions: [], lots: [], moves: [], sales: [], closures: [], liqs: [], prices: [], audit: [], expenses: [], fixed: [], notes: [],
  clients: [], creditPayments: [], creditRequests: [], priceRequests: [], abonoRequests: [], comRequests: [], operations: [], refunds: [], adjustments: [], fiscalEvents: [],
  workflowRevision: 0, workflowSchema: 1,
});

/** Catálogo real de LMA (reunión 2). */
export function addCatalog(S: State): void {
  const addP = (sku: string, nombre: string, familia: string, calibre: string, unidad: 'gamela' | 'kg', precio: number, usaGamela: boolean, extra: object = {}) =>
    S.products.push({ id: uid('p'), sku, nombre, familia, calibre, unidad, precio, pesoCaja: 0, usaGamela, activo: true, pos: S.products.length, ...extra });
  // tomate: se vende por gamela
  addP('TOM-C9', 'Tomate calibre 9', 'Tomate', '9', 'gamela', 20000, true);
  addP('TOM-C85', 'Tomate calibre 8½', 'Tomate', '8½', 'gamela', 19000, true);
  addP('TOM-C8', 'Tomate calibre 8', 'Tomate', '8', 'gamela', 18000, true);
  addP('TOM-C75', 'Tomate calibre 7½', 'Tomate', '7½', 'gamela', 16000, true);
  addP('TOM-C7', 'Tomate calibre 7', 'Tomate', '7', 'gamela', 14500, true);
  addP('TOM-C65', 'Tomate calibre 6½', 'Tomate', '6½', 'gamela', 12500, true);
  addP('TOM-C6', 'Tomate calibre 6', 'Tomate', '6', 'gamela', 11000, true);
  addP('TOM-ZAP', 'Tomate zapato', 'Tomate', 'zapato', 'gamela', 9000, true);
  addP('TOM-DES', 'Tomate descarte', 'Tomate', 'desc.', 'gamela', 6000, true);
  addP('TOM-POM', 'Tomate pomarola', 'Tomate', 'pomarola', 'gamela', 8000, true);
  addP('TOM-RAM', 'Tomate en rama', 'Tomate', 'rama', 'gamela', 17000, true);
  addP('TOM-PER', 'Tomate pera', 'Tomate', 'pera', 'gamela', 15000, true);
  // palta Hass: se vende solo por kilo, sin mínimo
  addP('PAL-I', 'Palta Hass I', 'Palta', 'I', 'kg', 2200, true);
  addP('PAL-II', 'Palta Hass II', 'Palta', 'II', 'kg', 1900, true);
  addP('PAL-III', 'Palta Hass III', 'Palta', 'III', 'kg', 1600, true);
  addP('PAL-DES', 'Palta Hass descarte', 'Palta', 'desc.', 'kg', 900, true);
  addP('PAL-GRA', 'Palta Hass granol', 'Palta', 'granol', 'kg', 700, true);
  // la gamela es un producto más con stock propio
  addP('GAMELA', 'Gamela (envase)', 'Envases', '—', 'gamela', 1000, false, { envase: true });
}

/**
 * Estado inicial. `blank`: solo usuarios, ajustes y catálogo (lo que se usa en producción).
 * Sin `blank`: ~2 meses de operación de demostración (para pruebas y presentación).
 */
export function seedState(blank = false): State {
  const S = emptyState();
  addCatalog(S);
  const prev = ctx.S;
  ctx.S = S;
  try {
    ensureWorkflowState();
    if (!blank) demoData(S);
  } finally {
    ctx.S = prev;
  }
  return S;
}

function demoData(S: State): void {
  const t = now();
  S.producers.push({ id: 'pr1', nombre: 'Agrícola San Pedro', rut: '12.345.678-9', fono: '+56911112222', tipo: 'productor', comision: 10 },
    { id: 'pr2', nombre: 'Hnos. Riquelme', rut: '9.876.543-2', fono: '+56933334444', tipo: 'productor', comision: 10 },
    { id: 'pr3', nombre: 'Distribuidora Valle Sur', rut: '77.111.222-3', fono: '+56955556666', tipo: 'proveedor', comision: 0 });
  const sku = (s: string) => S.products.find((p) => p.sku === s)!;
  const mkRec = (ts: number, prod: string, mod: 'consignación' | 'compra', lines: [string, number, number?][], user: string) => {
    const r = { id: uid('r'), fecha: ts, productor: prod, modalidad: mod, pallets: Math.ceil(lines.reduce((a, l) => a + l[1], 0) / 45), foto: '', user, anulada: false, lineas: [] as State['receptions'][number]['lineas'] };
    lines.forEach(([s, q, c]) => {
      const p = sku(s);
      const lot = { id: uid('l'), rec: r.id, prod: p.id, qty: q, costo: c || 0, fecha: ts, productor: prod, modalidad: mod };
      S.lots.push(lot);
      r.lineas.push({ prod: p.id, qty: q, costo: c || 0, lot: lot.id });
      S.moves.push({ id: uid('m'), lot: lot.id, prod: p.id, tipo: 'recepción', qty: q, user, fecha: ts, motivo: '', ref: r.id });
    });
    S.receptions.push(r);
  };
  const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
  const vend = ['u1', 'u2', 'u3'];
  const D = 60;
  // los fijos parten el primer mes completo de los datos de ejemplo
  const m0 = (() => { const [y, m] = monthKey(t - D * DAY).split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`; })();
  S.fixed.push({ id: uid('f'), cat: 'Arriendo', desc: 'Arriendo bodega', monto: 850000, desde: m0, hasta: '' },
    { id: uid('f'), cat: 'Sueldos', desc: 'Vendedor noche', monto: 650000, desde: m0, hasta: '' },
    { id: uid('f'), cat: 'Sueldos', desc: 'Vendedor mañana', monto: 650000, desde: m0, hasta: '' },
    { id: uid('f'), cat: 'Luz y agua', desc: 'Cuentas básicas', monto: 95000, desde: m0, hasta: '' });
  buyGamelas(1500, 1050000, t - D * DAY - DAY, 'u1', 'Stock inicial de gamelas');
  for (let d = D; d >= 0; d--) {
    const base = t - d * DAY;
    if (d % 3 === 0) mkRec(base - 8 * 36e5, d % 6 ? 'pr1' : 'pr2', 'consignación', [['TOM-C9', rnd(50, 80)], ['TOM-C85', rnd(40, 60)], ['TOM-C8', rnd(40, 60)], ['TOM-C75', rnd(30, 50)], ['TOM-C7', rnd(25, 40)], ['TOM-C65', rnd(15, 30)], ['TOM-C6', rnd(15, 30)], ['TOM-ZAP', rnd(8, 15)], ['TOM-DES', rnd(8, 15)], ['TOM-POM', rnd(8, 15)], ['TOM-RAM', rnd(8, 15)], ['TOM-PER', rnd(8, 15)]], d % 2 ? 'u2' : 'u3');
    if (d % 7 === 0) mkRec(base - 9 * 36e5, 'pr3', 'compra', [['PAL-I', rnd(250, 400), 1500], ['PAL-II', rnd(200, 300), 1300], ['PAL-III', rnd(150, 250), 1100], ['PAL-DES', rnd(40, 80), 500], ['PAL-GRA', rnd(40, 80), 400]], 'u1');
    if (d === 25) buyGamelas(1000, 750000, base - 10 * 36e5, 'u1', 'Reposición');
    if (d % 10 === 4) S.expenses.push({ id: uid('e'), fecha: base, cat: 'Flete', monto: rnd(4, 9) * 10000, desc: 'Flete mercadería' });
    const n = d === 0 ? 8 : rnd(14, 22);
    const times = [...Array(n)].map(() => base - rnd(60, 420) * 6e4).sort((x, y) => x - y);
    for (const ts of times) {
      const pool = S.products.filter((p) => !p.envase && prodStock(p.id, ts) > 20);
      if (!pool.length) continue;
      const p = pool[rnd(0, pool.length - 1)];
      const q = p.unidad === 'kg' ? round2(rnd(2, 60) + rnd(0, 99) / 100) : rnd(3, 15);
      const items = [{ prod: p.id, qty: q }];
      if (p.usaGamela) {
        const lleva = p.unidad === 'gamela' ? q : rnd(1, 3), trae = Math.random() < 0.85 ? rnd(Math.max(0, lleva - 1), lleva + 1) : 0, net = lleva - trae;
        if (net && (net > 0 || -net * gamProd().precio < lineTotal(p, q))) items.push({ prod: gamId(), qty: net });
      }
      try { makeSale({ vendedor: vend[rnd(0, 2)], items, pago: Math.random() < 0.6 ? 'efectivo' : 'transferencia', fecha: ts }); } catch { /* sin stock ese día */ }
    }
    if (d % 4 === 1) {
      const l = S.lots.filter((x) => !P(x.prod).envase && lotStock(x.id, base) > 8).pop();
      if (l) S.moves.push({ id: uid('m'), lot: l.id, prod: l.prod, tipo: 'merma', qty: -rnd(2, 6), user: 'u1', fecha: base, motivo: 'podrido', ref: '' });
    }
  }
  // créditos de demostración
  S.clients.push({ id: 'c1', nombre: 'Sergio', rut: '', fono: '', activo: true, creado: t - 30 * DAY }, { id: 'c2', nombre: 'Rodrigo', rut: '', fono: '', activo: true, creado: t - 30 * DAY }, { id: 'c3', nombre: 'Toño', rut: '', fono: '', activo: true, creado: t - 30 * DAY });
  // cantidades acotadas al stock que había ese día, para que la demo siempre cargue
  const fiar = (cid: string, ts: number, items: [string, number][], user: string) => {
    const its = items.map(([k, q]) => { const p = sku(k), max = prodStock(p.id, ts) * 0.5; const qty = p.unidad === 'kg' ? round2(Math.min(q, max)) : Math.floor(Math.min(q, max)); return { prod: p.id, qty }; }).filter((i) => i.qty > 0);
    if (its.length) try { makeSale({ vendedor: user, items: its, pago: 'credito', cliente: cid, fecha: ts }); } catch { /* sin stock */ }
  };
  const abonar = (cid: string, monto: number, medio: 'efectivo' | 'cheque', ref: string, ts: number) => {
    const m = Math.min(monto, creditBalance(cid));
    if (m > 0) S.creditPayments.push({ id: uid('ab'), cliente: cid, monto: m, medio, ref, fecha: ts, user: 'u1', cierre: '' });
  };
  fiar('c1', t - 6 * DAY, [['TOM-DES', 20], ['TOM-C8', 15]], 'u1');
  fiar('c2', t - 4 * DAY, [['TOM-PER', 10], ['TOM-C9', 24]], 'u1');
  fiar('c3', t - 2 * DAY, [['TOM-C75', 20], ['PAL-I', 120.5]], 'u2');
  abonar('c1', 150000, 'efectivo', '', t - 3 * DAY);
  abonar('c2', 300000, 'cheque', 'Cheque Santander', t - DAY);
  S.notes.push({ id: uid('n'), desde: t + 20 * DAY, hasta: t + 40 * DAY, tipo: 'buena', texto: 'Temporada alta de tomate (fiestas)' }, { id: uid('n'), desde: t + 70 * DAY, hasta: t + 90 * DAY, tipo: 'mala', texto: 'Febrero: baja demanda, vacaciones' });
}
