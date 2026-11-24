/* Comandos de negocio (todo lo que modifica datos fuera de la venta).
   Cada comando se ejecuta dentro de store.run(): es atómico, y si lanza un error no se guarda nada.
   Los mensajes de error son los mismos que mostraba el prototipo. */
import type { Client, Closure, Config, Fuente, Lot, Modalidad, Product, Reception, Rol, Unidad, User } from '../types/model';
import { audit } from './audit';
import { COM_DEF, gamId, gamInt, kgGam, P, PR, Popt, productFamilies, U } from './catalog';
import { ctx, isAdmin, me } from './ctx';
import { creditBalance, liveClients } from './credits';
import { clp, dayKey, decIn, fdate, monthKey, monthName, now, prevMonth, priceErr, priceOk, round2, searchText, today, uid, DAY } from './format';
import { embName, hasOwnPrice, lotPrice, openEmbarques } from './embarques';
import { buyGamelas, gamelaReturnLot } from './gamelas';
import { liqCalc } from './producers';
import { receiptPayment } from './receipts';
import { expireOpenRequests } from './requests';
import { activeFinancialSale, refundCashier } from './sales';
import { GAMELA_CAT, incomeOf, shortagePending, shortageRecoveries, VAR_CATS } from './balance';
import { revenueEntries } from './sales';
import { lotStock, lotSrc, prodLots, prodStock, SRC_LBL, srcLots, srcStock } from './stock';
import { needsFiscalReconciliation, workflowAdmin, workflowTransaction, workflowUser } from './workflow';

const requireAdmin = (msg = 'Requiere administrador.') => { if (!isAdmin()) throw new Error(msg); };

/* ---------- recepción ---------- */
export interface RecLineInput { prod: string; qty: string | number; costo?: string | number; gam?: string; /** Precio de venta del embarque nuevo (solo admin). Vacío: el precio actual. */ precio?: string }
export interface RecInput { productor: string; modalidad: Modalidad; lineas: RecLineInput[] }

export function saveReceptionCmd(form: RecInput): Reception {
  requireAdmin('Solo el administrador registra recepciones.');
  const S = ctx.S;
  const lineas = form.lineas.map((l) => ({ ...l, qty: decIn(l.qty) }));
  if (!S.producers.some((p) => p.id === form.productor)) throw new Error('Selecciona un productor o proveedor.');
  const ls = lineas.filter((l) => Number(l.qty) > 0);
  if (!ls.length) throw new Error('Ingresa al menos una cantidad.');
  if (lineas.some((l) => l.qty !== '' && (!Number.isFinite(Number(l.qty)) || Number(l.qty) < 0))) throw new Error('Revisa las cantidades.');
  if (ls.some((l) => kgGam(Popt(l.prod)) && !Number.isFinite(gamInt(l.gam)))) throw new Error('Las gamelas deben ser un número entero.');
  if (ls.some((l) => Popt(l.prod) && P(l.prod).unidad !== 'kg' && !Number.isInteger(Number(l.qty)))) throw new Error('Las gamelas deben ser números enteros (sin decimales).');
  if (ls.some((l) => !Popt(l.prod) || !Number.isFinite(Number(l.costo || 0)) || Number(l.costo || 0) < 0 || !(P(l.prod).unidad === 'kg' ? round2(+l.qty) : Math.round(+l.qty))))
    throw new Error('Revisa productos, cantidades y costos.');
  // precio de venta del embarque nuevo: solo el administrador lo fija al recibir
  const precios = ls.map((l) => String(l.precio ?? '').trim());
  if (precios.some(Boolean) && !isAdmin()) throw new Error('Solo el administrador fija el precio de venta de un embarque.');
  precios.forEach((raw, i) => { if (raw && !P(ls[i].prod).envase && !priceOk(Number(raw))) throw new Error(`${P(ls[i].prod).nombre}: ${priceErr(raw)}`); });
  const t = now(), u = me()!;
  const r: Reception = { id: uid('r'), fecha: t, productor: form.productor, modalidad: form.modalidad, user: u.id, anulada: false, lineas: [], proveedor: { ...(PR(form.productor) as Reception['proveedor'] & object) }, emisor: { ...S.cfg } };
  // gamelas que entran a la bodega: las que llegan solas, las del producto que viene en gamela (tomate) y las anotadas aparte (palta)
  const gam = ls.reduce((a, l) => { const p = P(l.prod); return a + (p.envase || (p.usaGamela && p.unidad === 'gamela') ? Math.round(+l.qty) : kgGam(p) ? gamInt(l.gam) || 0 : 0); }, 0);
  return workflowTransaction(() => {
    workflowUser();
    if (gam > 0) {
      const gl = gamelaReturnLot(t);
      r.gamelas = gam; r.gamelasLot = gl.id;
      S.moves.push({ id: uid('m'), lot: gl.id, prod: gamId(), tipo: 'recepción', qty: gam, user: u.id, fecha: t, motivo: 'Gamelas que llegaron con la recepción (incluye las del producto)', ref: r.id });
    }
    ls.forEach((l, i) => {
      if (P(l.prod).envase) return;
      const nuevo = precios[i] ? Number(precios[i]) : 0;
      if (nuevo) setGeneralPriceKeepingStock(P(l.prod), nuevo, t);
      const p = P(l.prod), q = p.unidad === 'kg' ? round2(+l.qty) : Math.round(+l.qty), gm = kgGam(p) ? gamInt(l.gam) : 0;
      const lot: Lot = { id: uid('l'), rec: r.id, prod: p.id, qty: q, costo: +(l.costo || 0) || 0, fecha: t, productor: form.productor, modalidad: form.modalidad, ...(r.comision != null ? { comision: r.comision } : {}), ...(gm ? { gamelas: gm } : {}) };
      S.lots.push(lot);
      r.lineas.push({ prod: p.id, nombre: p.nombre, unidad: p.unidad, qty: q, costo: lot.costo, lot: lot.id, ...(gm ? { gamelas: gm } : {}) });
      S.moves.push({ id: uid('m'), lot: lot.id, prod: p.id, tipo: 'recepción', qty: q, user: u.id, fecha: t, motivo: '', ref: r.id });
    });
    S.receptions.push(r);
    return r;
  });
}

