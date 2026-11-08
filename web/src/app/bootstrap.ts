import { store, loadPosDraft } from '../state/store';
import { LocalDataStore } from '../services/localStore';
import { LocalAuth } from '../services/auth';
import { seedState } from '../domain/seed';
import { saveUserLocalCmd } from '../domain/operations';
import { canSee, homeView } from '../routes/menu';
import { DATA_MODE, LOCAL_DEMO } from '../config/env';
import { adminServices, services } from './services';
import { routeFromHash } from './App';
import type { State } from '../types/model';
import { ctx } from '../domain/ctx';

/** Mantiene usuarios, catálogo y ajustes; borra operaciones (lo que promete "Reiniciar datos"). */
export function blankKeeping(S: State): State {
  const fresh = seedState(true);
  return { ...fresh, cfg: S.cfg, users: S.users, products: S.products, families: S.families, workflowRevision: S.workflowRevision + 1 };
}

async function startLocal(): Promise<void> {
  const ds = new LocalDataStore();
  let S = await ds.load();
  if (!S) { S = seedState(!LOCAL_DEMO); await ds.replaceAll(S); }
  services.auth = new LocalAuth();
  adminServices.users = { save: async (id, input) => { await store.run(() => saveUserLocalCmd(id, input)); } };
  adminServices.allowDemoData = true;
  // modo local: igual que el prototipo (reinicio con datos de ejemplo o en blanco desde el catálogo inicial)
  adminServices.reset = async (blank) => { const meId = ctx.meId; await store.replaceAll(seedState(blank)); if (meId) store.setSession(store.get().S.users[0].id); };
  store.init(ds, S);
  ds.subscribe((remote) => store.applyRemote(remote));
}

export async function bootstrap(): Promise<void> {
  if (DATA_MODE === 'firebase') {
    const { startFirebase } = await import('../services/firebase/start');
    await startFirebase();
  } else {
    await startLocal();
  }
  // sesión vigente y módulo (al recargar se vuelve al mismo módulo)
  const id = await services.auth.restore(store.get().S);
  const u = id ? store.get().S.users.find((x) => x.id === id && x.activo) : null;
  if (u) {
    const v = routeFromHash() || (sessionStorage.getItem('bodegaLV.view') as ReturnType<typeof routeFromHash>);
    store.setSession(u.id, v && canSee(u, v) ? v : homeView(u));
    store.setUi(loadPosDraft());
  }
}
