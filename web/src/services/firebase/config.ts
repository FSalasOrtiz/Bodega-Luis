import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

/**
 * Configuración pública del proyecto web de Firebase (no es secreta: la seguridad está en las reglas y en Auth).
 * Se toma de variables VITE_FIREBASE_* según el entorno (.env.development, .env.staging, .env.production).
 */
const env = import.meta.env;
export const USE_EMULATORS = env.VITE_USE_EMULATORS === 'true';
export const EMAIL_DOMAIN = env.VITE_AUTH_EMAIL_DOMAIN || 'usuarios.bodega-lo-valledor.app';
export const REGION = env.VITE_FUNCTIONS_REGION || 'southamerica-west1';
/** El usuario escribe solo su nombre de usuario; Firebase Auth usa un correo interno derivado. */
export const emailFor = (usuario: string): string => `${usuario.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

let app: FirebaseApp | null = null, auth: Auth | null = null, functions: Functions | null = null;

export function firebaseApp(): FirebaseApp {
  if (app) return app;
  const projectId = env.VITE_FIREBASE_PROJECT_ID || (USE_EMULATORS ? 'demo-bodega' : '');
  if (!projectId) throw new Error('Falta la configuración de Firebase (VITE_FIREBASE_PROJECT_ID).');
  app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    appId: env.VITE_FIREBASE_APP_ID || undefined,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
  });
  return app;
}
export function firebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(firebaseApp());
  if (USE_EMULATORS) connectAuthEmulator(auth, `http://${env.VITE_EMULATOR_HOST || '127.0.0.1'}:9099`, { disableWarnings: true });
  return auth;
}
export function firebaseFunctions(): Functions {
  if (functions) return functions;
  functions = getFunctions(firebaseApp(), REGION);
  if (USE_EMULATORS) connectFunctionsEmulator(functions, env.VITE_EMULATOR_HOST || '127.0.0.1', 5001);
  return functions;
}
