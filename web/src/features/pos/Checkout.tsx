import { useRef, useState } from 'react';
import { closeModal, openModal } from '../../components/modal';
import { toast } from '../../components/toast';
import { comBase, P } from '../../domain/catalog';
import { isAdmin, me } from '../../domain/ctx';
import { creditBalance, findClientByName } from '../../domain/credits';
import { clp, now, pctTxt, qtyFmt, uid } from '../../domain/format';
import { gamCalc, gamError } from '../../domain/gamelas';
import { cartHasConsig, checkoutItems, creditPlan, saleCom } from '../../domain/pos';
import { comReq, creditReq, creditRequestMatches, priceReq } from '../../domain/requests';
import { receiptPayment } from '../../domain/receipts';
import { itemTotal } from '../../domain/sales';
import { invoiceRecipientError } from '../../domain/rut';
import { lineName } from '../../domain/catalog';
import { embName, findLot, openEmbarques } from '../../domain/embarques';
import { lotSrc } from '../../domain/stock';
import { paymentPlan, registerSaleCommand, workflowUser, type SaleDraft } from '../../domain/workflow';
import { POS_DEFAULT } from '../../domain/pos';
import { store } from '../../state/store';
import { currentMixedPair } from './Pos';
import { openReceipt } from './Receipt';

/**
 * Revisión de la venta: todavía no se registra ni se descuenta stock.
 * El vendedor confirma que recibió el pago y recién ahí se registra (clave idempotente: un doble clic no duplica).
 */
export function openCheckout(): void {
  try {
    workflowUser();
    const ui = store.get().ui, g = gamCalc();
    if (!ui.cart.length && g.net <= 0) return;
    if (ui.cart.some((c) => priceReq(c.priceReq)?.estado === 'pendiente')) throw new Error('Hay un precio esperando la autorización de Luis.');
    if (cartHasConsig() && comReq(ui.comReq)?.estado === 'pendiente') throw new Error('La comisión está esperando la autorización de Luis.');
    const items = checkoutItems(), total = items.reduce((n, i) => n + itemTotal(i), 0);
    const gErr = gamError(g, total - g.monto);
    if (gErr) throw new Error(gErr);
    const documento = ui.documento || 'boleta';
    if (documento === 'factura') { const error = invoiceRecipientError(ui.receptor); if (error) throw new Error(error); }
    const credit = creditPlan(total), rest = total - (credit?.monto || 0);
    const [mixFirst, mixedSecond] = currentMixedPair();
    const payments = rest > 0 ? paymentPlan({ pago: ui.pago, pagoEf: ui.pagoEf, ...(ui.pago === 'mixto' ? { mixFirst, mixedSecond } : {}) }, rest) : [];
    if (credit) {
      if (!isAdmin()) {
        const r = creditReq(ui.creditReq);
        if (!creditRequestMatches(r, { user: me()!.id, nombre: credit.nombre, monto: credit.monto, total }))
          throw new Error(r?.estado === 'pendiente' ? 'El crédito está esperando la autorización de Luis.' : 'Pide a Luis que autorice el crédito.');
      }
      payments.push({ id: 'p' + payments.length, medio: 'credito', monto: credit.monto, reference: '', voucherTax: false });
    }
    const draft: SaleDraft = {
      key: 'venta:' + uid('checkout') + ':' + now(), user: me()!.id, items, documento, receptor: documento === 'factura' ? { ...(ui.receptor as Record<string, string>) } : null,
      payments, total, gamelas: g.lleva || g.trae ? { lleva: g.lleva, trae: g.trae } : null, clienteNombre: credit?.nombre || '',
      creditReq: credit && !isAdmin() ? ui.creditReq : '', ...(cartHasConsig() ? { comision: saleCom(), comReq: isAdmin() ? '' : ui.comReq || '' } : {}), paymentConfirmed: false,
    };
    openModal(() => <Checkout draft={draft} credit={credit} rest={rest} />);
  } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
}

