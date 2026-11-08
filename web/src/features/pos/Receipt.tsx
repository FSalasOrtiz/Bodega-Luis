import { useState } from 'react';
import { closeModal, openModal } from '../../components/modal';
import { Icon } from '../../components/icons';
import { toast } from '../../components/toast';
import { ctx } from '../../domain/ctx';
import { clp, fdate, fdt, kg, qtyFmt } from '../../domain/format';
import { invoiceModel, invoiceMoney } from '../../domain/invoice';
import { canSeeSale, payLabel, receiptData, receiptKind, receiptPayment, receiptPDF, receiptPdfFilename, receiptTitle } from '../../domain/receipts';
import type { Sale } from '../../types/model';

const findSale = (id: string): Sale | undefined => ctx.S.sales.find((x) => x.id === id);

export function openReceipt(id: string): void {
  const s = findSale(id);
  if (!canSeeSale(s)) { toast('No se encontró la venta.'); return; }
  if (receiptKind(s) === 'Factura') openModal(() => <InvoicePreview id={id} />, { wide: true, variant: 'invoice' });
  else openModal(() => <Ticket id={id} />);
}

export function downloadReceiptPDF(id: string): void {
  const s = findSale(id);
  if (!canSeeSale(s)) { toast('No se encontró la venta.'); return; }
  const url = URL.createObjectURL(new Blob([receiptPDF(s) as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = receiptPdfFilename(s); document.body.appendChild(a);
  try { a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

async function shareReceipt(id: string, notify: (m: string) => void): Promise<void> {
  const s = findSale(id);
  if (!canSeeSale(s)) { toast('No se encontró la venta.'); return; }
  const say = (m: string) => { notify(m); toast(m); };
  if (globalThis.isSecureContext === false) { say('Para compartir el PDF en WhatsApp, abre esta página mediante HTTPS en un navegador compatible.'); return; }
  if (typeof File === 'undefined' || typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) { say('Este navegador no permite compartir archivos. Usa un navegador compatible con envío de PDF.'); return; }
  try {
    const file = new File([receiptPDF(s) as BlobPart], receiptPdfFilename(s), { type: 'application/pdf' });
    if (!navigator.canShare({ files: [file] })) { say('Este navegador no permite compartir PDF. Prueba desde otro navegador o dispositivo compatible.'); return; }
    await navigator.share({ files: [file], title: `${receiptKind(s)} ${s.num}` });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return;
    say('No se pudo compartir el PDF. Vuelve a intentarlo desde un navegador compatible.');
  }
}

function Actions({ id, invoice }: { id: string; invoice?: boolean }) {
  const [msg, setMsg] = useState(invoice ? 'Selecciona WhatsApp en el menú para compartir la factura PDF. Requiere HTTPS y un navegador compatible.' : 'Selecciona WhatsApp en el menú para compartir el PDF. Requiere HTTPS y un navegador que permita compartir archivos.');
  return (
    <>
      <div className="receipt-actions acts noprint">
        <button className="btn ghost" onClick={() => downloadReceiptPDF(id)}>{invoice ? 'Descargar factura PDF' : 'Descargar PDF'}</button>
        <button className="btn" onClick={() => void shareReceipt(id, setMsg)}><Icon n="wa" s={17} />WhatsApp · PDF</button>
        <button className="btn pri" onClick={closeModal}>Listo</button>
      </div>
      <p id="receipt-share-status" className="receipt-share-help muted noprint" role="status" aria-live="polite">{msg}</p>
    </>
  );
}

function Ticket({ id }: { id: string }) {
  const s = findSale(id);
  if (!s) return null;
  const d = receiptData(s), e = d.emisor;
  return (
    <>
      <div className="receipt-heading noprint"><h2>Boleta</h2><p className="muted">Venta N° {s.num} · Formato ticket de 80 mm</p></div>
      <div className="receipt-stage"><article className="receipt-paper printable" aria-label={`Vista previa del comprobante de venta ${s.num}`}>
        <header className="receipt-brand"><strong>{e.nombre}</strong><p>RUT {e.rut}</p>{e.giro && <p>{e.giro}</p>}{e.direccion && <p>{e.direccion}</p>}{e.comuna && <p>{e.comuna}</p>}</header>
        <div className="receipt-number"><b>{receiptTitle(s)}</b><span>Comprobante interno N° {s.num}</span></div>
        <p className="receipt-disclaimer">DOCUMENTO NO VÁLIDO TRIBUTARIAMENTE</p>
        {s.estado === 'anulada' && <div className="receipt-void"><b>VENTA ANULADA</b><p>{s.motivoAnula || ''}</p></div>}
        <dl className="receipt-meta"><div><dt>Emisión</dt><dd>{fdt(s.fecha)}</dd></div><div><dt>Vendedor</dt><dd>{d.vendedor}</dd></div></dl>
        {d.receptor && <section className="receipt-customer"><b>CLIENTE</b><p>{d.receptor.razonSocial}</p><p>RUT {d.receptor.rut}</p><p>{d.receptor.giro}</p><p>{d.receptor.direccion}, {d.receptor.comuna}</p>{d.receptor.telefono && <p>Teléfono: {d.receptor.telefono}</p>}</section>}
        <table className="receipt-items"><caption className="receipt-sr">Productos de la venta</caption><thead><tr><th scope="col">Detalle</th><th scope="col">Monto</th></tr></thead>
          <tbody>{d.items.map((l, i) => <tr key={i}><td><b>{l.nombre}</b><span>{qtyFmt(l.qty, l.unidad)} × {clp(l.precio)}</span></td><td>{clp(l.subtotal)}</td></tr>)}</tbody></table>
        <dl className="receipt-totals"><div><dt>Neto referencial</dt><dd>{clp(d.neto)}</dd></div><div><dt>IVA 19% referencial</dt><dd>{clp(d.iva)}</dd></div><div className="receipt-grand-total"><dt>TOTAL</dt><dd>{clp(d.total)}</dd></div></dl>
        <div className="receipt-payments">{d.pagos.filter((p) => p.monto).map((p, i) => <div key={i}><span>{payLabel(p)}</span><b>{clp(p.monto)}</b></div>)}</div>
        <footer className="receipt-footer"><p>Precios finales con IVA incluido.<br />Desglose referencial: todos los productos se consideran afectos.</p><p>Sin folio autorizado ni timbre SII.<br />Conserva este comprobante de tu compra.</p></footer>
      </article></div>
      <Actions id={id} />
    </>
  );
}

function InvoicePreview({ id }: { id: string }) {
  const s = findSale(id);
  if (!s) return null;
  const m = invoiceModel(s), e = m.issuer, c = m.customer;
  const Field = ({ label, value }: { label: string; value?: string }) => <div><dt>{label}</dt><dd>{value || 'No registrado'}</dd></div>;
  return (
    <>
      <div className="receipt-heading noprint"><h2>Vista previa de factura</h2><p className="muted">Venta N° {s.num} · Formato de hoja A4 · La factura oficial la emite la contadora</p></div>
      <div className="invoice-stage"><article className="invoice-paper printable" aria-label={`Factura ${s.num}`}>
        <header className="invoice-header"><div className="invoice-issuer"><h3>{e.nombre}</h3><p><b>Giro:</b> {e.giro || 'Por configurar'}</p><p>{e.direccion || 'Dirección por configurar'}</p><p>{e.comuna || 'Comuna por configurar'}</p>{e.telefono && <p>Teléfono: {e.telefono}</p>}</div>
          <div className="invoice-document"><div className="invoice-tax-box"><b>R.U.T.: {e.rut}</b><strong>FACTURA</strong><span>LA EMITE LA CONTADORA</span><b>SIN FOLIO SII</b></div></div></header>
        <div className="invoice-notice">DOCUMENTO NO VÁLIDO TRIBUTARIAMENTE · NO CEDIBLE</div>
        {s.estado === 'anulada' && <p className="invoice-cancelled"><b>VENTA ANULADA</b> · {s.motivoAnula || ''}</p>}
        <div className="invoice-date"><span><b>Comprobante interno:</b> {s.num}</span><span><b>Fecha de emisión:</b> {fdate(s.fecha)}</span></div>
        <dl className="invoice-customer"><Field label="Señor(es)" value={c.razonSocial} /><Field label="RUT" value={c.rut} /><Field label="Giro" value={c.giro} /><Field label="Teléfono" value={c.telefono} /><Field label="Dirección" value={c.direccion} /><Field label="Comuna" value={c.comuna} /></dl>
        <p className="invoice-payment"><b>Medios de pago:</b> {m.data.pagos.filter((p) => p.monto).map((p) => receiptPayment(p.medio) + ' ' + invoiceMoney(p.monto)).join(' · ')}</p>
        {m.warning && <p className="invoice-notice">{m.warning}</p>}
        <div className="invoice-items-wrap"><table className="invoice-items"><caption className="receipt-sr">Detalle de la factura: valores netos referenciales</caption>
          <colgroup>{['4%', '9%', '32%', '8%', '6%', '15%', '9%', '17%'].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead><tr><th scope="col">Ítem</th><th scope="col">Código</th><th scope="col">Descripción</th><th scope="col">Cantidad</th><th scope="col">Unid.</th><th scope="col">P. unit. neto</th><th scope="col">Dscto.</th><th scope="col">Valor neto</th></tr></thead>
          <tbody>{m.rows.map((r) => <tr key={r.index}><td>{r.index}</td><td>{r.codigo || '—'}</td><td>{r.nombre}</td><td className="invoice-number">{kg(r.qty)}</td><td>{r.unidad === 'kg' ? 'kg' : 'gam.'}</td><td className="invoice-number">{invoiceMoney(r.unitNet, 6)}</td><td className="invoice-number">$0</td><td className="invoice-number">{invoiceMoney(r.net)}</td></tr>)}</tbody></table></div>
        <p className="invoice-rounding">Detalle neto y desglose de IVA referenciales; todos los productos se consideran afectos. Los redondeos conservan el total cobrado.</p>
        <section className="invoice-bottom"><div className="invoice-document-notes"><h4>Referencias</h4><p>Sin documentos de referencia registrados.</p><div className="invoice-stamp"><b>Timbre electrónico SII no disponible</b><span>La emite la contadora</span></div><p>Sin folio ni resolución de emisión asociados a este comprobante interno.</p></div>
          <dl className="invoice-totals"><div><dt>Monto neto referencial</dt><dd>{invoiceMoney(m.net)}</dd></div><div><dt>Monto exento referencial</dt><dd>$0</dd></div><div><dt>IVA (19%) referencial</dt><dd>{invoiceMoney(m.iva)}</dd></div><div className="invoice-total"><dt>TOTAL</dt><dd>{invoiceMoney(m.total)}</dd></div></dl></section>
        <section className="invoice-ack"><h4>Acuse de recibo</h4><div><span>Nombre: __________________________</span><span>RUT: __________________</span><span>Fecha: ________________</span><span>Recinto: __________________________</span><span>Firma: __________________</span></div><p>Este ejemplar no constituye un acuse legal ni un documento cedible.</p></section>
        <footer className="invoice-footer">Comprobante interno · La factura oficial la emite la contadora · Vendedor: {m.data.vendedor}</footer>
      </article></div>
      <Actions id={id} invoice />
    </>
  );
}
