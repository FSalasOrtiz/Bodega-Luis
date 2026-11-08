/**
 * Instalación inicial de la base de datos de Firebase.
 *
 *   Emulador:    FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx tsx scripts/seed-firebase.ts --project demo-bodega [--demo]
 *   Producción:  GOOGLE_APPLICATION_CREDENTIALS=clave-servicio.json npx tsx scripts/seed-firebase.ts --project <id-proyecto>
 *
 * Crea los usuarios iniciales (contraseña 111111: cada uno la cambia al implementar el sistema),
 * el catálogo, los ajustes de la bodega y el contador de ventas. Con --demo agrega ~2 meses de datos de ejemplo (SOLO emulador/pruebas).
 * Si la base ya tiene datos, se detiene (no sobrescribe nada).
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { seedState, INITIAL_PASSWORD } from '../src/domain/seed';
import { COLLECTIONS, type State } from '../src/types/model';

const args = process.argv.slice(2);
const project = args[args.indexOf('--project') + 1];
const demo = args.includes('--demo');
const domain = process.env.AUTH_EMAIL_DOMAIN || 'usuarios.bodega-lo-valledor.app';
if (!project || project.startsWith('--')) { console.error('Indica --project <id>'); process.exit(1); }
if (demo && !process.env.FIRESTORE_EMULATOR_HOST) { console.error('Los datos de ejemplo solo se cargan en el emulador.'); process.exit(1); }

initializeApp({ projectId: project });
const db = getFirestore(), auth = getAuth();

async function main() {
  if ((await db.doc('meta/app').get()).exists) { console.error('La base ya está inicializada (meta/app existe). No se modificó nada.'); process.exit(2); }
  const S: State = seedState(!demo);
  // usuarios en Firebase Auth con el mismo id que en los datos
  for (const u of S.users) {
    try { await auth.getUser(u.id); console.log('Usuario ya existe en Auth:', u.usuario); }
    catch { await auth.createUser({ uid: u.id, email: `${u.usuario}@${domain}`, password: INITIAL_PASSWORD, displayName: u.nombre }); console.log('Usuario creado:', u.usuario); }
  }
  // saldo por lote para el control de stock en transacciones
  const saldo = new Map<string, number>();
  for (const m of S.moves) saldo.set(m.lot, Math.round(((saldo.get(m.lot) || 0) + m.qty) * 1000) / 1000);
  const envase = new Set(S.products.filter((p) => p.envase).map((p) => p.id));
  const lotProd = new Map(S.lots.map((l) => [l.id, l.prod]));
  let batch = db.batch(), n = 0, total = 0;
  const put = async (path: string, data: Record<string, unknown>) => {
    batch.set(db.doc(path), data); n++; total++;
    if (n >= 450) { await batch.commit(); batch = db.batch(); n = 0; }
  };
  for (const col of COLLECTIONS) {
    for (const d of (S[col] || []) as Record<string, unknown>[]) {
      const { clave: _c, ...rest } = d as { clave?: string };
      void _c;
      await put(`${col}/${(d as { id: string }).id}`, { ...rest, _v: 1, _u: FieldValue.serverTimestamp() });
    }
  }
  for (const [lot, s] of saldo) await put(`stock/${lot || '_sin_lote'}`, { saldo: s, envase: envase.has(lotProd.get(lot) || ''), _u: FieldValue.serverTimestamp() });
  await put('meta/app', { cfg: S.cfg, families: S.families || [], epoch: 0, workflowSchema: 1, _u: FieldValue.serverTimestamp() });
  await put('meta/counters', { saleNum: 1000 + S.sales.length, _u: FieldValue.serverTimestamp() });
  await batch.commit();
  console.log(`Listo: ${total} documentos (${S.sales.length} ventas de ejemplo). Usuarios: ${S.users.map((u) => u.usuario).join(', ')} · contraseña inicial ${INITIAL_PASSWORD}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
