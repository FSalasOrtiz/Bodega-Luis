import {
  clearIndexedDbPersistence, collection, doc, getDoc, getDocFromCache, getDocsFromCache, initializeFirestore, connectFirestoreEmulator, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, query, runTransaction, serverTimestamp, terminate, Timestamp, where, type Firestore, type QueryConstraint, type Unsubscribe,
} from 'firebase/firestore';
import type { CollectionName, Rol, State } from '../../types/model';
import type { ChangeSet, DataStore, Fixup } from '../datastore';
import { emptyState } from '../../domain/seed';
import { firebaseApp, USE_EMULATORS } from './config';
import { friendlyError } from './errors';

type Doc = Record<string, unknown> & { id: string; _v?: number; _u?: number; _deleted?: boolean };

/** Colecciones que carga cada rol (las reglas de Firestore niegan el resto). */
function collectionsFor(rol: Rol, uid: string): { col: CollectionName; where?: QueryConstraint[] }[] {
  const seller: CollectionName[] = ['users', 'products', 'producers', 'receptions', 'lots', 'moves', 'sales', 'clients', 'creditPayments', 'refunds', 'creditRequests', 'priceRequests', 'comRequests', 'abonoRequests'];
  if (rol === 'contador') return (['users', 'products', 'sales', 'clients'] as CollectionName[]).map((col) => ({ col }));
  if (rol === 'vendedor') return [...seller.map((col) => ({ col })), { col: 'closures', where: [where('vendedor', '==', uid)] }];
  return ([...seller, 'closures', 'prices', 'liqs', 'audit', 'expenses', 'fixed', 'notes', 'operations', 'adjustments', 'fiscalEvents'] as CollectionName[]).map((col) => ({ col }));
}

const SYNC_MARGIN_MS = 120000;
const toPlain = (id: string, data: Record<string, unknown>): Doc => {
  const out: Doc = { ...data, id };
  if (data._u instanceof Timestamp) out._u = data._u.toMillis();
  return out;
};

/**
 * Persistencia en Cloud Firestore.
 * - Lectura: cada dispositivo mantiene una copia local (caché persistente) y solo descarga lo que cambió desde su última sincronización.
 * - Escritura: cada comando se guarda en una transacción con control de versión (_v), saldo por lote (no se vende dos veces lo mismo)
 *   y número de venta correlativo del servidor.
 */
export class FirestoreDataStore implements DataStore {
  readonly kind = 'firestore' as const;
  private db: Firestore | null = null;
  private docs = new Map<CollectionName, Map<string, Doc>>();
  private meta: { cfg?: State['cfg']; families?: string[]; epoch?: number } = {};
  private offs: Unsubscribe[] = [];
  private onRemote: ((s: State) => void) | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;

  private rol: Rol = 'contador';
  constructor(private readonly uid: string) {}

  /** Rol y estado del usuario: se leen del servidor (o de la copia local si no hay señal). */
  private async readUser(db: Firestore): Promise<void> {
    const ref = doc(db, 'users', this.uid);
    const snap = await getDoc(ref).catch(() => getDocFromCache(ref));
    const d = snap.data() as { rol?: Rol; activo?: boolean } | undefined;
    if (!d || d.activo !== true || !d.rol) throw new Error('Tu usuario no está habilitado. Pide a Luis que lo revise.');
    this.rol = d.rol;
  }

  private syncKey(col: string) { return `bodegaLV.sync.${this.uid}.${col}`; }

