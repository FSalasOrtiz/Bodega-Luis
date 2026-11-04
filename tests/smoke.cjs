// Logic and generated-markup checks; this does not simulate a browser or touch hardware.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../bodega-lo-valledor.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../assets/transaction-workflow.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../assets/invoice-layout.js'),'utf8')+'\n'+[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
const storage=()=>({getItem(){return null},setItem(){},removeItem(){}});
const root={innerHTML:'',inert:false,querySelectorAll(){return []}};
const context={console,Date,Math,Intl,JSON,Map,Set,Number,String,Array,Object,Boolean,RegExp,parseFloat,parseInt,isNaN,setTimeout,clearTimeout,localStorage:storage(),sessionStorage:storage(),matchMedia:()=>({matches:false,addEventListener(){}}),window:{addEventListener(){},scrollTo(){}},document:{addEventListener(){},documentElement:{dataset:{}},querySelector(s){return s==='#root'?root:null},querySelectorAll(){return []},activeElement:null}};
vm.createContext(context);vm.runInContext(source,context);
assert(root.innerHTML.includes('Ingresar'));
for(const role of ['admin','vendedor']){
 vm.runInContext(`me=S.users.find(x=>x.rol==='${role}');`,context);
 for(const view of role==='admin'?['dash','pos','rec','inv','sales','moves','prod','gastos','bal','rep','users']:['pos','rec','inv','sales']){
  vm.runInContext(`go('${view}')`,context);
  assert(root.innerHTML.includes('<main'),`${role}: ${view}`);
  assert(!root.innerHTML.includes('NaN'),`${view}: NaN`);
  console.log('OK',role,view);
 }
}
for(const theme of ['dark','mint']){vm.runInContext(`setTheme('${theme}')`,context);assert.equal(context.document.documentElement.dataset.theme,theme)}
console.log('OK login, 15 role/view combinations, 2 themes, no GSAP fallback');
// Regression checks execute app functions with isolated in-memory storage.
context.capture='';
vm.runInContext("modal=(html)=>{capture=html};toast=()=>{};me=S.users.find(x=>x.rol==='admin');",context);
vm.runInContext("gf={tipo:'variable',cat:VAR_CATS[0],fecha:'2026-10-01',monto:'10000',desc:'Flete'};drawGasto()",context);
assert(context.capture.includes('value="2026-10-01"'));
assert(context.capture.includes('onchange="gf.fecha=this.value"'));
vm.runInContext("gf.cat=VAR_CATS[1];drawGasto()",context);
assert(context.capture.includes('value="2026-10-01"'));
assert(context.capture.includes('value="10000"'));
vm.runInContext("gf.tipo='fijo';drawGasto();gf.tipo='variable';drawGasto()",context);
assert(context.capture.includes('value="2026-10-01"'));
vm.runInContext("ui.cart=[];globalThis.salesBefore=S.sales.length;confirmSale();globalThis.salesAfter=S.sales.length;",context);
assert.equal(context.salesBefore,context.salesAfter);
vm.runInContext("ui.cart=[{prod:S.products[0].id,qty:1}];ui.pago='mixto';ui.pagoEf=-10;confirmSale();globalThis.salesAfter=S.sales.length",context);
assert.equal(context.salesBefore,context.salesAfter);
vm.runInContext("S.products[0].nombre='Nombre muy largo '.repeat(20)+'<&\\\"';S.users[0].nombre='Usuario '.repeat(20);go('pos')",context);
assert(!root.innerHTML.includes('undefined'));
assert(root.innerHTML.includes('&lt;&amp;&quot;'));
vm.runInContext("ui.q='no existe producto 928389';go('pos');ui.q='no existe producto 928389';render()",context);
assert(root.innerHTML.includes('Sin resultados'));
vm.runInContext("applyTheme('invalid')",context);
assert.equal(context.document.documentElement.dataset.theme,'mint');
console.log('OK date retention, empty/negative-payment sale guards, long escaped names, empty search, invalid theme fallback');
vm.runInContext("S.products[0].nombre='Limón de estación';S.products[0].activo=true;S.products[0].envase=false;ui.fam='Todas';ui.q='LIMON';globalThis.found=filteredProducts().some(p=>p.id===S.products[0].id);globalThis.highlight=hl('Limón de estación','limon')",context);
assert(context.found);assert.equal(context.highlight,'<mark>Limón</mark> de estación');
vm.runInContext("ui.q='limo\\u0301n';globalThis.found=filteredProducts().some(p=>p.id===S.products[0].id)",context);assert(context.found);
vm.runInContext("ui.fam='Tomate';ui.q='sin coincidencias';clearProductSearch();globalThis.resetOK=ui.q===''&&ui.fam==='Todas';go('dash')",context);
assert(context.resetOK);assert(root.innerHTML.includes('class="sales-meter-fill"'));
let tweenCalls=0;
context.gsap={fromTo(targets,from,to){assert.equal(from.scaleX,.08);assert.equal(to.scaleX,1);assert(to.duration<=.3);tweenCalls++;return{progress(){return this},kill(){}}}};
const oldQueryAll=context.document.querySelectorAll;
context.document.querySelectorAll=selector=>selector.includes('.sales-meter-fill')?[{}]:[];
vm.runInContext("dashboardAnimated=false;keyboardInteraction=false;animateDashboard();animateDashboard()",context);
assert.equal(tweenCalls,1);
vm.runInContext("dashboardAnimated=false;keyboardInteraction=true;animateDashboard()",context);
assert.equal(tweenCalls,1);
context.document.querySelectorAll=oldQueryAll;
console.log('OK accent-insensitive search/highlight, filter reset, real chart targets, one-time reveal, keyboard motion suppression');

