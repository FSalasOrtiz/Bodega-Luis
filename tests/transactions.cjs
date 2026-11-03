// Controlled ledger tests. No browser, bank or tax API is contacted.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
let clock=Date.UTC(2026,8,20,12),failWrites=false;const store=new Map();
class TestDate extends Date{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
const root={innerHTML:'',inert:false,querySelectorAll(){return[]}};
const ctx={console,Date:TestDate,Math,Intl,JSON,Map,Set,Number,String,Array,Object,Boolean,RegExp,parseFloat,parseInt,isNaN,Uint8Array,Blob,setTimeout,clearTimeout,
 localStorage:{getItem:k=>store.get(k)||null,setItem(k,v){if(failWrites)throw new Error('quota');store.set(k,v)},removeItem:k=>store.delete(k)},sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},
 matchMedia:()=>({matches:false,addEventListener(){}}),window:{addEventListener(){},scrollTo(){}},document:{addEventListener(){},documentElement:{dataset:{}},querySelector:q=>q==='#root'?root:null,querySelectorAll(){return[]},activeElement:null}};
const html=fs.readFileSync(path.join(__dirname,'../bodega-lo-valledor.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../assets/transaction-workflow.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../assets/invoice-layout.js'),'utf8')+'\n'+[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
vm.createContext(ctx);vm.runInContext(source,ctx);
const run=code=>vm.runInContext(code,ctx),value=code=>JSON.parse(JSON.stringify(run(code)));
function reset(){clock=Date.UTC(2026,8,20,12);store.clear();failWrites=false;run(`
 S={cfg:{nombre:'Bodega',rut:'12.345.678-5',comision:10,inicioJornada:6,modeloBoleta:'sin_definir'},
 users:[{id:'admin',nombre:'Admin',rol:'admin',activo:true,turno:'día'},{id:'seller',nombre:'Vendedor',rol:'vendedor',activo:true,turno:'día'}],
 products:[{id:'p',sku:'TOM',nombre:'Tomate',familia:'Tomate',calibre:'9',unidad:'gamela',precio:100,pesoCaja:0,activo:true,envase:false},{id:'g',sku:'GAM',nombre:'Gamela',familia:'Otros',calibre:'',unidad:'gamela',precio:50,activo:true,envase:true}],
 producers:[{id:'producer',nombre:'Productor',tipo:'productor',comision:10}],
 lots:[{id:'l1',prod:'p',qty:6,fecha:now()-2000,productor:'producer',modalidad:'consignación'},{id:'l2',prod:'p',qty:10,fecha:now()-1000,productor:'producer',modalidad:'consignación'}],
 moves:[{id:'in1',lot:'l1',prod:'p',qty:6,fecha:now()-2000,tipo:'recepción'},{id:'in2',lot:'l2',prod:'p',qty:10,fecha:now()-1000,tipo:'recepción'}],sales:[],closures:[],liqss:[],liqs:[],receptions:[],prices:[],audit:[],expenses:[],fixed:[],notes:[]};
 me=S.users[0];ensureWorkflowState();localStorage.setItem(KEY,JSON.stringify(S));modal=html=>{globalThis.modalHTML=html};closeModal=()=>{};toast=msg=>{globalThis.lastToast=msg};
 globalThis.draft={key:'sale:1',user:'admin',items:[{prod:'p',qty:2,precio:100}],documento:'boleta',payments:[{medio:'efectivo',monto:200}],paymentConfirmed:true};
 `)}
function emit(id='doc-1'){run(`globalThis.s=S.sales[0];observeFiscalDocument(s.id,s.fiscalDocs[0].id,{eventId:'${id}',provider:'fixture',verified:true,state:'emitido',providerDocumentId:'remote-1',original:{tipo:39,folio:100,rutEmisor:'12.345.678-5',fecha:'2026-09-20',monto:s.total}})`)}
reset();const initial=value('S');run('ui.cart=[{prod:"p",qty:2}];ui.pago="efectivo";ui.paymentRefs={};confirmSale()');
assert(run('checkoutDraft!==null'));assert(run('S.sales.length===0&&S.moves.length===2'));run('cancelCheckout()');assert(run('checkoutDraft===null&&S.sales.length===0'));
run('globalThis.s=registerSaleCommand(draft)');assert.equal(run('S.sales.length'),1);assert.equal(run('prodStock("p")'),14);assert.equal(run('s.fiscalDocs[0].state'),'pendiente_integracion');assert.equal(run('S.operations[0].attempts'),0);
run('registerSaleCommand(draft)');assert.equal(run('S.sales.length'),1);assert.equal(run('S.moves.length'),3);
assert.throws(()=>run('registerSaleCommand({...draft,items:[{prod:"p",qty:3,precio:100}]})'),/clave/);
const before=value('S');failWrites=true;assert.throws(()=>run('registerSaleCommand({...draft,key:"sale:2"})'),/quota/);failWrites=false;assert.deepEqual(value('S'),before);
const stored=JSON.parse(store.values().next().value);stored.workflowRevision+=1;store.set(run('KEY'),JSON.stringify(stored));assert.throws(()=>run('registerSaleCommand({...draft,key:"sale:2"})'),/Otra pestaña/);store.set(run('KEY'),JSON.stringify(before));
console.log('OK final review no writes, idempotent sale, payload mismatch, quota rollback, stale revision');
reset();assert.throws(()=>run('registerSaleCommand({...draft,items:[{prod:"p",qty:9,precio:100},{prod:"p",qty:9,precio:100}],payments:[{medio:"efectivo",monto:1800}]})'),/stock/);assert.equal(run('S.moves.length'),2);
run('s=registerSaleCommand({...draft,items:[{prod:"p",qty:4,precio:100},{prod:"p",qty:4,precio:100}],payments:[{medio:"efectivo",monto:800}]})');
assert.equal(run('lotStock("l1")'),0);assert.equal(run('lotStock("l2")'),8);assert.deepEqual(value('s.lineas[1].allocs.map(a=>[a.lot,a.qty])'),[['l1',2],['l2',2]]);
run('reverseSaleCommand(s.id,"Devolución",true)');assert.equal(run('lotStock("l1")'),6);assert.equal(run('lotStock("l2")'),10);const moveCount=run('S.moves.length');run('reverseSaleCommand(s.id,"Reintento",true)');assert.equal(run('S.moves.length'),moveCount);assert.equal(run('S.refunds.length'),1);
assert.equal(run('revenueEntries().reduce((n,s)=>n+s.total,0)'),0);assert.equal(run('moneyEntries().reduce((n,e)=>n+e.monto,0)'),800);
run('confirmRefundCommand(S.refunds[0].id,"salida-caja-1")');run('confirmRefundCommand(S.refunds[0].id,"salida-caja-1")');assert.equal(run('moneyEntries().reduce((n,e)=>n+e.monto,0)'),0);assert.equal(run('s.paymentState'),'devuelto');
console.log('OK FIFO reservations, exact original-lot returns, one reversal/refund, money independent from sale');
reset();run('s=registerSaleCommand(draft)');emit();const original=value('s.fiscalDocs[0].original');run('reverseSaleCommand(s.id,"DTE emitido",true)');
assert.equal(run('s.reversal.state'),'pendiente_nota_credito');assert.equal(run('prodStock("p")'),14);assert.equal(run('s.estado'),'vigente');assert.equal(run('s.reversal.creditNotes.length'),1);
run('reverseSaleCommand(s.id,"Otra vez",true)');assert.equal(run('s.reversal.creditNotes.length'),1);
run('observeCreditNote(s.id,s.reversal.creditNotes[0].id,{eventId:"nc-error",provider:"fixture",verified:true,state:"error"})');assert.equal(run('s.reversal.state'),'pendiente_nota_credito');assert.equal(run('prodStock("p")'),14);
assert.throws(()=>run('observeCreditNote(s.id,s.reversal.creditNotes[0].id,{eventId:"bad-ref",provider:"fixture",verified:true,state:"emitida",tipo:61,folio:300,monto:200,originalDocumentId:"incorrecto",originalTipo:39,originalFolio:100})'),/coincide/);
run('s=S.sales[0];globalThis.ncEvent={eventId:"nc-1",provider:"fixture",verified:true,state:"emitida",tipo:61,folio:300,monto:200,originalDocumentId:s.fiscalDocs[0].id,originalTipo:39,originalFolio:100};observeCreditNote(s.id,s.reversal.creditNotes[0].id,ncEvent);s=S.sales[0]');
assert.equal(run('s.estado'),'anulada');assert.equal(run('prodStock("p")'),16);assert.deepEqual(value('s.fiscalDocs[0].original'),original);
const reversedMoves=run('S.moves.length');run('observeCreditNote(s.id,s.reversal.creditNotes[0].id,ncEvent)');assert.equal(run('S.moves.length'),reversedMoves);
console.log('OK issued DTE immutable, NC references/amounts, failed NC remains pending, repeated callback no double stock');
reset();run('s=registerSaleCommand(draft);observeFiscalDocument(s.id,s.fiscalDocs[0].id,{eventId:"unknown",provider:"fixture",verified:true,state:"desconocido"});reverseSaleCommand(s.id,"Consultar antes",true)');
assert.equal(run('s.reversal.state'),'pendiente_verificacion');assert.equal(run('prodStock("p")'),14);
run('observeFiscalDocument(s.id,s.fiscalDocs[0].id,{eventId:"not-issued",provider:"fixture",verified:true,state:"no_emitido"})');assert.equal(run('prodStock("p")'),16);
console.log('OK unknown emission never reverses optimistically; verified absence unlocks reversal');
reset();run('S.cfg.modeloBoleta="voucher_sustituye";S.cfg.modeloReferencia="declaracion-1";S.cfg.operadorTarjeta="Operador";s=registerSaleCommand({...draft,payments:[{medio:"tarjeta",monto:200,reference:"voucher-1",voucherTax:true}]})');
assert.deepEqual(value('s.fiscalDocs.map(d=>d.kind)'),['voucher']);assert.equal(run('S.operations.length'),0);
run('reverseSaleCommand(s.id,"Retorno tarjeta",false)');assert.equal(run('prodStock("p")'),14);assert.equal(run('S.refunds[0].state'),'pendiente_operador');assert.equal(run('s.paymentState'),'devolucion_pendiente');
run('confirmRefundCommand(S.refunds[0].id,"reversa-operador-1")');assert.equal(run('moneyEntries().reduce((n,e)=>n+e.monto,0)'),0);
reset();run('S.cfg.modeloBoleta="voucher_sustituye";S.cfg.modeloReferencia="declaracion-1";S.cfg.operadorTarjeta="Operador";s=registerSaleCommand({...draft,payments:[{medio:"efectivo",monto:75},{medio:"tarjeta",monto:125,reference:"v2",voucherTax:true}]})');
assert.deepEqual(value('s.fiscalDocs.map(d=>[d.kind,d.amount])'),[['boleta',75],['voucher',125]]);
reset();run('s=registerSaleCommand({...draft,payments:[{medio:"tarjeta",monto:200,reference:"v3"}]})');assert.equal(run('s.fiscalDocs[0].state'),'pendiente_conciliacion');assert.equal(run('S.operations.length'),0);
reset();run('S.cfg.modeloBoleta="voucher_sustituye";S.cfg.modeloReferencia="decl";S.cfg.operadorTarjeta="Operador";s=registerSaleCommand({...draft,documento:"factura",receptor:{rut:"12.345.678-5",razonSocial:"Cliente",giro:"Comercio",direccion:"Calle 1",comuna:"Santiago"},payments:[{medio:"tarjeta",monto:200,reference:"v4",voucherTax:true}]})');
assert.deepEqual(value('s.fiscalDocs.map(d=>[d.kind,d.amount])'),[['factura',200]]);
console.log('OK card voucher model, operator refund independent, mixed coverage exact, unknown model blocked, invoice overrides voucher');
reset();run('s=registerSaleCommand(draft);globalThis.septBefore=monthStats("2026-09");S.liqs.push({id:"settled",prod:"producer",desde:"2026-09-01",hasta:"2026-09-30",...liqCalc("producer","2026-09-01","2026-09-30")});localStorage.setItem(KEY,JSON.stringify(S))');
const settlement=value('S.liqs[0]');
ctx.document.querySelector=q=>q==='#dec'?{value:'200'}:q==='#root'?root:null;run('closeShift()');const closure=value('S.closures[0]');assert.equal(closure.esperado,200);
clock=Date.UTC(2026,9,10,12);run('reverseSaleCommand(s.id,"Después del cierre",true)');
assert.deepEqual(value('S.closures[0]'),closure);assert.deepEqual(value('S.liqs[0]'),settlement);
assert.equal(run('monthStats("2026-09").ventas'),200);assert.equal(run('monthStats("2026-10").ventas'),-200);
assert.equal(run('liqCalc("producer","2026-10-01","2026-10-31").neto'),-180);assert.equal(run('S.adjustments[0].originalClosure'),closure.id);assert.deepEqual(value('S.adjustments[0].settlements'),['settled']);
run('confirmRefundCommand(S.refunds[0].id,"refund-oct")');ctx.document.querySelector=q=>q==='#dec'?{value:'0'}:q==='#opening'?{value:'200'}:q==='#root'?root:null;run('closeShift()');
assert.equal(run('S.closures.length'),2);assert.equal(run('S.closures[1].netoEfectivo'),-200);assert.deepEqual(value('S.closures[0]'),closure);
console.log('OK previous closure and settlement preserved, adjustment dated later, consignment credit and subsequent cash out close');
reset();run('s=registerSaleCommand(draft);me=S.users[1]');assert.throws(()=>run('reverseSaleCommand(s.id,"no permiso",true)'),/administrador/);assert.throws(()=>run('requestReversalCommand(s.id,"ajena")'),/tus ventas/);
run('me=S.users[0];s=S.sales[0];s.vendedor="seller";localStorage.setItem(KEY,JSON.stringify(S));me=S.users[1];requestReversalCommand(s.id,"cliente solicita")');assert.equal(run('s.solicitud'),'cliente solicita');assert.equal(run('prodStock("p")'),14);
run('me=S.users[0];go("fiscal")');assert(root.innerHTML.includes('Control tributario y reversiones'));assert(root.innerHTML.includes('cliente solicita'));
console.log('OK seller/admin permissions, traceable request, admin panel renders');
reset();run('S.cfg.modeloBoleta="siempre_boleta";s=registerSaleCommand({...draft,payments:[{medio:"tarjeta",monto:200,reference:"term:1"}]})');assert.equal(run('s.fiscalDocs[0].state'),'pendiente_conciliacion');
assert.throws(()=>run('registerSaleCommand({...draft,key:"new-key",payments:[{medio:"tarjeta",monto:200,reference:"term:1"}]})'),/referencia/);assert.equal(run('S.sales.length'),1);
reset();run('S.cfg.modeloBoleta="siempre_boleta";S.cfg.modeloReferencia="declared";s=registerSaleCommand({...draft,payments:[{medio:"tarjeta",monto:200,reference:"term:2"}]})');assert.deepEqual(value('s.fiscalDocs.map(d=>[d.kind,d.amount])'),[['boleta',200]]);
run('prepareFiscalCommand(s.id);prepareFiscalCommand(s.id)');assert.equal(run('S.operations.filter(o=>o.kind==="emitir").length'),1);assert.equal(run('S.operations[0].attempts'),0);
console.log('OK model declaration required, unique terminal reference, always-boleta plan, preparing never emits or duplicates intent');
reset();run('s=registerSaleCommand(draft);reverseSaleCommand(s.id,"Retorno temprano",true);globalThis.originalReverseDate=s.reversal.completedAt');const initialReversed=value('S.adjustments');
clock=Date.UTC(2026,9,15,12);emit('late-emission');assert.equal(run('s.reversal.state'),'pendiente_nota_credito');assert.equal(run('prodStock("p")'),16);
run('observeCreditNote(s.id,s.reversal.creditNotes[0].id,{eventId:"late-nc",provider:"fixture",verified:true,state:"emitida",tipo:61,folio:501,monto:200,originalDocumentId:s.fiscalDocs[0].id,originalTipo:39,originalFolio:100})');
assert.equal(run('s.reversal.completedAt'),ctx.originalReverseDate);assert.deepEqual(value('S.adjustments'),initialReversed);assert.equal(run('prodStock("p")'),16);
console.log('OK late emitted document triggers NC without another stock return or moving the historical adjustment date');
reset();run('s=makeSale({vendedor:me.id,items:draft.items,pago:"efectivo",silent:true});ensureSaleWorkflow(s);localStorage.setItem(KEY,JSON.stringify(S));reverseSaleCommand(s.id,"Revisión histórico",true)');assert.equal(run('s.reversal.state'),'pendiente_verificacion');
run('observeFiscalDocument(s.id,s.fiscalDocs[0].id,{eventId:"legacy-not-issued",provider:"fixture",verified:true,state:"no_emitido"})');assert.equal(run('moneyEntries().reduce((n,e)=>n+e.monto,0)'),200);
run('confirmRefundCommand(S.refunds[0].id,"legacy-return")');assert.equal(run('moneyEntries().reduce((n,e)=>n+e.monto,0)'),0);
console.log('OK legacy requires verification; its payment is not subtracted twice');
reset();run('s=registerSaleCommand(draft);reverseSaleCommand(s.id,"Sin mercadería",false)');assert.equal(run('prodStock("p")'),14);assert.equal(run('S.moves.filter(m=>m.tipo==="anulación").length'),0);
assert.throws(()=>run('confirmRefundCommand(S.refunds[0].id,"")'),/referencia/);assert.equal(run('S.refunds[0].state'),'pendiente_confirmacion');
console.log('OK no physical return means no stock credit; missing money evidence leaves refund pending');
