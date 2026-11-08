import type { Payment, ReceiptSnapshot, Sale } from '../types/model';
import { CL, lineName, Popt, U } from './catalog';
import { ctx, isAccountant, isAdmin, me } from './ctx';
import { clp, fdt, qtyFmt } from './format';
import { sheetInvoicePDF } from './invoice';

/* El comprobante es distinto de la emisión tributaria del SII: el sistema solo registra; la contadora emite. */

export function receiptData(s: Sale): ReceiptSnapshot {
  if (s.comprobante) return s.comprobante;
  const total = Math.round(s.total), neto = Math.round(total / 1.19);
  const c = ctx.S.cfg;
  return {
    documento: s.documento || 'boleta',
    receptor: s.documento === 'factura' && s.receptor ? { ...s.receptor } : null,
    emisor: { nombre: c.nombre, rut: c.rut, giro: c.giro || '', direccion: c.direccion || '', comuna: c.comuna || '', telefono: c.telefonoEmisor || '', siiUnidad: c.siiUnidad || '' },
    vendedor: U(s.vendedor).nombre,
    items: s.lineas.map((l) => ({ nombre: lineName(l), codigo: Popt(l.prod)?.sku || '', qty: l.qty, unidad: l.unidad, precio: l.precio, subtotal: l.subtotal })),
    pagos: s.pagos.map((p) => ({ ...p, ...(p.medio === 'credito' && s.cliente ? { cliente: CL(s.cliente).nombre } : {}) })),
    total, neto, iva: total - neto,
  };
}
export const receiptKind = (s: Sale): 'Factura' | 'Boleta' => ((s.comprobante?.documento || s.documento) === 'factura' ? 'Factura' : 'Boleta');
export const receiptPdfFilename = (s: Sale): string => (receiptKind(s) === 'Factura' ? `factura-${s.num}.pdf` : `boleta-${s.num}.pdf`);
export const receiptTitle = (s: Sale): string => (receiptKind(s) === 'Factura' ? 'FACTURA' : 'BOLETA');
export const receiptPayment = (medio: string): string =>
  ({ efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', mixto: 'Mixto', credito: 'Crédito', cheque: 'Cheque' } as Record<string, string>)[medio] || String(medio);
export const payLabel = (p: Payment): string => receiptPayment(p.medio) + (p.cliente ? ' · ' + p.cliente : '');
/** El vendedor solo puede ver sus propias ventas. */
export const canSeeSale = (s: Sale | undefined): s is Sale => !!s && (isAdmin() || isAccountant() || s.vendedor === me()?.id);

export function saleText(s: Sale): string {
  const d = receiptData(s);
  return `*${d.emisor.nombre}*\nRUT ${d.emisor.rut}\n${receiptTitle(s)}\nComprobante interno N° ${s.num}\n${fdt(s.fecha)} · ${d.vendedor}\n` +
    (s.estado === 'anulada' ? `ANULADA: ${s.motivoAnula || ''}\n` : '') +
    (d.receptor ? `Cliente: ${d.receptor.razonSocial}\nRUT: ${d.receptor.rut}\nGiro: ${d.receptor.giro}\n${d.receptor.direccion}, ${d.receptor.comuna}\n${d.receptor.telefono ? 'Teléfono: ' + d.receptor.telefono + '\n' : ''}` : '') + '\n' +
    d.items.map((l) => `${l.nombre}\n${qtyFmt(l.qty, l.unidad)} × ${clp(l.precio)} = ${clp(l.subtotal)}`).join('\n') +
    `\n\nNeto referencial: ${clp(d.neto)}\nIVA 19% referencial: ${clp(d.iva)}\n*TOTAL: ${clp(d.total)}*\n` +
    d.pagos.filter((p) => p.monto).map((p) => `${payLabel(p)}: ${clp(p.monto)}`).join('\n') +
    '\n\nDocumento no válido tributariamente. Sin folio ni timbre SII.';
}

interface PdfLine { text: string; bold: boolean; center: boolean }
export function receiptPdfLines(s: Sale): PdfLine[] {
  const d = receiptData(s), e = d.emisor, lines: PdfLine[] = [];
  const add = (text = '', bold = false, center = false) => {
    for (const paragraph of String(text).split(/\r?\n/)) {
      const words = paragraph.split(/\s+/);
      let current = '';
      for (let word of words) {
        if (current && current.length + word.length + 1 > 38) { lines.push({ text: current, bold, center }); current = ''; }
        while (word.length > 38) { if (current) { lines.push({ text: current, bold, center }); current = ''; } lines.push({ text: word.slice(0, 38), bold, center }); word = word.slice(38); }
        current += (current ? ' ' : '') + word;
      }
      lines.push({ text: current, bold, center });
    }
  };
  const pair = (left: string, right: string, bold = false) => {
    const room = 38 - right.length;
    if (left.length > room - 1) { add(left, bold); add(right.padStart(38, ' '), bold); }
    else lines.push({ text: left + ' '.repeat(Math.max(1, room - left.length)) + right, bold, center: false });
  };
  add(e.nombre, true, true); add('RUT ' + e.rut, false, true);
  for (const text of [e.giro, e.direccion, e.comuna]) if (text) add(text, false, true);
  add(); add(receiptTitle(s), true, true); add('Comprobante interno N° ' + s.num, false, true);
  add('DOCUMENTO NO VÁLIDO TRIBUTARIAMENTE', true, true);
  if (s.estado === 'anulada') { add('VENTA ANULADA', true, true); add(s.motivoAnula || ''); }
  add(); add('Emisión: ' + fdt(s.fecha)); add('Vendedor: ' + d.vendedor);
  if (d.receptor) { add(); add('CLIENTE', true); add(d.receptor.razonSocial); add('RUT ' + d.receptor.rut); add(d.receptor.giro); add(d.receptor.direccion + ', ' + d.receptor.comuna); if (d.receptor.telefono) add('Teléfono: ' + d.receptor.telefono); }
  add('-'.repeat(38));
  for (const l of d.items) { add(l.nombre, true); pair(qtyFmt(l.qty, l.unidad) + ' x ' + clp(l.precio), clp(l.subtotal)); add(); }
  add('-'.repeat(38)); pair('Neto referencial', clp(d.neto)); pair('IVA 19% referencial', clp(d.iva)); pair('TOTAL', clp(d.total), true); add();
  for (const p of d.pagos.filter((p) => p.monto)) pair(payLabel(p), clp(p.monto));
  add('-'.repeat(38)); add('Precios finales con IVA incluido.', false, true); add('Desglose referencial: todos los productos se consideran afectos.', false, true); add();
  add('Sin folio autorizado ni timbre SII.', true, true); add('Conserva este comprobante de tu compra.', false, true);
  return lines;
}

/** Hex WinAnsi para las fuentes integradas del PDF (sin CDN ni scripts embebidos). */
export const pdfHex = (text: string): string => Array.from(String(text), (c) => {
  const code = c.codePointAt(0) as number;
  const map: Record<number, number> = { 0x20ac: 128, 0x2013: 150, 0x2014: 151, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2026: 133 };
  return (code >= 32 && code <= 255 ? code : map[code] || 63).toString(16).padStart(2, '0');
}).join('');

export function assemblePdf(objectsBodies: (put: (body: string) => number, objects: string[]) => void): Uint8Array {
  const objects: string[] = [];
  const put = (body: string) => { objects.push(body); return objects.length; };
  objectsBodies(put, objects);
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Array.from(pdf, (c) => c.charCodeAt(0)));
}

export function receiptPDF(s: Sale): Uint8Array {
  if (receiptKind(s) === 'Factura') return sheetInvoicePDF(s);
  const lines = receiptPdfLines(s), pages: PdfLine[][] = [];
  for (let i = 0; i < lines.length; i += 66) pages.push(lines.slice(i, i + 66));
  return assemblePdf((put, objects) => {
    put('<< /Type /Catalog /Pages 2 0 R >>'); put('');
    const regular = put('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
    const bold = put('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
    const pageIds: number[] = [];
    for (const [index, part] of pages.entries()) {
      const height = Math.max(220, part.length * 11 + 48), width = 226.77;
      let stream = '0 g\n';
      part.forEach((l, i) => {
        const x = l.center ? Math.max(14, (width - l.text.length * 5.1) / 2) : 14;
        stream += `BT /${l.bold ? 'F2' : 'F1'} 8.5 Tf 1 0 0 1 ${x.toFixed(2)} ${(height - 22 - i * 11).toFixed(2)} Tm <${pdfHex(l.text)}> Tj ET\n`;
      });
      stream += `BT /F1 7 Tf 1 0 0 1 14 12 Tm <${pdfHex('Página ' + (index + 1) + ' de ' + pages.length)}> Tj ET\n`;
      const content = put(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
      pageIds.push(put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`));
    }
    objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => id + ' 0 R').join(' ')}] >>`;
  });
}
