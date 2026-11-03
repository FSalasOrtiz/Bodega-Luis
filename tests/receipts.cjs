// Receipt logic/PDF and sharing branches in isolation; no live storage or external messages.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'../bodega-lo-valledor.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../assets/transaction-workflow.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../assets/invoice-layout.js'),'utf8')+'\n'+[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
const root={innerHTML:'',querySelectorAll(){return[]}};
const storage={getItem(){return null},setItem(){},removeItem(){}};
const ctx={console,Date,Math,Intl,JSON,Map,Set,Number,String,Array,Object,Boolean,RegExp,parseFloat,parseInt,isNaN,Uint8Array,Blob,setTimeout,clearTimeout,localStorage:storage,sessionStorage:storage,matchMedia:()=>({matches:false,addEventListener(){}}),window:{addEventListener(){},scrollTo(){}},document:{addEventListener(){},documentElement:{dataset:{}},querySelector(s){return s==='#root'?root:null},querySelectorAll(){return[]},activeElement:null}};
vm.createContext(ctx);vm.runInContext(source,ctx);
vm.runInContext(`
  modal=html=>{globalThis.receiptHTML=html};toast=msg=>{globalThis.lastToast=msg};
  me=S.users.find(u=>u.rol==='admin');
  globalThis.sample={id:'receipt-test',num:1234,fecha:Date.UTC(2026,9,28,15),vendedor:me.id,estado:'vigente',
    lineas:[{prod:S.products[0].id,unidad:'gamela',qty:2,precio:1190,subtotal:2380}],
    pagos:[{medio:'efectivo',monto:1000},{medio:'transferencia',monto:1380}],total:2380};
  sample.comprobante=receiptData(sample);S.sales.push(sample);
  S.products[0].nombre='Producto cambiado';S.cfg.nombre='Otra empresa';
  receipt(sample.id);globalThis.data=receiptData(sample);globalThis.message=saleText(sample);
`,ctx);
assert.equal(ctx.data.neto,2000);assert.equal(ctx.data.iva,380);assert.equal(ctx.data.neto+ctx.data.iva,ctx.data.total);
assert.notEqual(ctx.data.emisor.nombre,'Otra empresa');assert.notEqual(ctx.data.items[0].nombre,'Producto cambiado');
assert(ctx.receiptHTML.includes('Vista previa de boleta'));
assert(ctx.receiptHTML.includes('DOCUMENTO NO VÁLIDO TRIBUTARIAMENTE'));
assert(ctx.receiptHTML.includes('downloadReceiptPDF('));assert(ctx.message.includes('Sin folio ni timbre SII'));
vm.runInContext(`sample.estado='anulada';sample.motivoAnula='<script>alert(1)</script>';receipt(sample.id);globalThis.bytes=receiptPDF(sample)`,ctx);
assert(ctx.receiptHTML.includes('VENTA ANULADA'));assert(!ctx.receiptHTML.includes('<script>alert(1)</script>'));
const pdf=Buffer.from(ctx.bytes);assert(pdf.subarray(0,8).toString().startsWith('%PDF-1.4'));
const xref=Number(pdf.toString().match(/startxref\n(\d+)/)[1]);assert(pdf.subarray(xref,xref+4).toString()==='xref');
const samplePath=process.env.RECEIPT_TEST_PDF;if(samplePath)fs.writeFileSync(samplePath,pdf);
vm.runInContext(`sample.comprobante.items=[...Array(150)].map((_,i)=>({nombre:'Limón y palta - producto '+i,qty:1.5,unidad:'kg',precio:1000,subtotal:1500}));globalThis.longPDF=receiptPDF(sample)`,ctx);
assert(Number(Buffer.from(ctx.longPDF).toString().match(/\/Type \/Pages \/Count (\d+)/)[1])>1);
// Build a real new sale and ensure metadata is frozen before returning.
vm.runInContext(`
  const stocked=S.products.find(p=>!p.envase&&prodStock(p.id)>20);
  globalThis.newSale=makeSale({vendedor:me.id,items:[{prod:stocked.id,qty:1}],pago:'efectivo',silent:true});
`,ctx);
assert(ctx.newSale.comprobante);assert.equal(ctx.newSale.comprobante.total,ctx.newSale.total);
// Invoice validation must finish before any ledger mutation.
vm.runInContext(`globalThis.recipient={rut:'12.345.678-5',razonSocial:'Empresa <&> de prueba',giro:'Comercio',direccion:'Calle Uno 123',comuna:'Santiago',telefono:'+56 9 1234 5678'};globalThis.saleCount=S.sales.length;globalThis.moveCount=S.moves.length`,ctx);
assert(vm.runInContext("validRut('12.345.678-5')",ctx));
assert(!vm.runInContext("validRut('12.345.678-0')",ctx));
assert.throws(()=>vm.runInContext("makeSale({vendedor:me.id,items:[],pago:'tarjeta',documento:'factura',receptor:null,silent:true})",ctx),/RUT/);
assert.equal(vm.runInContext('S.sales.length',ctx),ctx.saleCount);assert.equal(vm.runInContext('S.moves.length',ctx),ctx.moveCount);
assert.throws(()=>vm.runInContext("makeSale({vendedor:me.id,items:[],pago:'tarjeta',documento:'factura',receptor:{rut:'12.345.678-5'},silent:true})",ctx),/razón social/);
vm.runInContext(`
 const stockedForInvoice=S.products.find(p=>!p.envase&&prodStock(p.id)>10);
 globalThis.invoice=makeSale({vendedor:me.id,items:[{prod:stockedForInvoice.id,qty:1}],pago:'tarjeta',documento:'factura',receptor:recipient,silent:true});
 recipient.razonSocial='Cambiado';receipt(invoice.id);globalThis.invoiceRows=receiptPdfLines(invoice);globalThis.invoiceMessage=saleText(invoice);
`,ctx);
assert.equal(ctx.invoice.comprobante.receptor.telefono,'+56 9 1234 5678');assert(ctx.receiptHTML.includes('+56 9 1234 5678'));assert(ctx.invoiceRows.some(l=>l.text.includes('+56 9 1234 5678')));assert(ctx.invoiceMessage.includes('+56 9 1234 5678'));
assert.equal(ctx.invoice.receptor.rut,'12345678-5');assert.equal(ctx.invoice.comprobante.receptor.razonSocial,'Empresa <&> de prueba');
assert.equal(ctx.invoice.pagos[0].medio,'tarjeta');
assert.equal(vm.runInContext('saleCash(invoice)',ctx),0);assert.equal(vm.runInContext('saleTr(invoice)',ctx),0);assert.equal(vm.runInContext('saleCard(invoice)',ctx),ctx.invoice.total);
assert(ctx.receiptHTML.includes('Vista previa de factura'));assert(ctx.receiptHTML.includes('Empresa &lt;&amp;&gt; de prueba'));
assert(ctx.invoiceRows.some(l=>l.text.includes('FACTURA')));assert(ctx.invoiceRows.some(l=>l.text.includes('Tarjeta')));assert(ctx.invoiceMessage.includes('Empresa <&> de prueba'));
// The public PDF route uses a sheet for invoices and retains the thermal format for boletas.
const invoiceState=vm.runInContext('JSON.stringify(S)',ctx);
vm.runInContext('globalThis.invoicePDFBytes=receiptPDF(invoice);globalThis.invoiceModelResult=invoiceModel(invoice)',ctx);
assert.equal(vm.runInContext('JSON.stringify(S)',ctx),invoiceState);
assert(Buffer.from(ctx.invoicePDFBytes).toString().includes('/MediaBox [0 0 595.28 841.89]'));
assert.equal(ctx.invoiceModelResult.rows.reduce((n,r)=>n+r.net,0),ctx.invoice.comprobante.neto);
assert(ctx.receiptHTML.includes('invoice-tax-box'));assert(ctx.receiptHTML.includes('SIN FOLIO SII'));assert(!ctx.receiptHTML.includes('Formato ticket de 80 mm'));
assert.equal(vm.runInContext('receiptPdfFilename(invoice)',ctx),'factura-demostracion-'+ctx.invoice.num+'.pdf');
if(process.env.INVOICE_TEST_PDF)fs.writeFileSync(process.env.INVOICE_TEST_PDF,Buffer.from(ctx.invoicePDFBytes));
vm.runInContext(`globalThis.longInvoice={...invoice,comprobante:{...invoice.comprobante,total:11900,neto:10000,iva:1900,items:[...Array(100)].map((_,i)=>({nombre:'Descripción extendida de producto '+i+' '+('mercadería '.repeat(8)),codigo:'SKU-'+i,qty:1,unidad:'kg',precio:119,subtotal:119}))}};globalThis.longInvoiceBytes=receiptPDF(longInvoice)`,ctx);
assert(Number(Buffer.from(ctx.longInvoiceBytes).toString().match(/\/Type \/Pages \/Count (\d+)/)[1])>1);
if(process.env.INVOICE_TEST_PDF)fs.writeFileSync(process.env.INVOICE_TEST_PDF.replace('.pdf','-long.pdf'),Buffer.from(ctx.longInvoiceBytes));
console.log('OK invoice sheet/PDF dimensions, net allocation, issuer/customer phone, no fake folio/stamp, multipage detail, no ledger changes');
vm.runInContext("ui.documento='factura';ui.receptor={...invoice.receptor};ui.pago='tarjeta';go('pos')",ctx);
assert(root.innerHTML.includes('inv-telefono'));assert(root.innerHTML.includes('type="tel"'));assert(root.innerHTML.includes('inv-razonSocial'));assert(root.innerHTML.includes('terminal de tarjeta'));
vm.runInContext("ui.documento='boleta';render()",ctx);assert(!root.innerHTML.includes('inv-razonSocial'));
vm.runInContext("go('dash')",ctx);assert(root.innerHTML.includes('Tarjetas hoy'));
vm.runInContext("sf.medio='tarjeta';go('sales')",ctx);assert(root.innerHTML.includes('<td>Factura</td>'));assert(root.innerHTML.includes('Tarjeta'));
const oldDocumentQuery=ctx.document.querySelector;
ctx.document.querySelector=selector=>selector==='#dec'?{value:'0'}:oldDocumentQuery(selector);
vm.runInContext("closeShift();globalThis.closure=S.closures.at(-1)",ctx);assert.equal(ctx.closure.tarjeta,ctx.invoice.total);
ctx.document.querySelector=oldDocumentQuery;
console.log('OK invoice validation/snapshot/preview/PDF, card ledger/filter/dashboard/shift closure');

