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

(async()=>{
reset();run('render=()=>{};newRecForm();recForm.productor="producer";recForm.lineas=[{prod:"p",qty:3,costo:20}]');
assert(!run('recView()').includes('Pallets'));assert(!run('recView()').includes('Quitar producto'));
assert(run('recView()').includes('Agregar productor / proveedor'));
run('mermaF={prod:"p",qty:8};saveMerma()');
assert.equal(run('lotStock("l1")'),0);assert.equal(run('lotStock("l2")'),8);
assert.deepEqual(value('S.moves.filter(m=>m.tipo==="merma").map(m=>[m.lot,m.qty])'),[['l1',-6],['l2',-2]]);
const before=run('JSON.stringify(S)');run('mermaF.qty=99;saveMerma()');assert.equal(run('JSON.stringify(S)'),before);
run('mermaF.qty=-1;saveMerma()');assert.equal(run('JSON.stringify(S)'),before);
assert(!run('mermaView()').includes('<label>Lote'));assert(!run('mermaView()').includes('<label>Motivo'));
reset();run('render=()=>{};newRecForm();recForm.productor="producer";recForm.lineas=[{prod:"p",qty:3,costo:20}];recForm.modalidad="compra"');
assert(!run('recView()').includes('Foto de la guía'));assert(!run('recView()').includes('type="file"'));
await run('saveRec()');assert.equal(run('S.receptions.length'),1);assert.equal(run('prodStock("p")'),19);assert(!run('S.receptions[0].fotoId'));
assert(run('modalHTML').includes('Costo unitario'));assert(!run('modalHTML').includes('Guía adjunta'));
run('recForm.productor="producer";recForm.lineas=[{prod:"p",qty:2,costo:10}]');
failWrites=true;await run('saveRec()');assert.equal(run('S.receptions.length'),1);assert.equal(run('prodStock("p")'),19);failWrites=false;
// diferencia de balanza: palta por kg puede venderse hasta la tolerancia sobre el stock
reset();run(`S.products.push({id:'pal',sku:'PAL',nombre:'Palta',familia:'Palta',calibre:'I',unidad:'kg',precio:1000,activo:true});
 S.lots.push({id:'lp',prod:'pal',qty:20,costo:0,fecha:now()-500,productor:'producer',modalidad:'consignación'});S.moves.push({id:'inp',lot:'lp',prod:'pal',qty:20,fecha:now()-500,tipo:'recepción'})`);
assert.equal(run('scaleOver(P("pal"),20,20.4)'),0.4);assert.equal(run('scaleOver(P("pal"),20,25)'),5);assert.equal(run('scaleOver(P("p"),6,7)'),0,'por gamela sigue el límite');
run('globalThis.sv=makeSale({vendedor:"seller",items:[{prod:"pal",qty:25}],pago:"efectivo"})');
assert.equal(run('sv.total'),25000);assert(Math.abs(run('prodStock("pal")'))<1e-9,'queda en 0, no negativo');
assert.deepEqual(value('S.moves.filter(m=>m.tipo==="ajuste"&&m.prod==="pal").map(m=>[m.qty,m.motivo])'),[[5,'Vendido sobre el stock registrado (venta N° 1001)']]);
run('makeSale({vendedor:"seller",items:[{prod:"pal",qty:3}],pago:"efectivo"})');assert(Math.abs(run('prodStock("pal")'))<1e-9,'también con stock en 0');
assert.throws(()=>run('makeSale({vendedor:"seller",items:[{prod:"p",qty:99}],pago:"efectivo"})'),/No alcanza/);
// dos stocks: consignación (l1+l2 = 16) y compra directa (ld = 5); la venta y la merma sacan solo del stock elegido
reset();run(`render=()=>{};S.lots.push({id:'ld',prod:'p',qty:5,costo:30,fecha:now()-3000,productor:'producer',modalidad:'compra'});S.moves.push({id:'ind',lot:'ld',prod:'p',qty:5,fecha:now()-3000,tipo:'recepción'})`);
assert.equal(run('srcStock("p","consig")'),16);assert.equal(run('srcStock("p","directa")'),5);assert.equal(run('prodStock("p")'),21);
run('globalThis.sc=makeSale({vendedor:"seller",items:[{prod:"p",qty:2,src:"consig"}],pago:"efectivo"})');
assert.deepEqual(value('sc.lineas[0].allocs.map(a=>a.lot)'),['l1'],'consignación no toca el lote de compra aunque sea más antiguo');assert.equal(run('sc.lineas[0].src'),'consig');
run('globalThis.sd=makeSale({vendedor:"seller",items:[{prod:"p",qty:3,src:"directa"}],pago:"efectivo"})');
assert.deepEqual(value('sd.lineas[0].allocs.map(a=>[a.lot,a.comision,a.costo])'),[['ld',0,30]]);assert.equal(run('srcStock("p","directa")'),2);assert.equal(run('srcStock("p","consig")'),14);
assert.throws(()=>run('makeSale({vendedor:"seller",items:[{prod:"p",qty:3,src:"directa"}],pago:"efectivo"})'),/No alcanza el stock de Tomate en compra directa\. Quedan 2/);
run('ui.src="directa";ui.cart=[{prod:"p",qty:1,src:"directa"}]');assert.equal(run('posLeft("p")'),1);assert.deepEqual(value('checkoutItems()').map(i=>i.src),['directa']);
run('ui.src="consig"');assert.equal(run('posLeft("p")'),14);
run('me=S.users[0];view="pos";globalThis.pos=viewPOS()');assert(run('pos').includes('Sacar del stock de'));assert(run('pos').includes('Quedan 14'));assert(run('pos').includes('>Compra directa</span>'));
run('ui.cart=[];mermaF={prod:"p",qty:"1",src:"directa"};saveMerma()');assert.equal(run('srcStock("p","directa")'),1);assert.equal(run('srcStock("p","consig")'),14);
assert(run('mermaView()').includes('Disponible en compra directa'));
run('S.products.push({id:"pk",sku:"PK",nombre:"Palta kg",familia:"Palta",calibre:"I",unidad:"kg",precio:1000,activo:true});globalThis.sk=makeSale({vendedor:"seller",items:[{prod:"pk",qty:2,src:"consig"}],pago:"efectivo"})');
assert.deepEqual(value('S.lots.filter(l=>l.prod==="pk").map(l=>[l.modalidad,lotSrc(l)])'),[['ajuste','consig']],'el ajuste por balanza queda en el stock elegido');
run('view="inv";globalThis.inv=viewInv()');assert(run('inv').includes('<th class="right">Consignación</th><th class="right">Compra directa</th>'));
run('ui.src="consig"');
// palta: gamelas y kg se anotan por separado (entran 20 kg en 2 gamelas, salen 25 kg en 3 gamelas)
reset();run(`render=()=>{};S.products.push({id:'pal',sku:'PAL',nombre:'Palta',familia:'Palta',calibre:'I',unidad:'kg',precio:1000,activo:true,usaGamela:true});
 newRecForm();recForm.productor="producer";recForm.lineas=[{prod:"pal",qty:"20",gam:"2",costo:""}]`);
assert(run('recView()').includes('>Gamelas</label>'));
await run('saveRec()');assert.equal(run('S.receptions[0].lineas[0].gamelas'),2);assert.equal(run('kgGamCount("pal").entra'),2);
run('ui.cart=[{prod:"pal",qty:25,gam:3}]');assert.equal(run('gamAuto()'),3,'las gamelas de palta se suman a Se lleva');
run('globalThis.sp=makeSale({vendedor:"seller",items:checkoutItems().filter(i=>i.prod==="pal"),pago:"efectivo"})');assert.equal(run('sp.lineas[0].gamelas'),3);
run('S.moves.push({id:"in3",lot:S.lots.find(l=>l.prod==="pal").id,prod:"pal",qty:5,fecha:now(),tipo:"recepción"});mermaF={prod:"pal",qty:"1",gam:"1"};saveMerma()');
assert.deepEqual(value('kgGamCount("pal")'),{entra:2,sale:3,merma:1,quedan:-2},'conteo independiente, no bloquea');
assert(run('kgGamTxt("pal")').includes('entraron 2 · salieron 3 · merma 1 · quedan -2'));
run('sp.estado="anulada";sp.reversal={completedAt:now()}');assert.equal(run('kgGamCount("pal").sale'),0,'la venta anulada no cuenta');
run('ui.cart=[]');
reset();run('S.families=["Cítricos"];S.products.push({id:"mango",familia:"Mango",activo:true});ui.fam="Todas"');
assert(run('productFamilies().includes("Cítricos")'));assert(!run('productFamilies().includes("Otros")'));assert(run('famChips()').includes('Mango'));
run('document.querySelector=q=>q==="#family-name"?{value:"Hortalizas"}:null;saveFamily()');assert(run('S.families.includes("Hortalizas")'));
run('S.sales=Array.from({length:25},(_,i)=>({id:"v"+i,num:1000+i,fecha:now()+i,vendedor:me.id,total:100,estado:"vigente",lineas:[{prod:"p",qty:1,unidad:"gamela"}],pagos:[{medio:"efectivo",monto:100}]}));ui.q="";sf={desde:"",hasta:"",vend:"",medio:""};globalThis.list=salesList()');
assert.equal((run('list').match(/onclick="receipt\('/g)||[]).length,20);assert(run('list').includes('1024'));assert(!run('list').includes('>1004<'));assert(run('list').includes('aria-current="page"'));assert(run('list').includes('Mostrando 1–20 de 25'));
run('ui.salesPage=2;globalThis.list=salesList()');assert.equal((run('list').match(/onclick="receipt\('/g)||[]).length,5);assert(run('list').includes('>1004<'));assert(!run('list').includes('>1024<'));
run('S.moves=Array.from({length:45},(_,i)=>({fecha:now()+i,tipo:"ajuste",user:me.id,prod:"p",qty:1,motivo:"m"+i}));S.audit=[];mf={tipo:"",user:""};ui.movesPage=3;globalThis.mv=movesList()');assert(run('mv').includes('Mostrando 41–45 de 45 movimientos'));assert(run('mv').includes('Página anterior'));assert(!run('mv').includes('Página siguiente'));
run('ui.salesPage=1');
// Movimientos es una pestaña de Historial (solo Luis) y no repite ventas ni recepciones
run(`S.moves=[{fecha:now(),tipo:"venta",user:"seller",prod:"p",qty:-1,motivo:""},{fecha:now(),tipo:"recepción",user:"admin",prod:"p",qty:5,motivo:""},{fecha:now(),tipo:"merma",user:"seller",prod:"p",qty:-2,motivo:"podrido"}];
 S.audit=[{fecha:now(),accion:"Cambio de precio",user:"admin",entidad:"Tomate",antes:"$100",despues:"$120"},{fecha:now(),accion:"Autoriza crédito",user:"admin",entidad:"Sergio",antes:"",despues:"$5.000"},{fecha:now(),accion:"venta_registrada",user:"seller",entidad:"Venta 1001",antes:"",despues:"x"},{fecha:now(),accion:"reversion_solicitada",user:"admin",entidad:"Venta 1001",antes:"",despues:"cliente se arrepintió"}];ui.movesPage=1;mf={tipo:"",user:""}`);
assert(run('movesList()').includes('Mostrando 1–4 de 4 movimientos'),'sin ventas ni recepciones');assert(!run('movesList()').includes('venta_registrada'));
run('mf.tipo="Mermas"');assert(run('movesList()').includes('podrido')&&!run('movesList()').includes('Cambio de precio'));
run('mf.tipo="Anulaciones"');assert(run('movesList()').includes('Anula venta')&&run('movesList()').includes('cliente se arrepintió'));run('mf.tipo="Autorizaciones"');assert(run('movesList()').includes('Autoriza crédito'));run('mf.tipo="Precios y productos"');assert(run('movesList()').includes('Cambio de precio'));
run('mf.tipo="";ui.salesTab="movimientos"');assert(run('viewSales()').includes('Precios y productos'));assert(!run('menu().some(m=>m.id==="moves")'));
run('me=S.users[1];ui.salesTab="movimientos"');assert(!run('viewSales()').includes('Precios y productos'),'el vendedor no ve movimientos');run('me=S.users[0];ui.salesTab="list"');

run('ui.salesTab="recepciones"');assert(run('viewSales()').includes('Historial de recepciones'));
run(`globalThis.printed=0;globalThis.removed=0;globalThis.printCleanup=null;
 globalThis.frame={style:{},setAttribute(){},remove(){removed++},contentWindow:{addEventListener(name,fn){if(name==='afterprint')printCleanup=fn},focus(){},print(){printed++}}};
 document.querySelector=q=>q==='.reception-paper'?{outerHTML:'<article class="reception-paper"><header>Bodega</header><p>Recepción de prueba</p></article>'}:null;
 document.getElementById=()=>null;document.createElement=()=>frame;document.body={appendChild(node){globalThis.appended=node}};
 printReception();`);
assert.equal(run('printed'),0);assert(run('frame.srcdoc').includes('@page{size:A4;margin:16mm}'));assert(!run('frame.srcdoc').includes('position:absolute'));assert(!run('frame.srcdoc').includes('class="modal"'));
run('frame.onload()');assert.equal(run('printed'),1);run('printCleanup()');assert.equal(run('removed'),1);
run(`globalThis.revoked=[];globalThis.previewImage=null;URL={createObjectURL:()=>"blob:test-guide",revokeObjectURL:url=>revoked.push(url)};
 document.createElement=()=>({});globalThis.preview={replaceChildren(){},appendChild(img){previewImage=img}};
 showReceptionImage(preview,{type:"image/png"});`);
assert.equal(run('previewImage.src'),'blob:test-guide');assert(run('previewImage.alt').includes('guía'));run('previewImage.onload()');assert.equal(run('revoked.length'),1);
console.log('OK inline guide preview URL lifecycle, isolated A4 printing target and cleanup');
console.log('OK reception without guide photo, storage failure rollback, FIFO waste across lots/invalid guards, dynamic families, latest 15 sales, reception history');
})().catch(e=>{console.error(e);process.exitCode=1});
