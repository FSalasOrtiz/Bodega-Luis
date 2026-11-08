import type { Client, CreditPayment, MedioPago, Sale } from '../types/model';
import { audit } from './audit';
import { ctx } from './ctx';
import { clp, now, searchText, uid } from './format';
import { pendingAbonoRequests, vig } from './requests';

/* Créditos: saldo por cliente; los pagos de deuda entran a la caja de quien los recibe. */

export const saleCredit = (s: Sale): number => s.pagos.filter((p) => p.medio === 'credito').reduce((a, p) => a + p.monto, 0);
export const creditSales = (cid: string): Sale[] => ctx.S.sales.filter((s) => s.cliente === cid && vig(s) && !s.reversal?.completedAt && saleCredit(s) > 0);
export const creditPayments = (cid: string): CreditPayment[] => (ctx.S.creditPayments || []).filter((a) => a.cliente === cid && !a.anulado);
export const creditBalance = (cid: string): number =>
  creditSales(cid).reduce((a, s) => a + saleCredit(s), 0) - creditPayments(cid).reduce((a, x) => a + x.monto, 0);
export const liveClients = (): Client[] => (ctx.S.clients || []).filter((c) => !c.borrado);
export const debtors = (): (Client & { saldo: number })[] =>
  liveClients().map((c) => ({ ...c, saldo: creditBalance(c.id) })).filter((c) => c.saldo > 0).sort((a, b) => b.saldo - a.saldo);
export const creditTotal = (): number => debtors().reduce((a, c) => a + c.saldo, 0);
export const findClientByName = (n: unknown): Client | undefined =>
  liveClients().find((c) => searchText(c.nombre) === searchText(String(n || '').trim()));
/** Lo que aún se puede pagar: la deuda menos los pagos que esperan autorización. */
export const abonoAvailable = (cid: string): number =>
  creditBalance(cid) - pendingAbonoRequests().filter((r) => r.cliente === cid).reduce((n, r) => n + r.monto, 0);

/** El cliente se anota por nombre: si no existe, se crea en el módulo de créditos al registrar la venta. */
export function resolveClient(nombre: string): string {
  let c = findClientByName(nombre);
  if (c && c.activo === false) throw new Error(`${c.nombre} está desactivado para crédito.`);
  if (!c) {
    c = { id: uid('c'), nombre: String(nombre).trim(), rut: '', fono: '', activo: true, creado: now() };
    ctx.S.clients.push(c);
    audit('Crea cliente de crédito', c.nombre, '', 'desde el punto de venta');
  }
  return c.id;
}

export const ABONO_MEDIOS: MedioPago[] = ['efectivo', 'transferencia', 'tarjeta', 'cheque'];
export function validAbono(_cid: string, monto: number, medio: string, saldo: number): void {
  if (!Number.isSafeInteger(monto) || monto <= 0) throw new Error('Ingresa el monto del abono.');
  if (monto > saldo) throw new Error(`El abono supera la deuda (${clp(saldo)}).`);
  if (!ABONO_MEDIOS.includes(medio as MedioPago)) throw new Error('Elige cómo paga.');
}
