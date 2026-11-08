/* Motor transaccional de ventas, reversiones, devoluciones y documentos tributarios.
   Todas las pasarelas tributarias y de pago están deliberadamente desconectadas. */
import type { FiscalDoc, Payment, Sale } from '../types/model';
import { audit } from './audit';
import { comBase, P } from './catalog';
import { ctx, isAdmin, me } from './ctx';
import { resolveClient } from './credits';
import { clp, dayKey, now, uid } from './format';
import { cleanRut } from './rut';
import { itemTotal, makeSale, type SaleItem } from './sales';
import { comReq, comRequestMatches, creditReq, creditRequestMatches, priceReq, priceRequestMatches, vig } from './requests';
import { receiptData } from './receipts';

export function ensureWorkflowState(): void {
  const S = ctx.S;
  for (const key of ['operations', 'refunds', 'adjustments', 'fiscalEvents', 'clients', 'creditPayments', 'creditRequests', 'priceRequests', 'abonoRequests', 'comRequests'] as const) S[key] ??= [];
  S.workflowRevision ??= 0;
  S.workflowSchema = 1;
}
export function workflowAdmin(): void { const u = me(); if (!u || !u.activo || u.rol !== 'admin') throw new Error('Esta acción requiere administrador.'); }
export function workflowUser(): void { const u = me(); if (!u || !u.activo) throw new Error('La sesión no está activa.'); }
/** Dentro de un comando del store (que ya es atómico): valida el perfil y avanza la revisión. */
export function workflowTransaction<T>(action: () => T): T {
  if (me()?.rol === 'contador') throw new Error('Tu perfil es de solo lectura.');
  ensureWorkflowState();
  const result = action();
  ctx.S.workflowRevision++;
  return result;
}
export function workflowEvent(s: Sale, type: string, detail: string): void {
  s.workflowEvents ??= [];
  s.workflowEvents.push({ id: uid('evt'), type, detail, user: me()?.id || '', at: now() });
  if (me()) audit(type, 'Venta ' + s.num, '', detail);
}
export function workflowSale(id: string): Sale { const s = ctx.S.sales.find((x) => x.id === id); if (!s) throw new Error('Venta no encontrada.'); return s; }
export function ensureSaleWorkflow(s: Sale): Sale {
  if (s.workflowVersion) return s;
  // Los registros históricos nunca suponen emisión remota exitosa ni confirmación bancaria.
  s.workflowVersion = 1; s.legacyWorkflow = true; s.saleState = s.estado === 'anulada' ? 'revertida' : 'registrada';
  s.paymentState = 'registrado_sin_verificar'; s.workflowEvents = [];
  s.fiscalDocs = [{ id: s.id + ':documento:legacy', kind: s.documento || 'boleta', amount: s.total, state: 'sin_verificar', idempotencyKey: s.id + ':documento:legacy' }];
  workflowEvent(s, 'migracion', 'Documento y pago históricos pendientes de verificación; no se borran datos.');
  return s;
}
export function fiscalStatus(s: Sale): string {
  if (!s.workflowVersion) return 'Histórico sin verificar';
  const docs = s.fiscalDocs || [];
  if (s.reversal?.state === 'pendiente_nota_credito') return 'Nota de crédito pendiente';
  if (s.reversal?.state === 'pendiente_verificacion') return 'Conciliación de anulación pendiente';
  if (s.reversal?.state === 'completada' && s.reversal.creditNotes?.length) return 'Revertida con nota de crédito';
  if (s.reversal?.state === 'completada' && docs.some((d) => d.kind === 'voucher'))
    return docs.filter((d) => d.kind === 'voucher').every((d) => d.state === 'voucher_revertido_verificado') ? 'Revertida conciliada' : 'Conciliar voucher revertido';
  if (docs.some((d) => ['error', 'desconocido', 'sin_verificar', 'pendiente_conciliacion'].includes(d.state))) return 'Pendiente de conciliación';
  if (docs.length && docs.every((d) => ['emitido', 'voucher_verificado'].includes(d.state))) return 'Documentada';
  if (docs.length && docs.every((d) => d.state === 'cancelado_sin_emision')) return 'Cancelada sin DTE';
  return 'Documento pendiente';
}
export const needsFiscalReconciliation = (s: Sale): boolean => !['Documentada', 'Cancelada sin DTE', 'Revertida con nota de crédito', 'Revertida conciliada'].includes(fiscalStatus(s));

