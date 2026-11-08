import type { State } from '../types/model';
import type { ChangeSet, DataStore } from './datastore';

/** Guarda todo el estado en localStorage del navegador. Solo para demostración y pruebas: no sincroniza dispositivos. */
export class LocalDataStore implements DataStore {
  readonly kind = 'local' as const;
  constructor(private readonly key = 'bodegaLV.app.v1') {}
  async load(): Promise<State | null> {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? (JSON.parse(raw) as State) : null;
    } catch {
      return null;
    }
  }
  async commit(_changes: ChangeSet, next: State): Promise<void> {
    this.write(next);
  }
  async replaceAll(s: State): Promise<void> {
    this.write(s);
  }
  private write(s: State): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(s));
    } catch (e) {
      throw new Error('No se pudo guardar el cambio en este equipo: no quedó registrado. Revisa el espacio disponible e inténtalo de nuevo. ' + (e instanceof Error ? e.message : ''));
    }
  }
  subscribe(onRemote: (s: State) => void): () => void {
    const h = (e: StorageEvent) => {
      if (e.key === this.key && e.newValue) {
        try { onRemote(JSON.parse(e.newValue) as State); } catch { /* dato corrupto: se ignora */ }
      }
    };
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  }
}
