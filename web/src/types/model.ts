/**
 * Modelo de datos de Bodega Lo Valledor.
 * Refleja exactamente el estado `S` del prototipo (bodega-lo-valledor.html, clave bodegaLV.v6)
 * para que la migración no altere cálculos ni reglas de negocio.
 */

export type Rol = 'admin' | 'vendedor' | 'contador';
export type Unidad = 'gamela' | 'kg';
export type Modalidad = 'consignación' | 'compra' | 'devolución' | 'ajuste';
export type Fuente = 'consig' | 'directa';
export type MedioPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'credito' | 'cheque';
export type PagoSeleccion = 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto' | 'credito';
export type Documento = 'boleta' | 'factura';
export type Ms = number;

export interface Config {
  nombre: string;
  rut: string;
  giro: string;
  direccion: string;
  comuna: string;
  telefonoEmisor: string;
  comision: number;
  inicioJornada: number;
  siiUnidad?: string;
  modeloBoleta?: string;
  modeloReferencia?: string;
  operadorTarjeta?: string;
}

export interface User {
  id: string;
  nombre: string;
  usuario: string;
  rol: Rol;
  turno: string;
  /** Solo en el modo local/demostración. Con Firebase la clave vive en Firebase Auth y este campo no existe. */
  clave?: string;
  activo: boolean;
  cambiosClave?: Ms[];
}

export interface Product {
  id: string;
  sku: string;
  nombre: string;
  familia: string;
  calibre: string;
  unidad: Unidad;
  precio: number;
  pesoCaja: number;
  usaGamela: boolean;
  activo: boolean;
  envase?: boolean;
}

export interface Producer {
  id: string;
  nombre: string;
  rut: string;
  fono: string;
  tipo?: 'productor' | 'proveedor';
  comision?: number;
}

export interface ReceptionLine {
  prod: string;
  qty: number;
  costo: number;
  lot: string;
  nombre?: string;
  unidad?: Unidad;
  gamelas?: number;
  comision?: number;
}

export interface Reception {
  id: string;
  fecha: Ms;
  productor: string;
  modalidad: Modalidad;
  pallets?: number;
  foto?: string;
  fotoId?: string;
  user: string;
  anulada: boolean;
  lineas: ReceptionLine[];
  gamelas?: number;
  gamelasLot?: string;
  proveedor?: Producer;
  emisor?: Config;
  comision?: number;
}

export interface Lot {
  id: string;
  rec: string;
  prod: string;
  qty: number;
  costo: number;
  fecha: Ms;
  productor: string;
  modalidad: Modalidad;
  fuente?: Fuente;
  comision?: number;
  gamelas?: number;
}

export type MoveTipo = 'recepción' | 'venta' | 'merma' | 'ajuste' | 'anulación' | 'compra gamelas';

export interface Move {
  id: string;
  lot: string;
  prod: string;
  tipo: MoveTipo;
  qty: number;
  user: string;
  fecha: Ms;
  motivo: string;
  ref: string;
  gamelas?: number;
  idempotencyKey?: string;
}

export interface Alloc {
  lot: string;
  qty: number;
  comision?: number;
  costo?: number;
}

export interface SaleLine {
  prod: string;
  unidad: Unidad;
  qty: number;
  precio: number;
  src?: Fuente;
  gamelas?: number;
  precioNormal?: number;
  precioAutorizadoPor?: string;
  subtotal: number;
  allocs: Alloc[];
}

export interface Payment {
  id?: string;
  medio: MedioPago;
  monto: number;
  reference?: string;
  voucherTax?: boolean;
  state?: string;
  confirmedAt?: Ms;
  cliente?: string;
}

export interface Receptor {
  rut: string;
  razonSocial: string;
  giro: string;
  direccion: string;
  comuna: string;
  telefono?: string;
}

export interface ReceiptItem {
  nombre: string;
  codigo: string;
  qty: number;
  unidad: Unidad;
  precio: number;
  subtotal: number;
}

export interface ReceiptSnapshot {
  documento: Documento;
  receptor: Receptor | null;
  emisor: { nombre: string; rut: string; giro: string; direccion: string; comuna: string; telefono: string; siiUnidad: string };
  vendedor: string;
  items: ReceiptItem[];
  pagos: Payment[];
  total: number;
  neto: number;
  iva: number;
}

