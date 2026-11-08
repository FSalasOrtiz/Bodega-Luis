import type { State } from '../types/model';

/**
 * Autenticación. Dos implementaciones:
 * - LocalAuth: compara la clave guardada en los datos locales (solo demostración/pruebas).
 * - FirebaseAuthService: Firebase Authentication (producción). La clave nunca llega a la base de datos.
 */
export interface AuthService {
  readonly kind: 'local' | 'firebase';
  /** Sesión vigente al abrir la app: id del usuario o null. */
  restore(S: State): Promise<string | null>;
  /** Devuelve el id del usuario o lanza 'Usuario o contraseña incorrectos'. */
  login(usuario: string, clave: string, S: State): Promise<string>;
  logout(): Promise<void>;
  /** Cambia la contraseña propia verificando la actual. */
  changePassword(usuario: string, actual: string, nueva: string, S: State): Promise<void>;
}

export const BAD_LOGIN = 'Usuario o contraseña incorrectos';
const SESSION_KEY = 'bodegaLV.me';

export class LocalAuth implements AuthService {
  readonly kind = 'local' as const;
  async restore(S: State): Promise<string | null> {
    try {
      const id = sessionStorage.getItem(SESSION_KEY);
      return id && S.users.some((u) => u.id === id && u.activo) ? id : null;
    } catch { return null; }
  }
  async login(usuario: string, clave: string, S: State): Promise<string> {
    const u = usuario.trim().toLowerCase();
    const x = S.users.find((y) => y.activo && y.usuario === u && y.clave === clave);
    if (!x) throw new Error(BAD_LOGIN);
    try { sessionStorage.setItem(SESSION_KEY, x.id); } catch { /* sin almacenamiento de sesión */ }
    return x.id;
  }
  async logout(): Promise<void> {
    try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem('bodegaLV.view'); } catch { /* nada */ }
  }
  async changePassword(usuario: string, actual: string, _nueva: string, S: State): Promise<void> {
    const x = S.users.find((y) => y.usuario === usuario);
    if (!x || x.clave !== actual) throw new Error('La contraseña actual no es correcta.');
    // en modo local la clave nueva se guarda con el comando recordPasswordChangeCmd
  }
}
