import type { CollectionName, State } from '../types/model';

/** Documentos que cambiaron en un comando (calculados por referencia gracias a Immer). */
export interface ChangeSet {
  set: { col: CollectionName; id: string; data: Record<string, unknown> }[];
  del: { col: CollectionName; id: string }[];
  /** Documento único con ajustes (cfg), familias y revisión. */
  meta?: Pick<State, 'cfg' | 'workflowRevision' | 'workflowSchema'> & { families: string[] };
}

/**
 * Persistencia de la bodega. Dos implementaciones:
 * - LocalDataStore: navegador (modo demostración y pruebas).
 * - FirestoreDataStore: base central en Cloud Firestore (producción).
 */
export interface DataStore {
  readonly kind: 'local' | 'firestore';
  /** Carga el estado. `null` si no hay datos todavía. */
  load(): Promise<State | null>;
  /** Persiste los cambios de un comando de forma atómica. Si falla, lanza un Error con mensaje para el usuario. */
  commit(changes: ChangeSet, next: State): Promise<void>;
  /** Avisa cuando otro dispositivo o pestaña cambia los datos. Devuelve la función para dejar de escuchar. */
  subscribe(onRemote: (s: State) => void): () => void;
  /** Reemplaza todos los datos (reinicio). Solo administrador. */
  replaceAll(s: State): Promise<void>;
}