export interface FiscalDoc {
  id: string;
  kind: string;
  amount: number;
  state: string;
  idempotencyKey: string;
  reason?: string;
  paymentId?: string;
  reference?: string;
  operator?: string;
  modelReference?: string;
  original?: Record<string, unknown> & { folio?: string | number; tipo?: string | number; rutEmisor?: string; documentId?: string };
  providerDocumentId?: string;
  lastObservation?: Record<string, unknown>;
}

export interface CreditNote {
  id: string;
  idempotencyKey: string;
  kind: 'nota_credito';
  amount: number;
  state: string;
  original: Record<string, unknown> & { documentId?: string; folio?: string | number; tipo?: string | number };
  folio?: string;
  observation?: Record<string, unknown>;
}

export interface Reversal {
  id: string;
  state: string;
  reason: string;
  returnStock: boolean;
  approvedBy: string;
  createdAt: Ms;
  creditNotes: CreditNote[];
  completedAt?: Ms;
}

export interface WorkflowEvent {
  id: string;
  type: string;
  detail: string;
  user: string;
  at: Ms;
}

export interface Sale {
  id: string;
  num: number;
  fecha: Ms;
  vendedor: string;
  documento: Documento;
  receptor: Receptor | null;
  cliente: string;
  lineas: SaleLine[];
  estado: 'vigente' | 'anulada';
  pagos: Payment[];
  cierre: string;
  total: number;
  comision?: number;
  gamelas?: { lleva: number; trae: number };
  comprobante?: ReceiptSnapshot | null;
  solicitud?: string;
  solicitudFecha?: Ms;
  motivoAnula?: string;
  anuladaPor?: string;
  comisionAutorizadaPor?: string;
  creditoAutorizadoPor?: string;
  // motor transaccional
  workflowVersion?: number;
  legacyWorkflow?: boolean;
  saleState?: string;
  paymentState?: string;
  commandKey?: string;
  commandFingerprint?: string;
  modelSnapshot?: { modeloBoleta: string; modeloReferencia: string; operadorTarjeta: string };
  workflowEvents?: WorkflowEvent[];
  fiscalDocs?: FiscalDoc[];
  reversal?: Reversal;
}

/** Entrada de devengo (venta o su compensación) derivada de una venta. */
export interface RevenueEntry extends Sale {
  entrySign: 1 | -1;
  originalSaleId?: string;
}

export interface MoneyEntry {
  saleId: string;
  abono?: string;
  user: string;
  fecha: Ms;
  medio: MedioPago;
  monto: number;
}

export interface Closure {
  id: string;
  vendedor: string;
  turno: string;
  fecha: Ms;
  apertura: number;
  netoEfectivo: number;
  esperado: number;
  declarado: number;
  transf: number;
  tarjeta: number;
  cheques: number;
  fiado: number;
  abonosTotal: number;
  abonos: string[];
  diferencia: number;
  aprobado: string;
  aprobadoEn?: Ms;
  registrado?: boolean;
  ventas: string[];
  devoluciones: string[];
  [split: string]: unknown;
}

export interface LiqRow {
  recibido: number;
  vendido: number;
  monto: number;
  merma: number;
  comision?: number;
}

export interface Liquidation {
  id: string;
  prod: string;
  desde: string;
  hasta: string;
  fecha: Ms;
  by: Record<string, LiqRow>;
  monto: number;
  comision: number;
  neto: number;
  pct: number;
  pcts: number[];
  pagada: Ms;
  medio: string;
}

export interface PriceChange {
  id?: string;
  prod: string;
  precio: number;
  desde: Ms;
  user: string;
}

export interface AuditEntry {
  id: string;
  fecha: Ms;
  user: string;
  accion: string;
  entidad: string;
  antes: string;
  despues: string;
}

export interface Expense {
  id: string;
  fecha: Ms;
  cat: string;
  monto: number;
  desc: string;
  cantidad?: number;
  lot?: string;
}

export interface FixedExpense {
  id: string;
  cat: string;
  desc: string;
  monto: number;
  desde: string;
  hasta: string;
}

export interface Note {
  id: string;
  desde: Ms;
  hasta: Ms;
  tipo: 'buena' | 'mala' | string;
  texto: string;
}

export interface Client {
  id: string;
  nombre: string;
  rut: string;
  fono: string;
  activo: boolean;
  creado: Ms;
  borrado?: Ms;
}

