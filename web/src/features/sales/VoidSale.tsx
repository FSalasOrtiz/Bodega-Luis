import { useState } from 'react';
import { closeModal, openModal } from '../../components/modal';
import { toast } from '../../components/toast';
import { U } from '../../domain/catalog';
import { ctx } from '../../domain/ctx';
import { clp, fdt } from '../../domain/format';
import { receiptPayment } from '../../domain/receipts';
import { vig } from '../../domain/requests';
import { confirmRefundCommand, requestReversalCommand, reverseSaleCommand, workflowAdmin, workflowLabel, workflowSale } from '../../domain/workflow';
import { exec } from '../../app/actions';
import { askReason } from '../shared/askReason';

/** Anular venta (admin): motivo obligatorio y decisión explícita de devolver la mercadería al stock. */
export function openVoidSale(id: string): void {
  try {
    workflowAdmin();
    const s = workflowSale(id);
    if (s.reversal || !vig(s)) { openWorkflowDetail(id); return; }
    openModal(() => <VoidSale id={id} />);
  } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
}
function VoidSale({ id }: { id: string }) {
  const s = ctx.S.sales.find((x) => x.id === id)!;
  const [reason, setReason] = useState(''), [stock, setStock] = useState(false);
  const go = async () => {
    const r = await exec(() => reverseSaleCommand(id, reason, stock), (x) => (x.reversal?.state === 'completada' ? 'Venta anulada.' : 'Anulación registrada, pero queda pendiente: el documento de esta venta debe verificarse antes de completarla. El stock y el dinero aún no se devuelven.'));
    if (r) closeModal();
  };
  return (
    <>
      <h2>Anular venta N° {s.num}</h2><p className="muted">La venta queda registrada como anulada, junto con sus cierres.</p>
      <div className="f"><label htmlFor="rev-reason">Motivo obligatorio</label><textarea id="rev-reason" className="in" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <label className="gamchk"><input id="rev-stock" type="checkbox" checked={stock} onChange={(e) => setStock(e.target.checked)} /><span>La mercadería volvió a la bodega: devolverla al stock.</span></label>
      <p className="muted">Si el cliente pagó, después confirma la devolución del dinero en el detalle de la venta.</p>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Volver</button><button className="btn bad" onClick={() => void go()}>Anular venta</button></div>
    </>
  );
}
/** El vendedor pide la anulación; Luis la aprueba o rechaza. */
export function requestVoid(id: string): void {
  askReason('Solicitar reversión', 'Se conservarán el motivo y la decisión del administrador.', async (reason) => {
    if (await exec(() => requestReversalCommand(id, reason), 'Solicitud registrada.')) closeModal();
  });
}
export function openWorkflowDetail(id: string): void { openModal(() => <WorkflowDetail id={id} />, { wide: true }); }
function WorkflowDetail({ id }: { id: string }) {
  const s = ctx.S.sales.find((x) => x.id === id);
  if (!s) return null;
  const refunds = (ctx.S.refunds || []).filter((r) => r.saleId === id);
  const confirm = (rid: string, medio: string, amount: number) => askReason('Devolución en ' + receiptPayment(medio).toLowerCase(), `Confirma solo después de devolver ${clp(amount)} al cliente. Anota cómo se devolvió.`, async (ref) => {
    if (await exec(() => confirmRefundCommand(rid, ref), 'Devolución confirmada.')) openWorkflowDetail(id);
  });
  return (
    <>
      <h2>Venta N° {s.num}</h2><p><b>Venta:</b> {workflowLabel(s.saleState || s.estado)}</p>
      {s.reversal && <p><b>Anulación:</b> {s.reversal.reason} · Stock: {s.reversal.returnStock ? 'devuelto a la bodega' : 'sin devolver'}</p>}
      <h3>Devoluciones de dinero</h3>
      {refunds.length ? refunds.map((r) => <p key={r.id}>{receiptPayment(r.medio)} · {clp(r.amount)} · {workflowLabel(r.state)}{r.reference ? ' · ' + r.reference : ''} {r.state !== 'confirmada_manual' && <button className="btn sm" onClick={() => confirm(r.id, r.medio, r.amount)}>Confirmar devolución</button>}</p>) : <p className="muted">No hay devoluciones solicitadas.</p>}
      <h3>Historial</h3>
      <div className="rows">{(s.workflowEvents || []).length ? (s.workflowEvents || []).map((e) => <div key={e.id}><div className="grow"><b>{e.type}</b><span>{fdt(e.at)} · {U(e.user).nombre} · {e.detail}</span></div></div>) : <p>Sin eventos nuevos.</p>}</div>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cerrar</button></div>
    </>
  );
}
