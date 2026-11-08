# Firebase: arquitectura, seguridad, operación y despliegue

## 1. Servicios usados (y por qué)

| Servicio | Uso | ¿Necesario? |
|---|---|---|
| **Authentication** (correo/contraseña) | Inicio de sesión. El usuario escribe `luis` + clave; internamente es `luis@usuarios.bodega-lo-valledor.app`. La clave vive solo en Auth | Sí |
| **Cloud Firestore** | Base central compartida por todos los teléfonos, en tiempo real | Sí |
| **Cloud Functions** (2ª gen., Node 22, `southamerica-west1`) | `saveUser`: crear, editar y desactivar usuarios con Admin SDK. `resetData`: reinicio de datos | Sí. **Requiere plan Blaze** |
| **Hosting** | Publica la app web (SPA, HTTPS, cabeceras de seguridad) | Sí |
| **Emulator Suite** | Pruebas locales sin datos reales | Sí (desarrollo) |
| Storage | — | **No**: la foto de la guía se quitó por decisión del cliente |

## 2. Modelo de datos

**Organización.** Un documento por entidad, con el mismo `id` que en el prototipo:

- `users`, `products`, `producers`, `receptions`, `lots`, `moves`, `sales`, `closures`, `liqs`, `prices`, `audit`;
- `expenses`, `fixed`, `notes`, `clients`, `creditPayments`, `creditRequests`, `priceRequests`, `abonoRequests`;
- `comRequests`, `operations`, `refunds`, `adjustments`, `fiscalEvents`.

**Documentos de apoyo:**

- `meta/app`: `cfg` (datos de la bodega), `families` y `epoch`. Este último cambia con un reinicio.
- `meta/counters`: `saleNum`, el número correlativo de venta. Lo asigna el servidor dentro de la transacción.
- `stock/{lote}`: `saldo` y `envase`. Es un saldo mantenido en la misma transacción que los movimientos. El libro de movimientos sigue siendo la fuente; `stock` es la barrera contra la sobreventa entre dispositivos.

**Campos de control en cada documento:**

- `_u`: fecha del servidor.
- `_v`: versión.
- Los borrados quedan como marca `{_deleted: true}`, para que los demás dispositivos se enteren.

**Lectura.** Cada dispositivo guarda una copia local (caché persistente de Firestore) y solo descarga los documentos con `_u` mayor a su última sincronización. Abrir la app muchas veces al día no vuelve a leer miles de documentos.

**Escritura.** Cada comando (venta, recepción, merma, cierre…) es **una transacción**:

1. **Control de versión.** Si otro usuario cambió el documento mientras tanto, se rechaza con "Otro usuario cambió estos datos recién…".
2. **Saldo por lote.** Si otro vendedor ya vendió ese stock, se rechaza con "Otro vendedor acaba de sacar parte de ese stock…".
3. **Número de venta del servidor.** Es correlativo y sin duplicados.

Sin conexión no se registra nada y la app avisa: "Sin conexión: no se pudo guardar…". Es una decisión deliberada: preferimos no vender que vender stock que no existe.

**Datos por rol** (las reglas niegan el resto):

| Rol | Colecciones que carga |
|---|---|
| Administrador | Todas |
| Vendedor | Catálogo, stock, ventas, clientes y créditos, solicitudes y **solo sus cierres** |
| Contadora | Ventas, productos, clientes y usuarios. Solo lectura |

## 3. Seguridad

**`firestore.rules`.** Todo está denegado salvo lo permitido:

- El rol y el estado (activo) se leen de `users/{uid}`. **Solo la Cloud Function escribe ese documento**: nadie puede darse un rol desde el navegador.
- **Vendedor:**
  - Crea ventas, recepciones, movimientos y cierres **a su nombre**, con fecha dentro de ±15 minutos de la hora del servidor.
  - En sus ventas solo puede pedir la anulación y marcar el cierre.
  - No cambia precios, productos, usuarios ni ajustes, y no aprueba nada.
- **Libro de movimientos y bitácora:** solo se agregan; nunca se editan ni se borran.
- **Saldo de un lote:** no puede quedar negativo. Las gamelas sí, porque son informativas (regla del prototipo).
- **Contador de ventas:** solo avanza de a uno.
- **Concurrencia:** toda actualización debe subir `_v` en 1.
- **Contadora:** solo lectura.

**Pruebas:** `web/tests/rules/firestore.rules.test.ts`, con 20 casos en el emulador (autorizados y rechazados).

**Otras protecciones:**

- **Contraseñas:** 6 números. Todos parten con **111111** y cada uno la cambia en "🔑 Cambiar contraseña" (el vendedor, máximo 2 veces por día). Firebase Auth bloquea temporalmente tras muchos intentos fallidos.
- **Desactivar un usuario** deshabilita su cuenta y **revoca sus sesiones**: es el cierre de sesión remoto si se pierde un teléfono.
- **Cambio de usuario en el mismo equipo:** se borra la copia local del anterior, así nadie ve datos de otro rol.
- **Hosting:** cabeceras CSP (sin scripts en línea), `X-Frame-Options: DENY`, `nosniff` y `Referrer-Policy`.