export interface CreditPayment {
  id: string;
  cliente: string;
  monto: number;
  medio: MedioPago;
  ref?: string;
  fecha: Ms;
  user: string;
  cierre: string;
  anulado?: boolean;
  autorizadoPor?: string;
  solicitud?: string;
}

export type RequestState = 'pendiente' | 'aprobada' | 'rechazada' | 'usada' | 'vencida' | 'cancelada';

interface RequestBase {
  id: string;
  user: string;
  fecha: Ms;
  estado: RequestState;
  resueltoPor?: string;
  resueltoEn?: Ms;
  saleId?: string;
  motivo?: string;
}

export interface CreditRequest extends RequestBase {
  clienteNombre: string;
  detalle?: string;
  monto: number;
  total: number;
}

export interface PriceRequest extends RequestBase {
  prod: string;
  qty: number;
  precio: number;
  precioNormal?: number;
}

export interface ComRequest extends RequestBase {
  pct: number;
  pctNormal?: number;
}

export interface AbonoRequest extends RequestBase {
  cliente: string;
  monto: number;
  medio: MedioPago;
  abono?: string;
}

export interface Refund {
  id: string;
  idempotencyKey: string;
  saleId: string;
  medio: MedioPago;
  amount: number;
  state: string;
  originalReference: string;
  createdAt: Ms;
  reference?: string;
  confirmedAt?: Ms;
  confirmedBy?: string;
  cashier?: string;
  cierre?: string;
}

export interface Adjustment {
  id: string;
  idempotencyKey: string;
  saleId: string;
  originalDate: Ms;
  fecha: Ms;
  originalClosure: string;
  total: number;
  producers: Record<string, number>;
  settlements: string[];
  reason: string;
  user: string;
}

export interface Operation {
  id: string;
  saleId: string;
  documentId: string;
  kind: string;
  idempotencyKey: string;
  state: string;
  mustQueryBeforeSend: boolean;
  createdAt: Ms;
  attempts: number;
  lastObservedState?: string;
  lastObservedAt?: Ms;
}

export interface FiscalEvent {
  id: string;
  saleId: string;
  documentId?: string;
  noteId?: string;
  at: Ms;
}

/** Estado completo de la bodega. */
export interface State {
  cfg: Config;
  users: User[];
  products: Product[];
  producers: Producer[];
  receptions: Reception[];
  lots: Lot[];
  moves: Move[];
  sales: Sale[];
  closures: Closure[];
  liqs: Liquidation[];
  prices: PriceChange[];
  audit: AuditEntry[];
  expenses: Expense[];
  fixed: FixedExpense[];
  notes: Note[];
  clients: Client[];
  creditPayments: CreditPayment[];
  creditRequests: CreditRequest[];
  priceRequests: PriceRequest[];
  abonoRequests: AbonoRequest[];
  comRequests: ComRequest[];
  operations: Operation[];
  refunds: Refund[];
  adjustments: Adjustment[];
  fiscalEvents: FiscalEvent[];
  workflowRevision: number;
  workflowSchema: number;
  families?: string[];
}

/** Colecciones con documentos identificados por `id` (se persisten como documentos independientes). */
export const COLLECTIONS = [
  'users', 'products', 'producers', 'prices', 'receptions', 'lots', 'moves', 'sales', 'closures', 'liqs', 'audit',
  'expenses', 'fixed', 'notes', 'clients', 'creditPayments', 'creditRequests', 'priceRequests', 'abonoRequests',
  'comRequests', 'operations', 'refunds', 'adjustments', 'fiscalEvents',
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

/** Borrador del punto de venta (por usuario, se conserva al recargar). */
export interface CartLine {
  prod: string;
  qty: number;
  src?: Fuente;
  gam?: number;
  priceReq?: string;
  precioAdmin?: number;
}

export interface PosDraft {
  cart: CartLine[];
  pago: Exclude<PagoSeleccion, 'credito'>;
  pagoEf: number;
  mixFirst: MedioPago;
  mixedSecond: MedioPago;
  documento: Documento;
  receptor: Partial<Receptor>;
  credito: boolean;
  creditoPaga: number;
  clienteNombre: string;
  creditReq: string;
  comReq: string;
  gamExtra: number;
  gamTrae: number;
  src: Fuente;
}
