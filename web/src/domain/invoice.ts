import type { Receptor, ReceiptItem, ReceiptSnapshot, Sale } from '../types/model';
import { fdate, kg } from './format';
import { assemblePdf, pdfHex, receiptData, receiptPayment } from './receipts';

/* Factura en hoja A4 basada en ejemplos impresos del SII. Siempre una vista previa local sin validez tributaria. */

export const invoiceMoney = (value: number, decimals = 0): string => '$' + Number(value || 0).toLocaleString('es-CL', { maximumFractionDigits: decimals });

export interface InvoiceRow extends ReceiptItem { index: number; net: number; fraction: number; unitNet: number }
export interface InvoiceModel { sale: Sale; data: ReceiptSnapshot; issuer: ReceiptSnapshot['emisor']; customer: Partial<Receptor>; rows: InvoiceRow[]; net: number; iva: number; total: number; warning: string }

export function invoiceModel(s: Sale): InvoiceModel {
  const d = receiptData(s), total = Math.round(d.total), net = Number.isFinite(d.neto) ? Math.round(d.neto) : Math.round(total / 1.19);
  const grossSum = d.items.reduce((n, l) => n + Math.round(l.subtotal), 0);
  // Reparte el neto referencial por mayor resto, preservando el total cobrado.
  const rows: InvoiceRow[] = d.items.map((l, index) => {
    const exact = grossSum ? (Math.round(l.subtotal) * net) / grossSum : 0;
    return { ...l, index: index + 1, net: Math.floor(exact), fraction: exact - Math.floor(exact), unitNet: 0 };
  });
  let remaining = net - rows.reduce((n, r) => n + r.net, 0);
  const priority = [...rows].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; remaining > 0 && priority.length; i++, remaining--) priority[i % priority.length].net++;
  rows.forEach((r) => { r.unitNet = r.qty ? r.net / r.qty : 0; });
  return { sale: s, data: d, issuer: d.emisor, customer: d.receptor || {}, rows, net, iva: total - net, total,
    warning: grossSum !== total ? 'El detalle no coincide con el total registrado. Revisa esta operación antes de preparar un documento tributario.' : '' };
}

