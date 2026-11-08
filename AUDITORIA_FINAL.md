# Auditoría final: Bodega Lo Valledor (React + TypeScript + Firebase)

Fecha: 08-11-2026 · Rama `migracion` · Original intacto en `main` (tag `prototipo-auditado`).

## 1. Veredicto

**Lista para preproducción. El lanzamiento a producción queda condicionado** a 5 pasos manuales que dependen de tu cuenta de Firebase (§8).

En el código no quedan errores críticos ni altos conocidos:

- Los 3 bloqueos críticos de la primera auditoría están resueltos por diseño y verificados con pruebas en el Emulator Suite.
- Todas las funcionalidades del prototipo están presentes y se comportan igual: 64 de 64 casos de regresión y una prueba diferencial de cálculos idéntica.

**Lo que no se pudo verificar desde aquí** (en orden de importancia):

1. Funcionamiento sobre un proyecto Firebase real, sin emulador. No hay credenciales ni proyecto creados; ver §8.
2. Uso en teléfonos físicos (iOS/Android) y en impresión real.
3. Accesibilidad completa con lector de pantalla.

## 2. Comparación entre auditorías

| Indicador | Fase 1 (prototipo HTML) | Fase 4 (React + Firebase) |
|---|---|---|
| Casos E2E funcionales | 63: 54 ✅ / 9 ❌ | **64: 64 ✅** (misma suite, adaptada a React) |
| Pruebas en modo Firebase (emulador) | No existía | **10/10 ✅** |
| Pruebas de reglas de seguridad | No existía | **20/20 ✅** |
| Prueba diferencial de cálculos vs. prototipo | No existía | **5/5 idéntico** |
| Errores de consola | 0 | 0 |
| XSS almacenado (10 vistas + ventanas) | Sin ejecución | Sin ejecución |
| Contraseñas | Texto plano en el navegador | Solo en Firebase Auth; no existen en la base (FB-03) |
| Permisos | Solo en el navegador; se podían saltar | Reglas de Firestore + Cloud Function (20 casos) |
| Datos entre teléfonos | Aislados, sin sincronizar | Base central en tiempo real (FB-06) |
| Sobreventa entre dos vendedores | Posible | Bloqueada por transacción (FB-07) |
| Capacidad | ~3.500 ventas (límite de localStorage) | Sin límite práctico |
| TypeScript estricto / ESLint | — | 0 errores / 0 errores |

## 3. Resultados por módulo (regresión Fase 4, `audit/resultados-fase4.json`)

| Módulo | Casos | Resultado |
|---|---|---|
| Acceso y permisos | AUTH-01 a AUTH-12, USR-03 | ✅ 13/13 |
| Punto de venta | POS-01 a POS-14, RESP-02 | ✅ 15/15 |
| Recepción y merma | REC-01 a REC-06, MER-01, MER-02 | ✅ 8/8 |
| Inventario | INV-01 a INV-06 | ✅ 6/6 |
| Historial y anulaciones | HIS-01, HIS-01b, HIS-02 a HIS-05 | ✅ 6/6 |
| Cierre de caja | CAJA-01, CAJA-02 | ✅ 2/2 |
| Créditos | CRE-01, CRE-02 | ✅ 2/2 |
| Productores y liquidaciones | PRD-01 | ✅ 1/1 |
| Balance | BAL-01, BAL-02 | ✅ 2/2 |
| Usuarios y ajustes | USR-01, USR-02 | ✅ 2/2 |
| Persistencia y concurrencia | STO-01 a STO-04 | ✅ 4/4 (STO-04 se verifica en modo Firebase) |
| Responsive, accesibilidad y dependencias | RESP-01, A11Y-01, NET-01 | ✅ 3/3 |

**Modo Firebase (`audit/resultados-firebase.json`):**

| Caso | Resultado |
|---|---|
| FB-01 | Clave incorrecta rechazada |
| FB-02 | Carga de datos por rol |
| FB-03 | Sin claves en los datos |
| FB-04 | Venta con número del servidor |
| FB-05 | Persiste tras recargar |
| FB-06 | Sincronización en vivo entre dos dispositivos |
| FB-07 | Dos vendedores venden el último stock al mismo tiempo: solo se acepta una venta y el stock queda en 0 |
| FB-08 | Desactivar a un usuario corta su acceso |
| FB-09 | Usuario creado por la Cloud Function entra con su clave |
| FB-10 | Sin errores JavaScript |

## 4. Problemas corregidos

