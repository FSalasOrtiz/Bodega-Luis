import type { CollectionName, State } from '../types/model';

/** Documentos que cambiaron en un comando (calculados por referencia gracias a Immer). */
export interface ChangeSet {
  set: { col: CollectionName; id: string; data: Record<string, unknown> }[];
  del: { col: CollectionName; id: string }[];
  /** Documento único con ajustes (cfg), familias y revisión. */
  meta?: Pick<State, 'cfg' | 'workflowRevision' | 'workflowSchema'> & { families: string[] };
}

/** Ajuste que el servidor impone a un documento recién guardado. */
export interface Fixup { col: CollectionName; id: string; patch: Record<string, unknown> }

/**
 * Persistencia de la bodega. Dos implementaciones:
 * - LocalDataStore: navegador (modo demostración y pruebas).
 * - FirestoreDataStore: base central en Cloud Firestore (producción).
 */
export interface DataStore {
  readonly kind: 'local' | 'firestore';
  /** Carga el estado. `null` si no hay datos todavía. */
  load(): Promise<State | null>;
  /**
   * Persiste los cambios de un comando de forma atómica. Si falla, lanza un Error con mensaje para el usuario.
   * Puede devolver ajustes del servidor (versión del documento, número definitivo de la venta) que se aplican al estado.
   */
  commit(changes: ChangeSet, next: State, prev: State): Promise<Fixup[] | void>;
  /** Avisa cuando otro dispositivo o pestaña cambia los datos. Devuelve la función para dejar de escuchar. */
  /** Recibe el estado o una función que lo construye en el momento de aplicarlo (evita aplicar una foto vieja). */
  subscribe(onRemote: (s: State | (() => State)) => void): () => void;
  /** Reemplaza todos los datos (reinicio). Solo administrador. */
  replaceAll(s: State): Promise<void>;
}
