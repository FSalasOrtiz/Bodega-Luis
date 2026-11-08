# Auditoría inicial — Bodega Lo Valledor

Fecha: 07-11-2026 · Fase 1 de la migración (sin cambios de comportamiento).

**Qué se auditó:** la copia de trabajo actual de `bodega-lo-valledor.html`, junto con `assets/transaction-workflow.js` y `assets/invoice-layout.js`. Esta copia **incluye cambios sin commitear** sobre el commit `921ed28`, en 5 archivos (+637 / −277 líneas). No se modificó ningún archivo de la aplicación.

**Cómo se probó:**

- Skill `webapp-testing` de Anthropic, instalada en `.agents/skills/webapp-testing` con un symlink en `.claude/skills`.
- Playwright 1.x (Python) con Chromium headless. El servidor lo levanta `with_server.py` de la skill en `localhost:8123`.
- Cada caso se ejecutó en un contexto de navegador nuevo. El almacenamiento empieza vacío y la app genera sus propios datos de demostración, que cubren unos 60 días y cerca de 950 ventas. **No se usaron datos reales.**
- Se ejecutaron también las 4 suites existentes en Node (`tests/*.cjs`).

---

## 1. Resumen ejecutivo

| Indicador | Resultado |
|---|---|
| Casos E2E en Playwright | **63 ejecutados: 54 aprobados y 9 fallidos.** Además: 1 prueba de XSS aprobada y 1 caso no ejecutable |
| Suites existentes (Node) | 4 de 4 en verde: smoke 23, receipts 4, transactions 12 y reception-inventory 2 grupos `OK` |
| Errores de consola y solicitudes fallidas | **0** en la corrida completa (63 casos, 3 viewports) |
| XSS almacenado | No se ejecutó código inyectado en 10 vistas ni en 4 ventanas |
| Bloqueos para producción | **3 críticos**: autenticación y permisos solo en el cliente, contraseñas en texto plano y datos aislados por navegador sin sincronización |

**Conclusión.** La lógica de negocio del prototipo es sólida y está bien validada:

- FIFO.
- Stock por origen (consignación / compra directa).
- Gamelas.
- Crédito con autorización.
- Idempotencia de la venta.
- Cierre de caja.
- Anulaciones con compensación.

Las fallas graves no son de flujo, sino de **arquitectura**. Hoy cada teléfono guarda su propia copia de los datos en `localStorage`, y los permisos se pueden saltar desde la consola. Por eso la migración a un backend (Fase 3) es imprescindible, y no un simple refactor. **La versión actual no debe usarse en producción con datos reales.**

---

## 2. Inventario de la aplicación

### 2.1 Archivos y dependencias

| Elemento | Descripción |
|---|---|
| `bodega-lo-valledor.html` (2.659 líneas, 263 KB) | CSS, HTML y todo el JS de la UI en un solo archivo. Renderiza con plantillas `innerHTML` y usa funciones globales llamadas desde `onclick` |
| `assets/transaction-workflow.js` (32 KB) | Motor de ventas, reversiones, devoluciones y documentos tributarios. Usa `workflowTransaction` con instantánea y reversión |
| `assets/invoice-layout.js` (14 KB) | Diseño y generación del PDF de comprobantes y facturas (sin librerías) |
| `index.html` | Redirección a `bodega-lo-valledor.html` (GitHub Pages) |
| GSAP 3.13.0 (CDN jsdelivr) | Solo para la animación del dashboard. **La app funciona sin él** (NET-01) |
| Google Fonts (Plus Jakarta Sans) | Tipografía. Hay un respaldo del sistema si no carga |
| Servicios externos | Ninguno. Los adaptadores `fiscal` y `payments` están desconectados a propósito |
| `bodega-lo-valledor.solido.html`, `versiones/` | Versiones anteriores. **No se tocan** (AGENTS.md) |

### 2.2 Persistencia actual

