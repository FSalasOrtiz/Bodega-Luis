import type { Documento, Fuente, Lot, MoneyEntry, PagoSeleccion, Receptor, RevenueEntry, Sale } from '../types/model';
import { gamProd, kgGam, lotCommission, P } from './catalog';
import { ctx } from './ctx';
import { liveClients } from './credits';
import { now, qtyFmt, round2, uid } from './format';
import { findLot, lotPrice } from './embarques';
import { gamelaReturnLot } from './gamelas';
import { receiptData } from './receipts';
import { vig } from './requests';
import { cleanRut, invoiceRecipientError } from './rut';
import { isFuente, lotStock, lotSrc, reserveFifo, scaleOver, SRC_LBL, srcLots, srcStock } from './stock';

export const lineTotal = (p: { precio: number }, qty: number): number => Math.round(qty * p.precio);
export const itemTotal = (i: { qty: number; precio: number }): number => Math.round(i.qty * i.precio);
export const saleCash = (s: Sale): number => s.pagos.filter((p) => p.medio === 'efectivo').reduce((a, p) => a + p.monto, 0);
export const saleCard = (s: Sale): number => s.pagos.filter((p) => p.medio === 'tarjeta').reduce((a, p) => a + p.monto, 0);
export const saleTr = (s: Sale): number => s.pagos.filter((p) => p.medio === 'transferencia').reduce((a, p) => a + p.monto, 0);

export interface SaleItem { prod: string; qty: number; src?: Fuente; lot?: string; gam?: number; precio?: number; precioEsp?: boolean; priceReq?: string }
export interface MakeSaleInput {
  vendedor: string; items: SaleItem[]; pago: PagoSeleccion; pagoEf?: number; fecha?: number; documento?: Documento;
  receptor?: Partial<Receptor> | null; cliente?: string; gamelas?: { lleva: number; trae: number } | null; comision?: number | null;
}

