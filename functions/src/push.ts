import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';

/*
 * Notificaciones push a los administradores (Luis) cuando un vendedor pide una autorización.
 * Llegan aunque la app esté cerrada. Cada dispositivo que activó los avisos queda en pushTokens/{token}.
 * Se envían como mensajes de datos: el service worker de la app (web/public/sw.js) arma la notificación.
 */

const db = () => getFirestore();
const clp = (n: unknown): string => { const v = Math.round(Number(n) || 0); return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('es-CL'); };
const pct = (v: unknown): string => String(v ?? '').replace('.', ',') + '%';
async function nameOf(col: string, id: unknown, fallback: string): Promise<string> {
  if (typeof id !== 'string' || !id) return fallback;
  try { return String((await db().doc(`${col}/${id}`).get()).get('nombre') || fallback); } catch { return fallback; }
}

/** Errores de FCM que indican que el token ya no sirve (app desinstalada, permiso quitado, etc.). */
const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

export async function notifyAdmins(title: string, body: string): Promise<void> {
  const admins = (await db().collection('users').get()).docs.filter((d) => d.get('rol') === 'admin' && d.get('activo') === true).map((d) => d.id);
  if (!admins.length) return;
  const toks = (await db().collection('pushTokens').get()).docs.filter((d) => admins.includes(String(d.get('user'))));
  if (!toks.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens: toks.map((d) => d.id),
    data: { title, body, tag: 'solicitudes' },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  });
  const dead = res.responses.map((r, i) => (!r.success && DEAD.has(r.error?.code || '') ? toks[i].ref : null)).filter((r) => r !== null);
  await Promise.all(dead.map((ref) => ref.delete()));
  logger.info('push solicitudes', { enviados: res.successCount, fallidos: res.failureCount, borrados: dead.length });
}

const pendiente = (d: FirebaseFirestore.DocumentData | undefined): boolean => !!d && d.estado === 'pendiente';

export const pushCreditRequest = onDocumentCreated('creditRequests/{id}', async (e) => {
  const r = e.data?.data(); if (!pendiente(r)) return;
  await notifyAdmins('Piden autorizar un crédito', `${await nameOf('users', r!.user, 'Un vendedor')} quiere fiar ${clp(r!.monto)} a ${r!.clienteNombre || 'un cliente'} (venta de ${clp(r!.total)})`);
});
export const pushPriceRequest = onDocumentCreated('priceRequests/{id}', async (e) => {
  const r = e.data?.data(); if (!pendiente(r)) return;
  const normal = r!.precioNormal ? ` (normal ${clp(r!.precioNormal)})` : '';
  await notifyAdmins('Piden otro precio', `${await nameOf('users', r!.user, 'Un vendedor')} quiere vender ${await nameOf('products', r!.prod, 'un producto')} a ${clp(r!.precio)}${normal}`);
});
export const pushComRequest = onDocumentCreated('comRequests/{id}', async (e) => {
  const r = e.data?.data(); if (!pendiente(r)) return;
  await notifyAdmins('Piden cambiar la comisión', `${await nameOf('users', r!.user, 'Un vendedor')} quiere cobrar ${pct(r!.pct)} de comisión${r!.pctNormal != null ? ` (normal ${pct(r!.pctNormal)})` : ''}`);
});
export const pushAbonoRequest = onDocumentCreated('abonoRequests/{id}', async (e) => {
  const r = e.data?.data(); if (!pendiente(r)) return;
  await notifyAdmins('Pago de deuda por autorizar', `${await nameOf('users', r!.user, 'Un vendedor')} recibió ${clp(r!.monto)} de ${await nameOf('clients', r!.cliente, 'un cliente')}`);
});
export const pushVoidRequest = onDocumentUpdated('sales/{id}', async (e) => {
  const before = e.data?.before.data(), after = e.data?.after.data();
  if (!after?.solicitud || before?.solicitud || after.estado !== 'vigente') return;
  await notifyAdmins('Piden anular una venta', `${await nameOf('users', after.vendedor, 'Un vendedor')} pide anular la venta N° ${after.num} (${clp(after.total)}): “${after.solicitud}”`);
});