| Clave | Almacén | Contenido |
|---|---|---|
| `bodegaLV.v6` | localStorage | **Todo el estado `S`** (ver el modelo más abajo) |
| `bodegaLV.pos.<usuario>` | localStorage | Borrador del POS por usuario: carrito, pago, crédito y solicitudes |
| `bodegaLV.theme` | localStorage | Tema (`mint` / `dark`) |
| `bodegaLV.me`, `bodegaLV.view` | sessionStorage | Usuario con sesión iniciada y módulo y pestaña actuales |
| `bodegaLV.attachments` | IndexedDB | Imágenes de guías de recepción (`fotoId`) |

**Modelo de datos (`S`):**

- **Datos maestros:** `cfg`, `users`, `products`, `producers`, `clients`.
- **Operación:**
  - `receptions`, `lots` y `moves`. Es un libro de movimientos: el stock es la suma de movimientos por lote.
  - `sales`, que incluye `lineas[].allocs` (FIFO por lote), `pagos[]`, `fiscalDocs[]` y `reversal`.
  - `closures`, `liqs` (liquidaciones), `expenses` (gastos variables), `fixed` (gastos fijos), `prices` (historial de precios), `notes` (calendario) y `audit` (bitácora).
- **Flujos de aprobación:** `creditRequests`, `priceRequests`, `abonoRequests`, `comRequests`, `creditPayments`.
- **Motor transaccional:** `operations`, `refunds`, `adjustments`, `fiscalEvents` y `workflowRevision`.

### 2.3 Perfiles y permisos (implementados)

| Rol | Usuario de demo | Módulos visibles |
|---|---|---|
| Administrador | `luis` | Los 10 módulos |
| Vendedor | `gonzalo`, `samuel` | Punto de venta, Recepción/Merma, Inventario (solo stock y precio), Historial (solo sus ventas), Cierre de caja y Créditos |
| Contador(a) | `genesis` | Solo Historial, en modo de solo lectura, con descarga del reporte |

### 2.4 Módulos y funcionalidades

