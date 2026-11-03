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
reset();run('render=()=>{};newRecForm();recForm.productor="producer";recForm.lineas=[{prod:"p",qty:3,costo:20}];globalThis.attachments=new Map();receptionImageStore=async(mode,key,value)=>{if(mode==="put")attachments.set(key,value);if(mode==="delete")attachments.delete(key);return attachments.get(key)};recForm.foto="guia.png";recForm.fotoArchivo={name:"guia.png",type:"image/png",size:50};recForm.modalidad="compra";recView()');
assert.equal(run('recForm.fotoArchivo.name'),'guia.png');
await run('saveRec()');assert.equal(run('S.receptions.length'),1);assert.equal(run('attachments.size'),1);assert.equal(run('prodStock("p")'),19);
assert(run('modalHTML').includes('guia.png'));assert(run('modalHTML').includes('Costo unitario'));
assert(run('receptionHistory()').includes('Con imagen'));
run('recForm.productor="producer";recForm.lineas=[{prod:"p",qty:2,costo:10}];recForm.fotoArchivo={name:"otra.png"};recForm.foto="otra.png"');
failWrites=true;await run('saveRec()');assert.equal(run('S.receptions.length'),1);assert.equal(run('prodStock("p")'),19);assert.equal(run('attachments.size'),1);failWrites=false;
run('recForm.fotoArchivo=null;receptionImageStore=async()=>{throw new Error("storage blocked")};recForm.fotoArchivo={name:"otra.png"}');await run('saveRec()');assert.equal(run('S.receptions.length'),1);
reset();run('S.families=["Cítricos"];S.products.push({id:"mango",familia:"Mango",activo:true});ui.fam="Todas"');
assert(run('productFamilies().includes("Cítricos")'));assert(!run('productFamilies().includes("Otros")'));assert(run('famChips()').includes('Mango'));
run('document.querySelector=q=>q==="#family-name"?{value:"Hortalizas"}:null;saveFamily()');assert(run('S.families.includes("Hortalizas")'));
run('S.sales=Array.from({length:25},(_,i)=>({id:"v"+i,num:1000+i,fecha:now()+i,vendedor:me.id,total:100,estado:"vigente",lineas:[{prod:"p",qty:1,unidad:"gamela"}],pagos:[{medio:"efectivo",monto:100}]}));ui.q="";sf={desde:"",hasta:"",vend:"",medio:""};globalThis.list=salesList()');
assert.equal((run('list').match(/onclick="receipt\('/g)||[]).length,15);assert(run('list').includes('1024'));assert(!run('list').includes('1009'));
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
console.log('OK receipt attachment retention/storage failure rollback, FIFO waste across lots/invalid guards, dynamic families, latest 15 sales, reception history');
})().catch(e=>{console.error(e);process.exitCode=1});
