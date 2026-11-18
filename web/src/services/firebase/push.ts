import { deleteDoc, doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { firebaseApp, firebaseAuth, USE_EMULATORS } from './config';

/*
 * Notificaciones push (Firebase Cloud Messaging) para el administrador: llegan aunque la app esté cerrada.
 * El dispositivo se guarda en pushTokens/{token}; la Cloud Function avisa a esos dispositivos.
 * Sin VITE_FIREBASE_VAPID_KEY se usa la clave web por defecto de Firebase.
 */

const KEY = 'bodegaLV.pushToken';
const stored = (): string => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const remember = (t: string) => { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } };

/** Registra este dispositivo para recibir avisos. Devuelve false si el navegador no lo permite. */
export async function enablePush(reg: ServiceWorkerRegistration): Promise<boolean> {
  if (USE_EMULATORS || !(await isSupported().catch(() => false))) return false;
  const uid = firebaseAuth().currentUser?.uid;
  if (!uid) return false;
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined;
  const token = await getToken(getMessaging(firebaseApp()), { serviceWorkerRegistration: reg, ...(vapidKey ? { vapidKey } : {}) });
  if (!token) return false;
  const prev = stored();
  if (prev && prev !== token) await deleteDoc(doc(getFirestore(firebaseApp()), 'pushTokens', prev)).catch(() => undefined);
  await setDoc(doc(getFirestore(firebaseApp()), 'pushTokens', token), { user: uid, token, ua: navigator.userAgent.slice(0, 200), _u: serverTimestamp() });
  remember(token);
  return true;
}

/** Al cerrar sesión: este dispositivo deja de recibir avisos (por si lo usa otra persona). */
export async function disablePush(): Promise<void> {
  const token = stored();
  if (!token) return;
  remember('');
  const timeout = new Promise((r) => setTimeout(r, 3000));
  await Promise.race([Promise.all([
    deleteDoc(doc(getFirestore(firebaseApp()), 'pushTokens', token)).catch(() => undefined),
    deleteToken(getMessaging(firebaseApp())).catch(() => undefined),
  ]), timeout]);
}

export const pushActive = (): boolean => !!stored();