| # | Módulo | Funcionalidades encontradas | Operaciones |
|---|---|---|---|
| T | **Acceso** (transversal) | <ul><li>Login con usuario y clave de 6 dígitos.</li><li>Sesión por pestaña y restauración del módulo.</li><li>Cambio de contraseña (vendedor: máximo 2 por día).</li><li>Tema claro/oscuro.</li><li>Avisos para Luis arriba de la pantalla: crédito, otro precio, comisión, abono y anulación.</li></ul> | Lectura y edición de la propia clave |
| 1 | 📊 **Dashboard** | <ul><li>Créditos por cobrar.</li><li>Ingresos, ventas, efectivo, transferencias y tarjetas del día.</li><li>Llegó hoy y stock total.</li><li>Ingresos de los últimos 7 días.</li><li>Ventas por familia, vendedor y medio de pago.</li><li>Cierres por aprobar.</li><li>Alertas.</li></ul> | Lectura |
| 2 | 🛒 **Punto de venta** | <ul><li>Origen del stock (consignación / compra directa).</li><li>Búsqueda por nombre, calibre o SKU, y filtro por familia.</li><li>Ventana de cantidad para gamela o kg, con coma decimal.</li><li>Carrito.</li><li>Gamelas: "se lleva" y "trae", con garantía fija de $1.000.</li><li>Boleta o factura, con validación de RUT.</li><li>Efectivo, transferencia, tarjeta o mixto.</li><li>Crédito con autorización.</li><li>Pedir otro precio y comisión de consignación.</li><li>Revisión y confirmación de la venta, con clave idempotente.</li><li>Comprobante en pantalla, PDF o compartido.</li><li>Borrador que se conserva al recargar.</li></ul> | Crear venta y solicitudes |
| 3 | 🚚 **Recepción / Merma** | <ul><li>Recepción por productor, en consignación o compra directa.</li><li>Líneas de producto, con costo en compra directa.</li><li>Gamelas recibidas.</li><li>Comprobante de recepción imprimible.</li><li>Anulación (solo admin, si no hay ventas del lote).</li><li>Merma por origen, con FIFO sobre los lotes.</li></ul> | Crear y anular recepción; crear merma |
| 4 | 📦 **Inventario** | <ul><li>Tabla de stock, llegó hoy y vendido.</li><li>Búsqueda y filtro por familia.</li><li>Ficha con lotes.</li><li>Crear y editar producto.</li><li>Nueva familia.</li><li>Cambio de precio con historial.</li><li>Ajuste de stock con motivo.</li></ul> | CRUD de productos (sin borrado: se desactivan) |
| 5 | 🧾 **Historial** | <ul><li>Pestañas Ventas, Recepciones y Movimientos.</li><li>Filtros: desde/hasta, documento, vendedor, medio y producto.</li><li>Totales con neto.</li><li>Paginación de 20 por página.</li><li>Anular (admin) o solicitar anulación (vendedor).</li><li>Detalle del flujo tributario y devoluciones de dinero.</li><li>Descarga del reporte en CSV (admin y contadora).</li></ul> | Lectura y reversión |
| 6 | 💵 **Cierre de caja** | <ul><li>Ventas sin cerrar.</li><li>Efectivo esperado, transferencias, tarjetas, cheques, crédito y pagos de deuda.</li><li>Fondo inicial, efectivo contado y diferencia.</li><li>Historial de cierres.</li><li>Aprobación (solo Luis).</li></ul> | Crear y aprobar cierre |
| 7 | 🪙 **Créditos** | <ul><li>Total por cobrar.</li><li>Listas "Me deben" y "Al día".</li><li>Detalle por cliente.</li><li>Pagar deuda, total o parcial (el vendedor necesita autorización).</li><li>Crear y editar cliente.</li><li>Borrar cliente, solo sin deuda.</li></ul> | CRUD de clientes y abonos |
| 8 | 🧑‍🌾 **Productores** | <ul><li>Listado.</li><li>Ficha con recepciones y cuenta de consignación.</li><li>Liquidación por periodo, con PDF.</li><li>Pago de la liquidación.</li><li>Crear y editar productor.</li></ul> | CRUD de productores (sin borrado) y liquidaciones |
| 9 | ⚖️ **Balance** | <ul><li>Resultado del mes: ingresos, egresos, gastos fijos y variables.</li><li>Calendario de mes y notas.</li><li>Compra de gamelas.</li><li>Exportar ventas y meses (CSV).</li><li>Cierre del mes en PDF.</li></ul> | CRUD de gastos |
| 10 | 👥 **Usuarios y ajustes** | <ul><li>Usuarios: crear, editar, desactivar y restablecer la clave.</li><li>Datos de la empresa.</li><li>Comisión por defecto.</li><li>Reiniciar datos, con o sin datos de ejemplo.</li></ul> | CRUD de usuarios (sin borrado) |

**Relaciones entre módulos** (verificadas en las pruebas):

- La recepción crea lotes que suman stock, y ese stock aparece en el POS, en Inventario y en el Dashboard.
- La venta descuenta por FIFO, deja movimientos en Historial, suma a Caja y genera la deuda en Créditos.
- La merma descuenta stock y alimenta la liquidación del productor.
- Las solicitudes del vendedor aparecen como avisos para Luis.
- El cierre del vendedor aparece en el Dashboard para que Luis lo apruebe.

---

## 3. Matriz de casos de prueba y resultados

Leyenda: ✅ aprobada · ❌ fallida · ⏸ no ejecutada. Los detalles están en `audit/resultados-fase1.json` y el código en `audit/playwright/audit_suite.py`.

### Acceso, permisos y seguridad