function Checkout({ draft, credit, rest }: { draft: SaleDraft; credit: { monto: number; nombre: string } | null; rest: number }) {
  const [paid, setPaid] = useState(false), [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const g = draft.gamelas, net = g ? g.lleva - g.trae : 0;
  const fiado = credit ? draft.payments[draft.payments.length - 1] : null, known = credit ? findClientByName(credit.nombre) : null;
  const commit = async () => {
    if (busyRef.current) return;
    const existing = store.get().S.sales.find((s) => s.commandKey === draft.key);
    if (existing) { openReceipt(existing.id); return; }
    if (!paid) { toast('Debes confirmar que recibiste el pago.'); return; }
    busyRef.current = true; setBusy(true);
    try {
      const s = await store.run(() => registerSaleCommand({ ...draft, paymentConfirmed: true }));
      const keep = store.get().ui.src;
      store.setUi({ ...POS_DEFAULT(), src: keep });
      closeModal();
      openReceipt(s.id);
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return (
    <>
      <h2>Revisar y confirmar venta</h2>
      <p className="muted">Todavía no se ha registrado la venta ni se ha descontado stock.</p>
      <div className="scroll"><table className="tbl"><thead><tr><th>Producto</th><th>Cantidad</th><th className="right">Importe</th></tr></thead>
        <tbody>{draft.items.map((i, k) => <tr key={k}><td>{lineName(i)}{embOf(i.lot)}</td><td>{qtyFmt(i.qty, P(i.prod).unidad)} × {clp(i.precio)}</td><td className="right num">{clp(itemTotal(i))}</td></tr>)}</tbody></table></div>
      {g && <p><b>Gamelas:</b> se lleva {g.lleva}, trae {g.trae} → {net > 0 ? 'se cobran ' + net : net < 0 ? 'se descuentan ' + -net : 'sin cobro'}</p>}
      {draft.comision != null && <p><b>Comisión consignación:</b> {pctTxt(draft.comision)}{draft.comision !== comBase() ? ' · autorizada por Luis solo para esta venta' : ''}</p>}
      <p><b>Documento:</b> {draft.documento === 'factura' ? `Factura · ${draft.receptor?.razonSocial} · RUT ${draft.receptor?.rut} (la emite la contadora)` : 'Boleta'}</p>
      {draft.payments.map((p, k) => <p key={k}>{receiptPayment(p.medio)}{p.medio === 'credito' && credit ? ' · ' + credit.nombre : ''}: <b>{clp(p.monto)}</b>{p.reference ? ' · Ref. ' + p.reference : ''}</p>)}
      {fiado && credit && <p className="muted">El crédito no entra a la caja: queda anotado a {credit.nombre}{known ? '' : ' (cliente nuevo)'}, que pasa a deber {clp((known ? creditBalance(known.id) : 0) + fiado.monto)}.</p>}
      <div className="total"><span>Total</span><span>{clp(draft.total)}</span></div>
      <label className="gamchk"><input id="checkout-paid" type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /><span>{fiado ? (rest ? 'Confirmo que recibí lo que paga ahora y que el resto queda a crédito.' : 'Confirmo que todo queda a crédito.') : 'Confirmo que recibí y verifiqué todos los pagos indicados.'}</span></label>
      <div className="acts"><button className="btn ghost" disabled={busy} onClick={closeModal}>Volver y corregir</button><button className="btn pri" id="checkout-submit" disabled={busy} onClick={() => void commit()}>{busy ? 'Registrando…' : 'Registrar venta'}</button></div>
    </>
  );
}

/** Embarque de la línea, solo si el producto tiene más de uno con stock. */
function embOf(lot: string | undefined): string {
  const l = findLot(lot);
  return l && openEmbarques(l.prod, lotSrc(l)).length > 1 ? ` · ${embName(l)}` : '';
}
