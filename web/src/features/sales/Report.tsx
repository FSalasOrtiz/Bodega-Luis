import { useState } from 'react';
import { closeModal, openModal } from '../../components/modal';
import { Icon } from '../../components/icons';
import { toast } from '../../components/toast';
import { lineName, U } from '../../domain/catalog';
import { ctx, isAccountant, isAdmin } from '../../domain/ctx';
import { clp, dayKey, fdt, qtyFmt, today } from '../../domain/format';
import { receiptData, receiptKind, receiptPayment } from '../../domain/receipts';
import { downloadCSV } from '../../utils/csv';
import type { Sale } from '../../types/model';

/** Reporte para la contadora (o Luis): siempre se elige el periodo antes de descargar, para no leer de más. */
export function reportSales(desde: string, hasta: string, doc: string): Sale[] {
  return ctx.S.sales.filter((s) => (isAdmin() || isAccountant()) && dayKey(s.fecha) >= desde && dayKey(s.fecha) <= hasta && (!doc || (receiptKind(s) === 'Factura' ? 'factura' : 'boleta') === doc)).sort((a, b) => a.fecha - b.fecha);
}
export function openReport(pre: { desde: string; hasta: string; doc: string }): void {
  if (!isAdmin() && !isAccountant()) return;
  openModal(() => <Report pre={pre} />);
}
function Report({ pre }: { pre: { desde: string; hasta: string; doc: string } }) {
  const k = today();
  const [d, setD] = useState(pre.desde || k.slice(0, 8) + '01'), [h, setH] = useState(pre.hasta || k), [doc, setDoc] = useState(pre.doc || '');
  const err = !d || !h ? 'Elige las fechas desde y hasta.' : d > h ? 'La fecha "desde" no puede ser posterior a "hasta".' : '';
  const n = err ? 0 : reportSales(d, h, doc).length;
  const download = () => {
    if (err) return toast(err);
    const ss = reportSales(d, h, doc);
    if (!ss.length) return toast('No hay ventas en ese periodo.');
    const rows: (string | number)[][] = [['N°', 'Documento', 'Fecha', 'Vendedor', 'RUT cliente', 'Razón social', 'Giro', 'Dirección', 'Comuna', 'Detalle', 'Medio de pago', 'Neto', 'IVA', 'Total', 'Estado']];
    ss.forEach((s) => {
      const dd = receiptData(s), c = dd.receptor;
      rows.push([s.num, receiptKind(s), fdt(s.fecha), U(s.vendedor).nombre, c?.rut || '', c?.razonSocial || '', c?.giro || '', c?.direccion || '', c?.comuna || '',
        s.lineas.map((l) => `${qtyFmt(l.qty, l.unidad)} ${lineName(l)} x ${clp(l.precio)}`).join(' | '), s.pagos.filter((p) => p.monto).map((p) => receiptPayment(p.medio)).join(' + '), dd.neto, dd.iva, s.total, s.estado]);
    });
    downloadCSV(rows, `${doc === 'factura' ? 'facturas' : doc === 'boleta' ? 'boletas' : 'boletas-y-facturas'}-${d}_a_${h}.csv`);
    closeModal();
  };
  return (
    <>
      <h2>Descargar reporte</h2><p className="muted">Elige el periodo del reporte.</p>
      <div className="row"><div className="f"><label htmlFor="rp-desde">Desde</label><input id="rp-desde" className="in" type="date" required value={d} max={k} onChange={(e) => setD(e.target.value)} /></div>
        <div className="f"><label htmlFor="rp-hasta">Hasta</label><input id="rp-hasta" className="in" type="date" required value={h} max={k} onChange={(e) => setH(e.target.value)} /></div></div>
      <div className="f"><label htmlFor="rp-doc">Documento</label><select id="rp-doc" className="in" value={doc} onChange={(e) => setDoc(e.target.value)}>{[['', 'Boletas y facturas'], ['boleta', 'Solo boletas'], ['factura', 'Solo facturas']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
      <p className={err ? 'err' : 'muted'} id="rp-count" role="status">{err || `${n} venta${n === 1 ? '' : 's'} en el periodo.`}</p>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" id="rp-ok" disabled={!!err || !n} onClick={download}><Icon n="print" s={17} />Descargar</button></div>
    </>
  );
}
