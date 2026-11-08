import { store } from '../../state/store';
import { emptyState } from '../../domain/seed';
import { adminServices, services } from '../../app/services';
import type { DataStore } from '../datastore';
import { FirebaseAuthService } from './auth';
import { FirestoreDataStore } from './datastore';
import { callResetData, FirebaseUserAdmin } from './users';

let current: FirestoreDataStore | null = null;
let unsubscribe: (() => void) | null = null;

/** Antes de iniciar sesión no hay datos: el login funciona sin leer la base. */
const signedOutStore: DataStore = {
  kind: 'firestore',
  load: async () => null,
  commit: async () => { throw new Error('Inicia sesión para guardar.'); },
  subscribe: () => () => undefined,
  replaceAll: async () => { throw new Error('Inicia sesión.'); },
};

/** Al iniciar sesión: carga lo que el rol puede ver y escucha los cambios de los demás dispositivos. */
async function onSignedIn(uid: string): Promise<void> {
  await onSignedOut();
  const ds = new FirestoreDataStore(uid);
  try {
    const S = await ds.load();
    const u = S?.users.find((x) => x.id === uid);
    if (!S || !u || !u.activo) throw new Error('Tu usuario no está habilitado. Pide a Luis que lo revise.');
    current = ds;
    store.init(ds, S);
    unsubscribe = ds.subscribe((remote) => store.applyRemote(remote));
  } catch (e) {
    await ds.close();
    throw e;
  }
}
/** Al cerrar sesión: deja de escuchar y no deja datos en pantalla para el siguiente usuario. */
async function onSignedOut(): Promise<void> {
  unsubscribe?.();
  unsubscribe = null;
  if (current) { await current.close(); current = null; }
  store.init(signedOutStore, { ...emptyState(), users: [] });
}

export async function startFirebase(): Promise<void> {
  services.auth = new FirebaseAuthService(onSignedIn, onSignedOut);
  adminServices.users = new FirebaseUserAdmin();
  adminServices.allowDemoData = false;
  adminServices.reset = async (blank) => {
    if (!blank) throw new Error('En producción no se cargan datos de ejemplo.');
    await callResetData();
  };
  store.init(signedOutStore, { ...emptyState(), users: [] });
}