/** Registra una venta: FIFO por lote dentro del origen elegido, movimientos de stock y comprobante. */
export function makeSale({ vendedor, items, pago, pagoEf, fecha, documento = 'boleta', receptor = null, cliente = '', gamelas = null, comision = null }: MakeSaleInput): Sale {
  const S = ctx.S;
  if (comision != null && !(Number.isFinite(comision) && comision >= 0 && comision <= 100)) throw new Error('La comisión debe estar entre 0 y 100%.');
  if (!['boleta', 'factura'].includes(documento)) throw new Error('Selecciona boleta o factura.');
  if (!['efectivo', 'transferencia', 'tarjeta', 'mixto', 'credito'].includes(pago)) throw new Error('Selecciona un medio de pago válido.');
  if (pago === 'credito' && !liveClients().some((c) => c.id === cliente)) throw new Error('Elige el cliente del crédito.');
  let rec: Receptor | null = null;
  if (documento === 'factura') {
    const error = invoiceRecipientError(receptor);
    if (error) throw new Error(error);
    const r = receptor as Receptor;
    rec = { rut: cleanRut(r.rut), razonSocial: String(r.razonSocial || '').trim(), giro: String(r.giro || '').trim(), direccion: String(r.direccion || '').trim(), comuna: String(r.comuna || '').trim(), telefono: String(r.telefono || '').trim() };
  }
  if (!items?.length) throw new Error('Agrega al menos un producto.');
  const at = fecha || now();
  const reserved = new Map<string, number>();
  const sale: Sale = { id: uid('v'), num: S.sales.length + 1001, fecha: at, vendedor, documento, receptor: documento === 'factura' && rec ? { ...rec } : null, cliente: cliente || '', lineas: [], estado: 'vigente', pagos: [], cierre: '', total: 0 };
  for (const it of items) {
    const p = P(it.prod), devGam = !!p?.envase && Number(it.qty) < 0;
    if (!p || !p.activo || !Number.isFinite(Number(it.qty)) || (Number(it.qty) <= 0 && !devGam)) throw new Error('Revisa los productos y cantidades.');
    const qty = p.unidad === 'kg' ? round2(it.qty) : Math.round(it.qty);
    if (qty <= 0 && !devGam) throw new Error('La cantidad debe ser mayor que cero.');
    // gamelas que trae el cliente de más: línea negativa que descuenta de la compra y devuelve stock al lote de gamelas
    // el stock de gamelas es informativo: nunca bloquea una venta
    const src: Fuente | undefined = !p.envase && isFuente(it.src) ? it.src : undefined;
    // embarque elegido: la línea sale solo de ese lote y su precio normal es el del embarque
    const emb = !p.envase && it.lot ? findLot(it.lot) : undefined;
    if (!p.envase && it.lot && (!emb || emb.prod !== p.id || (src && lotSrc(emb) !== src))) throw new Error(`El embarque elegido de ${p.nombre} ya no está disponible. Vuelve a agregar el producto.`);
    if (emb) {
      const left = lotStock(emb.id, at) - (reserved.get(emb.id) || 0), extra = scaleOver(p, left, qty);
      if (qty > left + 1e-9 && !extra) throw new Error(`No alcanza el stock de ${p.nombre} en el embarque elegido. Quedan ${qtyFmt(Math.max(0, left), p.unidad)}.`);
      if (extra) S.moves.push({ id: uid('m'), lot: emb.id, prod: p.id, tipo: 'ajuste', qty: extra, user: vendedor, fecha: at, motivo: `Vendido sobre el stock registrado (venta N° ${sale.num})`, ref: sale.id });
    } else if (!devGam && p.unidad === 'kg' && !p.envase) {
      const open = srcLots(p.id, src).map((l) => ({ l, a: lotStock(l.id, at) - (reserved.get(l.id) || 0) })).filter((x) => x.a > 1e-9);
      const avail = open.reduce((n, x) => n + x.a, 0), extra = scaleOver(p, avail, qty);
      if (extra) {
        let lot: Lot | undefined = open[open.length - 1]?.l || srcLots(p.id, src).filter((l) => l.fecha <= at).pop();
        if (!lot) { lot = { id: uid('l'), rec: '', prod: p.id, qty: 0, costo: 0, fecha: at, productor: '', modalidad: 'ajuste', fuente: src || 'directa' }; S.lots.push(lot); }
        S.moves.push({ id: uid('m'), lot: lot.id, prod: p.id, tipo: 'ajuste', qty: extra, user: vendedor, fecha: at, motivo: `Vendido sobre el stock registrado (venta N° ${sale.num})`, ref: sale.id });
      }
    }
    let alloc: { lot: string; qty: number }[] | null;
    if (emb) { alloc = [{ lot: emb.id, qty }]; reserved.set(emb.id, (reserved.get(emb.id) || 0) + qty); }
    else alloc = devGam ? [{ lot: gamelaReturnLot(at).id, qty }] : reserveFifo(p.id, qty, at, reserved, src) || (p.envase ? [{ lot: gamelaReturnLot(at).id, qty }] : null);
    if (!alloc) throw new Error(`No alcanza el stock de ${p.nombre}${src ? ' en ' + SRC_LBL[src].toLowerCase() : ''}. Quedan ${qtyFmt(srcStock(p.id, src), p.unidad)}.`);
    const normal = emb ? lotPrice(emb) : p.precio;
    const precio = it.precioEsp && !p.envase && Number.isSafeInteger(it.precio) && (it.precio as number) > 0 ? (it.precio as number) : normal;
    const gm = kgGam(p) && Number.isInteger(it.gam) && (it.gam as number) > 0 ? (it.gam as number) : 0;
    sale.lineas.push({
      prod: p.id, unidad: p.unidad, qty, precio, ...(src ? { src } : {}), ...(gm ? { gamelas: gm } : {}), ...(precio !== normal ? { precioNormal: normal } : {}),
      subtotal: Math.round(qty * precio),
      allocs: alloc.map((a) => { const lot = S.lots.find((l) => l.id === a.lot); return { ...a, comision: comision != null && lotSrc(lot) === 'consig' ? comision : lotCommission(lot), costo: lot?.costo || 0 }; }),
    });
  }
  sale.total = sale.lineas.reduce((a, l) => a + l.subtotal, 0);
  if (comision != null && sale.lineas.some((l) => l.allocs.some((a) => lotSrc(S.lots.find((x) => x.id === a.lot)) === 'consig'))) sale.comision = comision;
  if (sale.total <= 0) throw new Error('El descuento por gamelas tiene que ser menor que la compra.');
  if (gamelas) sale.gamelas = { lleva: gamelas.lleva, trae: gamelas.trae };
  if (pago === 'mixto') { const ef = Math.min(pagoEf || 0, sale.total); sale.pagos = [{ medio: 'efectivo', monto: ef }, { medio: 'transferencia', monto: sale.total - ef }]; }
  else sale.pagos = [{ medio: pago, monto: sale.total }];
  sale.lineas.forEach((ln) => ln.allocs.forEach((a) => S.moves.push({ id: uid('m'), lot: a.lot, prod: ln.prod, tipo: 'venta', qty: -a.qty, user: vendedor, fecha: at, motivo: '', ref: sale.id })));
  sale.comprobante = receiptData(sale);
  S.sales.push(sale);
  return sale;
}