export interface PaymentDraft { pago?: string; pagoEf?: number; mixFirst?: string; mixedSecond?: string; payments?: Payment[] }
export function paymentPlan(draft: PaymentDraft, total: number): Payment[] {
  const allowed = ['efectivo', 'transferencia', 'tarjeta', 'credito'];
  let parts: { medio: string; monto: number; reference?: string; voucherTax?: boolean }[] | undefined = draft.payments;
  if (!parts) {
    // mixto: dos medios cualesquiera; pagoEf es lo que va en el primero
    if (draft.pago === 'mixto') parts = [{ medio: draft.mixFirst || 'efectivo', monto: Number(draft.pagoEf) }, { medio: draft.mixedSecond || 'transferencia', monto: total - Number(draft.pagoEf) }];
    else parts = [{ medio: String(draft.pago), monto: total }];
  }
  const out = parts.map((p, i) => ({ id: 'p' + i, medio: p.medio as Payment['medio'], monto: Number(p.monto), reference: String(p.reference ?? '').trim(), voucherTax: !!p.voucherTax }));
  if (!out.length || out.some((p) => !allowed.includes(p.medio) || !Number.isSafeInteger(p.monto) || p.monto <= 0) || out.reduce((n, p) => n + p.monto, 0) !== total)
    throw new Error('Revisa los componentes del pago: deben sumar exactamente el total.');
  if (new Set(out.map((p) => p.medio)).size !== out.length) throw new Error('Los medios del pago mixto deben ser distintos.');
  return out;
}
export function fiscalPlan(s: Sale, payments: Payment[], config: { modeloBoleta?: string; modeloReferencia?: string; operadorTarjeta?: string }): FiscalDoc[] {
  const make = (kind: string, amount: number, state = 'pendiente_integracion', extra: Partial<FiscalDoc> = {}): FiscalDoc => ({ id: s.id + ':' + kind, kind, amount, state, idempotencyKey: s.id + ':' + kind, ...extra });
  if (s.documento === 'factura') return [make('factura', s.total)];
  const cards = payments.filter((p) => p.medio === 'tarjeta');
  if (!cards.length || (config.modeloBoleta === 'siempre_boleta' && config.modeloReferencia)) return [make('boleta', s.total)];
  if (config.modeloBoleta !== 'voucher_sustituye' || !config.modeloReferencia || !config.operadorTarjeta || cards.some((p) => !p.voucherTax))
    return [make('boleta', s.total, 'pendiente_conciliacion', { reason: 'Verificar modelo declarado, operador y validez tributaria del voucher antes de emitir.' })];
  const amount = payments.filter((p) => p.medio !== 'tarjeta').reduce((n, p) => n + p.monto, 0);
  return [...(amount ? [make('boleta', amount)] : []), ...cards.map((p) => make('voucher', p.monto, 'pendiente_validacion_voucher', { paymentId: p.id, reference: p.reference, operator: config.operadorTarjeta, modelReference: config.modeloReferencia }))];
}
export function queueFiscalIntent(s: Sale, doc: { id: string; idempotencyKey: string }, kind = 'emitir') {
  const key = kind + ':' + doc.idempotencyKey;
  const existing = ctx.S.operations.find((o) => o.idempotencyKey === key);
  if (existing) return existing;
  const op = { id: uid('op'), saleId: s.id, documentId: doc.id, kind, idempotencyKey: key, state: 'bloqueada_sin_integracion', mustQueryBeforeSend: true, createdAt: now(), attempts: 0 };
  ctx.S.operations.push(op);
  return op;
}

export interface CheckoutItem extends SaleItem { precio: number }
export interface SaleDraft {
  key: string; user: string; items: CheckoutItem[]; documento: 'boleta' | 'factura'; receptor: Record<string, string> | null; payments: Payment[]; total: number;
  gamelas: { lleva: number; trae: number } | null; clienteNombre: string; creditReq: string; comision?: number; comReq?: string; paymentConfirmed: boolean;
}