| ID | Tipo | Caso | Resultado |
|---|---|---|---|
| AUTH-01 | positivo | Login de los 4 roles abre su módulo inicial (dash / pos / pos / sales) | ✅ |
| AUTH-02 | negativo | Clave incorrecta → "Usuario o contraseña incorrectos" | ✅ |
| AUTH-03 | negativo | Usuario inexistente rechazado; `"  LUIS  "` se normaliza | ✅ |
| AUTH-04 | positivo | La sesión y el módulo se mantienen al recargar | ✅ |
| AUTH-05 | positivo | Cerrar sesión persiste tras recargar | ✅ |
| AUTH-06 | negativo | Un usuario desactivado no entra y su sesión se corta | ✅ |
| AUTH-07 | negativo | El vendedor no navega a dash, prod, bal ni users | ✅ |
| AUTH-08 | negativo | La contadora solo ve Historial, y `workflowTransaction` la rechaza | ✅ |
| AUTH-09 | seguridad | Contraseñas no legibles | ❌ **Crítico** |
| AUTH-10 | seguridad | El vendedor no puede elevar sus privilegios | ❌ **Crítico** |
| AUTH-11 | negativo | Cambio de clave: clave actual mala, formato, coincidencia, igual a la anterior y límite de 2 por día | ✅ |
| AUTH-12 | negativo | El administrador no puede quitarse su propio rol | ❌ Alta |
| SEC-XSS | seguridad | HTML en nombres de producto, productor, cliente, usuario y empresa no se ejecuta (10 vistas y 4 ventanas) | ✅ |

### Punto de venta

| ID | Tipo | Caso | Resultado |
|---|---|---|---|
| POS-01 | positivo | Venta de 2 × TOM-C9 en efectivo: total $42.000 (2 × $20.000 + 2 gamelas), stock −2, comprobante y persistencia tras recargar | ✅ |
| POS-02 | negativo | Más que el stock → "No alcanza: quedan N gam." y botón deshabilitado | ✅ |
| POS-03 | negativo | 0, −3 y "abc" deshabilitan "Agregar"; 2,5 gamelas se trata como 3 | ✅ (ver B-01) |
| POS-04 | positivo | Palta en kg con "2,5" → subtotal de $5.500 | ✅ |
| POS-05 | positivo | Búsqueda por SKU y filtro por familia | ✅ |
| POS-06 | negativo | Sin marcar "recibí el pago" no se registra | ✅ |
| POS-07 | extremo | Doble clic y reintento con la misma clave → una sola venta | ✅ |
| POS-08 | negativo | Factura sin datos y con RUT inválido se rechaza; con RUT válido queda como factura | ✅ |
| POS-09 | positivo | Mixto efectivo + transferencia suma exactamente el total | ✅ |
| POS-10 | negativo | Crédito del vendedor sin autorización: botón deshabilitado y aviso "Luis tiene que autorizar el crédito" | ✅ |
| POS-11 | positivo | El carrito se conserva al recargar | ✅ |
| POS-12 | extremo | 1 gamela llevada y 3 traídas → descuento de $2.000 (total $18.000); 50 traídas con una compra de $6.000 → bloqueado | ✅ |
| POS-13 | positivo | Venta de 2 gamelas solas = $2.000 | ✅ |
| POS-14 | integración | El vendedor pide otro precio → la solicitud queda pendiente → Luis ve el aviso | ✅ |
| RESP-02 | móvil | Venta completa a 390 px con toques | ✅ |

### Recepción y merma

| ID | Tipo | Caso | Resultado |
|---|---|---|---|
| REC-01 | positivo | Consignación +10: stock, lote, historial y persistencia | ✅ |
| REC-02 | negativo | Vacío, −5 o "abc" → no se guarda y hay mensaje | ✅ |
| REC-03 | extremo | "2,5" gamelas → se guardan 3 sin aviso | ✅ (ver B-01) |
| REC-04 | positivo | Compra directa con costo de $9.000 → stock de compra directa +7 | ✅ |
| REC-05 | positivo/permiso | Anular exige motivo, descuenta el stock, y el vendedor no ve el botón | ✅ |
| REC-06 | negativo | Recepción con parte del lote vendida → no se puede anular | ✅ |
| MER-01 | positivo | Merma de 2 → stock −2 y movimiento por FIFO | ✅ |
| MER-02 | negativo | Merma mayor al stock o 0 → botón deshabilitado; 1,5 gamelas → "Ingresa una cantidad válida…" | ✅ |
| MER-03 | requisito | Merma con motivo (podrido, dañado, descarte o reacondicionado) | ❌ Media |
| REC-FOTO | persistencia | Adjuntar la foto de la guía y comprobar IndexedDB real | ⏸ No hay campo para adjuntarla (ver P-01) |

