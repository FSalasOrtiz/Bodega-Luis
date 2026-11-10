// @vitest-environment node
/**
 * Pruebas de las reglas de Firestore en el emulador (proyecto aislado `rules-test`, sin datos reales).
 * Ejecutar con: npm run test:rules (desde la raíz: firebase emulators:exec ... o con el emulador ya iniciado).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, serverTimestamp, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const now = () => Date.now();
const users = {
  luis: { id: 'luis', nombre: 'Luis', usuario: 'luis', rol: 'admin', turno: '-', activo: true },
  gonzalo: { id: 'gonzalo', nombre: 'Gonzalo', usuario: 'gonzalo', rol: 'vendedor', turno: 'noche', activo: true },
  samuel: { id: 'samuel', nombre: 'Samuel', usuario: 'samuel', rol: 'vendedor', turno: 'mañana', activo: true },
  genesis: { id: 'genesis', nombre: 'Génesis', usuario: 'genesis', rol: 'contador', turno: '-', activo: true },
  ex: { id: 'ex', nombre: 'Ex', usuario: 'ex', rol: 'admin', turno: '-', activo: false },
};
const as = (uid: keyof typeof users | null): Firestore => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore()) as unknown as Firestore;
const create = (extra: Record<string, unknown>) => ({ ...extra, _v: 1, _u: serverTimestamp() });
const sale = (id: string, vendedor: string, extra: Record<string, unknown> = {}) => create({ id, num: 1001, fecha: now(), vendedor, documento: 'boleta', estado: 'vigente', total: 20000, lineas: [], pagos: [], cierre: '', ...extra });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'rules-test', firestore: { rules: readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 } });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const u of Object.values(users)) await setDoc(doc(db, 'users', u.id), { ...u, _v: 1 });
    await setDoc(doc(db, 'products', 'p1'), { id: 'p1', sku: 'TOM-C9', nombre: 'Tomate 9', precio: 20000, _v: 1 });
    await setDoc(doc(db, 'sales', 's1'), { id: 's1', vendedor: 'gonzalo', estado: 'vigente', total: 1000, fecha: now(), solicitud: '', cierre: '', _v: 1 });
    await setDoc(doc(db, 'sales', 's2'), { id: 's2', vendedor: 'samuel', estado: 'vigente', total: 1000, fecha: now(), solicitud: '', cierre: '', _v: 1 });
    await setDoc(doc(db, 'moves', 'm1'), { id: 'm1', lot: 'l1', prod: 'p1', qty: 10, user: 'luis', fecha: now(), _v: 1 });
    await setDoc(doc(db, 'stock', 'l1'), { saldo: 10, envase: false });
    await setDoc(doc(db, 'stock', 'g1'), { saldo: 5, envase: true });
    await setDoc(doc(db, 'closures', 'k1'), { id: 'k1', vendedor: 'samuel', aprobado: '', _v: 1 });
    await setDoc(doc(db, 'liqs', 'q1'), { id: 'q1', prod: 'pr1', neto: 100, _v: 1 });
    await setDoc(doc(db, 'meta', 'counters'), { saleNum: 1000 });
    await setDoc(doc(db, 'meta', 'app'), { cfg: { nombre: 'LMA' }, epoch: 0 });
    await setDoc(doc(db, 'audit', 'a1'), { id: 'a1', user: 'luis', accion: 'x', fecha: now(), _v: 1 });
  });
});

describe('sin sesión e inactivos', () => {
  it('sin sesión no lee ni escribe nada', async () => {
    await assertFails(getDoc(doc(as(null), 'sales', 's1')));
    await assertFails(getDoc(doc(as(null), 'users', 'luis')));
    await assertFails(setDoc(doc(as(null), 'sales', 'x'), sale('x', 'gonzalo')));
  });
  it('un usuario desactivado (aunque sea admin) no puede operar', async () => {
    await assertFails(getDoc(doc(as('ex'), 'sales', 's1')));
    await assertFails(updateDoc(doc(as('ex'), 'products', 'p1'), { precio: 1, _v: 2, _u: serverTimestamp() }));
  });
});

describe('vendedor', () => {
  it('registra su propia venta', async () => { await assertSucceeds(setDoc(doc(as('gonzalo'), 'sales', 'n1'), sale('n1', 'gonzalo'))); });
  it('no registra una venta a nombre de otro vendedor', async () => { await assertFails(setDoc(doc(as('gonzalo'), 'sales', 'n2'), sale('n2', 'samuel'))); });
  it('no registra una venta con fecha alterada (más de 15 minutos)', async () => { await assertFails(setDoc(doc(as('gonzalo'), 'sales', 'n3'), sale('n3', 'gonzalo', { fecha: now() - 3600e3 }))); });
  it('no registra una venta ya anulada ni con versión falsa', async () => {
    await assertFails(setDoc(doc(as('gonzalo'), 'sales', 'n4'), sale('n4', 'gonzalo', { estado: 'anulada' })));
    await assertFails(setDoc(doc(as('gonzalo'), 'sales', 'n5'), { ...sale('n5', 'gonzalo'), _v: 7 }));
  });
  it('solo pide anulación o cierra turno sobre sus ventas', async () => {
    await assertSucceeds(updateDoc(doc(as('gonzalo'), 'sales', 's1'), { solicitud: 'me equivoqué', solicitudFecha: now(), _v: 2, _u: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('gonzalo'), 'sales', 's1'), { total: 1, _v: 3, _u: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('gonzalo'), 'sales', 's1'), { estado: 'anulada', _v: 3, _u: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('gonzalo'), 'sales', 's2'), { solicitud: 'ajena', _v: 2, _u: serverTimestamp() }));
  });
  it('una actualización que no sube la versión se rechaza (concurrencia)', async () => {
    await assertFails(updateDoc(doc(as('gonzalo'), 'sales', 's1'), { solicitud: 'x', _v: 1, _u: serverTimestamp() }));
  });
  it('no borra ventas ni movimientos, y el libro de movimientos no se edita', async () => {
    await assertFails(deleteDoc(doc(as('gonzalo'), 'sales', 's1')));
    await assertFails(deleteDoc(doc(as('gonzalo'), 'moves', 'm1')));
    await assertFails(updateDoc(doc(as('gonzalo'), 'moves', 'm1'), { qty: 999, _v: 2, _u: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('gonzalo'), 'moves', 'm2'), create({ id: 'm2', lot: 'l1', prod: 'p1', qty: -2, user: 'gonzalo', fecha: now() })));
    await assertFails(setDoc(doc(as('gonzalo'), 'moves', 'm3'), create({ id: 'm3', lot: 'l1', prod: 'p1', qty: -2, user: 'samuel', fecha: now() })));
  });
  it('el saldo de un lote no puede quedar negativo (las gamelas sí, son informativas)', async () => {
    await assertSucceeds(updateDoc(doc(as('gonzalo'), 'stock', 'l1'), { saldo: 0 }));
    await assertFails(updateDoc(doc(as('gonzalo'), 'stock', 'l1'), { saldo: -3 }));
    await assertSucceeds(updateDoc(doc(as('gonzalo'), 'stock', 'g1'), { saldo: -2 }));
  });
  it('no cambia precios, productos, usuarios ni ajustes', async () => {
    await assertFails(updateDoc(doc(as('gonzalo'), 'products', 'p1'), { precio: 1, _v: 2, _u: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('gonzalo'), 'users', 'gonzalo'), { rol: 'admin', _v: 2, _u: serverTimestamp() }));
    await assertFails(setDoc(doc(as('gonzalo'), 'users', 'nuevo'), { rol: 'admin', activo: true }));
    await assertFails(setDoc(doc(as('gonzalo'), 'meta', 'app'), { cfg: { nombre: 'X' }, _u: serverTimestamp() }));
  });
  it('registra sus propios cambios de contraseña (sin guardar la clave)', async () => {
    await assertSucceeds(updateDoc(doc(as('gonzalo'), 'users', 'gonzalo'), { cambiosClave: [now()], _v: 2, _u: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('gonzalo'), 'users', 'gonzalo'), { clave: '123456', _v: 3, _u: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('gonzalo'), 'users', 'samuel'), { cambiosClave: [now()], _v: 2, _u: serverTimestamp() }));
  });
  it('no ve liquidaciones, bitácora ni cierres de otro vendedor', async () => {
    await assertFails(getDoc(doc(as('gonzalo'), 'liqs', 'q1')));
    await assertFails(getDoc(doc(as('gonzalo'), 'audit', 'a1')));
    await assertFails(getDoc(doc(as('gonzalo'), 'closures', 'k1')));
    await assertSucceeds(getDocs(query(collection(as('samuel'), 'closures'), where('vendedor', '==', 'samuel'))));
    await assertFails(getDocs(collection(as('samuel'), 'closures')));
  });
  it('no aprueba cierres ni autoriza sus propias solicitudes', async () => {
    await assertFails(updateDoc(doc(as('samuel'), 'closures', 'k1'), { aprobado: 'samuel', _v: 2, _u: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('samuel'), 'closures', 'k1'), { recuperado: 1000, recuperadoPor: 'samuel', recuperadoEn: now(), _v: 2, _u: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('gonzalo'), 'creditRequests', 'c1'), create({ id: 'c1', user: 'gonzalo', estado: 'pendiente', clienteNombre: 'X', monto: 1000, total: 2000, fecha: now() })));
    await assertFails(updateDoc(doc(as('gonzalo'), 'creditRequests', 'c1'), { estado: 'aprobada', resueltoEn: now(), _v: 2, _u: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('gonzalo'), 'creditRequests', 'c1'), { estado: 'cancelada', resueltoEn: now(), _v: 2, _u: serverTimestamp() }));
  });
  it('la bitácora solo se agrega con su propio usuario y no se edita', async () => {
    await assertSucceeds(setDoc(doc(as('gonzalo'), 'audit', 'a2'), create({ id: 'a2', user: 'gonzalo', accion: 'x', fecha: now() })));
    await assertFails(setDoc(doc(as('gonzalo'), 'audit', 'a3'), create({ id: 'a3', user: 'luis', accion: 'x', fecha: now() })));
    await assertFails(updateDoc(doc(as('luis'), 'audit', 'a1'), { accion: 'otra', _v: 2, _u: serverTimestamp() }));
  });
  it('el número de venta solo avanza de a uno', async () => {
    await assertSucceeds(updateDoc(doc(as('gonzalo'), 'meta', 'counters'), { saleNum: 1001, _u: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('gonzalo'), 'meta', 'counters'), { saleNum: 1005, _u: serverTimestamp() }));
  });
});

describe('administrador', () => {
  it('cambia precios con versión válida, aprueba cierres y ve liquidaciones', async () => {
    await assertSucceeds(updateDoc(doc(as('luis'), 'products', 'p1'), { precio: 21000, _v: 2, _u: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('luis'), 'products', 'p1'), { precio: 15000.5, _v: 3, _u: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('luis'), 'closures', 'k1'), { aprobado: 'luis', _v: 2, _u: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('luis'), 'closures', 'k1'), { recuperado: 1000, recuperadoPor: 'luis', recuperadoEn: now(), recuperaciones: [{ monto: 1000, por: 'luis', en: now() }], _v: 3, _u: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('luis'), 'closures', 'k1'), { declarado: 999999, _v: 4, _u: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(as('luis'), 'liqs', 'q1')));
  });
  it('no puede crear usuarios ni cambiar roles desde el navegador (solo la Cloud Function)', async () => {
    await assertFails(setDoc(doc(as('luis'), 'users', 'nuevo'), { rol: 'admin', activo: true, _v: 1 }));
    await assertFails(updateDoc(doc(as('luis'), 'users', 'gonzalo'), { rol: 'admin', _v: 2, _u: serverTimestamp() }));
  });
});

describe('contadora (solo lectura)', () => {
  it('lee ventas y no escribe nada', async () => {
    await assertSucceeds(getDoc(doc(as('genesis'), 'sales', 's1')));
    await assertFails(setDoc(doc(as('genesis'), 'sales', 'n9'), sale('n9', 'genesis')));
    await assertFails(updateDoc(doc(as('genesis'), 'sales', 's1'), { solicitud: 'x', _v: 2, _u: serverTimestamp() }));
  });
  it('no ve stock, movimientos ni liquidaciones', async () => {
    await assertFails(getDoc(doc(as('genesis'), 'moves', 'm1')));
    await assertFails(getDoc(doc(as('genesis'), 'liqs', 'q1')));
  });
});