/** Registra la venta confirmada. Idempotente por `key`: la misma clave devuelve la misma venta. */
export function registerSaleCommand(draft: SaleDraft): Sale {
  workflowUser();
  const S = ctx.S, u = me()!;
  if (!draft?.key) throw new Error('Confirmación de venta no válida.');
  const fingerprint = JSON.stringify({ user: draft.user, items: draft.items, documento: draft.documento, receptor: draft.receptor, payments: draft.payments, clienteNombre: draft.clienteNombre || '', creditReq: draft.creditReq || '', comision: draft.comision ?? null, comReq: draft.comReq || '' });
  const old = S.sales.find((s) => s.commandKey === draft.key);
  if (old) { if (old.commandFingerprint !== fingerprint || old.vendedor !== u.id) throw new Error('La clave de operación ya corresponde a otra venta.'); return old; }
  if (draft.user !== u.id || draft.paymentConfirmed !== true) throw new Error('Confirma primero que recibiste el pago.');
  if (!draft.items?.length || draft.items.some((i) => !P(i.prod) || (!i.precioEsp && P(i.prod).precio !== i.precio))) throw new Error('Los productos o precios cambiaron. Vuelve a revisar la venta.');
  // precio especial: el admin lo pone directo; un vendedor necesita la autorización de Luis para ese producto, cantidad y precio
  const especiales = draft.items.filter((i) => i.precioEsp).map((i) => {
    if (P(i.prod).envase || !Number.isSafeInteger(i.precio) || i.precio <= 0) throw new Error('Precio especial no válido.');
    if (u.rol === 'admin') return null;
    const r = priceReq(i.priceReq);
    if (!priceRequestMatches(r, i, u.id) || r!.precio !== i.precio) throw new Error('El precio especial necesita la autorización de Luis.');
    return r!;
  }).filter((r): r is NonNullable<typeof r> => !!r);
  return workflowTransaction(() => {
    const total = draft.items.reduce((n, i) => n + itemTotal(i), 0), requestedPayments = paymentPlan(draft, total);
    // el punto de venta ya no pide referencia; si una integración la envía, no puede repetirse
    if (requestedPayments.some((p) => p.medio === 'tarjeta' && p.reference && S.sales.some((s) => s.pagos.some((o) => o.medio === 'tarjeta' && o.reference === p.reference))))
      throw new Error('Esa referencia del terminal ya fue usada en otra venta.');
    // crédito: el admin fía directo; un vendedor necesita una autorización aprobada para este cliente, monto y total
    const fiado = requestedPayments.filter((p) => p.medio === 'credito').reduce((n, p) => n + p.monto, 0), nombre = String(draft.clienteNombre || '').trim();
    let cliente = '', autorizacion = null as ReturnType<typeof creditReq> | null;
    if (fiado) {
      if (!nombre) throw new Error('Escribe el nombre del cliente que pide el crédito.');
      if (u.rol !== 'admin') { autorizacion = creditReq(draft.creditReq); if (!creditRequestMatches(autorizacion, { user: u.id, nombre, monto: fiado, total })) throw new Error('El crédito necesita la autorización de Luis.'); }
      cliente = resolveClient(nombre);
    }
    // comisión de consignación: la del sistema, o la que Luis autorizó para esta venta
    let comAut = null as ReturnType<typeof comReq> | null;
    const com = draft.comision ?? null;
    if (com != null && com !== comBase()) {
      if (u.rol === 'admin') throw new Error('La comisión cambió. Vuelve a revisar la venta.');
      comAut = comReq(draft.comReq);
      if (!comRequestMatches(comAut, u.id) || comAut!.pct !== com) throw new Error('La comisión necesita la autorización de Luis.');
    }
    const s = makeSale({ vendedor: u.id, items: draft.items, pago: 'efectivo', documento: draft.documento, receptor: draft.receptor, cliente, gamelas: draft.gamelas, comision: draft.comision ?? null });
    if (comAut) { comAut.estado = 'usada'; comAut.saleId = s.id; s.comisionAutorizadaPor = comAut.resueltoPor; }
    if (autorizacion) { autorizacion.estado = 'usada'; autorizacion.saleId = s.id; s.creditoAutorizadoPor = autorizacion.resueltoPor; }
    especiales.forEach((r) => {
      const live = priceReq(r.id)!;
      live.estado = 'usada'; live.saleId = s.id;
      const ln = s.lineas.find((l) => l.prod === live.prod && l.precio === live.precio && !l.precioAutorizadoPor);
      if (ln) ln.precioAutorizadoPor = live.resueltoPor;
    });
    s.lineas.filter((l) => l.precioNormal && !l.precioAutorizadoPor).forEach((l) => { l.precioAutorizadoPor = u.id; });
    s.lineas.filter((l) => l.precioNormal).forEach((l) => audit('Venta con precio especial', P(l.prod).nombre + ' · N° ' + s.num, clp(l.precioNormal!), clp(l.precio)));
    s.pagos = paymentPlan(draft, s.total).map((p) => ({ ...p, state: 'confirmado_manual', confirmedAt: now() }));
    s.workflowVersion = 1; s.saleState = 'registrada'; s.paymentState = 'confirmado_manual'; s.commandKey = draft.key; s.commandFingerprint = fingerprint;
    s.modelSnapshot = { modeloBoleta: S.cfg.modeloBoleta || 'sin_definir', modeloReferencia: S.cfg.modeloReferencia || '', operadorTarjeta: S.cfg.operadorTarjeta || '' };
    s.workflowEvents = [];
    s.fiscalDocs = fiscalPlan(s, s.pagos, s.modelSnapshot);
    s.comprobante = null; s.comprobante = receiptData(s);
    workflowEvent(s, 'venta_registrada', 'Pago confirmado manualmente. La emisión fiscal es un proceso independiente.');
    s.fiscalDocs.filter((d) => d.state === 'pendiente_integracion').forEach((d) => queueFiscalIntent(s, d));
    return s;
  });
}