export function voidReceptionCmd(id: string, motivo: string): void {
  requireAdmin('Solo el administrador anula recepciones.');
  const S = ctx.S, r = S.receptions.find((x) => x.id === id);
  if (!r) throw new Error('Recepción no encontrada.');
  for (const l of r.lineas) if (lotStock(l.lot) < l.qty - 1e-9) throw new Error('No se puede anular: parte del lote ya se vendió. Ajusta el stock en su lugar.');
  r.lineas.forEach((l) => S.moves.push({ id: uid('m'), lot: l.lot, prod: l.prod, tipo: 'anulación', qty: -l.qty, user: me()!.id, fecha: now(), motivo, ref: r.id }));
  if (r.gamelas) S.moves.push({ id: uid('m'), lot: r.gamelasLot || '', prod: gamId(), tipo: 'anulación', qty: -r.gamelas, user: me()!.id, fecha: now(), motivo, ref: r.id });
  r.anulada = true;
  audit('Anula recepción', 'Recepción ' + PR(r.productor).nombre, 'vigente', 'anulada: ' + motivo);
}

/* ---------- merma ---------- */
/** Merma. Si el producto tiene más de un embarque con stock, el usuario elige de cuál sale (`lot`). */
export function saveMermaCmd(prodId: string, src: Fuente, qtyRaw: string, gamRaw: string, lot = ''): void {
  workflowTransaction(() => {
    workflowUser();
    const S = ctx.S, s = SRC_LBL[src] ? src : 'consig', p = P(prodId), raw = Number(decIn(qtyRaw)), q = p.unidad === 'kg' ? round2(raw) : raw;
    const open = openEmbarques(p.id, s);
    if (lot && !open.some((l) => l.id === lot)) throw new Error('Ese embarque ya no tiene stock. Elige otro.');
    if (!lot && open.length > 1) throw new Error('Elige de qué embarque sale la merma.');
    const from = lot ? open.filter((l) => l.id === lot) : srcLots(p.id, s);
    const disponible = lot ? lotStock(lot) : srcStock(p.id, s);
    if (!Number.isFinite(q) || q <= 0 || (p.unidad !== 'kg' && !Number.isInteger(q)) || q > disponible + 1e-9) throw new Error('Ingresa una cantidad válida dentro del stock disponible.');
    const gm = kgGam(p) ? gamInt(gamRaw) : 0;
    if (!Number.isFinite(gm)) throw new Error('Las gamelas deben ser un número entero.');
    let remaining = q;
    const ref = uid('merma'), fecha = now(), first = S.moves.length;
    for (const l of from) {
      const take = Math.min(remaining, Math.max(0, lotStock(l.id)));
      if (take > 0) { S.moves.push({ id: uid('m'), lot: l.id, prod: p.id, tipo: 'merma', qty: -take, user: me()!.id, fecha, motivo: 'Merma registrada', ref }); remaining = round2(remaining - take); }
      if (remaining <= 0) break;
    }
    if (remaining > 1e-9) throw new Error('No se pudo asignar la merma a los lotes disponibles.');
    if (gm) S.moves[first].gamelas = gm;
  });
}

/**
 * Nuevo precio general por la llegada de un embarque: los embarques con stock que seguían el precio general
 * conservan el que tenían (se venden a su precio), y el embarque nuevo se vende al precio nuevo.
 */
function setGeneralPriceKeepingStock(p: Product, v: number, t: number): void {
  if (v === p.precio) return;
  for (const l of openEmbarques(p.id)) if (!hasOwnPrice(l)) l.precio = p.precio;
  ctx.S.prices.push({ id: uid('pc'), prod: p.id, precio: v, desde: t, user: me()!.id });
  audit('Cambio de precio', p.nombre + ' · embarque nuevo', clp(p.precio), clp(v));
  p.precio = v;
}

/* ---------- inventario ---------- */
export function setPriceCmd(pid: string, raw: string): number {
  requireAdmin('Solo el administrador cambia precios.');
  const p = P(pid), v = Number(String(raw).trim());
  if (!priceOk(v)) throw new Error(priceErr(String(raw).trim()));
  if (v !== p.precio) {
    ctx.S.prices.push({ id: uid('pc'), prod: pid, precio: v, desde: now(), user: me()!.id });
    audit('Cambio de precio', p.nombre, clp(p.precio), clp(v));
    p.precio = v;
  }
  return v;
}

