import { EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, signInWithEmailAndPassword, signOut, updatePassword, type User as FbUser } from 'firebase/auth';
import { BAD_LOGIN, type AuthService } from '../auth';
import { emailFor, firebaseAuth } from './config';

/** Firebase Authentication: la contraseña vive solo en Firebase Auth (nunca en Firestore ni en el navegador). */
export class FirebaseAuthService implements AuthService {
  readonly kind = 'firebase' as const;
  constructor(private readonly onSignedIn: (uid: string) => Promise<void>, private readonly onSignedOut: () => Promise<void>) {}

  private firstUser(): Promise<FbUser | null> {
    const auth = firebaseAuth();
    return new Promise((resolve) => { const off = onAuthStateChanged(auth, (u) => { off(); resolve(u); }); });
  }
  async restore(): Promise<string | null> {
    const u = await this.firstUser();
    if (!u) return null;
    try { await this.onSignedIn(u.uid); return u.uid; }
    catch { await this.logout(); return null; }
  }
  async login(usuario: string, clave: string): Promise<string> {
    const auth = firebaseAuth();
    try {
      const cred = await signInWithEmailAndPassword(auth, emailFor(usuario), clave);
      await this.onSignedIn(cred.user.uid);
      return cred.user.uid;
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (code === 'auth/too-many-requests') throw new Error('Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.', { cause: e });
      if (code === 'auth/network-request-failed') throw new Error('Sin conexión: revisa la señal e inténtalo de nuevo.', { cause: e });
      if (code.startsWith('auth/')) throw new Error(BAD_LOGIN, { cause: e });
      await signOut(auth).catch(() => undefined);
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
  async logout(): Promise<void> {
    await this.onSignedOut();
    await signOut(firebaseAuth()).catch(() => undefined);
  }
  async changePassword(usuario: string, actual: string, nueva: string): Promise<void> {
    const u = firebaseAuth().currentUser;
    if (!u) throw new Error('La sesión no está activa.');
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(emailFor(usuario), actual));
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (code === 'auth/too-many-requests') throw new Error('Demasiados intentos fallidos. Espera unos minutos.', { cause: e });
      throw new Error('La contraseña actual no es correcta.', { cause: e });
    }
    await updatePassword(u, nueva);
  }
}