function initializeRefunds(s: Sale, reversal: { id: string }): void {
  // lo fiado no se devuelve en dinero: al revertir, simplemente deja de contarse como deuda
  s.pagos.filter((p) => p.monto > 0 && p.medio !== 'credito').forEach((p, i) => {
    const key = reversal.id + ':devolucion:' + i;
    if (!ctx.S.refunds.some((r) => r.idempotencyKey === key))
      ctx.S.refunds.push({ id: key, idempotencyKey: key, saleId: s.id, medio: p.medio, amount: p.monto, state: p.medio === 'tarjeta' ? 'pendiente_operador' : 'pendiente_confirmacion', originalReference: p.reference || '', createdAt: now() });
  });
  s.paymentState = 'devolucion_pendiente';
}
function completeCommercialReversal(s: Sale): void {
  const S = ctx.S, r = s.reversal;
  if (!r || r.state === 'completada') return;
  if (r.completedAt) { r.state = 'completada'; s.saleState = 'revertida'; return; }
  if (r.returnStock) s.lineas.forEach((l, i) => l.allocs.forEach((a, j) => {
    const key = r.id + ':stock:' + i + ':' + j;
    if (!S.moves.some((m) => m.idempotencyKey === key)) S.moves.push({ id: uid('m'), idempotencyKey: key, lot: a.lot, prod: l.prod, tipo: 'anulación', qty: a.qty, user: r.approvedBy, fecha: now(), motivo: r.reason, ref: s.id });
  }));
  r.state = 'completada'; r.completedAt = now(); s.saleState = 'revertida'; s.estado = 'anulada'; s.motivoAnula = r.reason; s.anuladaPor = r.approvedBy; s.solicitud = '';
  if (!S.adjustments.some((a) => a.idempotencyKey === r.id)) {
    const producers: Record<string, number> = {};
    s.lineas.forEach((l) => l.allocs.forEach((a) => { const lot = S.lots.find((x) => x.id === a.lot); if (lot?.modalidad === 'consignación') producers[lot.productor] = (producers[lot.productor] || 0) + Math.round(a.qty * l.precio); }));
    S.adjustments.push({ id: uid('aj'), idempotencyKey: r.id, saleId: s.id, originalDate: s.fecha, fecha: r.completedAt, originalClosure: s.cierre || '', total: -s.total, producers,
      settlements: S.liqs.filter((l) => Object.keys(producers).includes(l.prod) && (!l.desde || dayKey(s.fecha) >= l.desde) && (!l.hasta || dayKey(s.fecha) <= l.hasta)).map((l) => l.id),
      reason: r.reason, user: r.approvedBy });
  }
  workflowEvent(s, 'reversion_comercial', 'Ajuste compensatorio registrado. La devolución del dinero se confirma por separado.');
}
export function advanceReversal(s: Sale): void {
  const r = s.reversal;
  if (!r || r.state === 'completada') return;
  const docs = s.fiscalDocs || [];
  const unknown = docs.some((d) => ['sin_verificar', 'desconocido', 'enviando', 'error'].includes(d.state));
  if (unknown) { r.state = 'pendiente_verificacion'; return; }
  const issued = docs.filter((d) => d.state === 'emitido');
  for (const d of issued) {
    const key = r.id + ':nc:' + d.id;
    r.creditNotes ??= [];
    if (!r.creditNotes.some((n) => n.idempotencyKey === key)) {
      const nc = { id: key, idempotencyKey: key, kind: 'nota_credito' as const, amount: d.amount, state: 'pendiente_integracion', original: { ...d.original, documentId: d.id } };
      r.creditNotes.push(nc); queueFiscalIntent(s, nc, 'nota_credito');
    }
  }
  if (issued.length && r.creditNotes.some((n) => n.state !== 'emitida')) { r.state = 'pendiente_nota_credito'; return; }
  for (const d of docs) {
    if (['pendiente_integracion', 'pendiente_conciliacion', 'no_emitido'].includes(d.state)) {
      d.state = 'cancelado_sin_emision';
      ctx.S.operations.filter((o) => o.documentId === d.id && o.kind === 'emitir').forEach((o) => { o.state = 'cancelada_antes_envio'; });
    }
  }
  completeCommercialReversal(s);
}
export function reverseSaleCommand(id: string, reason: string, returnStock: boolean): Sale {
  workflowAdmin();
  reason = String(reason || '').trim();
  if (!reason) throw new Error('El motivo es obligatorio.');
  return workflowTransaction(() => {
    const s = ensureSaleWorkflow(workflowSale(id));
    if (s.reversal || s.estado === 'anulada') return s;
    s.reversal = { id: 'reversion:' + s.id, state: 'solicitada', reason, returnStock: !!returnStock, approvedBy: me()!.id, createdAt: now(), creditNotes: [] };
    s.saleState = 'reversion_pendiente'; initializeRefunds(s, s.reversal); workflowEvent(s, 'reversion_solicitada', reason);
    advanceReversal(s);
    return s;
  });
}
export function requestReversalCommand(id: string, reason: string): Sale {
  workflowUser();
  reason = String(reason || '').trim();
  if (!reason) throw new Error('El motivo es obligatorio.');
  return workflowTransaction(() => {
    const s = workflowSale(id);
    if (s.vendedor !== me()!.id && !isAdmin()) throw new Error('Solo puedes solicitar la reversión de tus ventas.');
    if (!vig(s) || s.reversal) throw new Error('Esta venta ya tiene una reversión.');
    s.solicitud = reason; s.solicitudFecha = now(); workflowEvent(s, 'solicitud_vendedor', reason);
    return s;
  });
}
export function rejectReversalRequest(id: string, reason: string): Sale {
  workflowAdmin();
  return workflowTransaction(() => {
    const s = workflowSale(id);
    if (!s.solicitud) throw new Error('No hay solicitud pendiente.');
    if (!String(reason).trim()) throw new Error('El motivo es obligatorio.');
    workflowEvent(s, 'solicitud_rechazada', reason + ' · Solicitud: ' + s.solicitud);
    s.solicitud = '';
    return s;
  });
}
export function confirmRefundCommand(id: string, reference: string) {
  workflowAdmin();
  reference = String(reference || '').trim();
  if (!reference) throw new Error('Registra una referencia o comprobante de la devolución efectiva.');
  return workflowTransaction(() => {
    const S = ctx.S, r = S.refunds.find((x) => x.id === id);
    if (!r) throw new Error('Devolución no encontrada.');
    if (r.state === 'confirmada_manual') { if (r.reference !== reference) throw new Error('La devolución ya se concilió con otra referencia.'); return r; }
    if (S.refunds.some((o) => o.id !== r.id && o.state === 'confirmada_manual' && o.medio === r.medio && o.reference === reference)) throw new Error('Esa referencia de devolución ya fue conciliada.');
    r.reference = reference; r.state = 'confirmada_manual'; r.confirmedAt = now(); r.confirmedBy = me()!.id;
    const s = workflowSale(r.saleId);
    r.cashier = s.vendedor;
    s.paymentState = S.refunds.filter((x) => x.saleId === s.id).every((x) => x.state === 'confirmada_manual') ? 'devuelto' : 'devolucion_pendiente';
    workflowEvent(s, 'devolucion_conciliada_manual', r.medio + ' ' + r.amount + ' · ' + reference);
    return r;
  });
}

