import type { AbonoRequest, CartLine, ComRequest, CreditRequest, PriceRequest, Sale } from '../types/model';
import { ctx } from './ctx';
import { searchText } from './format';

/* Autorizaciones de Luis: crédito, precio especial, comisión y pagos de deuda de un vendedor. */

export const creditReq = (id: string | undefined): CreditRequest | undefined => (ctx.S.creditRequests || []).find((r) => r.id === id);
export const creditRequestMatches = (r: CreditRequest | undefined, { user, nombre, monto, total }: { user: string; nombre: string; monto: number; total: number }): boolean =>
  !!r && r.estado === 'aprobada' && r.user === user && searchText(r.clienteNombre) === searchText(nombre) && r.monto === monto && r.total === total;
export const pendingCreditRequests = (): CreditRequest[] => (ctx.S.creditRequests || []).filter((r) => r.estado === 'pendiente').sort((a, b) => a.fecha - b.fecha);

export const priceReq = (id: string | undefined): PriceRequest | undefined => (ctx.S.priceRequests || []).find((r) => r.id === id);
export const pendingPriceRequests = (): PriceRequest[] => (ctx.S.priceRequests || []).filter((r) => r.estado === 'pendiente').sort((a, b) => a.fecha - b.fecha);
export const priceRequestMatches = (r: PriceRequest | undefined, c: Pick<CartLine, 'prod' | 'qty'>, user: string | undefined): boolean =>
  !!r && r.estado === 'aprobada' && r.user === user && r.prod === c.prod && r.qty === c.qty && !r.saleId;

export const comReq = (id: string | undefined): ComRequest | undefined => (ctx.S.comRequests || []).find((r) => r.id === id);
export const pendingComRequests = (): ComRequest[] => (ctx.S.comRequests || []).filter((r) => r.estado === 'pendiente').sort((a, b) => a.fecha - b.fecha);
export const comRequestMatches = (r: ComRequest | undefined, user: string | undefined): boolean => !!r && r.estado === 'aprobada' && r.user === user && !r.saleId;

export const abonoReq = (id: string): AbonoRequest | undefined => (ctx.S.abonoRequests || []).find((r) => r.id === id);
export const pendingAbonoRequests = (): AbonoRequest[] => (ctx.S.abonoRequests || []).filter((r) => r.estado === 'pendiente').sort((a, b) => a.fecha - b.fecha);

export const vig = (s: Sale): boolean => s.estado === 'vigente';
export const pendingVoidRequests = (): Sale[] =>
  ctx.S.sales.filter((s) => s.solicitud && vig(s) && !s.reversal).sort((a, b) => (a.solicitudFecha || a.fecha) - (b.solicitudFecha || b.fecha));

/** Una autorización sigue abierta mientras esté pendiente o aprobada sin venta; al cerrar el turno del vendedor vence. */
export const openRequest = (r: { estado: string; saleId?: string } | undefined): boolean => !!r && (r.estado === 'pendiente' || (r.estado === 'aprobada' && !r.saleId));
export function expireOpenRequests(user: string, at: number): void {
  [...(ctx.S.creditRequests || []), ...(ctx.S.priceRequests || []), ...(ctx.S.comRequests || [])]
    .filter((r) => r.user === user && openRequest(r))
    .forEach((r) => { r.estado = 'vencida'; r.resueltoEn = at; });
}
