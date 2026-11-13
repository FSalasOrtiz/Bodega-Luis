import type { CartLine, Fuente, PosDraft, Product } from '../types/model';
import { audit } from './audit';
import { CL, comBase, gamId, gamProd, P, Popt, U } from './catalog';
import { ctx, isAdmin, me } from './ctx';
import { abonoAvailable, creditBalance, findClientByName, validAbono } from './credits';
import { clp, now, pctTxt, qtyFmt, searchText, uid } from './format';
import { lineBasePrice } from './embarques';
import { gamCalc } from './gamelas';
import { receiptPayment } from './receipts';
import { abonoReq, comReq, comRequestMatches, creditReq, openRequest, priceReq, priceRequestMatches } from './requests';
import { itemTotal } from './sales';
import { isFuente, prodStock, srcStock } from './stock';
import { workflowAdmin, workflowTransaction, workflowUser, type CheckoutItem } from './workflow';

export const POS_KEYS = ['cart', 'pago', 'pagoEf', 'mixFirst', 'mixedSecond', 'documento', 'receptor', 'credito', 'creditoPaga', 'clienteNombre', 'creditReq', 'comReq', 'gamExtra', 'gamTrae'] as const;
export const POS_DEFAULT = (): PosDraft => ({ cart: [], pago: 'efectivo', pagoEf: 0, mixFirst: 'efectivo', mixedSecond: 'transferencia', documento: 'boleta', receptor: {}, credito: false, creditoPaga: 0, clienteNombre: '', creditReq: '', comReq: '', gamExtra: 0, gamTrae: 0, src: 'consig' });

/** El punto de venta saca de un stock a la vez: consignación o compra directa. */
export const posSrc = (): Fuente => (isFuente(ctx.ui.src) ? ctx.ui.src : 'consig');
export function cartQty(pid: string, src?: Fuente): number {
  return pid === gamId() ? Math.max(0, gamCalc().net) : ctx.ui.cart.filter((c) => c.prod === pid && (!src || c.src === src)).reduce((a, c) => a + c.qty, 0);
}
export const posLeft = (pid: string): number => (Popt(pid)?.envase ? prodStock(pid) - cartQty(pid) : srcStock(pid, posSrc()) - cartQty(pid, posSrc()));
export const cartHasConsig = (): boolean => ctx.ui.cart.some((c) => c.src === 'consig' && !Popt(c.prod)?.envase);
export function saleCom(): number { if (isAdmin()) return comBase(); const r = comReq(ctx.ui.comReq); return comRequestMatches(r, me()?.id) ? r!.pct : comBase(); }
/** Precio normal de la línea: el del embarque elegido o, sin embarque, el general del producto. */
export const cartBasePrice = lineBasePrice;
export function cartPrice(c: CartLine): number {
  const p = Popt(c.prod);
  if (!p) return 0;
  if (c.precioAdmin && isAdmin()) return c.precioAdmin;
  const r = priceReq(c.priceReq);
  return priceRequestMatches(r, c, me()?.id) ? r!.precio : cartBasePrice(c);
}
/** Cantidad ya agregada al carrito desde un embarque. */
export const cartLotQty = (lot: string): number => ctx.ui.cart.filter((c) => c.lot === lot).reduce((a, c) => a + c.qty, 0);
export function filteredProducts(q: string, fam: string, adminAll = false): Product[] {
  const s = searchText(q.trim());
  return ctx.S.products.filter((p) => (adminAll || (p.activo && !p.envase)) && (fam === 'Todas' || p.familia === fam) &&
    (!s || searchText(p.nombre).includes(s) || searchText(p.sku).includes(s) || searchText(p.calibre).includes(s)));
}
/** Líneas listas para cobrar: precio vigente o especial autorizado, más la línea de gamelas. */
export function checkoutItems(): CheckoutItem[] {
  const items: CheckoutItem[] = ctx.ui.cart.map((c) => {
    const precio = cartPrice(c), esp = precio !== cartBasePrice(c);
    return { prod: c.prod, qty: c.qty, ...(c.src ? { src: c.src } : {}), ...(c.lot ? { lot: c.lot } : {}), ...(c.gam ? { gam: c.gam } : {}), precio, ...(esp ? { precioEsp: true, priceReq: c.priceReq || '' } : {}) };
  });
  const g = gamCalc();
  if (g.net) items.push({ prod: gamId(), qty: g.net, precio: gamProd().precio });
  return items;
}
export function creditPlan(total: number): { monto: number; nombre: string } | null {
  const ui = ctx.ui;
  if (!ui.credito) return null;
  const paga = Number(ui.creditoPaga) || 0, monto = total - paga, nombre = String(ui.clienteNombre || '').trim();
  if (!Number.isSafeInteger(paga) || paga < 0) throw new Error('Indica cuánto paga ahora.');
  if (monto <= 0) throw new Error('Si paga todo, no es crédito: desmarca Crédito.');
  if (!nombre) throw new Error('Escribe el nombre del cliente que pide el crédito.');
  const known = findClientByName(nombre);
  if (known?.activo === false) throw new Error(`${known.nombre} está desactivado para crédito.`);
  return { monto, nombre: known ? known.nombre : nombre };
}