/**
 * Precios por embarque. `general`: precio para los embarques nuevos y para los que no tienen precio propio.
 * `lotes`: precio de cada embarque con stock; si es igual al general, el embarque vuelve a seguir el precio general.
 */
export function setEmbarquePricesCmd(pid: string, generalRaw: string, lotes: Record<string, string>): number {
  requireAdmin('Solo el administrador cambia precios.');
  const p = P(pid);
  // la gamela tiene un solo precio (sin embarques)
  if (p.envase) lotes = {};
  const general = Number(String(generalRaw).trim());
  if (!priceOk(general)) throw new Error(priceErr(String(generalRaw).trim()));
  const open = openEmbarques(pid), t = now(), user = me()!.id;
  const nuevos = Object.entries(lotes).map(([id, raw]) => {
    const l = open.find((x) => x.id === id);
    if (!l) throw new Error('Uno de los embarques ya no tiene stock. Vuelve a abrir el cambio de precio.');
    const v = Number(String(raw).trim());
    if (!priceOk(v)) throw new Error(`${embName(l)}: ${priceErr(String(raw).trim())}`);
    return { l, antes: lotPrice(l), v };
  });
  if (general !== p.precio) {
    ctx.S.prices.push({ id: uid('pc'), prod: pid, precio: general, desde: t, user });
    audit('Cambio de precio', p.nombre + ' · precio general', clp(p.precio), clp(general));
    p.precio = general;
  }
  for (const { l, antes, v } of nuevos) {
    if (v === general) delete l.precio; else l.precio = v;
    if (v !== antes) {
      ctx.S.prices.push({ id: uid('pc'), prod: pid, lot: l.id, precio: v, desde: t, user });
      audit('Cambio de precio', `${p.nombre} · ${embName(l)}`, clp(antes), clp(v));
    }
  }
  return general;
}

export function adjustStockCmd(pid: string, lot: string, qtyRaw: string, motivo: string): void {
  requireAdmin('Solo el administrador ajusta stock.');
  const p = P(pid), q = parseFloat(String(qtyRaw).replace(',', '.')), m = motivo.trim();
  if (!prodLots(pid).length) throw new Error(`${p.nombre} todavía no tiene lotes: el stock entra con una recepción.`);
  if (!q || !m) throw new Error('Cantidad y motivo son obligatorios');
  if (!lot || !ctx.S.lots.some((l) => l.id === lot && l.prod === pid)) throw new Error('Elige un lote del producto.');
  if (p.unidad !== 'kg' && !Number.isInteger(q)) throw new Error('Las gamelas se ajustan en números enteros.');
  if (p.unidad === 'kg' && round2(q) === 0) throw new Error('La cantidad es demasiado pequeña.');
  if (lotStock(lot) + q < 0) throw new Error('El lote quedaría negativo');
  ctx.S.moves.push({ id: uid('m'), lot, prod: pid, tipo: 'ajuste', qty: p.unidad === 'kg' ? round2(q) : Math.round(q), user: me()!.id, fecha: now(), motivo: m, ref: '' });
}

export interface ProductInput { sku: string; nombre: string; familia: string; calibre: string; unidad: Unidad; precio: string; usaGamela: boolean; activo: boolean }
export function saveProductCmd(pid: string, f: ProductInput): void {
  requireAdmin('Solo el administrador crea o edita productos.');
  const S = ctx.S;
  const d = { sku: f.sku.trim().toUpperCase(), nombre: f.nombre.trim(), familia: f.familia, calibre: f.calibre.trim() || '—', unidad: f.unidad, pesoCaja: 0, usaGamela: f.usaGamela, activo: f.activo };
  if (!d.familia || d.familia === 'Otros') throw new Error('Selecciona una familia identificada.');
  if (!d.sku || !d.nombre) throw new Error('SKU y nombre son obligatorios');
  if (S.products.some((x) => x.sku === d.sku && x.id !== pid)) throw new Error('Ese SKU ya existe');
  const prRaw = String(f.precio).trim(), pr = Number(prRaw);
  if (!priceOk(pr)) throw new Error(prRaw === '' ? 'Ingresa el precio' : priceErr(prRaw));
  if (pid) {
    const p = P(pid);
    if (pr !== p.precio) { S.prices.push({ id: uid('pc'), prod: pid, precio: pr, desde: now(), user: me()!.id }); audit('Cambio de precio', p.nombre, clp(p.precio), clp(pr)); }
    const keys = Object.keys(d) as (keyof typeof d)[];
    const ch = keys.filter((k) => String(p[k as keyof Product]) !== String(d[k]));
    if (ch.length) audit('Edita producto', p.nombre, ch.map((k) => k + ': ' + p[k as keyof Product]).join(', '), ch.map((k) => k + ': ' + d[k]).join(', '));
    Object.assign(p, d, { precio: pr });
  } else {
    S.products.push({ id: uid('p'), ...d, precio: pr, pos: S.products.reduce((m, p) => Math.max(m, p.pos ?? -1), -1) + 1 });
    audit('Crea producto', d.nombre, '', clp(pr));
  }
}

