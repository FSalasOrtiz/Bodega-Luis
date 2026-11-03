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