/* ---------- solicitudes a Luis (comandos: se ejecutan dentro de store.run) ---------- */

export function requestCreditCmd(): string {
  const items = checkoutItems(), total = items.reduce((n, i) => n + itemTotal(i), 0);
  if (!items.length) throw new Error('Agrega productos antes de pedir el crédito.');
  // el crédito se pide sobre el total final: si hay un precio esperando a Luis, el total todavía puede cambiar
  if (ctx.ui.cart.some((c) => priceReq(c.priceReq)?.estado === 'pendiente')) throw new Error('Espera que Luis responda el precio pedido; después pide el crédito.');
  const plan = creditPlan(total)!;
  return workflowTransaction(() => {
    const old = creditReq(ctx.ui.creditReq);
    if (old?.estado === 'pendiente') { old.estado = 'cancelada'; old.resueltoEn = now(); }
    const r = { id: uid('cq'), user: me()!.id, clienteNombre: plan.nombre, monto: plan.monto, total, detalle: items.map((i) => `${qtyFmt(i.qty, P(i.prod).unidad)} ${P(i.prod).nombre}`).join(', '), fecha: now(), estado: 'pendiente' as const, resueltoPor: '', resueltoEn: 0, saleId: '' };
    ctx.S.creditRequests.push(r);
    audit('Pide autorización de crédito', plan.nombre, '', clp(plan.monto) + ' de ' + clp(total));
    return r.id;
  });
}
export function cancelRequestCmd(kind: 'creditRequests' | 'priceRequests' | 'comRequests', id: string | undefined): void {
  const r = (ctx.S[kind] as { id: string; estado: string; saleId?: string; resueltoEn?: number }[]).find((x) => x.id === id);
  if (openRequest(r)) workflowTransaction(() => { r!.estado = 'cancelada'; r!.resueltoEn = now(); });
}
export function resolveCreditRequestCmd(id: string, ok: boolean): void {
  workflowAdmin();
  workflowTransaction(() => {
    const r = creditReq(id);
    if (!r || r.estado !== 'pendiente') throw new Error('Esta solicitud ya fue respondida.');
    r.estado = ok ? 'aprobada' : 'rechazada'; r.resueltoPor = me()!.id; r.resueltoEn = now();
    audit(ok ? 'Autoriza crédito' : 'Rechaza crédito', r.clienteNombre + ' · ' + U(r.user).nombre, '', clp(r.monto));
  });
}
export function requestPriceCmd(c: CartLine, v: number): string {
  const p = P(c.prod);
  return workflowTransaction(() => {
    const old = priceReq(c.priceReq);
    if (old?.estado === 'pendiente') { old.estado = 'cancelada'; old.resueltoEn = now(); }
    const normal = cartBasePrice(c);
    const r = { id: uid('pq'), user: me()!.id, prod: p.id, ...(c.lot ? { lot: c.lot } : {}), qty: c.qty, precioNormal: normal, precio: v, fecha: now(), estado: 'pendiente' as const, resueltoPor: '', resueltoEn: 0, saleId: '' };
    ctx.S.priceRequests.push(r);
    audit('Pide precio especial', p.nombre, clp(normal), clp(v) + ' · ' + qtyFmt(c.qty, p.unidad));
    return r.id;
  });
}
export function resolvePriceRequestCmd(id: string, ok: boolean): void {
  workflowAdmin();
  workflowTransaction(() => {
    const r = priceReq(id);
    if (!r || r.estado !== 'pendiente') throw new Error('Esta solicitud ya fue respondida.');
    r.estado = ok ? 'aprobada' : 'rechazada'; r.resueltoPor = me()!.id; r.resueltoEn = now();
    audit(ok ? 'Autoriza precio especial' : 'Rechaza precio especial', P(r.prod).nombre + ' · ' + U(r.user).nombre, clp(r.precioNormal || 0), clp(r.precio));
  });
}
export function saveComCmd(v: number): string | null {
  if (isAdmin()) {
    workflowAdmin();
    workflowTransaction(() => { audit('Cambia comisión de consignación', 'Punto de venta', pctTxt(comBase()), pctTxt(v)); ctx.S.cfg.comision = v; });
    return null;
  }
  return workflowTransaction(() => {
    const old = comReq(ctx.ui.comReq);
    if (old?.estado === 'pendiente') { old.estado = 'cancelada'; old.resueltoEn = now(); }
    const r = { id: uid('cq'), user: me()!.id, pctNormal: comBase(), pct: v, fecha: now(), estado: 'pendiente' as const, resueltoPor: '', resueltoEn: 0, saleId: '' };
    ctx.S.comRequests.push(r);
    audit('Pide otra comisión', 'Punto de venta', pctTxt(comBase()), pctTxt(v));
    return r.id;
  });
}
export function resolveComRequestCmd(id: string, ok: boolean): void {
  workflowAdmin();
  workflowTransaction(() => {
    const r = comReq(id);
    if (!r || r.estado !== 'pendiente') throw new Error('Esta solicitud ya fue respondida.');
    r.estado = ok ? 'aprobada' : 'rechazada'; r.resueltoPor = me()!.id; r.resueltoEn = now();
    audit(ok ? 'Autoriza otra comisión' : 'Rechaza otra comisión', U(r.user).nombre + ' · solo una venta', pctTxt(r.pctNormal ?? comBase()), pctTxt(r.pct));
  });
}