export function saveFamilyCmd(raw: string): void {
  workflowTransaction(() => {
    workflowAdmin();
    const name = raw.trim();
    if (!name || name.length > 50 || searchText(name) === 'otros' || searchText(name) === 'todas') throw new Error('Ingresa una familia específica de hasta 50 caracteres.');
    if (productFamilies().some((f) => searchText(f) === searchText(name))) throw new Error('Esta familia ya existe.');
    ctx.S.families ??= [];
    ctx.S.families.push(name);
    audit('Crea familia', name, '', name);
  });
}

/* ---------- cierre de caja ---------- */
export const shiftSplit = (sales: { id: string }[]) => {
  const ids = new Set(sales.map((s) => s.id)), r = incomeOf(revenueEntries().filter((e) => ids.has(e.originalSaleId || e.id)));
  return { vendido: r.ventas, consig: r.consig, comision: r.comision, deProductores: r.deProductores, propias: r.propias, gamelas: r.gamVend };
};
export function pendingShift(userId: string) {
  const S = ctx.S;
  const mine = S.sales.filter((s) => s.vendedor === userId && activeFinancialSale(s) && !s.cierre);
  const refunds = (S.refunds || []).filter((r) => refundCashier(r) === userId && r.state === 'confirmada_manual' && !r.cierre);
  const abonos = (S.creditPayments || []).filter((a) => a.user === userId && !a.anulado && !a.cierre);
  /** Gastos pagados con el efectivo de la caja del turno: se descuentan de lo esperado. */
  const gastos = (S.expenses || []).filter((e) => e.deCaja && e.user === userId && !e.cierre);
  return { mine, refunds, abonos, gastos };
}
export const hasPendingShift = (userId: string): boolean => { const x = pendingShift(userId); return !!(x.mine.length || x.refunds.length || x.abonos.length || x.gastos.length); };
/** Cajas que el usuario puede cerrar: la suya y, como los turnos se pasan entre ellos, la de cualquier otro vendedor o administrador. */
export const closableShifts = (): User[] => {
  const u = me();
  if (!u || u.rol === 'contador') return [];
  return ctx.S.users.filter((x) => x.rol !== 'contador' && (x.id === u.id || hasPendingShift(x.id))).sort((a, b) => (a.id === u.id ? -1 : b.id === u.id ? 1 : 0));
};
/** Quién puede recibir la caja al cerrar el turno: otro vendedor o administrador activo. */
export const shiftReceivers = (ownerId: string): User[] => ctx.S.users.filter((x) => x.activo && x.rol !== 'contador' && x.id !== ownerId);

/**
 * Cierra la caja de `ownerId` (por defecto la propia).
 * - Otro vendedor o el administrador puede cerrar la caja de alguien que se fue sin cerrarla: quien la cierra la recibe.
 * - Al cerrar la propia se elige a quién se entrega (`recibe`); esa persona la acepta después, porque pasa a responder por la plata y el stock.
 */