export const activeFinancialSale = (s: Sale): boolean => !!s.reversal?.completedAt || (!!s.workflowVersion && !s.legacyWorkflow) || vig(s);

/** Devengo: venta en su fecha y compensación negativa en la fecha efectiva de reversión. */
export function revenueEntries(): RevenueEntry[] {
  const result: RevenueEntry[] = [];
  for (const s of ctx.S.sales) {
    if (s.reversal?.completedAt) {
      result.push({ ...s, estado: 'vigente', entrySign: 1 });
      result.push({ ...s, id: s.id + ':ajuste', originalSaleId: s.id, fecha: s.reversal.completedAt, estado: 'vigente', entrySign: -1, total: -s.total,
        lineas: s.lineas.map((l) => ({ ...l, qty: -l.qty, subtotal: -l.subtotal, allocs: l.allocs.map((a) => ({ ...a, qty: -a.qty })) })),
        pagos: s.pagos.map((p) => ({ ...p, monto: -p.monto })) });
    } else if (vig(s)) result.push({ ...s, entrySign: 1 });
  }
  return result;
}
/** La devolución sale de la caja del vendedor que hizo la venta, aunque la confirme el admin. */
export const refundCashier = (r: { cashier?: string; saleId: string; confirmedBy?: string }): string =>
  r.cashier || ctx.S.sales.find((s) => s.id === r.saleId)?.vendedor || r.confirmedBy || '';
/** Dinero: ingresos registrados y salidas solo cuando se confirma manualmente la devolución. */
export function moneyEntries(): MoneyEntry[] {
  const S = ctx.S, result: MoneyEntry[] = [];
  S.sales.filter(activeFinancialSale).forEach((s) => s.pagos.forEach((p) => result.push({ saleId: s.id, user: s.vendedor, fecha: s.fecha, medio: p.medio, monto: p.monto })));
  S.refunds.filter((r) => r.state === 'confirmada_manual').forEach((r) => result.push({ saleId: r.saleId, user: refundCashier(r), fecha: r.confirmedAt || 0, medio: r.medio, monto: -r.amount }));
  // abonos de créditos: plata que entra a la caja de quien lo recibe, el día que se paga
  (S.creditPayments || []).filter((a) => !a.anulado).forEach((a) => result.push({ saleId: '', abono: a.id, user: a.user, fecha: a.fecha, medio: a.medio, monto: a.monto }));
  return result;
}
export const gamelaPrice = (): number => gamProd().precio;