/* ---------- pagos de deuda ---------- */
export function saveAbonoCmd(id: string, monto: number, medio: string): 'solicitud' | 'pago' {
  workflowUser();
  if (!isAdmin()) {
    workflowTransaction(() => {
      const c = CL(id);
      if (!ctx.S.clients.some((x) => x.id === id && !x.borrado)) throw new Error('Cliente no encontrado.');
      validAbono(id, monto, medio, abonoAvailable(id));
      ctx.S.abonoRequests.push({ id: uid('aq'), cliente: id, monto, medio: medio as 'efectivo', fecha: now(), user: me()!.id, estado: 'pendiente', resueltoPor: '', resueltoEn: 0, abono: '' });
      audit('Pide autorizar pago de deuda', c.nombre, '', clp(monto) + ' · ' + receiptPayment(medio));
    });
    return 'solicitud';
  }
  workflowTransaction(() => {
    const saldo = abonoAvailable(id);
    if (!Number.isSafeInteger(monto) || monto <= 0) throw new Error('Ingresa el monto del abono.');
    if (monto > saldo) throw new Error(`El abono supera la deuda (${clp(saldo)}).`);
    if (!['efectivo', 'transferencia', 'tarjeta', 'cheque'].includes(medio)) throw new Error('Elige cómo paga.');
    ctx.S.creditPayments.push({ id: uid('ab'), cliente: id, monto, medio: medio as 'efectivo', ref: '', fecha: now(), user: me()!.id, cierre: '' });
    audit('Abono de crédito', CL(id).nombre, clp(saldo), clp(saldo - monto) + ' · ' + receiptPayment(medio));
  });
  return 'pago';
}
export function cancelAbonoRequestCmd(id: string): void {
  workflowTransaction(() => {
    const r = abonoReq(id);
    if (!r || r.estado !== 'pendiente' || r.user !== me()!.id) throw new Error('Esta solicitud ya fue respondida.');
    r.estado = 'cancelada'; r.resueltoEn = now();
  });
}
export function resolveAbonoRequestCmd(id: string, ok: boolean): void {
  workflowAdmin();
  workflowTransaction(() => {
    const r = abonoReq(id);
    if (!r || r.estado !== 'pendiente') throw new Error('Esta solicitud ya fue respondida.');
    if (ok) {
      validAbono(r.cliente, r.monto, r.medio, creditBalance(r.cliente));
      const saldo = creditBalance(r.cliente), a = { id: uid('ab'), cliente: r.cliente, monto: r.monto, medio: r.medio, ref: '', fecha: now(), user: r.user, cierre: '', autorizadoPor: me()!.id, solicitud: r.id };
      ctx.S.creditPayments.push(a); r.abono = a.id;
      audit('Autoriza pago de deuda', CL(r.cliente).nombre + ' · ' + U(r.user).nombre, clp(saldo), clp(saldo - r.monto) + ' · ' + receiptPayment(r.medio));
    } else audit('Rechaza pago de deuda', CL(r.cliente).nombre + ' · ' + U(r.user).nombre, '', clp(r.monto));
    r.estado = ok ? 'aprobada' : 'rechazada'; r.resueltoPor = me()!.id; r.resueltoEn = now();
  });
}
/** Busca coincidencias por nombre de cliente sin distinguir mayúsculas ni tildes. */
export const sameName = (a: string, b: string): boolean => searchText(a) === searchText(b);
