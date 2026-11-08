import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { userInputError, type UserDoc, type UserInput } from './users.js';

initializeApp();
setGlobalOptions({ region: 'southamerica-west1', maxInstances: 5 });
const db = getFirestore();
/** Dominio interno de los correos de Firebase Auth (el usuario ingresa solo su nombre de usuario). */
const EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || 'usuarios.bodega-lo-valledor.app';
export const emailFor = (usuario: string): string => `${usuario}@${EMAIL_DOMAIN}`;

async function requireAdmin(req: CallableRequest): Promise<UserDoc> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión de nuevo.');
  const snap = await db.doc(`users/${req.auth.uid}`).get();
  const u = snap.data() as UserDoc | undefined;
  if (!u || !u.activo || u.rol !== 'admin') throw new HttpsError('permission-denied', 'Requiere administrador.');
  return { ...u, id: snap.id };
}
const audit = (user: string, accion: string, entidad: string, antes: string, despues: string) => {
  const ref = db.collection('audit').doc();
  return { ref, data: { id: ref.id, user, accion, entidad, antes, despues, fecha: Date.now(), _u: FieldValue.serverTimestamp(), _v: 1 } };
};

/**
 * Alta o edición de usuario (solo administrador).
 * Crea/actualiza la cuenta en Firebase Auth y el documento users/{uid}. La contraseña nunca se guarda en Firestore.
 * Desactivar un usuario deshabilita su cuenta y revoca sus sesiones (cierre de sesión remoto).
 */
export const saveUser = onCall(async (req: CallableRequest<{ id?: string; input: UserInput }>) => {
  const actor = await requireAdmin(req);
  const id = String(req.data?.id || ''), input = req.data?.input;
  if (!input) throw new HttpsError('invalid-argument', 'Datos incompletos.');
  const all = (await db.collection('users').get()).docs.map((d) => ({ ...(d.data() as UserDoc), id: d.id }));
  const err = userInputError(id, input, all, actor.id);
  if (err) throw new HttpsError('failed-precondition', err);
  const data = { nombre: input.nombre.trim(), usuario: input.usuario.trim().toLowerCase(), rol: input.rol, turno: input.turno };
  const auth = getAuth();
  if (id) {
    const prev = all.find((u) => u.id === id);
    if (!prev) throw new HttpsError('not-found', 'Usuario no encontrado.');
    const activo = input.activo ?? prev.activo;
    await auth.updateUser(id, { displayName: data.nombre, disabled: !activo, ...(input.clave ? { password: input.clave } : {}) });
    if (!activo || input.clave) await auth.revokeRefreshTokens(id);
    const a = audit(actor.id, 'Edita usuario', prev.nombre, `${prev.rol}/${prev.activo ? 'activo' : 'inactivo'}`, `${data.rol}/${activo ? 'activo' : 'inactivo'}${input.clave ? ' · contraseña restablecida' : ''}`);
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`users/${id}`), cur = await tx.get(ref);
      tx.update(ref, { ...data, activo, id, _u: FieldValue.serverTimestamp(), _v: ((cur.data()?._v as number) || 0) + 1 });
      tx.set(a.ref, a.data);
    });
    return { id };
  }
  const created = await auth.createUser({ email: emailFor(data.usuario), password: input.clave, displayName: data.nombre, disabled: false });
  const a = audit(actor.id, 'Crea usuario', data.nombre, '', data.rol);
  await db.runTransaction(async (tx) => {
    tx.set(db.doc(`users/${created.uid}`), { ...data, id: created.uid, activo: true, cambiosClave: [], _u: FieldValue.serverTimestamp(), _v: 1 });
    tx.set(a.ref, a.data);
  });
  return { id: created.uid };
});

const OPERATIONAL = ['producers', 'receptions', 'lots', 'moves', 'stock', 'sales', 'closures', 'liqs', 'prices', 'expenses', 'fixed', 'notes', 'clients', 'creditPayments', 'creditRequests', 'priceRequests', 'abonoRequests', 'comRequests', 'operations', 'refunds', 'adjustments', 'fiscalEvents'];
/**
 * Reinicio de datos (solo administrador): borra las operaciones y conserva usuarios, catálogo y ajustes.
 * Sube `epoch` para que todos los dispositivos descarten su copia local y vuelvan a cargar.
 */
export const resetData = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (req: CallableRequest<{ confirm?: string }>) => {
  const actor = await requireAdmin(req);
  if (req.data?.confirm !== 'BORRAR') throw new HttpsError('failed-precondition', 'Falta la confirmación.');
  for (const col of OPERATIONAL) await db.recursiveDelete(db.collection(col));
  const a = audit(actor.id, 'Reinicia datos', 'Bodega', '', 'operaciones borradas');
  await db.doc('meta/app').set({ epoch: FieldValue.increment(1), _u: FieldValue.serverTimestamp() }, { merge: true });
  await db.doc('meta/counters').set({ saleNum: 1000, _u: FieldValue.serverTimestamp() });
  await a.ref.set(a.data);
  return { ok: true };
});