### Inventario

| ID | Tipo | Caso | Resultado |
|---|---|---|---|
| INV-01 | negativo | SKU duplicado, sin precio, sin familia o precio negativo se rechazan; `tst-1` se guarda como `TST-1` | ✅ |
| INV-02 | integración | El cambio de precio queda en el historial, el POS lo muestra y las ventas anteriores conservan su precio | ✅ |
| INV-03 | negativo | 0 o vacío → "Precio inválido"; 15000.7 → $15.000 sin aviso; $999.999.999.999 se acepta | ✅ (ver B-02) |
| INV-04 | negativo | Ajuste sin motivo o que deja un lote negativo se rechaza; un ajuste de 0,4 gamela registra un movimiento de 0 | ✅ (ver B-03) |
| INV-05 | extremo | Ajuste de un producto sin lotes | ❌ Media |
| INV-06 | permiso | Búsqueda "pera"; el vendedor no ve "Editar" | ✅ |

### Historial, caja, créditos, productores, balance y usuarios

| ID | Tipo | Caso | Resultado |
|---|---|---|---|
| HIS-01 | positivo | Anular una venta nueva: exige motivo, devuelve el stock y queda la compensación | ✅ |
| HIS-01b | negativo | Anular una venta histórica informa su estado real | ❌ Media |
| HIS-02 | integración | El vendedor solicita una anulación y Luis ve el aviso | ✅ |
| HIS-03 | permiso/filtro | El vendedor solo ve sus ventas; el filtro "transferencia" es coherente | ✅ |
| HIS-04 | negativo | Contadora: periodo invertido → mensaje y botón deshabilitado; periodo válido → CSV de 966 ventas con RUT, neto e IVA | ✅ |
| HIS-05 | positivo | Paginación de la página 1 a la 2 | ✅ |
| CAJA-01 | integración | Vacío o negativo se rechaza; el cierre queda pendiente → aviso en el Dashboard → Luis lo aprueba | ✅ |
| CAJA-02 | negativo | Sin movimientos nuevos no se puede cerrar | ✅ |
| CRE-01 | positivo | Crédito de Luis → deuda → abono de $5.000 → pago total → deuda 0 | ✅ |
| CRE-02 | negativo | Abono mayor que la deuda y borrar un cliente con deuda se rechazan | ✅ |
| PRD-01 | positivo | Productor sin nombre se rechaza; productor creado; liquidación generada | ✅ (ver A-03) |
| BAL-01 | positivo | Gasto sin monto se rechaza; gasto creado; exportación CSV | ✅ |
| USR-01 | negativo | Usuario duplicado o clave de 2 dígitos se rechaza; el usuario nuevo entra | ✅ |
| USR-02 | positivo | Guardar ajustes; reiniciar en blanco deja 0 ventas y conserva 18 productos y 4 usuarios | ✅ |

### Persistencia, concurrencia, responsive, accesibilidad y dependencias

| ID | Tipo | Caso | Resultado |
|---|---|---|---|
| STO-01 | riesgo | Tamaño en localStorage | ✅ Medido: 1,35 MB para 947 ventas (~1,4 KB por venta) |
| STO-02 | negativo | Si falla el guardado, el usuario recibe aviso | ❌ Alta |
| STO-03 | concurrencia | Dos pestañas del mismo navegador no se pisan | ✅ |
| STO-04 | concurrencia | Dos copias desincronizadas (otro dispositivo) | ❌ **Crítico** (arquitectura) |
| RESP-01 | responsive | Sin scroll horizontal en 16 vistas × 3 anchos y barra inferior en móvil | ❌ Media (1 vista) |
| A11Y-01 | accesibilidad | Etiquetas del login; el menú se abre con Tab y Enter | ✅ |
| NET-01 | resiliencia | Con jsdelivr y Google Fonts bloqueados: login, dashboard y POS funcionan sin errores JS | ✅ |

