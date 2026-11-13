/* Comandos de negocio (todo lo que modifica datos fuera de la venta).
   Cada comando se ejecuta dentro de store.run(): es atómico, y si lanza un error no se guarda nada.
   Los mensajes de error son los mismos que mostraba el prototipo. */
import type { Client, Config, Fuente, Lot, Modalidad, Product, Reception, Rol, Unidad, User } from '../types/model';
import { audit } from './audit';
import { COM_DEF, gamId, gamInt, GAMELA_PRECIO, kgGam, P, PR, Popt, productFamilies, U } from './catalog';
import { ctx, isAdmin, me } from './ctx';
import { creditBalance, liveClients } from './credits';
import { clp, dayKey, decIn, fdate, monthKey, monthName, now, prevMonth, priceErr, priceOk, round2, searchText, today, uid, DAY } from './format';
import { embName, hasOwnPrice, lotPrice, openEmbarques } from './embarques';
import { buyGamelas, gamelaReturnLot } from './gamelas';
import { liqCalc } from './producers';
import { receiptPayment } from './receipts';
import { expireOpenRequests } from './requests';
import { activeFinancialSale, refundCashier } from './sales';
import { incomeOf, shortagePending, shortageRecoveries } from './balance';
import { revenueEntries } from './sales';
import { lotStock, lotSrc, prodLots, prodStock, SRC_LBL, srcLots, srcStock } from './stock';
import { needsFiscalReconciliation, workflowAdmin, workflowTransaction, workflowUser } from './workflow';

const requireAdmin = (msg = 'Requiere administrador.') => { if (!isAdmin()) throw new Error(msg); };

/* ---------- recepción ---------- */
export interface RecLineInput { prod: string; qty: string | number; costo?: string | number; gam?: string; /** Precio de venta del embarque nuevo (solo admin). Vacío: el precio actual. */ precio?: string }
export interface RecInput { productor: string; modalidad: Modalidad; lineas: RecLineInput[] }

export function saveReceptionCmd(form: RecInput): Reception {
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
  const gam = ls.filter((l) => P(l.prod).envase).reduce((a, l) => a + Math.round(+l.qty), 0);
  return workflowTransaction(() => {
    workflowUser();
    if (gam > 0) {
      const gl = gamelaReturnLot(t);
      r.gamelas = gam; r.gamelasLot = gl.id;
      S.moves.push({ id: uid('m'), lot: gl.id, prod: gamId(), tipo: 'recepción', qty: gam, user: u.id, fecha: t, motivo: 'Gamelas que llegaron con la recepción', ref: r.id });
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
  if (p.envase) throw new Error(`La garantía por gamela es fija: ${clp(GAMELA_PRECIO)}`);
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
  if (p.envase) throw new Error(`La garantía por gamela es fija: ${clp(GAMELA_PRECIO)}`);
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
  return { mine, refunds, abonos };
}
export function closeShiftCmd(openingRaw: string, declaredRaw: string) {
  workflowUser();
  const opening = Number(openingRaw || 0);
  if (!Number.isSafeInteger(opening) || opening < 0) throw new Error('Registra un fondo inicial válido.');
  const dec = Number(declaredRaw);
  if (declaredRaw === '' || !Number.isSafeInteger(dec) || dec < 0) throw new Error('Ingresa un efectivo contado válido.');
  return workflowTransaction(() => {
    const S = ctx.S, u = me()!;
    const { mine, refunds, abonos } = pendingShift(u.id);
    if (!mine.length && !refunds.length && !abonos.length) throw new Error('No hay movimientos nuevos para cerrar.');
    const net = (method: string) => mine.reduce((n, s) => n + s.pagos.filter((p) => p.medio === method).reduce((a, p) => a + p.monto, 0), 0) - refunds.filter((r) => r.medio === method).reduce((n, r) => n + r.amount, 0) + abonos.filter((a) => a.medio === method).reduce((n, a) => n + a.monto, 0);
    const esperado = opening + net('efectivo');
    if (esperado < 0) throw new Error('Las salidas superan los ingresos: registra el efectivo inicial con que se financiaron las devoluciones.');
    if (dec > esperado) throw new Error('El efectivo contado no puede ser mayor al esperado según las ventas (' + clp(esperado) + ').');
    const c = { id: uid('k'), vendedor: u.id, turno: u.turno, fecha: now(), apertura: opening, netoEfectivo: net('efectivo'), esperado, declarado: dec, transf: net('transferencia'), tarjeta: net('tarjeta'), cheques: net('cheque'), fiado: net('credito'),
      abonosTotal: abonos.reduce((n, a) => n + a.monto, 0), abonos: abonos.map((a) => a.id), diferencia: dec - esperado, ...shiftSplit(mine), aprobado: '', ventas: mine.map((s) => s.id), devoluciones: refunds.map((r) => r.id),
      documentosPendientes: mine.filter(needsFiscalReconciliation).map((s) => s.id), registrado: u.rol === 'admin' ? true : undefined };
    if (c.registrado === undefined) delete c.registrado;
    mine.forEach((s) => (s.cierre = c.id)); refunds.forEach((r) => (r.cierre = c.id)); abonos.forEach((a) => (a.cierre = c.id));
    expireOpenRequests(u.id, now());
    S.closures.push(c);
    return c;
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
export interface GastoInput { tipo: 'fijo' | 'variable'; cat: string; fecha: string; monto: string; desc: string; qty: string }
export function saveGastoCmd(g: GastoInput): string {
  requireAdmin();
  const m = parseInt(g.monto), desc = g.desc.trim();
  if (!(m > 0)) throw new Error('Ingresa el monto');
  if (g.tipo === 'fijo') {
    ctx.S.fixed.push({ id: uid('f'), cat: g.cat, desc, monto: m, desde: monthKey(now()), hasta: '' });
    audit('Crea gasto fijo', desc || g.cat, '', clp(m) + '/mes');
    return monthKey(now());
  }
  const d = g.fecha || today(), fecha = d === today() ? now() : new Date(d + 'T12:00').getTime();
  if (g.cat === 'Compra de gamelas') { const q = parseInt(g.qty); if (!(q > 0)) throw new Error('Ingresa cuántas gamelas compraste'); buyGamelas(q, m, fecha, me()!.id, desc); }
  else ctx.S.expenses.push({ id: uid('e'), fecha, cat: g.cat, monto: m, desc });
  audit('Registra gasto', g.cat, '', clp(m));
  return monthKey(new Date((g.fecha || today()) + 'T12:00').getTime());
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
