/* Local transaction workflow. All tax/payment gateways are deliberately disconnected. */
let checkoutDraft=null,checkoutBusy=false;
function ensureWorkflowState(){
  for(const key of ['operations','refunds','adjustments','fiscalEvents'])S[key]??=[];
  S.workflowRevision??=0;S.workflowSchema=1;
}
function workflowAdmin(){if(!me||!me.activo||me.rol!=='admin')throw new Error('Esta acción requiere administrador.');}
function workflowUser(){if(!me||!me.activo)throw new Error('La sesión no está activa.');}
function workflowTransaction(action){
  ensureWorkflowState();const before=JSON.stringify(S);
  try{
    const persisted=localStorage.getItem(KEY);
    if(persisted&&(JSON.parse(persisted).workflowRevision||0)!==S.workflowRevision)throw new Error('Otra pestaña cambió las operaciones. Recarga y vuelve a revisar.');
    const result=action();S.workflowRevision++;
    try{localStorage.setItem(KEY,JSON.stringify(S))}catch(error){throw new Error('No se pudo guardar la operación; no se completó el cambio. '+error.message)}return result;
  }catch(error){S=JSON.parse(before);throw error;}
}
function workflowEvent(s,type,detail){
  s.workflowEvents??=[];s.workflowEvents.push({id:uid('evt'),type,detail,user:me?.id||'',at:now()});
  if(me&&typeof audit==='function')audit(type,'Venta '+s.num,'',detail);
}
function workflowSale(id){const s=S.sales.find(x=>x.id===id);if(!s)throw new Error('Venta no encontrada.');return s;}
function ensureSaleWorkflow(s){
  if(s.workflowVersion)return s;
  // Legacy records never infer successful remote emission or bank confirmation.
  s.workflowVersion=1;s.legacyWorkflow=true;s.saleState=s.estado==='anulada'?'revertida':'registrada';
  s.paymentState='registrado_sin_verificar';s.workflowEvents=[];
  s.fiscalDocs=[{id:s.id+':documento:legacy',kind:s.documento||'boleta',amount:s.total,state:'sin_verificar',idempotencyKey:s.id+':documento:legacy'}];
  workflowEvent(s,'migracion','Documento y pago históricos pendientes de verificación; no se borran datos.');return s;
}
function fiscalStatus(s){
  if(!s.workflowVersion)return 'Histórico sin verificar';
  const docs=s.fiscalDocs||[];
  if(s.reversal?.state==='pendiente_nota_credito')return 'Nota de crédito pendiente';
  if(s.reversal?.state==='pendiente_verificacion')return 'Conciliación de anulación pendiente';
  if(s.reversal?.state==='completada'&&s.reversal.creditNotes?.length)return 'Revertida con nota de crédito';
  if(s.reversal?.state==='completada'&&docs.some(d=>d.kind==='voucher'))return docs.filter(d=>d.kind==='voucher').every(d=>d.state==='voucher_revertido_verificado')?'Revertida conciliada':'Conciliar voucher revertido';
  if(docs.some(d=>['error','desconocido','sin_verificar','pendiente_conciliacion'].includes(d.state)))return 'Pendiente de conciliación';
  if(docs.length&&docs.every(d=>['emitido','voucher_verificado'].includes(d.state)))return 'Documentada';
  if(docs.length&&docs.every(d=>d.state==='cancelado_sin_emision'))return 'Cancelada sin DTE';
  return 'Documento pendiente';
}
function paymentPlan(draft,total){
  const allowed=['efectivo','transferencia','tarjeta'];
  let parts=draft.payments;
  if(!parts){
    if(draft.pago==='mixto')parts=[{medio:'efectivo',monto:Number(draft.pagoEf)},{medio:draft.mixedSecond||'transferencia',monto:total-Number(draft.pagoEf)}];
    else parts=[{medio:draft.pago,monto:total}];
  }
  parts=parts.map((p,i)=>({id:'p'+i,medio:p.medio,monto:Number(p.monto),reference:String(p.reference??draft.paymentRefs?.[p.medio]??'').trim(),voucherTax:!!p.voucherTax}));
  if(!parts.length||parts.some(p=>!allowed.includes(p.medio)||!Number.isSafeInteger(p.monto)||p.monto<=0)||parts.reduce((n,p)=>n+p.monto,0)!==total)throw new Error('Revisa los componentes del pago: deben sumar exactamente el total.');
  if(new Set(parts.map(p=>p.medio)).size!==parts.length)throw new Error('Los medios del pago mixto deben ser distintos.');
  if(parts.some(p=>p.medio==='tarjeta'&&!p.reference))throw new Error('Registra la referencia de cada pago aprobado por el terminal.');
  return parts;
}
function fiscalPlan(s,payments,config){
  const make=(kind,amount,state='pendiente_integracion',extra={})=>({id:s.id+':'+kind,kind,amount,state,idempotencyKey:s.id+':'+kind,...extra});
  if(s.documento==='factura')return [make('factura',s.total)];
  const cards=payments.filter(p=>p.medio==='tarjeta');
  if(!cards.length||config.modeloBoleta==='siempre_boleta'&&config.modeloReferencia)return [make('boleta',s.total)];
  if(config.modeloBoleta!=='voucher_sustituye'||!config.modeloReferencia||!config.operadorTarjeta||cards.some(p=>!p.voucherTax))return [make('boleta',s.total,'pendiente_conciliacion',{reason:'Verificar modelo declarado, operador y validez tributaria del voucher antes de emitir.'})];
  const amount=payments.filter(p=>p.medio!=='tarjeta').reduce((n,p)=>n+p.monto,0);
  return [...(amount?[make('boleta',amount)]:[]),...cards.map(p=>make('voucher',p.monto,'pendiente_validacion_voucher',{paymentId:p.id,reference:p.reference,operator:config.operadorTarjeta,modelReference:config.modeloReferencia}))];
}
function queueFiscalIntent(s,doc,kind='emitir'){
  const key=kind+':'+doc.idempotencyKey;
  const existing=S.operations.find(o=>o.idempotencyKey===key);if(existing)return existing;
  const op={id:uid('op'),saleId:s.id,documentId:doc.id,kind,idempotencyKey:key,state:'bloqueada_sin_integracion',mustQueryBeforeSend:true,createdAt:now(),attempts:0};
  S.operations.push(op);return op;
}
function registerSaleCommand(draft){
  workflowUser();if(!draft?.key)throw new Error('Confirmación de venta no válida.');
  const fingerprint=JSON.stringify({user:draft.user,items:draft.items,documento:draft.documento,receptor:draft.receptor,payments:draft.payments});
  const old=S.sales.find(s=>s.commandKey===draft.key);
  if(old){if(old.commandFingerprint!==fingerprint||old.vendedor!==me.id)throw new Error('La clave de operación ya corresponde a otra venta.');return old;}
  if(draft.user!==me.id||draft.paymentConfirmed!==true)throw new Error('Confirma primero que recibiste el pago.');
  if(!draft.items?.length||draft.items.some(i=>!P(i.prod)||P(i.prod).precio!==i.precio))throw new Error('Los productos o precios cambiaron. Vuelve a revisar la venta.');
  return workflowTransaction(()=>{
    const requestedPayments=paymentPlan(draft,draft.items.reduce((n,i)=>n+lineTotal(P(i.prod),i.qty),0));
    if(requestedPayments.some(p=>p.medio==='tarjeta'&&S.sales.some(s=>s.pagos.some(old=>old.medio==='tarjeta'&&old.reference===p.reference))))throw new Error('Esa referencia del terminal ya fue usada en otra venta.');
    const s=makeSale({...draft,vendedor:me.id,pago:'efectivo',silent:true});
    s.pagos=paymentPlan(draft,s.total).map(p=>({...p,state:'confirmado_manual',confirmedAt:now()}));
    s.workflowVersion=1;s.saleState='registrada';s.paymentState='confirmado_manual';s.commandKey=draft.key;s.commandFingerprint=fingerprint;
    s.modelSnapshot={modeloBoleta:S.cfg.modeloBoleta||'sin_definir',modeloReferencia:S.cfg.modeloReferencia||'',operadorTarjeta:S.cfg.operadorTarjeta||''};
    s.workflowEvents=[];
    s.fiscalDocs=fiscalPlan(s,s.pagos,s.modelSnapshot);
    s.comprobante=null;s.comprobante=receiptData(s);
    workflowEvent(s,'venta_registrada','Pago confirmado manualmente. La emisión fiscal es un proceso independiente.');
    s.fiscalDocs.filter(d=>d.state==='pendiente_integracion').forEach(d=>queueFiscalIntent(s,d));
    return s;
  });
}
function checkoutItems(){
  const items=ui.cart.map(c=>({prod:c.prod,qty:c.qty,precio:P(c.prod)?.precio}));
  const gamelas=cartQty(gamId());if(gamelas)items.push({prod:gamId(),qty:gamelas,precio:gamProd().precio});return items;
}
function prepareCheckout(){
  try{
    workflowUser();if(checkoutBusy||!ui.cart.length)return;
    const items=checkoutItems();const total=items.reduce((n,i)=>n+lineTotal(P(i.prod),i.qty),0);
    const documento=ui.documento||'boleta';if(documento==='factura'){const error=invoiceRecipientError(ui.receptor);if(error)throw new Error(error);}
    const payments=paymentPlan({pago:ui.pago,pagoEf:ui.pagoEf,mixedSecond:ui.mixedSecond,paymentRefs:ui.paymentRefs},total);
    payments.forEach(p=>{p.voucherTax=!!ui.voucherTax&&p.medio==='tarjeta'});
    checkoutDraft={key:'venta:'+uid('checkout')+':'+now(),user:me.id,items,documento,receptor:documento==='factura'?{...ui.receptor}:null,payments,total,paymentConfirmed:false};
    modal(`<h2>Revisar y confirmar venta</h2><p class="muted">Todavía no se ha registrado la venta ni se ha descontado stock.</p>
      <div class="scroll"><table class="tbl"><thead><tr><th>Producto</th><th>Cantidad</th><th class="right">Importe</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(P(i.prod).nombre)}</td><td>${qtyFmt(i.qty,P(i.prod).unidad)}</td><td class="right num">${clp(lineTotal(P(i.prod),i.qty))}</td></tr>`).join('')}</tbody></table></div>
      <p><b>Documento:</b> ${documento==='factura'?'Factura · '+esc(ui.receptor.razonSocial):'Boleta'}</p>
      ${payments.map(p=>`<p>${receiptPayment(p.medio)}: <b>${clp(p.monto)}</b>${p.reference?' · Ref. '+esc(p.reference):''}</p>`).join('')}
      <div class="total"><span>Total</span><span>${clp(total)}</span></div>
      <label class="gamchk"><input id="checkout-paid" type="checkbox"><span>Confirmo que recibí y verifiqué todos los pagos indicados.</span></label>
      <p class="muted">Sin API activa: el documento queda pendiente. Esta acción no realiza un cobro bancario.</p>
      <div class="acts"><button class="btn ghost" onclick="cancelCheckout()">Volver y corregir</button><button class="btn pri" id="checkout-submit" onclick="commitCheckout('${checkoutDraft.key}')">Registrar venta y preparar documento</button></div>`);
  }catch(error){toast(error.message)}
}
function cancelCheckout(){if(checkoutBusy)return;checkoutDraft=null;closeModal();}
function commitCheckout(key){
  if(checkoutBusy)return;
  const existing=S.sales.find(s=>s.commandKey===key);if(existing){receipt(existing.id);return;}
  if(!checkoutDraft||checkoutDraft.key!==key)return toast('Revisa nuevamente la venta.');
  if(!document.querySelector('#checkout-paid')?.checked)return toast('Debes confirmar que recibiste el pago.');
  checkoutBusy=true;const button=document.querySelector('#checkout-submit');if(button)button.disabled=true;
  try{
    const s=registerSaleCommand({...checkoutDraft,paymentConfirmed:true});checkoutDraft=null;
    ui.cart=[];ui.pago='efectivo';ui.pagoEf=0;ui.documento='boleta';ui.receptor={};ui.paymentRefs={};ui.voucherTax=false;
    closeModal();render();receipt(s.id);
  }catch(error){toast(error.message)}finally{checkoutBusy=false;if(button?.isConnected)button.disabled=false;}
}
function activeFinancialSale(s){return !!s.reversal?.completedAt||s.workflowVersion&&!s.legacyWorkflow||vig(s);}
function revenueEntries(){
  const result=[];
  for(const s of S.sales){
    if(s.reversal?.completedAt){
      result.push({...s,estado:'vigente',entrySign:1});
      result.push({...s,id:s.id+':ajuste',originalSaleId:s.id,fecha:s.reversal.completedAt,estado:'vigente',entrySign:-1,total:-s.total,
        lineas:s.lineas.map(l=>({...l,qty:-l.qty,subtotal:-l.subtotal,allocs:l.allocs.map(a=>({...a,qty:-a.qty}))})),pagos:s.pagos.map(p=>({...p,monto:-p.monto}))});
    }else if(vig(s))result.push({...s,entrySign:1});
  }
  return result;
}
function moneyEntries(){
  ensureWorkflowState();const result=[];
  S.sales.filter(activeFinancialSale).forEach(s=>s.pagos.forEach(p=>result.push({saleId:s.id,user:s.vendedor,fecha:s.fecha,medio:p.medio,monto:p.monto})));
  S.refunds.filter(r=>r.state==='confirmada_manual').forEach(r=>result.push({saleId:r.saleId,user:r.confirmedBy,fecha:r.confirmedAt,medio:r.medio,monto:-r.amount}));
  return result;
}
function initializeRefunds(s,reversal){
  s.pagos.filter(p=>p.monto>0).forEach((p,i)=>{
    const key=reversal.id+':devolucion:'+i;
    if(!S.refunds.some(r=>r.idempotencyKey===key))S.refunds.push({id:key,idempotencyKey:key,saleId:s.id,medio:p.medio,amount:p.monto,state:p.medio==='tarjeta'?'pendiente_operador':'pendiente_confirmacion',originalReference:p.reference||'',createdAt:now()});
  });
  s.paymentState='devolucion_pendiente';
}
function completeCommercialReversal(s){
  const r=s.reversal;if(!r||r.state==='completada')return;
  if(r.completedAt){r.state='completada';s.saleState='revertida';return}
  if(r.returnStock)s.lineas.forEach((l,i)=>l.allocs.forEach((a,j)=>{
    const key=r.id+':stock:'+i+':'+j;
    if(!S.moves.some(m=>m.idempotencyKey===key))S.moves.push({id:uid('m'),idempotencyKey:key,lot:a.lot,prod:l.prod,tipo:'anulación',qty:a.qty,user:r.approvedBy,fecha:now(),motivo:r.reason,ref:s.id});
  }));
  r.state='completada';r.completedAt=now();s.saleState='revertida';s.estado='anulada';s.motivoAnula=r.reason;s.anuladaPor=r.approvedBy;s.solicitud='';
  if(!S.adjustments.some(a=>a.idempotencyKey===r.id)){
    const producers={};s.lineas.forEach(l=>l.allocs.forEach(a=>{const lot=S.lots.find(x=>x.id===a.lot);if(lot?.modalidad==='consignación')producers[lot.productor]=(producers[lot.productor]||0)+Math.round(a.qty*l.precio)}));
    S.adjustments.push({id:uid('aj'),idempotencyKey:r.id,saleId:s.id,originalDate:s.fecha,fecha:r.completedAt,originalClosure:s.cierre||'',total:-s.total,producers,settlements:S.liqs.filter(l=>Object.keys(producers).includes(l.prod)&&(!l.desde||dayKey(s.fecha)>=l.desde)&&(!l.hasta||dayKey(s.fecha)<=l.hasta)).map(l=>l.id),reason:r.reason,user:r.approvedBy});
  }
  workflowEvent(s,'reversion_comercial','Ajuste compensatorio registrado. La devolución del dinero se confirma por separado.');
}
function advanceReversal(s){
  const r=s.reversal;if(!r||r.state==='completada')return;
  const unknown=s.fiscalDocs.some(d=>['sin_verificar','desconocido','enviando','error'].includes(d.state));
  if(unknown){r.state='pendiente_verificacion';return;}
  const issued=s.fiscalDocs.filter(d=>d.state==='emitido');
  for(const d of issued){
    const key=r.id+':nc:'+d.id;
    r.creditNotes??=[];
    if(!r.creditNotes.some(n=>n.idempotencyKey===key)){
      const nc={id:key,idempotencyKey:key,kind:'nota_credito',amount:d.amount,state:'pendiente_integracion',original:{...d.original,documentId:d.id}};
      r.creditNotes.push(nc);queueFiscalIntent(s,nc,'nota_credito');
    }
  }
  if(issued.length&&r.creditNotes.some(n=>n.state!=='emitida')){r.state='pendiente_nota_credito';return;}
  for(const d of s.fiscalDocs){if(['pendiente_integracion','pendiente_conciliacion','no_emitido'].includes(d.state)){d.state='cancelado_sin_emision';S.operations.filter(o=>o.documentId===d.id&&o.kind==='emitir').forEach(o=>{o.state='cancelada_antes_envio'})}}
  completeCommercialReversal(s);
}
function reverseSaleCommand(id,reason,returnStock){
  workflowAdmin();reason=String(reason||'').trim();if(!reason)throw new Error('El motivo es obligatorio.');
  return workflowTransaction(()=>{
    const s=ensureSaleWorkflow(workflowSale(id));if(s.reversal||s.estado==='anulada')return s;
    s.reversal={id:'reversion:'+s.id,state:'solicitada',reason,returnStock:!!returnStock,approvedBy:me.id,createdAt:now(),creditNotes:[]};
    s.saleState='reversion_pendiente';initializeRefunds(s,s.reversal);workflowEvent(s,'reversion_solicitada',reason);
    advanceReversal(s);return s;
  });
}
function requestReversalCommand(id,reason){
  workflowUser();reason=String(reason||'').trim();if(!reason)throw new Error('El motivo es obligatorio.');
  return workflowTransaction(()=>{const s=workflowSale(id);if(s.vendedor!==me.id&&!isAdmin())throw new Error('Solo puedes solicitar la reversión de tus ventas.');if(!vig(s)||s.reversal)throw new Error('Esta venta ya tiene una reversión.');s.solicitud=reason;workflowEvent(s,'solicitud_vendedor',reason);return s;});
}
function confirmRefundCommand(id,reference){
  workflowAdmin();reference=String(reference||'').trim();if(!reference)throw new Error('Registra una referencia o comprobante de la devolución efectiva.');
  return workflowTransaction(()=>{
    const r=S.refunds.find(x=>x.id===id);if(!r)throw new Error('Devolución no encontrada.');if(r.state==='confirmada_manual'){if(r.reference!==reference)throw new Error('La devolución ya se concilió con otra referencia.');return r;}
    if(S.refunds.some(other=>other.id!==r.id&&other.state==='confirmada_manual'&&other.medio===r.medio&&other.reference===reference))throw new Error('Esa referencia de devolución ya fue conciliada.');
    r.reference=reference;r.state='confirmada_manual';r.confirmedAt=now();r.confirmedBy=me.id;
    const s=workflowSale(r.saleId);s.paymentState=S.refunds.filter(x=>x.saleId===s.id).every(x=>x.state==='confirmada_manual')?'devuelto':'devolucion_pendiente';
    workflowEvent(s,'devolucion_conciliada_manual',r.medio+' '+r.amount+' · '+reference);return r;
  });
}
// Future server adapter observations. These reducers never call a network service.
// A production backend MUST authenticate webhooks, verify the actual provider state and enforce uniqueness.
function observeFiscalDocument(saleId,documentId,observation){
  workflowAdmin();if(!observation?.eventId||observation.verified!==true||!observation.provider)throw new Error('Falta una consulta de estado verificada del proveedor.');
  return workflowTransaction(()=>{
    if(S.fiscalEvents.some(e=>e.id===observation.eventId))return workflowSale(saleId);
    const s=ensureSaleWorkflow(workflowSale(saleId)),d=s.fiscalDocs.find(d=>d.id===documentId);
    if(!d)throw new Error('Documento no encontrado.');
    if(!['emitido','no_emitido','desconocido','error','voucher_verificado','voucher_revertido_verificado'].includes(observation.state))throw new Error('Estado externo no válido.');
    if(d.state==='emitido'&&observation.state!=='emitido')throw new Error('No se puede sobrescribir un DTE emitido.');
    if(observation.state==='emitido'){
      const o=observation.original;
      if(!o?.folio||!o.tipo||!o.rutEmisor||!o.fecha||!observation.providerDocumentId||Number(o.monto)!==d.amount)throw new Error('Falta la identificación completa del DTE original.');
      if(!({boleta:[39,41],factura:[33,34]}[d.kind]||[]).includes(Number(o.tipo)))throw new Error('Tipo DTE incompatible con el documento solicitado.');
      if(cleanRut(o.rutEmisor)!==cleanRut(receiptData(s).emisor.rut))throw new Error('El emisor no coincide con la venta.');
      if(S.sales.some(other=>other.id!==s.id&&(other.fiscalDocs||[]).some(x=>x.original&&String(x.original.folio)===String(o.folio)&&Number(x.original.tipo)===Number(o.tipo)&&cleanRut(x.original.rutEmisor)===cleanRut(o.rutEmisor))))throw new Error('Ese DTE ya está asociado a otra venta.');
      if(d.providerDocumentId&&d.providerDocumentId!==observation.providerDocumentId)throw new Error('La referencia remota del DTE es inmutable.');
      if(d.original&&JSON.stringify(d.original)!==JSON.stringify(o))throw new Error('El DTE original es inmutable.');
      d.original={...o};d.providerDocumentId=observation.providerDocumentId;
    }
    if(['voucher_verificado','voucher_revertido_verificado'].includes(observation.state)&&(d.kind!=='voucher'||observation.reference!==d.reference||observation.operator!==d.operator||Number(observation.amount)!==d.amount))throw new Error('La referencia, operador o monto del voucher no coinciden.');
    if(d.state==='cancelado_sin_emision'&&observation.state==='emitido'){
      // A late external issuance requires a credit-note workflow; never silently delete it.
      d.state='emitido';s.reversal.state='pendiente_nota_credito';s.saleState='revertida_con_documento_pendiente';
    }else d.state=observation.state;
    d.lastObservation={...observation,observedAt:now()};S.fiscalEvents.push({id:observation.eventId,saleId,documentId,at:now()});
    S.operations.filter(o=>o.documentId===d.id).forEach(o=>{o.lastObservedState=observation.state;o.lastObservedAt=now();if(['emitido','voucher_verificado'].includes(observation.state))o.state='conciliada'});
    workflowEvent(s,'consulta_documento',observation.state);if(s.reversal)advanceReversal(s);return s;
  });
}
function observeCreditNote(saleId,noteId,observation){
  workflowAdmin();if(!observation?.eventId||observation.verified!==true||!observation.provider||!['emitida','error','desconocido'].includes(observation.state))throw new Error('Falta consulta verificada del estado de la nota de crédito.');
  return workflowTransaction(()=>{
    const s=workflowSale(saleId);if(S.fiscalEvents.some(e=>e.id===observation.eventId))return s;
    const n=s.reversal?.creditNotes.find(n=>n.id===noteId);if(!n)throw new Error('Nota de crédito no encontrada.');
    if(n.state==='emitida'){if(observation.state!=='emitida'||n.folio!==observation.folio)throw new Error('La nota de crédito emitida es inmutable.');return s;}
    if(observation.state==='emitida'){
      if(!observation.folio||Number(observation.tipo)!==61||Number(observation.monto)!==n.amount||observation.originalDocumentId!==n.original.documentId||String(observation.originalFolio)!==String(n.original.folio)||Number(observation.originalTipo)!==Number(n.original.tipo))throw new Error('La nota de crédito no coincide con el monto y DTE original.');
      n.state='emitida';n.folio=observation.folio;
    }else n.state='error_conciliacion';
    n.observation={...observation};S.fiscalEvents.push({id:observation.eventId,saleId,noteId,at:now()});
    S.operations.filter(o=>o.documentId===n.id).forEach(o=>{o.lastObservedState=observation.state;if(observation.state==='emitida')o.state='conciliada'});
    workflowEvent(s,'nota_credito_consultada',observation.state);advanceReversal(s);return s;
  });
}
function prepareFiscalCommand(id){
  workflowAdmin();return workflowTransaction(()=>{
    const s=ensureSaleWorkflow(workflowSale(id));
    for(const d of s.fiscalDocs){
      if(['emitido','voucher_verificado','voucher_revertido_verificado','cancelado_sin_emision'].includes(d.state))continue;
      if(d.kind==='voucher'||['sin_verificar','desconocido','error','enviando','pendiente_conciliacion'].includes(d.state))queueFiscalIntent(s,d,'consultar');
      else queueFiscalIntent(s,d);
    }
    for(const n of s.reversal?.creditNotes||[]){if(n.state!=='emitida')queueFiscalIntent(s,n,'consultar_nota_credito')}
    workflowEvent(s,'preparacion_documentos','Integración desconectada; no se emitió ni se reintentó un envío.');return s;
  });
}
function rejectReversalRequest(id,reason){workflowAdmin();return workflowTransaction(()=>{const s=workflowSale(id);if(!s.solicitud)throw new Error('No hay solicitud pendiente.');if(!String(reason).trim())throw new Error('El motivo es obligatorio.');workflowEvent(s,'solicitud_rechazada',reason+' · Solicitud: '+s.solicitud);s.solicitud='';return s;});}
function workflowRefundDialog(id){
  const r=S.refunds?.find(r=>r.id===id);if(!r)return;
  askReason('Conciliar devolución '+receiptPayment(r.medio),`Confirma solo después de devolver ${clp(r.amount)}. ${r.medio==='tarjeta'?'Exige comprobante de reversa o devolución del operador; anular la venta no devuelve el dinero.':'Registra la referencia de la salida de caja o transferencia.'} Es una conciliación manual, sin consulta bancaria.`,ref=>{
    try{confirmRefundCommand(id,ref);closeModal();render();toast('Devolución conciliada manualmente.')}catch(e){toast(e.message)}
  });
}
function workflowFiscalPrepare(id){try{prepareFiscalCommand(id);render();toast('Solicitud preparada. Integración desconectada: no se ha emitido ningún documento.')}catch(e){toast(e.message)}}
function workflowDetail(id){
  const s=workflowSale(id),refunds=(S.refunds||[]).filter(r=>r.saleId===id);
  modal(`<h2>Control de venta ${s.num}</h2><p><b>Venta:</b> ${esc(workflowLabel(s.saleState||s.estado))} · <b>Pago:</b> ${esc(workflowLabel(s.paymentState||'histórico sin verificar'))}</p><p><b>Tributario:</b> ${esc(fiscalStatus(s))}</p>
    ${(s.fiscalDocs||[]).map(d=>`<p>${esc(d.kind)} · ${clp(d.amount)} · ${esc(workflowLabel(d.state))}${d.reference?' · Ref. '+esc(d.reference):''}${d.original?' · DTE '+esc(d.original.tipo)+' / '+esc(d.original.folio):''}</p>`).join('')}
    ${s.reversal?`<p><b>Reversión:</b> ${esc(workflowLabel(s.reversal.state))} · ${esc(s.reversal.reason)} · Stock: ${s.reversal.returnStock?'reintegro solicitado':'sin reintegro'}</p>`:''}
    ${(s.reversal?.creditNotes||[]).map(n=>`<p>Nota de crédito: ${esc(workflowLabel(n.state))} · referencia ${esc(n.original.tipo)} / ${esc(n.original.folio)}</p>`).join('')}
    <h3>Devoluciones</h3>${refunds.map(r=>`<p>${receiptPayment(r.medio)} · ${clp(r.amount)} · ${esc(workflowLabel(r.state))}${r.reference?' · '+esc(r.reference):''} ${r.state!=='confirmada_manual'?`<button class="btn sm" onclick="workflowRefundDialog('${r.id}')">Conciliar devolución efectiva</button>`:''}</p>`).join('')||'<p class="muted">No hay devoluciones solicitadas.</p>'}
    <h3>Historial</h3><div class="rows">${(s.workflowEvents||[]).map(e=>`<div><div class="grow"><b>${esc(e.type)}</b><span>${fdt(e.at)} · ${esc(U(e.user).nombre)} · ${esc(e.detail)}</span></div></div>`).join('')||'<p>Sin eventos nuevos.</p>'}</div>
    <div class="acts"><button class="btn ghost" onclick="closeModal()">Cerrar</button></div>`,true);
}
let workflowFilter='todos',workflowPage=0;
function viewFiscalControl(){
  if(!isAdmin())return head('Acceso restringido','Este control requiere administrador.');
  ensureWorkflowState();
  const q=searchText(ui.q||'');
  const all=[...S.sales].sort((a,b)=>b.fecha-a.fecha),filtered=all.filter(s=>!q||searchText(String(s.num)+' '+(s.comprobante?.receptor?.razonSocial||'')).includes(q)).filter(s=>workflowFilter==='todos'||workflowFilter==='solicitudes'&&s.solicitud||workflowFilter==='anuladas'&&!vig(s)||workflowFilter==='documentadas'&&fiscalStatus(s)==='Documentada'||workflowFilter==='pendientes'&&needsFiscalReconciliation(s)||workflowFilter==='errores'&&(s.fiscalDocs||[]).some(d=>['error','desconocido','pendiente_conciliacion','sin_verificar'].includes(d.state))||workflowFilter==='devoluciones'&&S.refunds.some(r=>r.saleId===s.id&&r.state!=='confirmada_manual'));
  workflowPage=Math.max(0,Math.min(workflowPage,Math.ceil(filtered.length/50)-1));
  return head('Control tributario y reversiones','Emisión, cobro y devolución son estados independientes. Control local de este navegador; sin servicios conectados.')+
    `<div class="card"><div class="tabs">${['todos','pendientes','documentadas','anuladas','solicitudes','errores','devoluciones'].map(f=>`<button class="btn sm ${workflowFilter===f?'pri':'ghost'}" onclick="workflowFilter='${f}';workflowPage=0;render()">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('')}</div>
    <div class="f"><label>Buscar operación</label><input class="in" placeholder="Buscar número de venta o cliente" value="${esc(ui.q||'')}" oninput="ui.q=this.value;workflowPage=0;render(true)"></div><p class="muted">${filtered.length} operaciones. Las solicitudes se preparan al vender; el cierre no dispara emisiones. Los históricos no se suponen documentados.</p>
    <div class="scroll"><table class="tbl"><thead><tr><th>Venta</th><th>Comercial</th><th>Pago</th><th>Tributario</th><th>Acciones</th></tr></thead><tbody>${filtered.slice(workflowPage*50,(workflowPage+1)*50).map(s=>`<tr><td>${s.num}<br>${clp(s.total)}</td><td>${esc(workflowLabel(s.saleState||s.estado))}${s.solicitud?'<br>Solicitud: '+esc(s.solicitud):''}</td><td>${esc(workflowLabel(s.paymentState||'histórico sin verificar'))}</td><td>${esc(fiscalStatus(s))}</td><td><button class="btn sm ghost" onclick="workflowDetail('${s.id}')">Revisar</button> <button class="btn sm" onclick="workflowFiscalPrepare('${s.id}')">Consultar / preparar</button>${vig(s)&&!s.reversal?` <button class="btn sm bad" onclick="voidSale('${s.id}')">Revertir</button>`:''}${s.solicitud?` <button class="btn sm ghost" onclick="askReason('Rechazar solicitud','El motivo quedará en el historial.',reason=>{try{rejectReversalRequest('${s.id}',reason);closeModal();render()}catch(e){toast(e.message)}})">Rechazar solicitud</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5">Sin operaciones</td></tr>'}</tbody></table></div><div class="acts"><button class="btn ghost" ${workflowPage===0?'disabled':''} onclick="workflowPage--;render()">Anterior</button><span>Página ${workflowPage+1} de ${Math.max(1,Math.ceil(filtered.length/50))}</span><button class="btn ghost" ${(workflowPage+1)*50>=filtered.length?'disabled':''} onclick="workflowPage++;render()">Siguiente</button></div></div>
    <div class="card" style="margin-top:16px"><h3>Ajustes y conciliación</h3><div class="rows">${S.adjustments.slice().reverse().slice(0,30).map(a=>`<div><div class="grow"><b>Venta ${workflowSale(a.saleId).num} · ${clp(a.total)}</b><span>${fdt(a.fecha)} · ${esc(a.reason)}${a.originalClosure?' · Cierre original conservado: '+esc(a.originalClosure):''} · Productores: ${Object.keys(a.producers).map(p=>esc(PR(p).nombre)).join(', ')||'sin consignación'}</span></div></div>`).join('')||'<p class="muted">Sin ajustes.</p>'}</div></div>`;
}
function reserveFifo(prodId,qty,until,reserved){
  const out=[];let rest=qty;
  for(const lot of prodLots(prodId)){
    if(rest<=1e-9)break;const available=lotStock(lot.id,until)-(reserved.get(lot.id)||0);if(available<=1e-9)continue;
    const take=Math.min(rest,available);out.push({lot:lot.id,qty:take});reserved.set(lot.id,(reserved.get(lot.id)||0)+take);rest-=take;
  }
  return rest>1e-9?null:out;
}
function updateClosingDifference(netCash){
  const opening=Number(document.querySelector('#opening')?.value||0),counted=document.querySelector('#dec');
  const expected=document.querySelector('#closing-expected');if(expected)expected.textContent=clp(opening+netCash);
  const diff=document.querySelector('#dif');if(diff)diff.textContent=counted?.value!==''?'Diferencia: '+clp(Number(counted?.value||0)-opening-netCash):'Diferencia: —';
}
const transactionAdapters=Object.freeze({
  fiscal:Object.freeze({connected:false,async consultar(){throw new Error('Adaptador tributario no conectado.')},async emitir(){throw new Error('Emisión real deshabilitada.')},async notaCredito(){throw new Error('Nota de crédito real deshabilitada.')}}),
  payments:Object.freeze({connected:false,async consultar(){throw new Error('Operador de pagos no conectado.')},async devolver(){throw new Error('Devolución bancaria real deshabilitada.')}})
});
function needsFiscalReconciliation(s){return !['Documentada','Cancelada sin DTE','Revertida con nota de crédito','Revertida conciliada'].includes(fiscalStatus(s));}
function workflowLabel(state){return ({registrada:'Registrada',vigente:'Vigente',anulada:'Anulada',reversion_pendiente:'Reversión pendiente',revertida:'Revertida',revertida_con_documento_pendiente:'Revertida; documento pendiente',confirmado_manual:'Pago confirmado manualmente',registrado_sin_verificar:'Pago histórico sin verificar',devolucion_pendiente:'Devolución pendiente',devuelto:'Devolución conciliada',sin_verificar:'Sin verificar',pendiente_integracion:'Pendiente de conexión',pendiente_validacion_voucher:'Voucher pendiente de verificación',pendiente_conciliacion:'Pendiente de conciliación',emitido:'Emitido',emitida:'Emitida',no_emitido:'Ausencia de emisión verificada',desconocido:'Estado desconocido',error:'Error: conciliar',error_conciliacion:'Error: conciliar',voucher_verificado:'Voucher verificado',voucher_revertido_verificado:'Reversión de voucher verificada',cancelado_sin_emision:'Cancelado sin emisión',pendiente_nota_credito:'Nota de crédito pendiente',pendiente_verificacion:'Verificación pendiente',completada:'Reversión comercial registrada',pendiente_operador:'Devolución pendiente del operador',pendiente_confirmacion:'Devolución pendiente de confirmar',confirmada_manual:'Devolución conciliada manualmente'})[state]||state;}