  /** Abre Firestore. Si el dispositivo tenía datos de otro usuario, borra la copia local antes de usarla. */
  private async open(): Promise<Firestore> {
    if (this.db) return this.db;
    const app = firebaseApp();
    const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true });
    if (USE_EMULATORS) connectFirestoreEmulator(db, import.meta.env.VITE_EMULATOR_HOST || '127.0.0.1', 8080);
    const owner = localStorage.getItem('bodegaLV.cacheOwner');
    if (owner && owner !== this.uid) {
      await clearIndexedDbPersistence(db).catch(() => undefined);
      Object.keys(localStorage).filter((k) => k.startsWith('bodegaLV.sync.')).forEach((k) => localStorage.removeItem(k));
    }
    localStorage.setItem('bodegaLV.cacheOwner', this.uid);
    this.db = db;
    return db;
  }

  async load(): Promise<State | null> {
    const db = await this.open();
    await this.readUser(db);
    const cols = collectionsFor(this.rol, this.uid);
    // 1) copia local (instantánea, también sin señal)
    await Promise.all(cols.map(async ({ col, where: w }) => {
      const m = new Map<string, Doc>();
      try {
        const snap = await getDocsFromCache(query(collection(db, col), ...(w || [])));
        snap.forEach((d) => m.set(d.id, toPlain(d.id, d.data())));
      } catch { /* sin caché todavía */ }
      this.docs.set(col, m);
    }));
    // 2) cambios desde la última sincronización (y escucha en tiempo real)
    const firsts: Promise<void>[] = [];
    for (const { col, where: w } of cols) {
      const since = Number(localStorage.getItem(this.syncKey(col)) || 0);
      const q = since && this.docs.get(col)!.size
        ? query(collection(db, col), ...(w || []), where('_u', '>', Timestamp.fromMillis(Math.max(0, since - SYNC_MARGIN_MS))))
        : query(collection(db, col), ...(w || []));
      firsts.push(new Promise((resolve, reject) => {
        let first = true;
        this.offs.push(onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
          const m = this.docs.get(col)!;
          let max = Number(localStorage.getItem(this.syncKey(col)) || 0);
          snap.docChanges().forEach((ch) => {
            if (ch.type === 'removed' && !w) return; // fuera del filtro de fecha: sigue vigente en la copia local
            const d = toPlain(ch.doc.id, ch.doc.data());
            m.set(d.id, d);
            if (typeof d._u === 'number' && d._u > max) max = d._u;
          });
          if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) localStorage.setItem(this.syncKey(col), String(max));
          if (first) { first = false; resolve(); } else this.scheduleFlush();
        }, (err) => { if (first) { first = false; reject(friendlyError(err)); } }));
      }));
    }
    // 3) ajustes, familias y época (un reinicio obliga a recargar todo)
    firsts.push(new Promise((resolve, reject) => {
      let first = true;
      this.offs.push(onSnapshot(doc(db, 'meta', 'app'), (snap) => {
        const data = snap.data() as { cfg?: State['cfg']; families?: string[]; epoch?: number } | undefined;
        const prevEpoch = this.meta.epoch, storedEpoch = Number(localStorage.getItem(`bodegaLV.epoch.${this.uid}`) || 0);
        this.meta = { cfg: data?.cfg, families: data?.families, epoch: data?.epoch || 0 };
        if ((prevEpoch !== undefined && prevEpoch !== this.meta.epoch) || (first && storedEpoch && storedEpoch !== this.meta.epoch && !snap.metadata.fromCache)) {
          void this.resetLocalCopy();
          return;
        }
        if (!snap.metadata.fromCache) localStorage.setItem(`bodegaLV.epoch.${this.uid}`, String(this.meta.epoch));
        if (first) { first = false; resolve(); } else this.scheduleFlush();
      }, (err) => { if (first) { first = false; reject(friendlyError(err)); } }));
    }));
    await Promise.all(firsts);
    this.ready = true;
    return this.buildState();
  }

  /** Tras un reinicio de datos desde otro dispositivo: borra la copia local y recarga. */
  private async resetLocalCopy(): Promise<void> {
    Object.keys(localStorage).filter((k) => k.startsWith('bodegaLV.sync.') || k.startsWith('bodegaLV.epoch.')).forEach((k) => localStorage.removeItem(k));
    await this.close();
    location.reload();
  }

  private buildState(): State {
    const S = emptyState() as unknown as Record<string, unknown>;
    for (const [col, m] of this.docs) S[col] = [...m.values()].filter((d) => !d._deleted);
    const base = S as unknown as State;
    if (this.meta.cfg) base.cfg = this.meta.cfg;
    base.families = this.meta.families || [];
    // orden estable, como el prototipo (orden de creación): posición, fecha propia o fecha del servidor, e id
    type O = { pos?: number; fecha?: number; creado?: number; createdAt?: number; _u?: number; id: string };
    const key = (d: O) => d.fecha ?? d.creado ?? d.createdAt ?? d._u ?? 0;
    for (const col of this.docs.keys()) (S[col] as O[]).sort((a, b) => (a.pos ?? 1e9) - (b.pos ?? 1e9) || key(a) - key(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return base;
  }

  private scheduleFlush(): void {
    if (!this.ready || this.flushTimer) return;
    this.flushTimer = setTimeout(() => { this.flushTimer = null; this.onRemote?.(this.buildState()); }, 50);
  }

  subscribe(onRemote: (s: State) => void): () => void {
    this.onRemote = onRemote;
    return () => { this.onRemote = null; };
  }

  async commit(changes: ChangeSet, next: State, prev: State): Promise<Fixup[]> {
    const db = await this.open();
    const prevById = (col: CollectionName, id: string) => (prev[col] as Doc[]).find((d) => d.id === id);
    const products = new Map(next.products.map((p) => [p.id, p]));
    // movimientos nuevos → variación de saldo por lote
    const deltas = new Map<string, { qty: number; envase: boolean }>();
    for (const s of changes.set) {
      if (s.col !== 'moves' || prevById('moves', s.id)) continue;
      const m = s.data as { lot: string; prod: string; qty: number };
      const cur = deltas.get(m.lot) || { qty: 0, envase: !!products.get(m.prod)?.envase };
      cur.qty += m.qty;
      deltas.set(m.lot, cur);
    }
    const newSale = changes.set.find((s) => s.col === 'sales' && !prevById('sales', s.id));
    if (changes.set.length + changes.del.length + deltas.size + 2 > 490) throw new Error('La operación es demasiado grande para guardarla de una vez.');
    try {
      return await runTransaction(db, async (tx) => {
        const fixups: Fixup[] = [];
        let saleNum: number | null = null;
        // ----- lecturas -----
        const updates = changes.set.filter((s) => prevById(s.col, s.id));
        const current = await Promise.all(updates.map((s) => tx.get(doc(db, s.col, s.id))));
        const delCurrent = await Promise.all(changes.del.map((d) => tx.get(doc(db, d.col, d.id))));
        const stockRefs = [...deltas.keys()].map((lot) => doc(db, 'stock', lot || '_sin_lote'));
        const stockSnaps = await Promise.all(stockRefs.map((r) => tx.get(r)));
        const counterSnap = newSale ? await tx.get(doc(db, 'meta', 'counters')) : null;
        // ----- control de concurrencia: nadie cambió estos datos mientras se preparaba la operación -----
        updates.forEach((s, i) => {
          const base = prevById(s.col, s.id)?._v ?? 0, srv = current[i].exists() ? (current[i].data()?._v as number | undefined) ?? 0 : null;
          if (srv !== base) throw new Error('Otro usuario cambió estos datos recién. Revisa la pantalla actualizada e inténtalo de nuevo.');
        });
        changes.del.forEach((d, i) => {
          const base = prevById(d.col, d.id)?._v ?? 0, srv = delCurrent[i].exists() ? (delCurrent[i].data()?._v as number | undefined) ?? 0 : null;
          if (srv !== null && srv !== base) throw new Error('Otro usuario cambió estos datos recién. Revisa la pantalla actualizada e inténtalo de nuevo.');
        });
        // ----- saldo por lote (no se vende ni se mermea lo que otro ya sacó) -----
        [...deltas.entries()].forEach(([lot, dlt], i) => {
          const snap = stockSnaps[i];
          const base = snap.exists() ? Number(snap.data()?.saldo || 0) : (prev.moves.filter((m) => m.lot === lot).reduce((a, m) => a + m.qty, 0));
          const saldo = Math.round((base + dlt.qty) * 1000) / 1000;
          if (!dlt.envase && dlt.qty < 0 && saldo < -0.001) throw new Error('Otro vendedor acaba de sacar parte de ese stock. Revisa las cantidades disponibles e inténtalo de nuevo.');
          tx.set(stockRefs[i], { saldo, envase: dlt.envase, _u: serverTimestamp() });
        });
        // ----- número de venta correlativo del servidor -----
        if (newSale && counterSnap) {
          if (!counterSnap.exists()) throw new Error('Falta el contador de ventas en la base de datos (meta/counters). Pide al administrador revisar la instalación.');
          const num = Number(counterSnap.data().saleNum) + 1;
          tx.update(doc(db, 'meta', 'counters'), { saleNum: num, _u: serverTimestamp() });
          saleNum = num;
          fixups.push({ col: 'sales', id: newSale.id, patch: { num } });
        }
        // ----- escrituras -----
        for (const s of changes.set) {
          const base = prevById(s.col, s.id), v = base ? (base._v ?? 0) + 1 : 1;
          const { _u: _ignoredU, ...rest } = s.data as Doc;
          void _ignoredU;
          const data: Record<string, unknown> = { ...rest, _v: v, _u: serverTimestamp() };
          if (saleNum !== null && newSale && s.col === 'sales' && s.id === newSale.id) data.num = saleNum;
          if (s.col === 'users') delete data.clave; // la clave nunca se guarda en Firestore
          tx.set(doc(db, s.col, s.id), data);
          const fx = fixups.find((f) => f.col === s.col && f.id === s.id);
          if (fx) fx.patch._v = v; else fixups.push({ col: s.col, id: s.id, patch: { _v: v } });
        }
        // los borrados quedan como marca (para que los demás dispositivos se enteren en la sincronización incremental)
        for (const d of changes.del) {
          const base = prevById(d.col, d.id);
          tx.set(doc(db, d.col, d.id), { id: d.id, _deleted: true, _v: (base?._v ?? 0) + 1, _u: serverTimestamp() });
        }
        if (changes.meta && (changes.meta.cfg !== prev.cfg || (changes.meta.families || []) !== (prev.families || []))) {
          tx.set(doc(db, 'meta', 'app'), { cfg: changes.meta.cfg, families: changes.meta.families, _u: serverTimestamp() }, { merge: true });
        }
        return fixups;
      });
    } catch (e) {
      throw friendlyError(e);
    }
  }

  async replaceAll(): Promise<void> {
    throw new Error('El reinicio de datos se hace con la función del servidor.');
  }

  async close(): Promise<void> {
    this.offs.forEach((o) => o());
    this.offs = [];
    if (this.db) { await terminate(this.db).catch(() => undefined); this.db = null; }
  }
}