export interface FiscalObservation {
  eventId?: string; verified?: boolean; provider?: string; state?: string; providerDocumentId?: string;
  original?: { folio?: string | number; tipo?: string | number; rutEmisor?: string; fecha?: string; monto?: number };
  reference?: string; operator?: string; amount?: number; folio?: string; tipo?: number; monto?: number; originalDocumentId?: string; originalFolio?: string | number; originalTipo?: number;
}
/** Observaciones de un futuro adaptador de servidor. Nunca llaman a un servicio de red. */
export function observeFiscalDocument(saleId: string, documentId: string, observation: FiscalObservation): Sale {
  workflowAdmin();
  if (!observation?.eventId || observation.verified !== true || !observation.provider) throw new Error('Falta una consulta de estado verificada del proveedor.');
  return workflowTransaction(() => {
    const S = ctx.S;
    if (S.fiscalEvents.some((e) => e.id === observation.eventId)) return workflowSale(saleId);
    const s = ensureSaleWorkflow(workflowSale(saleId)), d = (s.fiscalDocs || []).find((x) => x.id === documentId);
    if (!d) throw new Error('Documento no encontrado.');
    const st = String(observation.state);
    if (!['emitido', 'no_emitido', 'desconocido', 'error', 'voucher_verificado', 'voucher_revertido_verificado'].includes(st)) throw new Error('Estado externo no válido.');
    if (d.state === 'emitido' && st !== 'emitido') throw new Error('No se puede sobrescribir un DTE emitido.');
    if (st === 'emitido') {
      const o = observation.original;
      if (!o?.folio || !o.tipo || !o.rutEmisor || !o.fecha || !observation.providerDocumentId || Number(o.monto) !== d.amount) throw new Error('Falta la identificación completa del DTE original.');
      if (!(({ boleta: [39, 41], factura: [33, 34] } as Record<string, number[]>)[d.kind] || []).includes(Number(o.tipo))) throw new Error('Tipo DTE incompatible con el documento solicitado.');
      if (cleanRut(o.rutEmisor) !== cleanRut(receiptData(s).emisor.rut)) throw new Error('El emisor no coincide con la venta.');
      if (S.sales.some((other) => other.id !== s.id && (other.fiscalDocs || []).some((x) => x.original && String(x.original.folio) === String(o.folio) && Number(x.original.tipo) === Number(o.tipo) && cleanRut(x.original.rutEmisor) === cleanRut(o.rutEmisor)))) throw new Error('Ese DTE ya está asociado a otra venta.');
      if (d.providerDocumentId && d.providerDocumentId !== observation.providerDocumentId) throw new Error('La referencia remota del DTE es inmutable.');
      if (d.original && JSON.stringify(d.original) !== JSON.stringify(o)) throw new Error('El DTE original es inmutable.');
      d.original = { ...o }; d.providerDocumentId = observation.providerDocumentId;
    }
    if (['voucher_verificado', 'voucher_revertido_verificado'].includes(st) && (d.kind !== 'voucher' || observation.reference !== d.reference || observation.operator !== d.operator || Number(observation.amount) !== d.amount))
      throw new Error('La referencia, operador o monto del voucher no coinciden.');
    if (d.state === 'cancelado_sin_emision' && st === 'emitido') {
      // Una emisión externa tardía requiere nota de crédito; nunca se borra en silencio.
      d.state = 'emitido'; s.reversal!.state = 'pendiente_nota_credito'; s.saleState = 'revertida_con_documento_pendiente';
    } else d.state = st;
    d.lastObservation = { ...observation, observedAt: now() };
    S.fiscalEvents.push({ id: observation.eventId!, saleId, documentId, at: now() });
    S.operations.filter((o) => o.documentId === d.id).forEach((o) => { o.lastObservedState = st; o.lastObservedAt = now(); if (['emitido', 'voucher_verificado'].includes(st)) o.state = 'conciliada'; });
    workflowEvent(s, 'consulta_documento', st);
    if (s.reversal) advanceReversal(s);
    return s;
  });
}
export function observeCreditNote(saleId: string, noteId: string, observation: FiscalObservation): Sale {
  workflowAdmin();
  if (!observation?.eventId || observation.verified !== true || !observation.provider || !['emitida', 'error', 'desconocido'].includes(String(observation.state))) throw new Error('Falta consulta verificada del estado de la nota de crédito.');
  return workflowTransaction(() => {
    const S = ctx.S, s = workflowSale(saleId);
    if (S.fiscalEvents.some((e) => e.id === observation.eventId)) return s;
    const n = s.reversal?.creditNotes.find((x) => x.id === noteId);
    if (!n) throw new Error('Nota de crédito no encontrada.');
    if (n.state === 'emitida') { if (observation.state !== 'emitida' || n.folio !== observation.folio) throw new Error('La nota de crédito emitida es inmutable.'); return s; }
    if (observation.state === 'emitida') {
      if (!observation.folio || Number(observation.tipo) !== 61 || Number(observation.monto) !== n.amount || observation.originalDocumentId !== n.original.documentId || String(observation.originalFolio) !== String(n.original.folio) || Number(observation.originalTipo) !== Number(n.original.tipo))
        throw new Error('La nota de crédito no coincide con el monto y DTE original.');
      n.state = 'emitida'; n.folio = observation.folio;
    } else n.state = 'error_conciliacion';
    n.observation = { ...observation };
    S.fiscalEvents.push({ id: observation.eventId!, saleId, noteId, at: now() });
    S.operations.filter((o) => o.documentId === n.id).forEach((o) => { o.lastObservedState = observation.state; if (observation.state === 'emitida') o.state = 'conciliada'; });
    workflowEvent(s, 'nota_credito_consultada', String(observation.state));
    advanceReversal(s);
    return s;
  });
}
export function prepareFiscalCommand(id: string): Sale {
  workflowAdmin();
  return workflowTransaction(() => {
    const s = ensureSaleWorkflow(workflowSale(id));
    for (const d of s.fiscalDocs || []) {
      if (['emitido', 'voucher_verificado', 'voucher_revertido_verificado', 'cancelado_sin_emision'].includes(d.state)) continue;
      if (d.kind === 'voucher' || ['sin_verificar', 'desconocido', 'error', 'enviando', 'pendiente_conciliacion'].includes(d.state)) queueFiscalIntent(s, d, 'consultar');
      else queueFiscalIntent(s, d);
    }
    for (const n of s.reversal?.creditNotes || []) { if (n.state !== 'emitida') queueFiscalIntent(s, n, 'consultar_nota_credito'); }
    workflowEvent(s, 'preparacion_documentos', 'Integración desconectada; no se emitió ni se reintentó un envío.');
    return s;
  });
}