export const invoiceTextWidth = (text: string, size: number): number =>
  Array.from(String(text), (c) => size * (/[ilI.,:;'!| ]/.test(c) ? 0.28 : /[MW@%m]/.test(c) ? 0.95 : c === 'w' ? 0.8 : /[A-ZÁÉÍÓÚÑ]/.test(c) ? 0.75 : 0.59)).reduce((a, b) => a + b, 0);
export function invoiceWrap(text: string, width: number, size: number): string[] {
  const lines: string[] = [];
  for (const paragraph of String(text || '').split(/\r?\n/)) {
    let line = '';
    for (let word of paragraph.split(/\s+/)) {
      if (line && invoiceTextWidth(line + ' ' + word, size) > width) { lines.push(line); line = ''; }
      while (invoiceTextWidth(word, size) > width) { let take = 1; while (take < word.length && invoiceTextWidth(word.slice(0, take + 1), size) <= width) take++; lines.push(word.slice(0, take)); word = word.slice(take); }
      line += (line ? ' ' : '') + word;
    }
    lines.push(line);
  }
  return lines;
}

export function sheetInvoicePDF(s: Sale): Uint8Array {
  const m = invoiceModel(s), e = m.issuer, c = m.customer, W = 595.28, H = 841.89, margin = 36, contentWidth = W - margin * 2;
  const pages: { stream: string }[] = [];
  const columns = [22, 48, 170, 42, 30, 76, 48, contentWidth - 436], fontSize = 8.5;
  let page: { stream: string } = { stream: '' }, y = 0;
  const drawText = (text: string, x: number, top: number, size = 9, bold = false, color = '0 0 0') => {
    page.stream += `${color} rg\nBT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(H - top - size).toFixed(2)} Tm <${pdfHex(text)}> Tj ET\n`;
  };
  const paragraph = (text: string, x: number, top: number, width: number, size = 9, bold = false) => {
    const lines = invoiceWrap(text, width, size);
    lines.forEach((line, i) => drawText(line, x, top + i * (size + 3), size, bold));
    return lines.length * (size + 3);
  };
  const rect = (x: number, top: number, w: number, h: number, color = '0.3 0.3 0.3', fill = false) => {
    page.stream += `${color} ${fill ? 'rg' : 'RG'}\n0.7 w ${x.toFixed(2)} ${(H - top - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill ? 'f' : 'S'}\n`;
  };
  const rule = (top: number) => { page.stream += `0.65 G 0.4 w ${margin} ${(H - top).toFixed(2)} m ${W - margin} ${(H - top).toFixed(2)} l S\n`; };
  const tableHeader = () => {
    rect(margin, y, contentWidth, 26, '0.94 0.94 0.94', true);
    let x = margin;
    ['Ítem', 'Código', 'Descripción', 'Cant.', 'Unid.', 'P. unit. neto', 'Dscto.', 'Valor neto'].forEach((t, i) => { drawText(t, x + 4, y + 8, 7.5, true); x += columns[i]; });
    y += 26;
  };
  const startPage = () => {
    page = { stream: '' }; pages.push(page);
    let issuerY = margin;
    issuerY += paragraph(e.nombre, margin, issuerY, 270, 14, true) + 7;
    for (const text of ['Giro: ' + (e.giro || 'Por configurar'), e.direccion || 'Dirección por configurar', e.comuna || 'Comuna por configurar', ...(e.telefono ? ['Teléfono: ' + e.telefono] : [])]) issuerY += paragraph(text, margin, issuerY, 270, 9) + 2;
    const bx = W - margin - 219;
    rect(bx, margin, 219, 100, '0.66 0.12 0.12');
    const boxLine = (text: string, top: number, size: number, bold: boolean) => drawText(text, bx + Math.max(8, (219 - invoiceTextWidth(text, size)) / 2), top, size, bold, '0.66 0.12 0.12');
    boxLine('R.U.T.: ' + e.rut, margin + 12, 12, true); boxLine('FACTURA', margin + 34, 12, true); boxLine('LA EMITE LA CONTADORA', margin + 56, 10, true); boxLine('SIN FOLIO SII', margin + 77, 11, true);
    y = Math.max(issuerY + 8, margin + 128);
    rect(margin, y, contentWidth, 21, '0.94 0.94 0.94', true); drawText('DOCUMENTO NO VÁLIDO TRIBUTARIAMENTE - NO CEDIBLE', margin + 8, y + 5, 9, true); y += 32;
    drawText('Comprobante interno N° ' + s.num, margin, y, 9, true); drawText('Fecha de emisión: ' + fdate(s.fecha), W - margin - 174, y, 9); y += 22;
    const clientTop = y;
    for (const [label, value] of [['Señor(es)', c.razonSocial], ['RUT', c.rut], ['Giro', c.giro], ['Dirección', c.direccion], ['Comuna', c.comuna], ['Teléfono', c.telefono]] as const) {
      drawText(label + ':', margin + 8, y + 5, 9, true);
      const height = paragraph(value || 'No registrado', margin + 83, y + 5, contentWidth - 96, 9);
      y += Math.max(20, height + 8);
    }
    rect(margin, clientTop, contentWidth, y - clientTop); y += 10;
    y += paragraph('Medios de pago: ' + m.data.pagos.filter((p) => p.monto).map((p) => receiptPayment(p.medio) + ' ' + invoiceMoney(p.monto)).join(' / '), margin, y, contentWidth, 8.5);
    y += paragraph('Vendedor: ' + m.data.vendedor, margin, y, contentWidth, 8.5) + 9;
    if (s.estado === 'anulada') y += paragraph('VENTA ANULADA: ' + (s.motivoAnula || ''), margin, y, contentWidth, 9, true) + 6;
    if (m.warning) y += paragraph(m.warning, margin, y, contentWidth, 9, true) + 6;
    tableHeader();
  };
  startPage();
  for (const row of m.rows) {
    const values = [row.index, row.codigo || '—', row.nombre, kg(row.qty), row.unidad === 'kg' ? 'kg' : 'gam.', invoiceMoney(row.unitNet, 6), '$0', invoiceMoney(row.net)].map(String);
    let wrapped = values.map((v, i) => invoiceWrap(v, columns[i] - 8, fontSize));
    while (wrapped.some((lines) => lines.length)) {
      let capacity = Math.floor((H - 64 - y - 12) / (fontSize + 3));
      if (capacity < 1) { startPage(); capacity = Math.floor((H - 64 - y - 12) / (fontSize + 3)); }
      const count = Math.min(capacity, Math.max(...wrapped.map((lines) => lines.length))), height = Math.max(30, count * (fontSize + 3) + 12);
      let x = margin;
      wrapped.forEach((lines, i) => {
        lines.slice(0, count).forEach((line, n) => { const tx = [3, 5, 6, 7].includes(i) ? x + columns[i] - 4 - invoiceTextWidth(line, fontSize) : x + 4; drawText(line, tx, y + 6 + n * (fontSize + 3), fontSize); });
        x += columns[i];
      });
      wrapped = wrapped.map((lines) => lines.slice(count)); y += height; rule(y);
      if (wrapped.some((lines) => lines.length)) startPage();
    }
  }
  // Totales, timbre y acuse de recibo quedan juntos en la última hoja.
  if (y + 330 > H - 58) startPage();
  y += 12; y += paragraph('Detalle neto e IVA referenciales. Todos los productos se consideran afectos; el redondeo conserva el total cobrado.', margin, y, contentWidth, 8) + 14;
  const bottom = y, right = W - margin - 218;
  drawText('Referencias', margin, y, 9, true); paragraph('Sin documentos de referencia registrados.', margin, y + 18, 270, 8.5);
  const stampTop = y + 48; rect(margin, stampTop, 200, 64);
  paragraph('Timbre electrónico SII no disponible', margin + 12, stampTop + 16, 180, 9, true); paragraph('La emite la contadora', margin + 12, stampTop + 39, 180, 8);
  paragraph('Sin folio ni resolución de emisión asociados a este comprobante interno.', margin, stampTop + 72, 270, 8);
  let ty = bottom;
  for (const [label, amount, strong] of [['Monto neto referencial', m.net, false], ['Monto exento referencial', 0, false], ['IVA (19%) referencial', m.iva, false], ['TOTAL', m.total, true]] as const) {
    if (strong) rect(right, ty, 218, 31, '0.94 0.94 0.94', true);
    const size = strong ? 11 : 9, amountText = invoiceMoney(amount), split = invoiceTextWidth(label, size) + invoiceTextWidth(amountText, size) > 190;
    drawText(label, right + 8, ty + 8, size, strong); drawText(amountText, W - margin - 8 - invoiceTextWidth(amountText, size), ty + (split ? 24 : 8), size, strong);
    ty += split ? 43 : strong ? 31 : 26;
  }
  y = Math.max(bottom + 163, ty + 14); rect(margin, y, contentWidth, 75); drawText('Acuse de recibo', margin + 8, y + 8, 9, true);
  drawText('Nombre: __________________________    RUT: _________________    Fecha: __________', margin + 8, y + 27, 8);
  drawText('Recinto: __________________________    Firma: _______________________________', margin + 8, y + 44, 8);
  drawText('Este ejemplar no constituye un acuse legal ni un documento cedible.', margin + 8, y + 61, 8);
  pages.forEach((p, i) => { page = p; drawText('Comprobante interno - La factura oficial la emite la contadora', margin, H - 36, 8); drawText('Página ' + (i + 1) + ' de ' + pages.length, W - margin - 86, H - 36, 8); });
  return assemblePdf((put, objects) => {
    put('<< /Type /Catalog /Pages 2 0 R >>'); put('');
    const regular = put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), bold = put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const ids: number[] = [];
    for (const p of pages) { const stream = put(`<< /Length ${p.stream.length} >>\nstream\n${p.stream}endstream`); ids.push(put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${stream} 0 R >>`)); }
    objects[1] = `<< /Type /Pages /Count ${ids.length} /Kids [${ids.map((id) => id + ' 0 R').join(' ')}] >>`;
  });
}
