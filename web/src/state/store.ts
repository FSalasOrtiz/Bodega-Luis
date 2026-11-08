import { enablePatches, freeze, isDraft, current, produce, produceWithPatches, setAutoFreeze } from 'immer';
import { useSyncExternalStore } from 'react';
import type { PosDraft, State } from '../types/model';
import type { DataStore } from '../services/datastore';
import { ctx } from '../domain/ctx';
import { POS_DEFAULT, POS_KEYS } from '../domain/pos';
import { ensureWorkflowState } from '../domain/workflow';
import { changesFrom } from './changes';
import { Popt } from '../domain/catalog';

enablePatches();
setAutoFreeze(true);

export type View = 'dash' | 'pos' | 'rec' | 'inv' | 'sales' | 'caja' | 'credits' | 'prod' | 'bal' | 'users';

export interface Snapshot {
  S: State;
  meId: string | null;
  ui: PosDraft;
  view: View;
  /** Cambia en cada actualización: sirve para memorizar cálculos derivados. */
  version: number;
  ready: boolean;
  online: boolean;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let snap: Snapshot = { S: undefined as unknown as State, meId: null, ui: POS_DEFAULT(), view: 'dash', version: 0, ready: false, online: true };
let datastore: DataStore | null = null;
let queue: Promise<unknown> = Promise.resolve();

function publish(partial: Partial<Snapshot>): void {
  snap = { ...snap, ...partial, version: snap.version + 1 };
  ctx.S = snap.S;
  ctx.meId = snap.meId;
  ctx.ui = snap.ui;
  listeners.forEach((l) => l());
}

export const store = {
  get: (): Snapshot => snap,
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get datastore(): DataStore | null {
    return datastore;
  },
  /** Carga el estado inicial desde el almacén. */
  init(ds: DataStore, S: State): void {
    datastore = ds;
    const fixed = normalize(S);
    publish({ S: fixed, ready: true });
  },
  /** Datos que llegan de otro dispositivo o pestaña. */
  applyRemote(S: State | (() => State)): void {
    queue = queue.then(() => publish({ S: normalize(typeof S === 'function' ? S() : S) }));
  },
  setSession(meId: string | null, view?: View): void {
    publish({ meId, ...(view ? { view } : {}) });
  },
  setView(view: View): void {
    publish({ view });
  },
  setOnline(online: boolean): void {
    if (online !== snap.online) publish({ online });
  },
  /** Borrador del punto de venta (por usuario, no compartido). */
  setUi(patch: Partial<PosDraft> | ((u: PosDraft) => Partial<PosDraft>)): void {
    const p = typeof patch === 'function' ? patch(snap.ui) : patch;
    publish({ ui: { ...snap.ui, ...p } });
    savePosDraft();
  },
  /**
   * Ejecuta un comando de negocio de forma atómica.
   * El comando muta un borrador (Immer). Si lanza un error o no se puede guardar, el estado no cambia.
   * Los comandos se serializan para que cada uno vea el resultado del anterior.
   */
  run<T>(fn: () => T): Promise<T> {
    const job = queue.then(async () => {
      const prev = snap.S;
      let result: T | undefined;
      const [next, patches] = produceWithPatches(prev, (draft) => {
        ctx.S = draft as State;
        try {
          const r = fn();
          result = (isDraft(r) ? (current(r as object) as T) : r);
        } finally {
          ctx.S = prev;
        }
      });
      if (patches.length) {
        if (!datastore) throw new Error('El almacenamiento no está listo.');
        const changes = changesFrom(prev, next, patches);
        const fixups = await datastore.commit(changes, next, prev);
        let final = next;
        if (fixups && fixups.length) {
          final = produce(next, (d) => {
            for (const f of fixups) {
              const doc = (d[f.col] as { id: string }[]).find((x) => x.id === f.id);
              if (doc) Object.assign(doc, f.patch);
            }
          });
          // el resultado devuelto (p. ej. la venta) refleja el número definitivo
          const r = result as unknown as { id?: string } | undefined;
          if (r && typeof r === 'object' && r.id) {
            const fx = fixups.find((f) => f.id === r.id);
            if (fx) result = { ...(result as object), ...fx.patch } as T;
          }
        }
        publish({ S: final });
      }
      return result as T;
    });
    queue = job.catch(() => undefined);
    return job;
  },
  /** Reemplaza todo el estado (reinicio de datos). */
  async replaceAll(S: State): Promise<void> {
    if (!datastore) throw new Error('El almacenamiento no está listo.');
    const fixed = normalize(S);
    await datastore.replaceAll(fixed);
    publish({ S: fixed });
  },
};

/** Completa colecciones nuevas y congela el estado (Immer exige inmutabilidad). */
function normalize(S: State): State {
  const prev = ctx.S;
  const copy: State = { ...S };
  ctx.S = copy;
  try {
    ensureWorkflowState();
    for (const k of ['users', 'products', 'producers', 'receptions', 'lots', 'moves', 'sales', 'closures', 'liqs', 'prices', 'audit', 'expenses', 'fixed', 'notes'] as const) copy[k] ??= [];
    // los cambios de precio antiguos no tenían id
    if (copy.prices.some((p) => !p.id)) copy.prices = copy.prices.map((p, i) => (p.id ? p : { ...p, id: `pc-legacy-${i}-${p.desde}` }));
  } finally {
    ctx.S = prev;
  }
  return freeze(copy, true);
}

/* ---------- borrador del punto de venta: se guarda por usuario para no perderlo al recargar ---------- */
const posKey = () => 'bodegaLV.pos.' + (snap.meId || '');
function savePosDraft(): void {
  if (!snap.meId) return;
  try {
    localStorage.setItem(posKey(), JSON.stringify(Object.fromEntries(POS_KEYS.map((k) => [k, snap.ui[k]]))));
  } catch { /* sin almacenamiento: el borrador vive solo en memoria */ }
}
export function loadPosDraft(): PosDraft {
  const ui = POS_DEFAULT();
  if (!snap.meId) return ui;
  try {
    const d = JSON.parse(localStorage.getItem(posKey()) || 'null') as Partial<PosDraft> | null;
    if (d && typeof d === 'object') {
      for (const k of POS_KEYS) if (k in d) (ui as unknown as Record<string, unknown>)[k] = d[k];
      ui.cart = (Array.isArray(ui.cart) ? ui.cart : []).filter((c) => Popt(c.prod)?.activo && Number(c.qty) > 0);
    }
  } catch { /* borrador corrupto: se descarta */ }
  return ui;
}

/** Hook: re-renderiza el componente cuando cambia el estado. */
export function useApp(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