export function workflowLabel(state: string | undefined): string {
  return ({ registrada: 'Registrada', vigente: 'Vigente', anulada: 'Anulada', reversion_pendiente: 'Reversión pendiente', revertida: 'Revertida', revertida_con_documento_pendiente: 'Revertida; documento pendiente', confirmado_manual: 'Pago confirmado manualmente', registrado_sin_verificar: 'Pago histórico sin verificar', devolucion_pendiente: 'Devolución pendiente', devuelto: 'Devolución conciliada', sin_verificar: 'Sin verificar', pendiente_integracion: 'Pendiente de conexión', pendiente_validacion_voucher: 'Voucher pendiente de verificación', pendiente_conciliacion: 'Pendiente de conciliación', emitido: 'Emitido', emitida: 'Emitida', no_emitido: 'Ausencia de emisión verificada', desconocido: 'Estado desconocido', error: 'Error: conciliar', error_conciliacion: 'Error: conciliar', voucher_verificado: 'Voucher verificado', voucher_revertido_verificado: 'Reversión de voucher verificada', cancelado_sin_emision: 'Cancelado sin emisión', pendiente_nota_credito: 'Nota de crédito pendiente', pendiente_verificacion: 'Verificación pendiente', completada: 'Reversión comercial registrada', pendiente_operador: 'Devolución pendiente del operador', pendiente_confirmacion: 'Devolución pendiente de confirmar', confirmada_manual: 'Devolución conciliada manualmente' } as Record<string, string>)[state || ''] || state || '';
}