### No ejecutado o fuera del alcance de esta fase

| Caso | Motivo |
|---|---|
| Adjuntar la foto de la guía (IndexedDB real) | No hay control para adjuntarla en la copia actual (P-01) |
| Impresión física de 80 mm, compartir en el móvil real y WhatsApp | Requiere un dispositivo real. `tests/receipts.cjs` cubre la lógica |
| Lectores de pantalla y contraste compuesto | No se realizó una auditoría de accesibilidad completa. Solo hay verificaciones puntuales |
| Rendimiento con volumen de un año | Solo se midió el tamaño. No se midió el tiempo de render con más de 5.000 ventas |
| Safari/iOS y Firefox | Solo se usó Chromium |

---

## 4. Errores encontrados

### Críticos (bloquean la producción)

**C-01 · Contraseñas en texto plano y visibles (AUTH-09)**

- Las claves se guardan tal cual en `localStorage['bodegaLV.v6'].users[].clave`.
- Cualquier persona con el teléfono o el PC abierto puede leerlas.
- Además, la pantalla de login muestra las 4 credenciales de demostración (`bodega-lo-valledor.html:1137`).

*Reproducir:*

1. Entrar como `gonzalo`.
2. Abrir la consola y ejecutar `JSON.parse(localStorage['bodegaLV.v6']).users`.
3. Resultado: `luis:123456, gonzalo:111111, …`.

**C-02 · Autorización solo en el cliente (AUTH-10)**

- Los roles se comprueban en el navegador, y una parte de las funciones de escritura ni siquiera los comprueba: `voidRec`, `doAdjust`, `setPrice`, `saveProduct`, `saveLiq`, `saveProducer`, `saveGasto`, `saveUser`, `delFixed`, `updFixed` y `doDelVar`.
- En la UI solo se ocultan los botones.

*Reproducir:*

1. Entrar como `gonzalo`.
2. En la consola ejecutar `me.rol='admin';render()`. Aparecen los 10 módulos.
3. Cambiar `S.products[0].precio=1;save()`. El cambio persiste.

**C-03 · Datos aislados por navegador, sin sincronización (STO-04)**

- Cada teléfono tiene su propia base en `localStorage`.
- El objetivo del sistema es que Luis vea desde su casa lo que venden los vendedores en sus teléfonos, y eso **hoy no es posible**.
- Además, una escritura con una copia vieja (`save()`) sobrescribe ventas más nuevas.

*Reproducir:* la prueba STO-04 simula una copia antigua y llama a `save()`. La venta recién registrada desaparece (971 → 970).

### Alta

**A-01 · Pérdida silenciosa de datos al llenarse el almacenamiento (STO-02 + STO-01)**

- `save()` traga la excepción (`try{…}catch(e){}`, línea 737).
- Si `localStorage` falla, el cambio de precio, producto, ajuste, usuario o gasto **muestra éxito** pero se pierde al recargar.
- La venta, que usa `workflowTransaction`, sí avisa: "No se pudo guardar la operación".
- Con ~1,4 KB por venta, el límite de ~5 MB se alcanza con unas **3.500 ventas** (alrededor de 6 meses a 20 ventas diarias).

*Reproducir:*

1. Forzar `setItem` a lanzar `QuotaExceededError`.
2. Cambiar un precio → toast "Nuevo precio…".
3. Recargar → precio anterior.

**A-02 · El único administrador puede quitarse el rol (AUTH-12)**

- En "Editar usuario" sobre uno mismo, el selector de rol está habilitado.
- Si lo cambia a Vendedor, quedan 0 administradores, y no hay forma de recuperarlo desde la UI.

*Reproducir:* Usuarios → Editar Luis → Rol: Vendedor → Guardar.

**A-03 · Liquidación duplicada del mismo periodo (PRD-01)**

- "Generar liquidación" no comprueba si ya existe una liquidación para el mismo productor y periodo.
- Dos clics generan 2 liquidaciones, con riesgo de **pagar dos veces** al productor.