| Hallazgo (Fase 1) | Corrección | Evidencia |
|---|---|---|
| C-01 Claves en texto plano y visibles | Firebase Auth; login sin credenciales; clave inicial 111111 | AUTH-09, FB-03 |
| C-02 Autorización solo en el cliente | `firestore.rules` por rol y propietario; usuarios solo por la Cloud Function | 20 pruebas de reglas, AUTH-10 |
| C-03 Datos aislados por navegador | Firestore central con sincronización incremental | FB-06 |
| A-01 Pérdida de datos en silencio | Cada guardado confirma o avisa; Firestore elimina el límite de 5 MB | STO-02 |
| A-02 El admin se quita su rol | Selector bloqueado + validación en la UI y en la Cloud Function | AUTH-12, USR-03 |
| A-03 Liquidación duplicada | Se rechazan periodos superpuestos | PRD-01 |
| M-01 Mensaje de anulación engañoso | Mensaje según el estado real | HIS-01b |
| M-03 Ajuste sin lotes | Bloqueado con mensaje | INV-05 |
| M-04 Balance en tablet | Columnas apiladas bajo 1000 px | RESP-01 |
| B-01 a B-04 | Gamelas y precios enteros, tope de precio, formato `-$` | POS-03, REC-03, INV-03, INV-04, BAL-02 |
| M-02 Motivo de merma | **No se implementó** (decisión del cliente) | — |

**Errores encontrados durante la migración y corregidos:**

- Orden de suma del stock en kg: corregido para que sea idéntico al prototipo (prueba diferencial).
- Asignación del número de venta sobre un objeto inmutable (FB-04).
- La clase `is-open` del modal se perdía al cambiar de diálogo (REC-05, REC-06).

## 5. Seguridad

Ver `docs/FIREBASE.md` §3.

**Riesgos residuales aceptados y documentados:**

1. Los totales de la venta los calcula el dispositivo. La regla valida el autor, la fecha, el estado y la versión, pero no el precio línea por línea.
2. Los vendedores pueden leer todas las ventas (el stock y los créditos lo requieren).
3. Las claves son de 6 dígitos (decisión del cliente). Mitigación: el bloqueo de Firebase tras varios intentos fallidos y App Check.

**Dependencias:**

- `npm audit` marca una alerta "high" en `@grpc/grpc-js`, que viene con `firebase`. Solo se usa en Node: el navegador se conecta por WebChannel, así que **no afecta a la app publicada**.
- Hay alertas moderadas en herramientas internas de `firebase-admin`.
- Recomendación: actualizar cuando se publique la corrección.

## 6. Calidad del código y rendimiento

**Estructura:**

| Carpeta | Contenido |
|---|---|
| `web/src/domain` | Lógica pura, 18 módulos |
| `web/src/state` | Store con Immer y comandos atómicos |
| `web/src/services` | Almacén local y Firestore, autenticación |
| `web/src/features` | Un módulo por pantalla |
| `web/src/components` | Componentes compartidos |
| `web/src/routes` | Menú y rutas protegidas |
| `functions/` | Cloud Functions |

**Verificaciones de calidad:**

- `tsc` estricto: 0 errores.
- ESLint: 0 errores.
- `any` prohibido por regla.

**Tamaño del bundle:**

- App: 140 KB gzip.
- SDK de Firebase: 201 KB gzip, cargado de forma diferida.
- El modo demo no descarga Firebase.

**Rendimiento:**

- El stock se calcula con un índice en memoria, en lugar de recorrer todos los movimientos en cada consulta.
- Los comandos de Immer solo copian lo que cambia.

**Consumo de Firebase:** dentro de la cuota gratuita (ver `docs/FIREBASE.md` §7).

## 7. Riesgos restantes

| Riesgo | Impacto | Recomendación |
|---|---|---|
| Sin conexión no se puede vender (las transacciones requieren red) | Medio | Asegurar datos móviles. Mejora futura: cola de ventas sin conexión con conciliación |
| Cada dispositivo tiene el historial completo en memoria | Bajo hoy, medio en 2–3 años | Archivar los periodos cerrados (por ejemplo, años anteriores) en otra colección |
| Proyecto Firebase real aún no probado | Alto si se omite | Ejecutar la §8 en preproducción antes de producción |
| Teléfonos reales y lector de pantalla | Medio | Prueba manual de 30 minutos con Luis y un vendedor |
| El prototipo en GitHub Pages sigue publicado con datos de ejemplo | Bajo | Retirarlo o redirigirlo cuando la nueva versión esté en producción |

## 8. Lista de verificación para el lanzamiento

**Pasos manuales (los haces tú, con tu cuenta):**

- [ ] **1.** Crear los proyectos de preproducción y producción, plan Blaze y alerta de presupuesto (`docs/FIREBASE.md` §5).
- [ ] **2.** Activar correo/contraseña, protección contra enumeración, App Check, backups programados y PITR.
- [ ] **3.** Completar `web/.env.staging`, `web/.env.production` y `.firebaserc`.
- [ ] **4.** Desplegar en **preproducción** (reglas, functions y hosting), ejecutar el script de instalación y hacer la prueba guiada:
  - 4 usuarios;
  - venta, anulación, recepción, merma, cierre de caja, crédito con autorización y liquidación.
- [ ] **5.** Con tu autorización: desplegar en producción, instalar los usuarios con 111111 y pedir a cada uno que cambie su clave el primer día.

**Verificado (lo hice en esta sesión):**

- [x] Compilación de producción (`npm run build`).
- [x] Reglas e índices listos (`firestore.rules`, `firestore.indexes.json`).
- [x] Variables de entorno de ejemplo, sin secretos.
- [x] Procedimiento de despliegue y reversión documentado.
- [x] Prueba completa en el emulador (preproducción local).