// Share the PDF only: cancellation/unsupported browsers never download or open text links.
ctx.File=class extends Blob{constructor(parts,name,options){super(parts,options);this.name=name}};
let native=0,downloaded=0,opened=0;
ctx.navigator={canShare:({files})=>files[0].type==='application/pdf',share:async(data)=>{assert(data.files[0].name.endsWith('.pdf'));assert.equal(data.text,undefined);native++}};
ctx.document.body={appendChild(){}};
ctx.document.createElement=()=>({click(){opened++;assert(this.href.startsWith('https://wa.me/'))},remove(){}});
vm.runInContext('downloadReceiptPDF=()=>{globalThis.downloaded=(globalThis.downloaded||0)+1}',ctx);
(async()=>{
 await vm.runInContext('shareReceipt(sample.id)',ctx);assert.equal(native,1);assert.equal(ctx.downloaded,undefined);
 ctx.navigator.share=async()=>{throw Object.assign(new Error('cancel'),{name:'AbortError'})};
 await vm.runInContext('shareReceipt(sample.id)',ctx);assert.equal(ctx.downloaded,undefined);assert.equal(opened,0);
 ctx.navigator={};await vm.runInContext('shareReceipt(sample.id)',ctx);assert.equal(ctx.downloaded,undefined);assert.equal(opened,0);
 assert(ctx.lastToast.includes('no permite compartir'));
 ctx.isSecureContext=false;await vm.runInContext('shareReceipt(sample.id)',ctx);assert(ctx.lastToast.includes('HTTPS'));assert.equal(ctx.downloaded,undefined);assert.equal(opened,0);
 assert(!ctx.receiptHTML.includes('onclick="printReceipt()"'));
 ctx.isSecureContext=true;ctx.navigator={canShare:()=>false,share:async()=>{throw new Error('must not share')}};await vm.runInContext('shareReceipt(sample.id)',ctx);assert.equal(ctx.downloaded,undefined);assert.equal(opened,0);
// Printing configures only receipt output and is reversible when the dialog closes.
let printStyle=null,printCalls=0;const classes=new Set();
ctx.document.body={classList:{add(c){classes.add(c)},remove(c){classes.delete(c)}}};
ctx.document.getElementById=id=>printStyle?.id===id?printStyle:null;
ctx.document.createElement=()=>({remove(){printStyle=null}});
ctx.document.head={appendChild(style){printStyle=style}};
ctx.window.print=()=>{printCalls++};
vm.runInContext('printReceipt()',ctx);
assert(classes.has('receipt-print'));assert(printStyle.textContent.includes('size:80mm'));assert.equal(printCalls,1);
vm.runInContext('cleanupReceiptPrint()',ctx);assert(!classes.has('receipt-print'));assert.equal(printStyle,null);
console.log('OK 80 mm print mode setup and cleanup');

 console.log('OK receipt preview, issuer/product snapshot, totals, mixed payments, cancelled/escaped content, valid PDF xref, pagination, real sale snapshot, PDF-only share/cancel/unsupported/HTTPS guards, no print button');
})().catch(e=>{console.error(e);process.exitCode=1});