*Reproducir:* Productores → elegir un productor de consignación → Generar liquidación → cerrar → Generar liquidación otra vez.

### Media

**M-01 · Anular una venta histórica dice "Venta anulada." sin haberla anulado (HIS-01b)**

- En las ventas anteriores al motor transaccional (todas las de demostración), la reversión queda en `pendiente_verificacion`.
- El estado sigue `vigente` y el stock no vuelve, pero el toast dice "Venta anulada.".
- Las ventas nuevas sí se anulan bien (HIS-01).

*Reproducir:* Historial → Anular una venta antigua → motivo y "volvió a la bodega" → Confirmar.

**M-02 · La merma no pide motivo (MER-03)**

- El documento de módulos exige el motivo (podrido, dañado, descarte o reacondicionado).
- El formulario no lo pide, y todo queda como "Merma registrada".
- Evidencia: `audit/capturas/hallazgo-merma-sin-motivo.png`.

**M-03 · Ajuste de stock de un producto sin lotes crea un movimiento huérfano (INV-05)**

- El selector de lote queda vacío y se registra `lot:''`.
- El stock calculado suma, pero ese movimiento no pertenece a ningún lote: FIFO, venta y merma no lo pueden consumir.
- Resultado: stock "fantasma".

*Reproducir:* crear un producto → Editar → Ajustar stock +5 → "Ajuste registrado".

**M-04 · Balance a 768 px (RESP-01)**

- En tablet vertical se mantienen la barra lateral y dos columnas.
- Los nombres de los gastos fijos se parten letra por letra ("Arri/end/o") y el monto "− $2.245.000" se sale 28 px.
- Evidencia: `audit/capturas/hallazgo-768-balance-desborde.png`.

### Baja

| ID | Hallazgo |
|---|---|
| B-01 | Las cantidades de gamela con decimal se redondean sin aviso: 2,5 → 3, en la recepción (REC-03) y en el POS (POS-03) |
| B-02 | Un precio con decimal se trunca sin aviso (`parseInt`: 15000.7 → 15.000) y no hay tope (se acepta $999.999.999.999) (INV-03) |
| B-03 | Un ajuste de 0,4 gamela registra un movimiento de 0 con el mensaje "Ajuste registrado" (INV-04) |
| B-04 | Los montos negativos se muestran como `$-1.403.595` en vez de `-$1.403.595` (Balance) |

### A confirmar con Felipe (no se clasifican como error)

- **P-01 · Foto de la guía.**
  - El campo "Foto de la guía (opcional)" existe en el commit `921ed28`, pero **no está en la copia de trabajo** (se eliminó en los cambios sin commitear).
  - El código que lee `fotoId` sigue presente.
  - ¿La eliminación es intencional?
- **P-02 · Créditos del vendedor.** `Reunion_2_cambios.md` dice "Vendedores sin el módulo Créditos", pero el vendedor ve Créditos y el botón "Pagar" (con autorización). Las pruebas `smoke` validan este comportamiento.
- **P-03 · Documentación desactualizada.**
  - La documentación indica claves de 4 dígitos (`luis/1234`); el código usa 6.
  - Indica "15 ventas + Ver 15 más"; el código usa paginación numerada de 20.

---

## 5. Recomendaciones de corrección

| Prioridad | Acción | Fase |
|---|---|---|
| Crítica | Autenticación real (Firebase Auth); eliminar `clave` del modelo y las credenciales del login | 3 |
| Crítica | Aplicar los permisos en el servidor (reglas de Firestore y Cloud Functions para ventas, reversiones, cierres y liquidaciones); `workflowAdmin()` en todas las escrituras de admin | 2–3 |
| Crítica | Base de datos central (Firestore) con transacciones para la venta, la recepción y la merma (FIFO) | 3 |
| Alta | `save()` debe propagar el error y la UI debe avisar. Con Firestore desaparece el límite de 5 MB | 2–3 |
| Alta | Impedir quitarse el rol de admin y exigir al menos 1 administrador activo | 2 |
| Alta | Unicidad de la liquidación por productor y periodo (o advertencia de solape) | 2–3 |
| Media | Mensaje de reversión según el estado real (completada / pendiente de verificación) | 2 |
| Media | Campo de motivo en la merma | 2 (cambio funcional: confirmar) |
| Media | Ajuste sin lotes: crear un lote de ajuste o bloquearlo con un mensaje | 2 |
| Media | Balance a 768 px: apilar las columnas por debajo de ~900 px | 2 |
| Baja | Rechazar los decimales en gamelas y precios con un mensaje; tope razonable de precio; formato `-$` | 2 |

