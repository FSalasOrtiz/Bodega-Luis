/* Sheet invoice layout based on SII printed examples. Always a non-tax-valid local preview. */
function invoiceMoney(value,decimals=0){return '$'+Number(value||0).toLocaleString('es-CL',{maximumFractionDigits:decimals});}
function invoiceModel(s){
  const d=receiptData(s),total=Math.round(d.total),net=Number.isFinite(d.neto)?Math.round(d.neto):Math.round(total/1.19);
  const grossSum=d.items.reduce((n,l)=>n+Math.round(l.subtotal),0);
  // Allocate referential net pesos by largest remainder, preserving the charged total and snapshot.
  const rows=d.items.map((l,index)=>{
    const exact=grossSum?Math.round(l.subtotal)*net/grossSum:0;
    return {...l,index:index+1,net:Math.floor(exact),fraction:exact-Math.floor(exact)};
  });
  let remaining=net-rows.reduce((n,r)=>n+r.net,0);
  const priority=[...rows].sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
  for(let i=0;remaining>0&&priority.length;i++,remaining--)priority[i%priority.length].net++;
  rows.forEach(r=>{r.unitNet=r.qty?r.net/r.qty:0});
  return {sale:s,data:d,issuer:d.emisor,customer:d.receptor||{},rows,net,iva:total-net,total,warning:grossSum!==total?'El detalle no coincide con el total registrado. Revisa esta operación antes de preparar un documento tributario.':''};
}
function invoicePreviewHTML(s){
  const m=invoiceModel(s),e=m.issuer,c=m.customer;
  const field=(label,value)=>`<div><dt>${label}</dt><dd>${esc(value||'No registrado')}</dd></div>`;
  return `<div class="receipt-heading noprint"><h2>Vista previa de factura</h2><p class="muted">Venta N° ${s.num} · Formato de hoja A4 · La factura oficial la emite la contadora</p></div>
  <div class="invoice-stage"><article class="invoice-paper printable" aria-label="Factura ${s.num}">
    <header class="invoice-header"><div class="invoice-issuer"><h3>${esc(e.nombre)}</h3><p><b>Giro:</b> ${esc(e.giro||'Por configurar')}</p><p>${esc(e.direccion||'Dirección por configurar')}</p><p>${esc(e.comuna||'Comuna por configurar')}</p>${e.telefono?`<p>Teléfono: ${esc(e.telefono)}</p>`:''}</div>
    <div class="invoice-document"><div class="invoice-tax-box"><b>R.U.T.: ${esc(e.rut)}</b><strong>FACTURA</strong><span>LA EMITE LA CONTADORA</span><b>SIN FOLIO SII</b></div></div></header>
    <div class="invoice-notice">DOCUMENTO NO VÁLIDO TRIBUTARIAMENTE · NO CEDIBLE</div>
    ${s.estado==='anulada'?`<p class="invoice-cancelled"><b>VENTA ANULADA</b> · ${esc(s.motivoAnula||'')}</p>`:''}
    <div class="invoice-date"><span><b>Comprobante interno:</b> ${s.num}</span><span><b>Fecha de emisión:</b> ${fdate(s.fecha)}</span></div>
    <dl class="invoice-customer">${field('Señor(es)',c.razonSocial)}${field('RUT',c.rut)}${field('Giro',c.giro)}${field('Teléfono',c.telefono)}${field('Dirección',c.direccion)}${field('Comuna',c.comuna)}</dl>
    <p class="invoice-payment"><b>Medios de pago:</b> ${m.data.pagos.filter(p=>p.monto).map(p=>esc(receiptPayment(p.medio))+' '+invoiceMoney(p.monto)).join(' · ')}</p>
    ${m.warning?`<p class="invoice-notice">${esc(m.warning)}</p>`:''}
    <div class="invoice-items-wrap"><table class="invoice-items"><caption class="receipt-sr">Detalle de la factura: valores netos referenciales</caption><colgroup><col style="width:4%"><col style="width:9%"><col style="width:32%"><col style="width:8%"><col style="width:6%"><col style="width:15%"><col style="width:9%"><col style="width:17%"></colgroup><thead><tr><th scope="col">Ítem</th><th scope="col">Código</th><th scope="col">Descripción</th><th scope="col">Cantidad</th><th scope="col">Unid.</th><th scope="col">P. unit. neto</th><th scope="col">Dscto.</th><th scope="col">Valor neto</th></tr></thead><tbody>
    ${m.rows.map(r=>`<tr><td>${r.index}</td><td>${esc(r.codigo||'—')}</td><td>${esc(r.nombre)}</td><td class="invoice-number">${kg(r.qty)}</td><td>${r.unidad==='kg'?'kg':'gam.'}</td><td class="invoice-number">${invoiceMoney(r.unitNet,6)}</td><td class="invoice-number">$0</td><td class="invoice-number">${invoiceMoney(r.net)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="invoice-rounding">Detalle neto y desglose de IVA referenciales; todos los productos se consideran afectos. Los redondeos conservan el total cobrado.</p>
    <section class="invoice-bottom"><div class="invoice-document-notes"><h4>Referencias</h4><p>Sin documentos de referencia registrados.</p><div class="invoice-stamp"><b>Timbre electrónico SII no disponible</b><span>La emite la contadora</span></div><p>Sin folio ni resolución de emisión asociados a este comprobante interno.</p></div>
      <dl class="invoice-totals"><div><dt>Monto neto referencial</dt><dd>${invoiceMoney(m.net)}</dd></div><div><dt>Monto exento referencial</dt><dd>$0</dd></div><div><dt>IVA (19%) referencial</dt><dd>${invoiceMoney(m.iva)}</dd></div><div class="invoice-total"><dt>TOTAL</dt><dd>${invoiceMoney(m.total)}</dd></div></dl></section>
    <section class="invoice-ack"><h4>Acuse de recibo</h4><div><span>Nombre: __________________________</span><span>RUT: __________________</span><span>Fecha: ________________</span><span>Recinto: __________________________</span><span>Firma: __________________</span></div><p>Este ejemplar no constituye un acuse legal ni un documento cedible.</p></section>
    <footer class="invoice-footer">Comprobante interno · La factura oficial la emite la contadora · Vendedor: ${esc(m.data.vendedor)}</footer>
  </article></div>
  <div class="receipt-actions acts noprint"><button class="btn ghost" onclick="downloadReceiptPDF('${s.id}')">Descargar factura PDF</button><button class="btn" onclick="shareReceipt('${s.id}')">${ic('wa',17)}WhatsApp · PDF</button><button class="btn pri" onclick="closeModal()">Listo</button></div>
  <p id="receipt-share-status" class="receipt-share-help muted noprint" role="status" aria-live="polite">Selecciona WhatsApp en el menú para compartir la factura PDF. Requiere HTTPS y un navegador compatible.</p>`;
}
function invoicePreview(s){modal(invoicePreviewHTML(s),true,'invoice');}
function invoicePdfHex(text){return Array.from(String(text),c=>{
  const n=c.codePointAt(0),map={0x20ac:128,0x2013:150,0x2014:151,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2026:133};
  return(n>=32&&n<=255?n:map[n]||63).toString(16).padStart(2,'0');
}).join('');}
function invoiceTextWidth(text,size){return Array.from(String(text),c=>size*(/[ilI.,:;'!| ]/.test(c)?.28:/[MW@%m]/.test(c)?.95:c==='w'?.8:/[A-ZÁÉÍÓÚÑ]/.test(c)?.75:.59)).reduce((a,b)=>a+b,0);}
function invoiceWrap(text,width,size){
  const lines=[];
  for(const paragraph of String(text||'').split(/\r?\n/)){
    let line='';
    for(let word of paragraph.split(/\s+/)){
      if(line&&invoiceTextWidth(line+' '+word,size)>width){lines.push(line);line=''}
      while(invoiceTextWidth(word,size)>width){let take=1;while(take<word.length&&invoiceTextWidth(word.slice(0,take+1),size)<=width)take++;lines.push(word.slice(0,take));word=word.slice(take)}
      line+=(line?' ':'')+word;
    }
    lines.push(line);
  }
  return lines;
}
function sheetInvoicePDF(s){
  const m=invoiceModel(s),e=m.issuer,c=m.customer,W=595.28,H=841.89,margin=36,contentWidth=W-margin*2,pages=[];
  const columns=[22,48,170,42,30,76,48,contentWidth-436],fontSize=8.5;
  let page,y;
  const drawText=(text,x,top,size=9,bold=false,color='0 0 0')=>{
    page.stream+=`${color} rg\nBT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(H-top-size).toFixed(2)} Tm <${invoicePdfHex(text)}> Tj ET\n`;
  };
  const paragraph=(text,x,top,width,size=9,bold=false)=>{const lines=invoiceWrap(text,width,size);lines.forEach((line,i)=>drawText(line,x,top+i*(size+3),size,bold));return lines.length*(size+3)};
  const rect=(x,top,w,h,color='0.3 0.3 0.3',fill=false)=>{page.stream+=`${color} ${fill?'rg':'RG'}\n0.7 w ${x.toFixed(2)} ${(H-top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill?'f':'S'}\n`};
  const rule=(top)=>{page.stream+=`0.65 G 0.4 w ${margin} ${(H-top).toFixed(2)} m ${W-margin} ${(H-top).toFixed(2)} l S\n`};
  function startPage(){
    page={stream:''};pages.push(page);
    let issuerY=margin;
    issuerY+=paragraph(e.nombre,margin,issuerY,270,14,true)+7;
    for(const text of ['Giro: '+(e.giro||'Por configurar'),e.direccion||'Dirección por configurar',e.comuna||'Comuna por configurar',...(e.telefono?['Teléfono: '+e.telefono]:[])])issuerY+=paragraph(text,margin,issuerY,270,9)+2;
    const bx=W-margin-219;
    rect(bx,margin,219,100,'0.66 0.12 0.12');
    const boxLine=(text,top,size,bold)=>drawText(text,bx+Math.max(8,(219-invoiceTextWidth(text,size))/2),top,size,bold,'0.66 0.12 0.12');
    boxLine('R.U.T.: '+e.rut,margin+12,12,true);boxLine('FACTURA',margin+34,12,true);boxLine('LA EMITE LA CONTADORA',margin+56,10,true);boxLine('SIN FOLIO SII',margin+77,11,true);
    y=Math.max(issuerY+8,margin+128);
    rect(margin,y,contentWidth,21,'0.94 0.94 0.94',true);drawText('DOCUMENTO NO VÁLIDO TRIBUTARIAMENTE - NO CEDIBLE',margin+8,y+5,9,true);y+=32;
    drawText('Comprobante interno N° '+s.num,margin,y,9,true);drawText('Fecha de emisión: '+fdate(s.fecha),W-margin-174,y,9);y+=22;
    const clientTop=y;
    for(const [label,value]of [['Señor(es)',c.razonSocial],['RUT',c.rut],['Giro',c.giro],['Dirección',c.direccion],['Comuna',c.comuna],['Teléfono',c.telefono]]){
      drawText(label+':',margin+8,y+5,9,true);const height=paragraph(value||'No registrado',margin+83,y+5,contentWidth-96,9);y+=Math.max(20,height+8);
    }
    rect(margin,clientTop,contentWidth,y-clientTop);y+=10;
    y+=paragraph('Medios de pago: '+m.data.pagos.filter(p=>p.monto).map(p=>receiptPayment(p.medio)+' '+invoiceMoney(p.monto)).join(' / '),margin,y,contentWidth,8.5);
    y+=paragraph('Vendedor: '+m.data.vendedor,margin,y,contentWidth,8.5)+9;
    if(s.estado==='anulada')y+=paragraph('VENTA ANULADA: '+(s.motivoAnula||''),margin,y,contentWidth,9,true)+6;
    if(m.warning)y+=paragraph(m.warning,margin,y,contentWidth,9,true)+6;
    tableHeader();
  }
  function tableHeader(){
    rect(margin,y,contentWidth,26,'0.94 0.94 0.94',true);
    let x=margin;['Ítem','Código','Descripción','Cant.','Unid.','P. unit. neto','Dscto.','Valor neto'].forEach((t,i)=>{drawText(t,x+4,y+8,7.5,true);x+=columns[i]});y+=26;
  }
  startPage();
  for(const row of m.rows){
    const values=[row.index,row.codigo||'—',row.nombre,kg(row.qty),row.unidad==='kg'?'kg':'gam.',invoiceMoney(row.unitNet,6),'$0',invoiceMoney(row.net)].map(String);
    let wrapped=values.map((v,i)=>invoiceWrap(v,columns[i]-8,fontSize));
    while(wrapped.some(lines=>lines.length)){
      let capacity=Math.floor((H-64-y-12)/(fontSize+3));
      if(capacity<1){startPage();capacity=Math.floor((H-64-y-12)/(fontSize+3))}
      const count=Math.min(capacity,Math.max(...wrapped.map(lines=>lines.length))),height=Math.max(30,count*(fontSize+3)+12);
      let x=margin;
      wrapped.forEach((lines,i)=>{lines.slice(0,count).forEach((line,n)=>{const tx=[3,5,6,7].includes(i)?x+columns[i]-4-invoiceTextWidth(line,fontSize):x+4;drawText(line,tx,y+6+n*(fontSize+3),fontSize)});x+=columns[i]});
      wrapped=wrapped.map(lines=>lines.slice(count));y+=height;rule(y);
      if(wrapped.some(lines=>lines.length))startPage();
    }
  }
  // Totals, stamp placeholder and receipt acknowledgment stay together on the last sheet.
  if(y+330>H-58)startPage();
  y+=12;y+=paragraph('Detalle neto e IVA referenciales. Todos los productos se consideran afectos; el redondeo conserva el total cobrado.',margin,y,contentWidth,8)+14;
  const bottom=y,right=W-margin-218;
  drawText('Referencias',margin,y,9,true);paragraph('Sin documentos de referencia registrados.',margin,y+18,270,8.5);
  const stampTop=y+48;rect(margin,stampTop,200,64);
  paragraph('Timbre electrónico SII no disponible',margin+12,stampTop+16,180,9,true);paragraph('La emite la contadora',margin+12,stampTop+39,180,8);
  paragraph('Sin folio ni resolución de emisión asociados a este comprobante interno.',margin,stampTop+72,270,8);
  let ty=bottom;for(const [label,amount,strong]of [['Monto neto referencial',m.net,false],['Monto exento referencial',0,false],['IVA (19%) referencial',m.iva,false],['TOTAL',m.total,true]]){
    if(strong)rect(right,ty,218,31,'0.94 0.94 0.94',true);
    const size=strong?11:9,amountText=invoiceMoney(amount),split=invoiceTextWidth(label,size)+invoiceTextWidth(amountText,size)>190;
    drawText(label,right+8,ty+8,size,strong);drawText(amountText,W-margin-8-invoiceTextWidth(amountText,size),ty+(split?24:8),size,strong);ty+=split?43:strong?31:26;
  }
  y=Math.max(bottom+163,ty+14);rect(margin,y,contentWidth,75);drawText('Acuse de recibo',margin+8,y+8,9,true);
  drawText('Nombre: __________________________    RUT: _________________    Fecha: __________',margin+8,y+27,8);
  drawText('Recinto: __________________________    Firma: _______________________________',margin+8,y+44,8);
  drawText('Este ejemplar no constituye un acuse legal ni un documento cedible.',margin+8,y+61,8);
  pages.forEach((p,i)=>{page=p;drawText('Comprobante interno - La factura oficial la emite la contadora',margin,H-36,8);drawText('Página '+(i+1)+' de '+pages.length,W-margin-86,H-36,8)});
  const objects=[],put=body=>{objects.push(body);return objects.length};put('<< /Type /Catalog /Pages 2 0 R >>');put('');
  const regular=put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),bold=put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const ids=[];for(const p of pages){const stream=put(`<< /Length ${p.stream.length} >>\nstream\n${p.stream}endstream`);ids.push(put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${stream} 0 R >>`))}
  objects[1]=`<< /Type /Pages /Count ${ids.length} /Kids [${ids.map(id=>id+' 0 R').join(' ')}] >>`;
  let pdf='%PDF-1.4\n',offsets=[];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`});const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Array.from(pdf,c=>c.charCodeAt(0)));
}