**Riesgos restantes (documentados):**

- Los **totales de la venta los calcula el dispositivo**. Las reglas validan autor, fecha, estado y versión, pero no recalculan precios línea por línea, porque las reglas no admiten ciclos.
  - Mitigación: cada venta guarda el precio usado y el vendedor, y la bitácora es inalterable.
  - Mejora futura: registrar la venta en una Cloud Function que recalcule.
- **Los vendedores pueden leer todas las ventas**, no solo las suyas: el cálculo de stock y de créditos lo necesita. La pantalla solo muestra las suyas.
- **Claves de 6 dígitos:** es una decisión del cliente. Conviene activar **App Check** y la **protección contra enumeración de correos** (ver §5).

## 4. Entornos

| Entorno | Cómo | Datos |
|---|---|---|
| Emulador | `npm run emulators` (raíz) + `npm --prefix web run reset:emulator` + `npm --prefix web run dev:emulator` | Proyecto `demo-bodega`, solo datos de ejemplo |
| Demo local (sin servidor) | `npm --prefix web run build:demo` | En el navegador, igual que el prototipo |
| Desarrollo / preproducción / producción | `.firebaserc` (alias `dev`, `staging`, `prod`) y `web/.env.<modo>` copiado de `web/.env.example` | Proyectos separados |

La configuración web de Firebase **no es secreta**. Nunca se ponen en el frontend claves de cuentas de servicio. El script de instalación usa la variable de entorno `GOOGLE_APPLICATION_CREDENTIALS` en tu equipo, nunca en el repositorio.

## 5. Pasos manuales en Firebase Console (los hace Felipe)

1. **Crear el proyecto** (uno para preproducción y otro para producción), por ejemplo `lma-bodega-prod`.
2. Plan **Blaze**, con una **alerta de presupuesto** de USD 5–10 al mes (Facturación → Presupuestos).
3. **Authentication:**
   - Habilitar **Correo/contraseña**.
   - Activar **Protección contra la enumeración de correos**.
   - En Dominios autorizados, dejar solo el dominio de Hosting y, si existe, el propio.
4. **Firestore:**
   - Crear la base en modo **producción**, región `southamerica-west1` (Santiago).
   - Activar **Backups programados** (diarios, retención de 7 a 14 semanas) y **Point-in-time recovery**.
5. **App Check** con reCAPTCHA Enterprise para la app web (recomendado), y después aplicarlo a Firestore, Auth y Functions.
6. Registrar la app web y copiar su configuración en `web/.env.production`.
7. Reemplazar los ids en `.firebaserc`.
8. Crear una cuenta de servicio solo para la instalación inicial y **borrarla después**.

## 6. Instalación y despliegue

> **No se ha publicado nada.** Estos pasos requieren tu autorización y tu cuenta.

```bash
npm install && npm --prefix web install && npm --prefix functions install
npx firebase login
npx firebase use staging                                     # primero en preproducción
npm --prefix web run build                                   # usa web/.env.production o --mode staging
npx firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
# instalación inicial (una sola vez por proyecto): usuarios con clave 111111, catálogo, ajustes y contador
GOOGLE_APPLICATION_CREDENTIALS=~/clave-servicio.json npx --prefix web tsx web/scripts/seed-firebase.ts --project <id>
```

**Verificación después de desplegar:**

- Entrar con los 4 usuarios.
- Hacer una venta de prueba y anularla.
- Revisar que el vendedor no vea Dashboard ni Balance.
- Ejecutar `npm run test:rules` contra el emulador con las mismas reglas.

**Reversión:**

- **Hosting:** Firebase Console → Hosting → historial de versiones → "Revertir"; o `firebase hosting:clone <sitio>:<versión> <sitio>:live`.
- **Reglas:** Firestore → Reglas → historial → restaurar la versión anterior; o desplegar el `firestore.rules` del commit anterior.
- **Functions:** desplegar el commit anterior (`git checkout <tag> && firebase deploy --only functions`).
- **Datos:** restaurar desde un backup programado o con PITR a una base nueva, y redirigir. Nunca sobrescribas la de producción sin respaldo.

## 7. Costos estimados

Supuestos: 4 usuarios, unas 20 ventas al día y algunas recepciones.

- Escrituras: unas 300 al día (cada venta escribe venta, movimientos, saldo, bitácora y contador).
- Lecturas: unas 1.500 al día con la sincronización incremental, más una carga completa (~20.000) cada vez que se usa un teléfono nuevo.

**Cuota gratuita diaria de Firestore:** 50.000 lecturas, 20.000 escrituras y 1 GB.

**Estimación:** dentro de la cuota gratuita, **≈ USD 0 al mes**. Functions y Hosting también quedan dentro del nivel gratuito. El plan Blaze es obligatorio solo por las Functions.

**Riesgos de consumo:**

- Muchos teléfonos nuevos o borrados de datos: cada carga completa cuesta unas 20.000 lecturas.
- Crecimiento después de 2–3 años: cada dispositivo guarda todo el historial en memoria. Ver la recomendación de archivado en `AUDITORIA_FINAL.md`.