vm.runInContext("applyTheme('light');globalThis.picker=themePicker()",context);
assert.equal(context.document.documentElement.dataset.theme,'mint');
assert(!context.picker.includes('Tema Claro'));
assert.equal((context.picker.match(/<button/g)||[]).length,2);
console.log('OK only dark/mint themes; legacy light migrates to mint');
// Keyboard behavior for custom actions and table cells (DOM doubles; no browser assertion).
function fakeControl(tag,onclick){
 const node={tag,attrs:{onclick},handlers:{},clicks:0,classList:{contains(){return false}},
  matches(selector){return selector.split(',').some(x=>x.trim()===tag)},
  getAttribute(name){return this.attrs[name]},setAttribute(name,value){this.attrs[name]=value},
  addEventListener(type,handler){this.handlers[type]=handler},click(){this.clicks++}};
 return node;
}
const action=fakeControl('div',"go('pos')"),tableRow=fakeControl('tr',"go('inv')"),boundary=fakeControl('td','event.stopPropagation()'),nativeButton=fakeControl('button',"go('dash')");
context.controlRoot={querySelectorAll(selector){return selector==='[onclick]'?[action,tableRow,boundary,nativeButton]:[]}};
vm.runInContext('enhanceControls(controlRoot)',context);
assert.equal(action.attrs.role,'button');assert.equal(tableRow.attrs.role,undefined);
assert.equal(tableRow.tabIndex,0);assert.equal(boundary.tabIndex,undefined);assert.equal(nativeButton.tabIndex,undefined);
const key=(node,value,repeat=false,target=node)=>({target,key:value,repeat,preventDefault(){}});
action.handlers.keydown(key(action,' '));assert.equal(action.clicks,0);
action.handlers.keyup(key(action,' '));assert.equal(action.clicks,1);
action.handlers.keydown(key(action,'Enter'));assert.equal(action.clicks,2);
action.handlers.keydown(key(action,'Enter',true));assert.equal(action.clicks,2);
action.handlers.keydown(key(action,'Enter',false,nativeButton));assert.equal(action.clicks,2);
// CSV URLs are revoked after download, without changing exported cell content.
let appended=0,removed=0,clicked=0,revoked=0,scheduled;
context.Blob=Blob;
context.URL={createObjectURL(){return 'blob:test'},revokeObjectURL(url){assert.equal(url,'blob:test');revoked++}};
context.document.createElement=()=>({click(){clicked++},remove(){removed++}});
context.document.body={appendChild(){appended++}};
context.setTimeout=(callback,delay)=>{assert.equal(delay,1000);scheduled=callback};
vm.runInContext("downloadCSV([['Nombre','Monto'],['Limón',1234]],'prueba.csv')",context);
assert.equal(appended,1);assert.equal(removed,1);assert.equal(clicked,1);assert.equal(revoked,0);
scheduled();assert.equal(revoked,1);
console.log('OK table semantics, propagation-only cells, Space keyup/Enter repeat/nested actions, CSV URL cleanup');
// Reunión 2: catálogo real, palta solo por kilo sin mínimo, perfil contador de solo lectura.
vm.runInContext("toast=m=>{globalThis.lastToast=m};me=S.users.find(x=>x.rol==='admin');view='dash';render()",context);
assert.equal(vm.runInContext("S.cfg.rut",context),'78.402.234-K');
assert(!vm.runInContext("S.products.some(p=>/mango/i.test(p.nombre)||p.familia==='Mango')",context),'mango eliminado');
assert.deepEqual(vm.runInContext("S.products.filter(p=>p.familia==='Palta').map(p=>p.calibre)",context),['I','II','III','desc.','granol']);
assert(vm.runInContext("S.products.filter(p=>p.familia==='Palta').every(p=>p.unidad==='kg'&&!p.pesoCaja)",context));
assert(vm.runInContext("['zapato','pomarola','8½'].every(c=>S.products.some(p=>p.familia==='Tomate'&&p.calibre===c))",context));
{const qs=context.document.querySelector,fake={value:'',textContent:'',disabled:false,querySelectorAll(){return []}};context.document.querySelector=s=>s==='#root'?root:fake;
vm.runInContext("globalThis.palta=S.products.find(p=>p.sku==='PAL-I');openItem(palta.id)",context);
// 0,35 kg con coma: no hay mínimo de caja
vm.runInContext("itemSt.qty=parseFloat('0,35'.replace(',','.'));updItem()",context);assert.equal(fake.textContent,'');assert.equal(fake.disabled,false);
vm.runInContext("itemSt.qty=0;updItem()",context);assert.equal(fake.disabled,true);
context.document.querySelector=qs}
assert(!context.capture.includes('Por cajas'),'sin modo cajas');
assert(context.capture.includes('type="text" inputmode="decimal"'),'acepta coma decimal');
vm.runInContext("globalThis.smallSale=makeSale({vendedor:me.id,items:[{prod:palta.id,qty:0.35}],pago:'efectivo',silent:true})",context);
assert.equal(context.smallSale.lineas[0].qty,0.35);
const accountant=vm.runInContext("S.users.find(u=>u.rol==='contador')",context);
assert(accountant,'existe usuario contador');
vm.runInContext("me=S.users.find(u=>u.rol==='contador');view='pos';render()",context);
assert(root.innerHTML.includes('<h1>Historial</h1>')&&root.innerHTML.includes('Boletas')&&root.innerHTML.includes('Facturas'),'contador aterriza en el historial');assert(!root.innerHTML.includes('Recepciones')&&!root.innerHTML.includes('Anular'),'contador: solo lectura, sin recepciones');assert.equal(vm.runInContext("menu().map(m=>m.id).join()",context),'sales','contador: solo historial');
assert(!root.innerHTML.includes('Punto de venta'),'contador no ve el punto de venta');
for(const v of ['pos','rec','inv','sales','dash','users','bal']){vm.runInContext(`go('${v}')`,context);assert(root.innerHTML.includes('Desde')&&root.innerHTML.includes('Hasta'),`contador bloqueado en ${v}`)}
vm.runInContext("globalThis.before=JSON.stringify(S.users);globalThis.store=localStorage.setItem;globalThis.writes=0;localStorage.setItem=()=>{writes++};save()",context);
assert.equal(context.writes,0,'contador no persiste cambios');
assert.throws(()=>vm.runInContext("workflowTransaction(()=>1)",context),/solo lectura/);
vm.runInContext("sf={desde:'2026-11-05',hasta:'2026-11-01',vend:'',medio:'',doc:''};render()",context);
assert(root.innerHTML.includes('no puede ser posterior'));
vm.runInContext("sf={desde:'2000-01-01',hasta:today(),vend:'',medio:'',doc:'factura'};render()",context);
assert(!vm.runInContext("salesRows().some(s=>receiptKind(s)!=='Factura')",context));vm.runInContext("sf={desde:'',hasta:'',vend:'',medio:'',doc:''}",context);
vm.runInContext("localStorage.setItem=store;me=S.users.find(x=>x.rol==='admin');ui.salesTab='list';go('sales')",context);
assert(root.innerHTML.includes('Descargar reporte')&&root.innerHTML.includes('Recepciones'),'admin: reporte y recepciones en el historial');assert(!vm.runInContext("menu().some(m=>m.id==='docs')",context),'sin módulo duplicado');
// descargar reporte: siempre pide el periodo
{let csv=null;const q0=context.document.querySelector;const vals={'#rp-desde':'','#rp-hasta':'','#rp-doc':''};
context.document.querySelector=s=>s==='#root'?root:s in vals?{value:vals[s]}:{textContent:'',className:'',disabled:false};
vm.runInContext("globalThis.__dl=downloadCSV;globalThis.__cm=closeModal;closeModal=()=>{};downloadCSV=(rows,name)=>{globalThis.__csv={rows,name}}",context);
vm.runInContext("exportSales()",context);assert(context.capture.includes('Elige el periodo')&&context.capture.includes('rp-desde')&&context.capture.includes('rp-hasta'),'pide periodo');
vm.runInContext("globalThis.__csv=null;globalThis.lastToast='';downloadReport()",context);assert.equal(vm.runInContext("__csv",context),null,'sin fechas no descarga');assert.match(vm.runInContext("lastToast",context),/Elige las fechas/);
vals['#rp-desde']='2026-11-05';vals['#rp-hasta']='2026-11-01';vm.runInContext("downloadReport()",context);assert.equal(vm.runInContext("__csv",context),null,'periodo al revés no descarga');
vals['#rp-desde']='2000-01-01';vals['#rp-hasta']=vm.runInContext("today()",context);vals['#rp-doc']='boleta';vm.runInContext("downloadReport()",context);
const out=vm.runInContext("__csv",context);assert(out&&out.name.startsWith('boletas-2000-01-01_a_'),'descarga con el periodo elegido');assert(out.rows.length>1&&out.rows.slice(1).every(r=>r[1]==='Boleta'));
vm.runInContext("downloadCSV=__dl;closeModal=__cm",context);context.document.querySelector=q0;}
console.log('OK catálogo real, palta por kg sin mínimo, perfil contador de solo lectura con periodo desde-hasta');
// Reunión 2 (b): tomate pera, crédito por checkbox con autorización del admin.
{const run=c=>vm.runInContext(c,context);
run("localStorage.setItem=()=>{};toast=m=>{globalThis.lastToast=m};modal=(h)=>{capture=h};closeModal=()=>{}");
assert(run("S.products.some(p=>p.sku==='TOM-PER'&&p.activo)"),'tomate pera vuelve al catálogo');
assert(run("creditTotal()>0&&debtors().length>=2"),'créditos de demostración');

const fake={value:'',textContent:'',checked:true,disabled:false,isConnected:true,querySelectorAll(){return []}},qs=context.document.querySelector;
context.document.querySelector=s=>s==='#root'?root:fake;
// vendedor: checkbox de crédito, monto parcial y cliente; sin autorización no se puede vender
run("me=S.users.find(u=>u.usuario==='gonzalo');view='pos';globalThis.tom=S.products.find(p=>p.sku==='TOM-C9');ui.cart=[{prod:tom.id,qty:3}];ui.gamTrae=3;ui.pago='efectivo';render()");
assert(root.innerHTML.includes('<b>Crédito</b>'),'checkbox de crédito');assert(!root.innerHTML.includes('Cliente al que se le fía'));
run("globalThis.T=3*tom.precio;toggleCredit(true,T)");
assert(root.innerHTML.includes('¿Cuánto paga ahora?')&&root.innerHTML.includes('Nombre del cliente'),'aparecen monto y cliente');
assert.equal(run("ui.creditoPaga"),0,'por defecto paga 0: todo a crédito');assert(root.innerHTML.includes('¿Cuánto paga ahora?'));assert(!/fiad|frecuente/i.test(root.innerHTML),'solo dice crédito');
run("ui.creditoPaga=20000;ui.clienteNombre='sergio';render()");
assert(root.innerHTML.includes('Pedir autorización a Luis'));assert(root.innerHTML.includes('Paga ahora'));
run("globalThis.n0=S.sales.length;prepareCheckout()");assert.match(context.lastToast,/autorice/);
run("requestCredit()");assert.equal(run("pendingCreditRequests().length"),1);assert(root.innerHTML.includes('Esperando autorización'));
run("prepareCheckout()");assert.match(context.lastToast,/esperando/);
// admin ve el aviso y rechaza; luego autoriza otra solicitud
run("globalThis.cart=ui.cart;me=S.users.find(u=>u.rol==='admin');view='dash';render()");
assert(root.innerHTML.includes('autorización de crédito')&&root.innerHTML.includes('a Sergio'),'aviso para Luis con el nombre del cliente frecuente');
run("resolveCreditRequest(pendingCreditRequests()[0].id,false);me=S.users.find(u=>u.usuario==='gonzalo');view='pos';render()");
assert(root.innerHTML.includes('rechazó'));
run("requestCredit();me=S.users.find(u=>u.rol==='admin');resolveCreditRequest(pendingCreditRequests()[0].id,true);me=S.users.find(u=>u.usuario==='gonzalo');render()");
assert(root.innerHTML.includes('Crédito autorizado'));
// si cambia el monto, la autorización ya no sirve
run("ui.creditoPaga=10000;prepareCheckout()");assert.match(context.lastToast,/autorice/);
run("ui.creditoPaga=20000;globalThis.deuda0=creditBalance('c1');prepareCheckout();commitCheckout(checkoutDraft.key)");
const cs=run("S.sales[S.sales.length-1]");
assert.equal(cs.cliente,'c1','se asocia al cliente existente por nombre');assert.equal(cs.total,context.T);
assert.deepEqual(cs.pagos.map(p=>p.medio+':'+p.monto),['efectivo:20000','credito:'+(context.T-20000)]);
assert.equal(run("creditBalance('c1')"),context.deuda0+context.T-20000);
assert.equal(run("S.creditRequests.find(r=>r.saleId===S.sales[S.sales.length-1].id).estado"),'usada','la autorización se consume');
assert.equal(run("ui.credito"),false,'el formulario se limpia');
// admin fía directo a un cliente nuevo, todo a crédito
run("me=S.users.find(u=>u.rol==='admin');view='pos';ui.cart=[{prod:tom.id,qty:1}];ui.gamTrae=1;toggleCredit(true,tom.precio);ui.clienteNombre='Don Pedro';render()");
assert(!root.innerHTML.includes('Pedir autorización'));assert(root.innerHTML.includes('Cliente nuevo'));assert(!root.innerHTML.includes('Medio de pago de lo que paga'),'sin medio de pago si todo es crédito');
run("prepareCheckout();commitCheckout(checkoutDraft.key)");
assert(run("findClientByName('don pedro')"),'cliente nuevo creado en créditos');assert.equal(run("creditBalance(findClientByName('Don Pedro').id)"),run("tom.precio"));
// gamelas anónimas: se cobra lo que se lleva menos lo que trae; si trae de más, se descuenta de la compra
run("ui.credito=false;ui.creditoPaga=0;ui.clienteNombre='';ui.cart=[{prod:tom.id,qty:7}];ui.gamExtra=0;ui.gamTrae=4;ui.pago='efectivo';render();globalThis.g0=prodStock(gamId())");
assert.equal(run("gamProd().precio"),1000,'garantía fija de $1.000');
assert(root.innerHTML.includes('Cobrar 3 gamelas'),'cobra solo las 3 extra');
run("prepareCheckout();commitCheckout(checkoutDraft.key)");
const gs=run("S.sales[S.sales.length-1]");
assert.equal(gs.total,7*context.tom.precio+3000);assert.deepEqual(gs.gamelas,{lleva:7,trae:4});
assert.equal(run("prodStock(gamId())"),context.g0-3,'salen 3 gamelas netas del stock');
assert.equal(run("ui.gamTrae"),0,'el bloque de gamelas se limpia');
run("ui.cart=[{prod:tom.id,qty:2}];ui.gamTrae=5;render();globalThis.g1=prodStock(gamId())");
assert(root.innerHTML.includes('Devuelve 3 gamelas de más'),'trae más de las que se lleva');
run("prepareCheckout();commitCheckout(checkoutDraft.key)");
const gd=run("S.sales[S.sales.length-1]");
assert.equal(gd.total,2*context.tom.precio-3000,'se descuenta de la compra');
assert.equal(run("lineName(S.sales[S.sales.length-1].lineas.at(-1))"),'Devolución de gamelas');
assert.equal(run("prodStock(gamId())"),context.g1+3,'las gamelas devueltas vuelven al stock');
// palta usa gamelas pero se vende por kilo: el vendedor suma las gamelas a mano
run("ui.cart=[{prod:S.products.find(p=>p.sku==='PAL-I').id,qty:20}];ui.gamExtra=2;ui.gamTrae=0;render()");
assert(root.innerHTML.includes('Cobrar 2 gamelas'));
// el descuento no puede ser igual o mayor que la compra
run("ui.cart=[{prod:S.products.find(p=>p.sku==='PAL-GRA').id,qty:1}];ui.gamExtra=0;ui.gamTrae=5;render()");
assert(root.innerHTML.includes('tiene que ser menor que la compra'));assert(/disabled onclick="confirmSale/.test(root.innerHTML));
run("prepareCheckout()");assert.match(context.lastToast,/menor que la compra/);
// gamelas vacías sueltas sin otro producto
run("ui.cart=[];ui.gamExtra=2;ui.gamTrae=0;render()");assert(!/disabled onclick="confirmSale/.test(root.innerHTML),'se pueden vender gamelas vacías solas');
run("ui.gamExtra=0;ui.cart=[]");
// balance separa gamelas cobradas y descontadas
run("view='bal';render()");assert(root.innerHTML.includes('Gamelas (garantía neta)')&&root.innerHTML.includes('Descontadas (las trajo el cliente)'));
run("view='pos'");
// precio especial por una venta: el vendedor lo pide, Luis lo ve arriba y en la campana, autoriza o rechaza; se consume al vender
{const setPrice=v=>{context.document.querySelector=q=>q==='#root'?root:q==='#pe-precio'?{value:String(v),focus(){}}:fake};
run("me=S.users.find(u=>u.usuario==='gonzalo');view='pos';ui.credito=false;ui.cart=[{prod:tom.id,qty:4}];ui.gamExtra=0;ui.gamTrae=4;ui.pago='efectivo';render()");
assert(root.innerHTML.includes('Pedir otro precio'),'botón para pedir otro precio');
run("openItem(tom.id)");assert(context.capture.includes('addItem(true)')&&context.capture.includes('Pedir otro precio'),'también al elegir la cantidad');
run("openItem(gamId())");assert(!context.capture.includes('addItem(true)'),'gamelas sin otro precio');
run("priceForm(0)");assert(context.capture.includes('Solo vale para esta venta')&&context.capture.includes('Pedir autorización a Luis'));
setPrice(run("tom.precio"));run("savePrice(0)");assert.match(context.lastToast,/mismo precio/);
const esp=run("tom.precio-2000");setPrice(esp);run("savePrice(0)");
assert.equal(run("pendingPriceRequests().length"),1);run("render()");assert(root.innerHTML.includes('Esperando a Luis'));assert(/disabled onclick="confirmSale/.test(root.innerHTML),'no se vende mientras espera');
run("prepareCheckout()");assert.match(context.lastToast,/esperando la autorización/);
context.document.querySelector=s=>s==='#root'?root:fake;
run("me=S.users.find(u=>u.rol==='admin');view='dash';render()");
assert(root.innerHTML.includes('cambiar un precio')&&root.innerHTML.includes("resolvePriceRequest("),'aviso arriba para Luis');assert(!root.innerHTML.includes('showAlerts'),'sin campana');
run("resolvePriceRequest(pendingPriceRequests()[0].id,false);me=S.users.find(u=>u.usuario==='gonzalo');view='pos';render()");assert(root.innerHTML.includes('Luis rechazó'));
assert.equal(run("cartPrice(ui.cart[0])"),run("tom.precio"),'rechazado: precio normal');
setPrice(esp);run("savePrice(0);me=S.users.find(u=>u.rol==='admin');resolvePriceRequest(pendingPriceRequests()[0].id,true);me=S.users.find(u=>u.usuario==='gonzalo');render()");
assert(root.innerHTML.includes('Precio autorizado'));assert.equal(run("cartPrice(ui.cart[0])"),esp);
context.document.querySelector=s=>s==='#root'?root:fake;
run("prepareCheckout();commitCheckout(checkoutDraft.key)");const ps=run("S.sales[S.sales.length-1]");
assert.equal(ps.lineas[0].precio,esp);assert.equal(ps.lineas[0].precioNormal,run("tom.precio"));assert.equal(ps.total,4*esp);
assert.equal(run("S.priceRequests.at(-1).estado"),'usada','se consume en esa venta');assert.equal(run("tom.precio"),esp+2000,'el precio del producto no cambia');
// no se reutiliza: otra venta igual vuelve al precio normal
run("ui.cart=[{prod:tom.id,qty:4,priceReq:S.priceRequests.at(-1).id}];ui.gamTrae=4;render()");assert.equal(run("cartPrice(ui.cart[0])"),run("tom.precio"));
// un vendedor no puede colar un precio sin autorización
assert.throws(()=>run("registerSaleCommand({key:'x-esp',user:me.id,items:[{prod:tom.id,qty:1,precio:100,precioEsp:true}],documento:'boleta',receptor:null,payments:[{medio:'efectivo',monto:100}],paymentConfirmed:true})"),/autorización/);
// Luis lo aplica directo
setPrice(esp);run("me=S.users.find(u=>u.rol==='admin');ui.cart=[{prod:tom.id,qty:4}];render();savePrice(0);render()");assert(root.innerHTML.includes('Precio especial'));
context.document.querySelector=s=>s==='#root'?root:fake;
run("prepareCheckout();commitCheckout(checkoutDraft.key)");assert.equal(run("S.sales.at(-1).lineas[0].precio"),esp);
run("ui.cart=[];ui.gamTrae=0;render()")}
// solicitud de anulación del vendedor: Luis la ve arriba y en la campana
run("me=S.users.find(u=>u.usuario==='gonzalo');globalThis.vs=S.sales.filter(s=>s.vendedor===me.id&&vig(s)&&!s.reversal&&!s.solicitud).at(-1);requestReversalCommand(vs.id,'se equivocó de producto')");
run("me=S.users.find(u=>u.rol==='admin');view='inv';render()");
assert(root.innerHTML.includes('anular una venta')&&root.innerHTML.includes('se equivocó de producto')&&root.innerHTML.includes(`voidSale('${run("vs.id")}')`),'aviso de anulación para Luis');

// la venta en curso no se pierde al recargar (se guarda por usuario)
{const store=new Map();run("globalThis.__ls=localStorage");context.__mem={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
run("localStorage=__mem;me=S.users.find(u=>u.usuario==='gonzalo');view='pos';ui.cart=[{prod:tom.id,qty:2,priceReq:'pq-x'}];ui.credito=true;ui.creditoPaga=5000;ui.clienteNombre='Sergio';ui.creditReq='cq-x';render()");
run("Object.assign(ui,POS_DEFAULT());loadPosDraft()");
assert.equal(run("ui.cart.length"),1);assert.equal(run("ui.cart[0].priceReq"),'pq-x');assert.equal(run("ui.creditReq"),'cq-x');assert.equal(run("ui.clienteNombre"),'Sergio');
run("logout()");assert.equal(run("ui.cart.length"),0,'al salir no queda el carrito para el siguiente');
run("me=S.users.find(u=>u.rol==='admin');loadPosDraft()");assert.equal(run("ui.cart.length"),0,'cada usuario tiene su propia venta');
run("me=S.users.find(u=>u.usuario==='gonzalo');loadPosDraft()");assert.equal(run("ui.cart.length"),1);
run("Object.assign(ui,POS_DEFAULT());localStorage=__ls;me=S.users.find(u=>u.rol==='admin')")}
context.document.querySelector=s=>s==='#root'?root:fake;
// cierre de caja del vendedor: lo vendido a crédito no entra a la caja
run("me=S.users.find(u=>u.usuario==='gonzalo');view='caja';render()");assert(root.innerHTML.includes('Vendido a crédito'));
const espBefore=run("S.sales.filter(s=>s.vendedor===me.id&&activeFinancialSale(s)&&!s.cierre).reduce((a,s)=>a+saleCash(s),0)");
const fiadoBefore=run("S.sales.filter(s=>s.vendedor===me.id&&activeFinancialSale(s)&&!s.cierre).reduce((a,s)=>a+saleCredit(s),0)");
// el vendedor no ve el módulo Créditos ni puede registrar pagos de deuda
assert(!run("menu().some(m=>m.id==='credits')"),'vendedor sin módulo créditos');
run("go('credits')");assert(!root.innerHTML.includes('Total por cobrar'));
context.document.querySelector=s=>s==='#root'?root:s==='#ab-monto'?{value:'10000'}:s==='#ab-medio'?{value:'efectivo'}:fake;
run("globalThis.d0=creditBalance('c1');saveAbono('c1')");assert.equal(run("creditBalance('c1')"),context.d0);assert.match(context.lastToast,/Solo Luis/);
context.document.querySelector=s=>s==='#root'?root:s==='#opening'?{value:'0'}:s==='#dec'?{value:String(espBefore)}:fake;
run("closeShift()");const k=run("S.closures[S.closures.length-1]");
assert.equal(k.esperado,espBefore);assert.equal(k.fiado,fiadoBefore,'lo vendido a crédito no entra a la caja');assert.equal(k.diferencia,0);
// Luis registra pagos de deuda: entran a su caja
run("me=S.users.find(u=>u.rol==='admin')");
context.document.querySelector=s=>s==='#root'?root:s==='#ab-monto'?{value:'10000'}:s==='#ab-medio'?{value:'efectivo'}:fake;
run("globalThis.d1=creditBalance('c1');saveAbono('c1')");assert.equal(run("creditBalance('c1')"),context.d1-10000);
assert(run("moneyEntries().some(e=>e.abono&&e.user===me.id&&e.monto===10000)"),'el pago entra a la caja de Luis');
context.document.querySelector=s=>s==='#root'?root:s==='#ab-monto'?{value:'999999999'}:s==='#ab-medio'?{value:'efectivo'}:fake;
run("saveAbono('c1')");assert.match(context.lastToast,/supera la deuda/);
context.document.querySelector=qs;
run("go('credits')");assert(root.innerHTML.includes('Total por cobrar'));assert(root.innerHTML.includes('🪙'),'ícono moneda');
assert(/onclick="event.stopPropagation\(\);abonoForm\('c1'\)">Pagar</.test(root.innerHTML),'botón Pagar en cada deudor');
run("abonoForm('c1')");assert(context.capture.includes('Pagar deuda')&&context.capture.includes('Paga todo')&&context.capture.includes('Paga una parte'));assert(context.capture.includes('<option value="tarjeta">Tarjeta</option>')&&!context.capture.includes('ab-ref'),'pagar deuda con tarjeta y sin referencia');
context.document.querySelector=s=>s==='#root'?root:s==='#ab-monto'?{value:String(run("creditBalance('c1')"))}:s==='#ab-medio'?{value:'tarjeta'}:fake;
run("saveAbono('c1')");assert.equal(run("creditBalance('c1')"),0,'deuda saldada');assert.match(context.lastToast,/saldada/);
context.document.querySelector=qs;run("render()");assert(!/fiad/i.test(root.innerHTML));
// borrar clientes de crédito: solo sin deuda; se ocultan pero las ventas antiguas conservan el nombre
run("go('credits')");assert(root.innerHTML.includes("deleteClient('c1')"),'botón borrar en Al día');
assert(!/class="head"><div><h1>[^<]*<\/h1><p>/.test(root.innerHTML),'módulos sin descripción');
{const deudor=run("debtors()[0]?.id");if(deudor){run(`globalThis.lastToast='';deleteClient('${deudor}')`);assert.match(context.lastToast,/pagar su deuda/);run(`confirmDeleteClient('${deudor}')`);assert(!run(`CL('${deudor}').borrado`),'no se borra con deuda')}}
run("deleteClient('c1')");assert(context.capture.includes('¿Borrar a'));run("confirmDeleteClient('c1')");
assert(run("!!CL('c1').borrado"));assert(!run("liveClients().some(c=>c.id==='c1')"));run("go('credits')");assert(!root.innerHTML.includes("creditDetail('c1')"),'ya no aparece en Créditos');
assert(run("S.sales.filter(s=>s.cliente==='c1').every(s=>CL(s.cliente).nombre!=='(cliente no encontrado)')"),'ventas antiguas conservan el nombre');
assert.throws(()=>run("makeSale({vendedor:me.id,items:[],pago:'credito',cliente:'c1'})"),/cliente/);
run("view='dash';render()");assert(root.innerHTML.includes('Créditos por cobrar'));
run("me=S.users.find(u=>u.rol==='contador');go('credits')");assert(!root.innerHTML.includes('Total por cobrar'));
// el vendedor solo ve sus ventas
run("me=S.users.find(u=>u.usuario==='samuel');ui.salesTab='list';sf={desde:'',hasta:'',vend:'',medio:''};view='sales';render()");
const otherSale=run("S.sales.find(s=>s.vendedor!==me.id).id"),ownNums=run("S.sales.filter(s=>s.vendedor===me.id).map(s=>s.num)");
assert(!run(`S.sales.filter(s=>s.vendedor!==me.id).some(s=>document.querySelector('#root').innerHTML.includes("receipt('"+s.id+"')"))`),'no aparecen ventas de otros');
run(`globalThis.lastToast='';receipt('${otherSale}')`);assert.match(context.lastToast,/No se encontró/);
// el vendedor cambia su contraseña: máximo 2 veces por día
run("render()");assert(root.innerHTML.includes('Cambiar contraseña'));
const pw=(o,n,r)=>{context.document.querySelector=s=>s==='#root'?root:s==='#pw-old'?{value:o}:s==='#pw-new'?{value:n}:s==='#pw-rep'?{value:r}:fake;run("savePw()")};
context.setTimeout=()=>0;run("pwForm()");assert(context.capture.includes('Contraseña actual'));
pw('mala','abcd','abcd');assert.equal(run("me.clave"),'2222','clave actual incorrecta no cambia');
pw('2222','ab','ab');assert.equal(run("me.clave"),'2222','mínimo 4');
pw('2222','abcd','abce');assert.equal(run("me.clave"),'2222','deben coincidir');
pw('2222','abcd','abcd');assert.equal(run("me.clave"),'abcd');
pw('abcd','wxyz','wxyz');assert.equal(run("me.clave"),'wxyz');assert.match(context.lastToast,/Ya no puedes/);
pw('wxyz','qrst','qrst');assert.equal(run("me.clave"),'wxyz','tercer cambio del día bloqueado');
run("globalThis.lastToast='';pwForm()");assert.match(context.lastToast,/2 veces hoy/);
context.document.querySelector=qs;
run("render()");assert(!root.innerHTML.includes('pw-btn'),'sin botón de clave arriba');assert(root.innerHTML.includes('Cambiar contraseña'),'vendedor: clave en el menú');
run("me=S.users.find(u=>u.rol==='admin');render()");assert(root.innerHTML.includes('pwForm()')&&!root.innerHTML.includes('pw-btn'),'Luis: clave en el menú, no arriba');
{const adm=run("me.clave");context.setTimeout=()=>0;const qs2=context.document.querySelector;
for(const n of ['adm1','adm2','adm3']){context.document.querySelector=s=>s==='#root'?root:s==='#pw-old'?{value:run("me.clave")}:s==='#pw-new'?{value:n}:s==='#pw-rep'?{value:n}:fake;run("savePw()")}
assert.equal(run("me.clave"),'adm3','admin sin límite diario');assert.equal(run("S.users.find(u=>u.rol==='admin').clave"),'adm3');context.document.querySelector=qs2;assert.notEqual(adm,'adm3')}
// medios de pago: sin referencias; mixto con dos medios cualesquiera
context.document.querySelector=s=>s==='#root'?root:fake;
run("me=S.users.find(u=>u.rol==='admin');view='pos';ui.credito=false;ui.cart=[{prod:tom.id,qty:2}];ui.gamExtra=0;ui.gamTrae=2;ui.pago='tarjeta';render()");
assert(!root.innerHTML.includes('payment-ref-')&&!root.innerHTML.includes('Referencia'),'tarjeta sin referencia');
run("ui.pago='mixto';render()");assert(root.innerHTML.includes('Primer medio')&&root.innerHTML.includes('Segundo medio'));
run("setMixed(1,'tarjeta');setMixed(2,'transferencia');ui.pagoEf=15000;render()");assert(root.innerHTML.includes('Monto en tarjeta'));
run("prepareCheckout();commitCheckout(checkoutDraft.key)");
assert.deepEqual(run("S.sales.at(-1).pagos.map(p=>p.medio+':'+p.monto)"),['tarjeta:15000','transferencia:'+(2*context.tom.precio-15000)],'mixto tarjeta + transferencia, sin efectivo');
run("ui.pago='mixto';setMixed(1,'transferencia');setMixed(2,'transferencia')");assert.deepEqual(run("mixedPair()"),['efectivo','transferencia'],'elegir el mismo medio intercambia: nunca se repite');
run("ui.pago='efectivo';ui.cart=[];ui.gamTrae=0;ui.pagoEf=0");
context.document.querySelector=qs;
// dashboard: sin atajos de recepción ni reportes; cada tarjeta lleva a su módulo
run("me=S.users.find(u=>u.rol==='admin');view='dash';render()");
assert(!/Recepción<\/button>|>Reportes<\/button>/.test(root.innerHTML),'sin atajos de recepción ni reportes');
assert((root.innerHTML.match(/class="card[^"]*shortcut/g)||[]).length>=9,'tarjetas con atajo');
assert(root.innerHTML.includes(`class="card credit-card" onclick="go('credits')"`));
run("dashGo('sales',{hoy:1,medio:'transferencia'})");assert.equal(run("view"),'sales');assert.equal(run("sf.medio"),'transferencia');assert.equal(run("sf.desde"),run("today()"));
run("dashGo('inv',{fam:'Palta'})");assert.equal(run("view+':'+ui.fam"),'inv:Palta');run("ui.fam='Todas'");
// cierre de caja como módulo; Luis aprueba cierres desde el dashboard
run("me=S.users.find(u=>u.usuario==='gonzalo');view='caja';render()");assert(root.innerHTML.includes('<h1>Cierre de caja</h1>')&&root.innerHTML.includes('Declarar y cerrar turno'));
assert(run("menu().some(m=>m.id==='caja')"),'vendedor ve el módulo');assert(/onclick="go\('caja'\)">[^<]*<span[^>]*>💵<\/span>Caja/.test(root.innerHTML),'Caja en la barra inferior');
assert(/<nav class="bnav">[\s\S]*onclick="pwForm\(\)">[\s\S]*Clave<\/a><\/nav>/.test(root.innerHTML),'Clave en la barra inferior del vendedor');
run("view='sales';render()");assert(!root.innerHTML.includes("salesTab='cierre'"),'el cierre ya no es pestaña del historial');
run("S.closures.push({id:'k-test',vendedor:me.id,turno:'noche',fecha:now(),esperado:1000,declarado:900,transf:500,tarjeta:0,diferencia:-100,aprobado:''});approveClose('k-test')");assert.equal(run("S.closures.at(-1).aprobado"),'','el vendedor no aprueba');
run("me=S.users.find(u=>u.rol==='admin');view='dash';render()");assert(root.innerHTML.includes('por aprobar')&&root.innerHTML.includes("approveClose('k-test')"),'Luis ve el cierre por aprobar en el dashboard');
assert(root.innerHTML.includes(`onclick="go('caja')" aria-label="Ver cierre`),'el aviso lleva a Cierre de caja');
run("approveClose('k-test');render()");assert(!root.innerHTML.includes("approveClose('k-test')"));assert.equal(run("S.closures.at(-1).aprobado"),run("me.id"));
run("moreMenu()");assert(context.capture.includes('Cambiar contraseña')&&context.capture.includes('💵'),'Luis: Más con contraseña y caja');
// transferencias resaltadas; etiquetas de balance e inventario
run("ui.salesTab='list';sf={desde:'',hasta:'',vend:'',medio:'transferencia'};view='sales';render()");assert(root.innerHTML.includes('class="pay-tr"')&&root.innerHTML.includes('row-tr'));
run("view='bal';render()");assert(root.innerHTML.includes('>Ingresos<')&&root.innerHTML.includes('>Egresos<')&&root.innerHTML.includes('Total del período')&&!root.innerHTML.includes('Entradas de la bodega'));
run("view='inv';render()");assert(root.innerHTML.includes('Stock total'));run("view='dash';render()");assert(root.innerHTML.includes('Llegó hoy y stock total'));
// documento: boleta o factura (con todos los datos)
context.document.querySelector=s=>s==='#root'?root:fake;
run("view='pos';ui.cart=[{prod:tom.id,qty:1}];ui.gamTrae=1;render()");assert(root.innerHTML.includes('<label>Documento</label>')&&/>Boleta</.test(root.innerHTML)&&/>Factura</.test(root.innerHTML)&&!root.innerHTML.includes('¿Necesita factura?'));
run("prepareCheckout()");assert(context.capture.includes('<b>Documento:</b> Boleta'),'confirmar con boleta');
run("commitCheckout(checkoutDraft.key)");assert.equal(run("receiptKind(S.sales.at(-1))"),'Boleta');
run("ui.cart=[{prod:tom.id,qty:1}];ui.gamTrae=1;ui.documento='factura';render()");assert(['inv-rut','inv-razonSocial','inv-giro','inv-direccion','inv-comuna','inv-telefono'].every(id=>root.innerHTML.includes(id)),'pide todos los datos de la factura');
run("ui.receptor={rut:'12.345.678-5',razonSocial:'Verdulería Sol',giro:'Comercio',direccion:'Calle 1',comuna:'Cerrillos',telefono:''};prepareCheckout();commitCheckout(checkoutDraft.key)");
assert.equal(run("receiptKind(S.sales.at(-1))"),'Factura');assert.equal(run("S.sales.at(-1).receptor.razonSocial"),'Verdulería Sol');assert.equal(run("ui.documento"),'boleta');
run("view='sales';ui.salesTab='list';sf={desde:'',hasta:'',vend:'',medio:'',doc:'factura'};render()");assert(root.innerHTML.includes('Verdulería Sol')&&root.innerHTML.includes('<th>Cliente</th>'),'facturas con cliente en el historial');run("sf.doc=''");
assert.equal(run("S.cfg.telefonoEmisor"),'+56956109092');
// día de calendario: una venta a la 01:00 cuenta en ese mismo día (no en el anterior)
assert.equal(run("dayKey(new Date(2026,10,5,1,0).getTime())"),'2026-11-05');assert.equal(run("dayKey(new Date(2026,10,4,23,59).getTime())"),'2026-11-04');
run("view='users';render()");assert(!root.innerHTML.includes('Inicio de jornada'),'sin ajuste de jornada');
run("view='users';render()");assert(!/Modelo de boletas|Unidad SII|Operador de tarjeta/.test(root.innerHTML),'ajustes sin campos del SII');
// recepción: coma decimal; la gamela es un producto más que se agrega a mano; comisión por recepción
{const pal=run("S.products.find(p=>p.sku==='PAL-I').id"),k0=run(`prodStock('${pal}')`),g0=run("prodStock(gamId())");
run(`view='rec';ui.recTab='rec';newRecForm();recForm.lineas=[{prod:tom.id,qty:'10',costo:''},{prod:'${pal}',qty:'92,73',costo:''}];render()`);
assert(!root.innerHTML.includes('Gamelas que pasan a la bodega'),'sin gamelas automáticas');assert(root.innerHTML.includes('Gamela (envase)'),'gamela en la lista de productos');assert(root.innerHTML.includes('% comisión'),'comisión en la recepción');
run("saveRec()");assert.equal(run("prodStock(gamId())"),g0,'no suma gamelas solas');const k1=run(`prodStock('${pal}')`);
run(`newRecForm();recForm.comision='12,5';recForm.lineas=[{prod:'${pal}',qty:'92,73',costo:''},{prod:gamId(),qty:'6',costo:''}];saveRec()`);assert(Math.abs(run(`prodStock('${pal}')`)-(k1+92.73))<1e-6,'acepta 92,73');assert.equal(run("prodStock(gamId())"),g0+6,'gamelas agregadas a mano');
assert.equal(run("S.lots.find(l=>l.rec===S.receptions.at(-1).id).comision"),12.5,'comisión guardada en el lote');
run("view='users';render()");assert(!/Garantía por gamela|Comisión por defecto/.test(root.innerHTML),'ajustes sin garantía ni comisión');
run("editProducer()");assert(!/id="p_t"|id="p_c"/.test(run("capture")),'productor sin tipo ni comisión');run("closeModal()");
run("voidRec(S.receptions.at(-1).id)");}
// merma con coma decimal
{const pal=run("S.products.find(p=>p.sku==='PAL-I').id"),k1=run(`prodStock('${pal}')`);run(`mermaF={prod:'${pal}',qty:decIn('1,5')};saveMerma()`);assert(Math.abs(run(`prodStock('${pal}')`)-(k1-1.5))<1e-6,'merma acepta 1,5');}
// sin restos de "fiado", "cliente frecuente" ni control tributario en pantalla
for(const v of ['pos','sales','caja','credits','dash','users']){run(`view='${v}';render()`);assert(!/fiad|fiar|frecuente|tributari[oa]\b(?! ·)|DTE|Control tributario/i.test(root.innerHTML.replace(/NO VÁLIDO TRIBUTARIAMENTE/g,'')),`sin textos viejos en ${v}`)}
console.log('OK tomate pera, crédito por checkbox, autorización del admin (pedir/rechazar/autorizar/consumir), cliente nuevo, abonos y cierre');}