export function closeShiftCmd(openingRaw: string, declaredRaw: string, ownerId = '', recibe = '') {
  workflowUser();
  const opening = Number(openingRaw || 0);
  if (!Number.isSafeInteger(opening) || opening < 0) throw new Error('Registra un fondo inicial válido.');
  const dec = Number(declaredRaw);
  if (declaredRaw === '' || !Number.isSafeInteger(dec) || dec < 0) throw new Error('Ingresa un efectivo contado válido.');
  return workflowTransaction(() => {
    const S = ctx.S, actor = me()!, ownerIdOk = ownerId || actor.id;
    const owner = S.users.find((x) => x.id === ownerIdOk);
    if (!owner || owner.rol === 'contador') throw new Error('Elige de quién es la caja.');
    const ajena = owner.id !== actor.id;
    if (!ajena && recibe && !shiftReceivers(owner.id).some((x) => x.id === recibe)) throw new Error('Elige a quién le entregas la caja.');
    const { mine, refunds, abonos, gastos } = pendingShift(owner.id);
    if (!mine.length && !refunds.length && !abonos.length && !gastos.length) throw new Error('No hay movimientos nuevos para cerrar.');
    const gastoCaja = gastos.reduce((n, e) => n + e.monto, 0);
    const net = (method: string) => mine.reduce((n, s) => n + s.pagos.filter((p) => p.medio === method).reduce((a, p) => a + p.monto, 0), 0) - refunds.filter((r) => r.medio === method).reduce((n, r) => n + r.amount, 0) + abonos.filter((a) => a.medio === method).reduce((n, a) => n + a.monto, 0);
    const esperado = opening + net('efectivo') - gastoCaja;
    if (esperado < 0) throw new Error('Las salidas superan los ingresos: registra el efectivo inicial con que se financiaron las devoluciones y gastos.');
    if (dec > esperado) throw new Error('El efectivo contado no puede ser mayor al esperado según las ventas (' + clp(esperado) + ').');
    const t = now();
    const c: Closure = { id: uid('k'), vendedor: owner.id, turno: owner.turno, fecha: t, apertura: opening, netoEfectivo: net('efectivo') - gastoCaja, esperado, declarado: dec, transf: net('transferencia'), tarjeta: net('tarjeta'), cheques: net('cheque'), fiado: net('credito'),
      abonosTotal: abonos.reduce((n, a) => n + a.monto, 0), abonos: abonos.map((a) => a.id), diferencia: dec - esperado, ...shiftSplit(mine), aprobado: '', ventas: mine.map((s) => s.id), devoluciones: refunds.map((r) => r.id),
      gastoCaja, gastos: gastos.map((e) => e.id), documentosPendientes: mine.filter(needsFiscalReconciliation).map((s) => s.id) };
    if (ajena) { c.cerradoPor = actor.id; c.recibe = actor.id; c.recibidoPor = actor.id; c.recibidoEn = t; }
    else if (recibe) c.recibe = recibe;
    // el administrador no se aprueba a sí mismo: su cierre queda registrado; si cierra la caja de un vendedor, queda aprobada por él
    if (actor.rol === 'admin') { if (ajena) c.aprobado = actor.id; else c.registrado = true; }
    mine.forEach((s) => (s.cierre = c.id)); refunds.forEach((r) => (r.cierre = c.id)); abonos.forEach((a) => (a.cierre = c.id)); gastos.forEach((e) => (e.cierre = c.id));
    expireOpenRequests(owner.id, t);
    if (ajena) audit('Cierra caja de otro usuario', 'Cierre ' + owner.nombre, '', 'cerrada por ' + actor.nombre + ' (dif. ' + clp(c.diferencia) + ')');
    S.closures.push(c);
    return c;
  });
}
/** Turnos que me entregaron y aún no acepto. */
export const shiftsToReceive = (userId: string): Closure[] => ctx.S.closures.filter((c) => c.recibe === userId && !c.recibidoPor);
/** Quien recibe el turno lo acepta: desde ahí responde por la plata y el stock. */
export function receiveShiftCmd(id: string): void {
  workflowTransaction(() => {
    workflowUser();
    const c = ctx.S.closures.find((x) => x.id === id), u = me()!;
    if (!c) throw new Error('No se encontró el cierre.');
    if (c.recibe !== u.id) throw new Error('Este turno se le entregó a otra persona.');
    if (c.recibidoPor) return;
    c.recibidoPor = u.id; c.recibidoEn = now();
    audit('Recibe turno', 'Cierre ' + U(c.vendedor).nombre, 'por recibir', 'recibido por ' + u.nombre + ' (efectivo ' + clp(c.declarado) + ')');
  });
}
export function approveCloseCmd(id: string): void {
  requireAdmin('Solo Luis aprueba cierres.');
  const c = ctx.S.closures.find((x) => x.id === id);
  if (!c || c.aprobado || c.registrado) return;
  c.aprobado = me()!.id;
  audit('Aprueba cierre', 'Cierre ' + U(c.vendedor).nombre, 'pendiente', 'aprobado (dif. ' + clp(c.diferencia) + ')');
}
/** El administrador autoriza una recuperación (total o parcial) del faltante de un cierre; se pueden autorizar varias hasta completar el faltante. Cada una se suma en el Balance del mes en que se autoriza. */
export function recoverShortageCmd(id: string, montoRaw: string): true {
  requireAdmin('Solo Luis autoriza la recuperación de un faltante.');
  const c = ctx.S.closures.find((x) => x.id === id);
  if (!c) throw new Error('No se encontró el cierre.');
  if (c.diferencia >= 0) throw new Error('Este cierre no tiene faltante.');
  const restante = shortagePending(c), monto = Number(montoRaw);
  if (!restante) throw new Error('El faltante de este cierre ya se recuperó completo.');
  if (montoRaw === '' || !Number.isSafeInteger(monto) || monto <= 0) throw new Error('Ingresa un monto recuperado válido.');
  if (monto > restante) throw new Error('El monto no puede superar lo que falta por recuperar: ' + clp(restante) + '.');
  const r = { monto, por: me()!.id, en: now() };
  c.recuperaciones = [...shortageRecoveries(c), r];
  c.recuperado = (c.recuperado || 0) + monto; c.recuperadoPor = r.por; c.recuperadoEn = r.en;
  audit('Autoriza recuperación de faltante', 'Cierre ' + U(c.vendedor).nombre, 'por recuperar ' + clp(restante), 'recuperado ' + clp(monto) + ' · queda ' + clp(restante - monto));
  return true;
}