Las correcciones que cambian reglas de negocio (motivo de merma, bloqueo de liquidaciones) necesitan tu visto bueno antes de aplicarse.

---

## 6. Riesgos para la migración

1. **Lógica acoplada al DOM.**
   - Las funciones de negocio (`fifo`, `lotStock`, `srcStock`, `creditBalance`, `liqCalc`, `revenueEntries`…) están mezcladas con plantillas HTML y leen `$('#id').value`.
   - Hay que extraer primero un núcleo de dominio puro en TypeScript y probarlo contra las suites actuales, antes de mover la UI.
2. **Estado global mutable.**
   - `S`, `ui`, `me` y `view` son globales y casi todas las funciones las mutan directamente.
   - Migrar a React exige un único punto de escritura (comandos y servicios). Si no, se pierden las garantías de `workflowTransaction`.
3. **Stock derivado de movimientos.**
   - En Firestore no se puede sumar la colección `moves` en cada lectura (costo y latencia).
   - Se necesitan saldos por lote mantenidos dentro de transacciones o Functions, sin perder el libro de movimientos.
4. **Invariantes sensibles.** Hay que conservarlos exactamente:
   - FIFO por origen.
   - Reservas compartidas entre líneas repetidas.
   - Idempotencia por `commandKey`.
   - Gamelas (el descuento debe ser menor que la compra).
   - Crédito y comisiones con autorización de un solo uso.
   - Reversión en 3 estados independientes.
   - Las 41 verificaciones de `tests/*.cjs` y estas 63 E2E forman la red de regresión.
5. **Datos históricos (legacy).** Las ventas sin `workflowVersion` se tratan como "sin verificar". Si se migran datos de un navegador, se mantienen esas reglas (no se infiere emisión ni cobro).
6. **Autorización en tiempo real.**
   - Hoy los avisos para Luis dependen de que todo ocurra en el mismo navegador.
   - Con Firestore se necesitan listeners (`onSnapshot`) acotados para no disparar las lecturas.
7. **Offline.** Hoy la app funciona sin red una vez cargada. Con Firestore hay que decidir si se habilita la persistencia offline (útil en la bodega) y cómo se resuelven los conflictos de stock.
8. **Cambios sin commitear.** La auditoría se hizo sobre la copia de trabajo. **Antes de la Fase 2 hay que commitear o respaldar esos cambios** para tener una base verificable.
9. **Visual.** La apariencia depende de un CSS único con tokens por tema (`reports/design-token-audit.md`). Hay que migrarlo sin rediseñar, y compararlo con las capturas de `audit/capturas/` y `reports/qa-lma/`.

---

## 7. Evidencias

- `audit/resultados-fase1.json`: resultado y detalle de cada caso.
- `audit/consola-fase1.json`: errores de consola y solicitudes fallidas. La corrida completa reportó 0; el archivo se regenera en cada ejecución.
- `audit/capturas/`:
  - `recon-*.png`: cada módulo por rol a 1440 px.
  - `resp-390-*` y `resp-768-*`: vistas en móvil y tablet.
  - `resp-390-venta-comprobante.png`: venta completa en móvil.
  - `hallazgo-*.png`: evidencia de los errores visuales.
- `audit/reporte-contadora.csv`: reporte descargado por la contadora con datos de demostración.
- Cómo volver a ejecutar las pruebas: `audit/README.md`.