/* ---------- productores y liquidaciones ---------- */
export function saveProducerCmd(id: string, nombre: string, rut: string, fono: string): string {
  if (id && !isAdmin()) throw new Error('Solo el administrador edita productores.');
  const d = { nombre: nombre.trim(), rut: rut.trim(), fono: fono.trim() };
  if (!d.nombre) throw new Error('Falta el nombre');
  if (id) { Object.assign(ctx.S.producers.find((p) => p.id === id)!, d); return id; }
  const producer = { id: uid('pr'), ...d };
  ctx.S.producers.push(producer);
  return producer.id;
}
export function saveLiqCmd(prod: string, desde: string, hasta: string): string {
  requireAdmin();
  if (desde && hasta && desde > hasta) throw new Error('La fecha "desde" no puede ser posterior a "hasta".');
  const dup = ctx.S.liqs.find((l) => l.prod === prod && (l.desde || '') <= (hasta || '9999-99-99') && (desde || '') <= (l.hasta || '9999-99-99'));
  if (dup) throw new Error(`Ya existe una liquidación de ${PR(prod).nombre} que cubre parte de ese periodo (${dup.desde || 'inicio'} a ${dup.hasta || 'hoy'}). Elige fechas posteriores para no pagar dos veces.`);
  const L = liqCalc(prod, desde, hasta);
  const l = { id: uid('q'), prod, desde, hasta, fecha: now(), ...L, pagada: 0, medio: '' };
  ctx.S.liqs.push(l);
  audit('Genera liquidación', PR(l.prod).nombre, '', clp(l.neto));
  return l.id;
}
export function payLiqCmd(id: string, medio: string): void {
  requireAdmin();
  const l = ctx.S.liqs.find((x) => x.id === id);
  if (!(l && l.neto > 0)) throw new Error('Este saldo es un ajuste a compensar, no un pago al productor.');
  l.pagada = now(); l.medio = medio;
  audit('Paga liquidación', PR(l.prod).nombre, 'pendiente', 'pagada');
}

/* ---------- gastos ---------- */
export interface GastoInput { tipo: 'fijo' | 'variable'; cat: string; fecha: string; monto: string; desc: string; qty: string; /** Se pagó con el efectivo de la caja del turno. */ deCaja?: boolean }
/** Todos los perfiles (menos el de solo lectura) registran gastos variables; los gastos fijos y las fechas pasadas son del administrador. */
export function saveGastoCmd(g: GastoInput): string {
  const u = me();
  if (!u || !u.activo || u.rol === 'contador') throw new Error('Tu perfil no registra gastos.');
  const admin = u.rol === 'admin';
  const m = parseInt(g.monto), desc = g.desc.trim();
  if (!(m > 0)) throw new Error('Ingresa el monto');
  if (g.tipo === 'fijo') {
    requireAdmin('Solo el administrador registra gastos fijos.');
    ctx.S.fixed.push({ id: uid('f'), cat: g.cat, desc, monto: m, desde: monthKey(now()), hasta: '' });
    audit('Crea gasto fijo', desc || g.cat, '', clp(m) + '/mes');
    return monthKey(now());
  }
  if (!VAR_CATS.includes(g.cat)) throw new Error('Elige la categoría del gasto.');
  // el vendedor registra el gasto del momento y siempre sale de su caja
  const deCaja = admin ? !!g.deCaja : true;
  const d = admin && !deCaja ? g.fecha || today() : today();
  if (d > today()) throw new Error('La fecha no puede ser futura.');
  const fecha = d === today() ? now() : new Date(d + 'T12:00').getTime();
  const extra = { user: u.id, ...(deCaja ? { deCaja: true, cierre: '' } : {}) };
  if (g.cat === GAMELA_CAT) { const q = parseInt(g.qty); if (!(q > 0)) throw new Error('Ingresa cuántas gamelas compraste'); buyGamelas(q, m, fecha, u.id, desc, extra); }
  else ctx.S.expenses.push({ id: uid('e'), fecha, cat: g.cat, monto: m, desc, ...extra });
  audit('Registra gasto', g.cat, '', clp(m) + (deCaja ? ' · pagado con la caja' : ''));
  return monthKey(fecha);
}
export function updFixedCmd(id: string, montoRaw: string, desc: string, cat: string): void {
  requireAdmin();
  const S = ctx.S, f = S.fixed.find((x) => x.id === id)!, m = parseInt(montoRaw), d = desc.trim(), mk = monthKey(now());
  if (!(m > 0)) throw new Error('Monto inválido');
  if (cat !== f.cat || d !== f.desc) audit('Edita gasto fijo', f.desc || f.cat, f.cat + ' · ' + f.desc, cat + ' · ' + d);
  f.cat = cat; f.desc = d;
  if (m !== f.monto) {
    audit('Cambia monto gasto fijo', d || cat, clp(f.monto), clp(m));
    if (f.desde >= mk || f.hasta) f.monto = m;
    else { f.hasta = prevMonth(mk); S.fixed.push({ id: uid('f'), cat, desc: d, monto: m, desde: mk, hasta: '' }); }
  }
}
export function delFixedCmd(id: string): void {
  requireAdmin();
  const f = ctx.S.fixed.find((x) => x.id === id);
  if (!f) return;
  ctx.S.fixed = ctx.S.fixed.filter((x) => x.id !== id);
  audit('Elimina gasto fijo', f.desc || f.cat, clp(f.monto) + '/mes', 'eliminado');
}
export function endFixedCmd(id: string): void {
  requireAdmin();
  const S = ctx.S, f = S.fixed.find((x) => x.id === id)!, mk = monthKey(now());
  if (f.desde === mk) S.fixed = S.fixed.filter((x) => x.id !== id); else f.hasta = prevMonth(mk);
  audit('Termina gasto fijo', f.desc || f.cat, clp(f.monto) + '/mes', 'sin repetir desde ' + monthName(mk));
}
export function updVarCmd(id: string, montoRaw: string, fechaRaw: string, desc: string, cat: string, qtyRaw: string): string {
  requireAdmin();
  const S = ctx.S, e = S.expenses.find((x) => x.id === id)!, m = parseInt(montoRaw), d = fechaRaw;
  if (!(m > 0)) throw new Error('Monto inválido');
  if (e.cierre && m !== e.monto) throw new Error('Este gasto ya quedó en un cierre de caja: su monto no se puede cambiar.');
  const antes = `${e.cat} · ${fdate(e.fecha)} · ${clp(e.monto)}${e.cantidad ? ' · ' + e.cantidad + ' gam.' : ''}`;
  if (e.cantidad) {
    const q = parseInt(qtyRaw);
    if (!(q > 0)) throw new Error('Cantidad inválida');
    const lot = S.lots.find((l) => l.id === e.lot)!, delta = q - e.cantidad;
    if (delta < 0 && lotStock(lot.id) + delta < 0) throw new Error(`No se puede bajar a ${q}: ya se vendieron ${e.cantidad - lotStock(lot.id)} de esas gamelas`);
    if (delta) S.moves.push({ id: uid('m'), lot: lot.id, prod: lot.prod, tipo: 'ajuste', qty: delta, user: me()!.id, fecha: now(), motivo: 'Corrección compra de gamelas', ref: e.id });
    e.cantidad = q; lot.costo = Math.round(m / q);
  } else e.cat = cat;
  if (d && d !== dayKey(e.fecha)) e.fecha = new Date(d + 'T12:00').getTime();
  e.monto = m; e.desc = desc.trim();
  audit('Edita gasto', e.cat, antes, `${e.cat} · ${fdate(e.fecha)} · ${clp(e.monto)}${e.cantidad ? ' · ' + e.cantidad + ' gam.' : ''}`);
  return monthKey(e.fecha);
}
/** Comprueba si se puede eliminar un gasto variable antes de pedir confirmación. */
export function canDelVar(id: string): string {
  const e = ctx.S.expenses.find((x) => x.id === id);
  if (e?.cantidad) { const st = lotStock(e.lot || ''); if (st < e.cantidad) return `No se puede eliminar: ya se vendieron ${e.cantidad - st} de esas gamelas. Edita la cantidad en su lugar.`; }
  return '';
}
export function delVarCmd(id: string): void {
  requireAdmin();
  const S = ctx.S, e = S.expenses.find((x) => x.id === id);
  if (!e) return;
  const block = canDelVar(id);
  if (block) throw new Error(block);
  if (e.cierre) throw new Error('Este gasto ya quedó en un cierre de caja: no se puede eliminar.');
  if (e.cantidad) { const lot = S.lots.find((l) => l.id === e.lot)!; S.moves.push({ id: uid('m'), lot: lot.id, prod: lot.prod, tipo: 'anulación', qty: -e.cantidad, user: me()!.id, fecha: now(), motivo: 'Compra de gamelas eliminada', ref: e.id }); }
  S.expenses = S.expenses.filter((x) => x.id !== id);
  audit('Elimina gasto', e.cat, `${fdate(e.fecha)} · ${clp(e.monto)}${e.desc ? ' · ' + e.desc : ''}`, 'eliminado');
}

/* ---------- clientes de crédito ---------- */
export function saveClientCmd(id: string, nombre: string, rut: string, fono: string, activo?: boolean): Client {
  workflowAdmin();
  const n = nombre.trim();
  if (!n) throw new Error('Escribe el nombre del cliente.');
  if (liveClients().some((c) => c.id !== id && searchText(c.nombre) === searchText(n))) throw new Error('Ya existe un cliente con ese nombre.');
  return workflowTransaction(() => {
    if (id) {
      const c = ctx.S.clients.find((x) => x.id === id)!;
      Object.assign(c, { nombre: n, rut: rut.trim(), fono: fono.trim(), activo: activo ?? c.activo });
      audit('Edita cliente de crédito', n, '', '');
      return c;
    }
    const c = { id: uid('c'), nombre: n, rut: rut.trim(), fono: fono.trim(), activo: true, creado: now() };
    ctx.S.clients.push(c);
    audit('Crea cliente de crédito', n, '', '');
    return c;
  });
}
export function deleteClientCmd(id: string): void {
  requireAdmin('Solo Luis borra clientes.');
  workflowTransaction(() => {
    const c = ctx.S.clients.find((x) => x.id === id);
    if (!c) throw new Error('Cliente no encontrado.');
    if (creditBalance(id) > 0) throw new Error('Este cliente tiene deuda.');
    c.borrado = now();
    audit('Borra cliente de crédito', c.nombre, '', 'borrado');
  });
}

/* ---------- usuarios, contraseñas y ajustes ---------- */
export const PW_MAX_DIA = 2;
/** Contraseña: exactamente 6 números. */
export const PW_OK = (v: unknown): boolean => /^\d{6}$/.test(String(v || ''));
export const pwChangesToday = (u: User): number => (u.cambiosClave || []).filter((t) => dayKey(t) === today()).length;
/** El límite diario es solo para vendedores; el administrador puede cambiar la suya sin límite. */
export const pwLimited = (u: User | null): boolean => u?.rol === 'vendedor';

/** Valida el cambio de contraseña propia. Devuelve el mensaje de error o '' si es válido. */
export function passwordChangeError(u: User, actualOk: boolean, nueva: string, repetida: string, actual: string): string {
  if (pwLimited(u) && pwChangesToday(u) >= PW_MAX_DIA) return 'Ya cambiaste tu contraseña 2 veces hoy.';
  if (!actualOk) return 'La contraseña actual no es correcta.';
  if (!PW_OK(nueva)) return 'La nueva contraseña debe tener exactamente 6 números.';
  if (nueva === actual) return 'La nueva contraseña debe ser distinta de la actual.';
  if (nueva !== repetida) return 'Las contraseñas nuevas no coinciden.';
  return '';
}
/** Registra el cambio de contraseña (en modo local también guarda la clave; con Firebase la guarda Auth). */
export function recordPasswordChangeCmd(nueva: string | null): void {
  const u = ctx.S.users.find((x) => x.id === me()?.id);
  if (!u) throw new Error('La sesión no está activa.');
  if (nueva !== null) u.clave = nueva;
  u.cambiosClave = [...(u.cambiosClave || []).filter((t) => now() - t < 7 * DAY), now()];
  audit('Cambia su contraseña', u.nombre, '', '');
}

export interface UserInput { nombre: string; usuario: string; rol: Rol; turno: string; clave: string; activo?: boolean }
/** Validación compartida por el modo local y por la Cloud Function de usuarios. */
export function userInputError(id: string, d: UserInput, users: User[], actorId: string): string {
  const n = d.nombre.trim(), usr = d.usuario.trim().toLowerCase();
  if (!n || !usr) return 'Nombre y usuario son obligatorios';
  if (!/^[a-z0-9._-]{2,30}$/.test(usr)) return 'El usuario solo admite letras minúsculas, números, punto, guion y guion bajo (2 a 30).';
  if (d.clave && !PW_OK(d.clave)) return 'La contraseña debe tener exactamente 6 números';
  if (!id && !d.clave) return 'Ingresa una contraseña';
  if (users.some((u) => u.usuario === usr && u.id !== id)) return 'Ese usuario ya existe';
  const actor = users.find((u) => u.id === actorId);
  if (id === actorId && actor && d.rol !== actor.rol) return 'No puedes cambiar tu propio rol. Pídeselo a otro administrador.';
  const prev = users.find((u) => u.id === id), nextActive = id ? d.activo ?? prev?.activo ?? true : true;
  if (id === actorId && !nextActive) return 'No puedes desactivar tu propio usuario.';
  const wasAdmin = !!prev && prev.rol === 'admin' && prev.activo;
  if (wasAdmin && (d.rol !== 'admin' || !nextActive) && users.filter((u) => u.rol === 'admin' && u.activo && u.id !== id).length === 0) return 'Debe quedar al menos un administrador activo.';
  return '';
}
/** Alta o edición de usuario en el modo local. Con Firebase lo hace la Cloud Function `saveUser`. */
export function saveUserLocalCmd(id: string, d: UserInput, uidOverride?: string): string {
  requireAdmin();
  const err = userInputError(id, d, ctx.S.users, me()!.id);
  if (err) throw new Error(err);
  const data = { nombre: d.nombre.trim(), usuario: d.usuario.trim().toLowerCase(), rol: d.rol, turno: d.turno };
  if (id) {
    const u = ctx.S.users.find((x) => x.id === id)!;
    const activo = d.activo ?? u.activo;
    audit('Edita usuario', u.nombre, u.rol + '/' + (u.activo ? 'activo' : 'inactivo'), data.rol + '/' + (activo ? 'activo' : 'inactivo') + (d.clave ? ' · contraseña restablecida' : ''));
    Object.assign(u, data, { activo }, d.clave ? { clave: d.clave } : {});
    return id;
  }
  const nid = uidOverride || uid('u');
  ctx.S.users.push({ id: nid, ...data, clave: d.clave, activo: true });
  audit('Crea usuario', data.nombre, '', data.rol);
  return nid;
}
export function saveCfgCmd(f: Pick<Config, 'nombre' | 'rut' | 'giro' | 'direccion' | 'comuna' | 'telefonoEmisor'>): void {
  requireAdmin();
  const c = ctx.S.cfg, before = JSON.stringify(c);
  Object.assign(c, { nombre: f.nombre.trim() || c.nombre, rut: f.rut.trim(), giro: f.giro.trim(), direccion: f.direccion.trim(), comuna: f.comuna.trim(), telefonoEmisor: f.telefonoEmisor.trim() });
  audit('Cambia ajustes', 'Configuración', before, JSON.stringify(c));
}

/* ---------- utilidades de vista que dependen del estado ---------- */
export const stockByOrigin = (pid: string) => ({ consig: srcStock(pid, 'consig'), directa: srcStock(pid, 'directa'), total: prodStock(pid) });
export const lotLabel = (l: Lot, p: Product): string =>
  `${fdate(l.fecha)} · ${p.envase ? '' : SRC_LBL[lotSrc(l)] + ' · '}${PR(l.productor).nombre} · `;
export const receptionMoneyTotal = (r: Reception): number => r.lineas.reduce((a, l) => a + l.qty * l.costo, 0);
export const comDefault = COM_DEF;
export const paymentName = receiptPayment;
