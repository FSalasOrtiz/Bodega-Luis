# Sistema de Bodega Lo Valledor — Desglose de módulos

Oct 27, 2026 · @Felipe

El sistema es una aplicación web, usable desde el celular, que controla el stock de bodega por calibre, registra cada venta con el nombre de quien la hizo y le muestra a Luis, desde su casa, cuánto llegó, cuánto se vendió y cuánto queda. Debe estar operativo antes del **15–20 de noviembre**, cuando empieza a llegar mercadería de productor en consignación.

## Resumen del negocio

- **Cliente:** Luis, administrador y dueño de una bodega en Lo Valledor, más de 10 años en el rubro.
- **Productos:** principalmente tomate por calibre; también tomate en rama, tomate pera ("larguito"), palta por variedad y categoría (súper, extra) y otros productos (ej. mango).
- **Dos formas de ingreso de mercadería:**
  - **Compra directa:** Luis compra la mercadería y la revende.
  - **Consignación de productor:** el productor envía su cosecha, se vende a precio de plaza y la bodega cobra **10% de comisión** sobre lo vendido.
- **Equipo:** Luis (también vende) y dos vendedores, uno en turno de noche y otro en turno de mañana. Nombres y horarios exactos por confirmar.
- **Pagos:** efectivo y transferencia. Tarjeta (POS) a futuro.
- **Terminología:** "gamela" es la caja negra retornable en que se vende el tomate; en este documento se usa siempre "gamela" para esa unidad.

**Problema actual:** todo se lleva en Excel, donde un dato se borra o se altera sin querer, no hay registro de quién vendió qué y Luis tiene que estar físicamente en la bodega casi todo el día. Su objetivo explícito es pasar menos horas ahí y más tiempo con su familia, controlando todo desde el teléfono.

## Alcance y arquitectura general

Se propone una **aplicación web responsiva** (funciona en celular, tablet y notebook sin instalar nada), con base de datos central en la nube, para que Luis y los vendedores trabajen sobre el mismo stock en tiempo real desde sus propios teléfonos.

**Pensado primero para el celular:** la bodega tiene un PC, pero la venta se hará principalmente desde el teléfono de cada vendedor mientras recorre la bodega. El punto de venta y la recepción se diseñan para una mano: botones grandes, búsqueda por nombre o SKU y confirmación en pocos toques. El PC queda para el administrador (reportes, inventario, historiales).

**Módulos del sistema (8):**

1. Dashboard y Reportes
2. Punto de venta
3. Recepción de productos / Merma
4. Inventario (catálogo, precios y stock)
5. Historial de ventas (incluye cierre de caja)
6. Historial de movimientos
7. Usuarios
8. Productores y liquidaciones

Transversal a todos: **inicio de sesión** con usuario y contraseña (o PIN en el celular) y **registro automático** de quién hizo cada acción y cuándo, consultable en Historial de movimientos.

**Stack y decisiones técnicas:** ver la sección Requisitos técnicos para el desarrollo. El prototipo HTML funcional entregado junto a este documento es la referencia de pantallas y flujos.

**Flujo de la mercadería:** llega el camión → se registra el embarque por calibre y cantidad de cajas → queda en stock → sale por venta o por merma → si es de productor, se liquida descontando el 10%. El diagrama al final de esta sección lo muestra.

&#91;embedded content: flujo de la mercadería · de la recepción a la liquidación\]

El stock por calibre es el centro: todo lo que entra suma ahí y cada venta o merma lo descuenta, con el nombre de quien lo registró.

## Roles y permisos

Hay dos roles: **Administrador** (Luis) ve y controla todo; **Vendedor** (los trabajadores de cada turno) registra ventas, recepciones y mermas, y ve únicamente lo suyo. Cualquier corrección pasa por el administrador.

| Acción | Administrador | Vendedor |
| --- | --- | --- |
| Registrar ventas desde su celular | Sí | Sí |
| Ver precios de hoy (franja en el punto de venta) | Sí | Sí |
| Consultar stock y precio de un producto | Sí | Sí |
| Ver sus propias ventas del turno | Sí | Sí |
| Ver ventas de otros vendedores y totales globales | Sí | No |
| Registrar recepción de mercadería | Sí | Sí (queda disponible al tiro; no la puede editar después) |
| Registrar merma | Sí | Sí (a confirmar con Luis) |
| Declarar efectivo al cerrar su turno | Sí | Sí |
| Cambiar precios | Sí | No |
| Corregir recepciones, ajustar stock, anular ventas | Sí | No (lo solicita al admin) |
| Dashboard, reportes y comparativos | Sí | No |
| Productores, liquidaciones y gastos | Sí | No |
| Revisar cierres de caja | Sí | No |
| Crear usuarios y productos | Sí | No |

**Mecanismo de corrección ("la llave del supervisor"):** si un vendedor se equivoca, pide la corrección desde la app; el administrador la aprueba o la hace con su clave, y queda registrado el valor anterior, el nuevo, quién y cuándo. Los datos confirmados no se pueden borrar, solo anular con motivo.

## Módulos detallados

Cada módulo corresponde a una opción del menú; el acceso (login) es transversal. Todos los módulos se entregan juntos como un pack completo; el orden de construcción está en Plan de entrega.

### Acceso (transversal)

- Login con usuario y contraseña; PIN corto de 4 dígitos opcional en el celular del vendedor.
- Sesión que se mantiene abierta en el teléfono para vender rápido.
- Menú según el rol. El vendedor ve: Punto de venta, Recepción / Merma, Inventario (solo stock y precio) y Mis ventas.
- Cierre de sesión remoto si se pierde un teléfono.

### 1. Dashboard

Pantalla de inicio del administrador, para ver la bodega desde la casa.

- Llegadas de hoy por producto y por productor.
- Tabla de stock por producto: llegó / vendido / merma / queda (ej. "a las 12 quedan 150 gamelas de calibre 9").
- Ventas del día: monto total, número de ventas, gamelas y kg vendidos.
- Ventas por vendedor y por medio de pago (efectivo / transferencia).
- Desglose por familia: tomate, palta, otros.
- Alertas: stock bajo, lotes con muchos días en bodega, gamelas pendientes, diferencias de caja.
- Recuadro Precios de hoy (el mismo que ven los vendedores en el punto de venta).
- **Reportes (opción propia del menú del administrador):** ventas por día, semana, mes y año; comparativo con el mismo periodo del año anterior; meta mensual con porcentaje de avance; productos más vendidos; merma por periodo; gastos y resultado del mes; calendario de temporadas con notas de fechas buenas y malas y recordatorios; exportación a Excel / PDF.

### 2. Punto de venta

Diseñado para usarse con una mano desde el celular.

- **Franja "Precios de hoy"** arriba de la pantalla, con aviso cuando el administrador cambia un precio.
- Búsqueda por nombre o SKU, con filtro por familia (tomate, palta, otros).
- Cada producto muestra su **precio vigente y stock actual**, para que el vendedor corrobore si el precio cambió.
- **Consulta de precio sin generar venta.**
- **Dos unidades de medida:**
  - **Gamela:** se vende por cantidad entera de gamelas. Total = gamelas × precio por gamela.
  - **Kg:** el precio se define por kg y el cálculo es proporcional. El vendedor puede ingresar kilos directos o número de cajas (kg = cajas × peso base de la caja). Total = kg × precio por kg. Venta mínima: el peso de una caja, con opción de rellenar sobre ese peso.
  - Ejemplo kg: palta a $1.600/kg, caja de 15 kg. Una caja = 15 kg = $24.000; si el cliente pide 20 kg = $32.000.
- No permite vender más stock del disponible y muestra lo que queda al agregar ("quedan 280 gamelas de calibre 9").
- **Gamelas retornables:** en la venta se indica cuántas gamelas vacías devuelve el cliente; las que no devuelve se cobran en la misma venta al valor configurado.
- Cliente opcional (nombre o "cliente ocasional"); con saldo de gamelas si es cliente frecuente.
- Medio de pago: efectivo, transferencia o mixto (tarjeta a futuro).
- Confirmación y comprobante interno en pantalla o por WhatsApp.
- Cada venta queda con el **nombre del vendedor**, fecha y hora, y el precio usado en ese momento.
- El vendedor no puede cambiar precios; si se equivoca, solicita la anulación al administrador.

### 3. Recepción de productos / Merma

Una pantalla con dos botones grandes: **Recepción de producto** y **Merma**.

**Recepción de producto:**

- Fecha y hora, productor o proveedor, y modalidad (compra directa o consignación).
- Líneas por producto: cantidad de gamelas (no pallets, porque varían entre 40 y 50); para productos por kg, cajas y kg totales.
- Pallets como dato informativo; costo de compra en compra directa.
- Foto opcional de la guía o boleta del productor.
- Total de la recepción calculado automáticamente.
- Cada línea crea un **lote** con fecha de ingreso y productor.
- Al guardar, el stock queda **disponible al tiro** para vender (aunque Luis no esté). El vendedor no puede editarla después; solo el administrador corrige, con motivo.
- Comprobante de recepción en PDF para el productor, con nombre y logo de la bodega.

**Merma:**

- Producto, lote, cantidad (gamelas o kg) y motivo: podrido, dañado, descarte, reacondicionado.
- Caso de reacondicionamiento: de 30 gamelas quedan 20 buenas y se botan 10.
- Al confirmar, el stock baja y queda en Historial de movimientos; en consignación aparece en la liquidación.

### 4. Inventario

Registro de todos los productos que la bodega ha tenido, con su stock actual. Incluye el catálogo y los precios.

- **Vista administrador:** SKU, nombre, familia, unidad, precio, stock actual, llegó hoy y vendido hoy.
- **Vista vendedor:** solo nombre, precio y stock actual (sin totales de venta).
- Filtros por familia y calibre; búsqueda por nombre o SKU; productos inactivos ocultos pero con historial.
- Ficha de producto con sus lotes (fecha de ingreso, productor, cantidad que queda, días en bodega) y sus movimientos.
- **Solo administrador:** crear y editar productos, cambiar precios (con aviso a los vendedores) y ajustar stock con motivo.
- **Stock por lote:** cada venta y merma descuenta del lote más antiguo del producto (primero en entrar, primero en salir), para saber de qué productor era cada gamela y no dejar que se pudra.
- El **stock actual no se edita a mano**: es la suma de los movimientos (recepción suma; venta y merma restan; ajustes del administrador quedan registrados).

**Atributos del producto:**

| Atributo | Descripción | Ejemplo |
| --- | --- | --- |
| SKU | Código único interno, usable con lector de código de barras a futuro | TOM-C9 |
| Nombre | Como lo llama Luis | Tomate calibre 9 |
| Familia | Tomate, palta u otros, para separar en el dashboard | Tomate |
| Calibre / variedad | Para filtrar sin depender del nombre | 9 |
| Unidad | Gamela o kg (por ahora solo la palta se vende por kg) | Gamela |
| Precio de venta | Precio vigente por gamela o por kg, según la unidad; cada cambio queda en el historial | $20.000 |
| Stock actual | Suma de los movimientos, no editable; en gamelas o kg | 280 |
| Peso base caja (kg) | Solo productos por kg: convierte cajas a kg y define la venta mínima | 15 |
| Usa gamela | Si se controla el envase retornable | Sí |
| Activo | Para productos de temporada | Sí |

### 5. Historial de ventas

- Lista de ventas con fecha, hora, vendedor, cliente, productos, total y medio de pago.
- Filtros por fecha, vendedor, producto y medio de pago.
- El vendedor ve solo sus ventas ("Mis ventas"); el administrador ve todas.
- Anulación de una venta solo por el administrador, con motivo; devuelve el stock al lote original.
- **Cierre de caja por turno:** el vendedor declara el efectivo contado al terminar su turno; el sistema muestra lo esperado (ventas en efectivo) y la diferencia. El administrador revisa y aprueba. Historial de cierres por día.

### 6. Historial de movimientos

Bitácora de todo lo que cambia el stock o la configuración; es la base del control que pidió Luis.

- Recepciones, mermas, ventas, anulaciones, ajustes de stock y cambios de precio.
- Cada registro con usuario, fecha y hora, valor anterior y valor nuevo, y motivo.
- Filtros por tipo de movimiento, producto, usuario y fecha.
- Solo lectura; ningún registro se puede borrar.

### 7. Usuarios

- Crear, editar y desactivar usuarios (solo administrador).
- Rol: Administrador o Vendedor; turno: noche o mañana.
- Restablecer contraseña o PIN.
- Resumen de ventas por vendedor (solo administrador).

**Ajustes (solo administrador):** nombre comercial y RUT de la bodega, valor de la gamela no devuelta, comisión por defecto, hora de inicio de la jornada y umbral de alerta de stock bajo.

**Referencia visual:** el prototipo HTML (`bodega-lo-valledor.html`) implementa todas estas pantallas y reglas con datos en el navegador. Usuarios de prueba: Luis (PIN 1234), "Vendedor noche" (1111) y "Vendedor mañana" (2222); los nombres de los vendedores son provisorios hasta que Luis los confirme.

### 8. Productores y liquidaciones

Necesario desde el 15 de noviembre, cuando llega el primer productor en consignación.

- Ficha de productores y proveedores: nombre, RUT, teléfono, % de comisión (10% por defecto).
- **Liquidación por productor y periodo:** gamelas o kg recibidos, vendidos, merma, monto vendido, comisión de 10% y neto a pagar.
- Liquidación en PDF para el productor, con nombre y logo de la bodega.
- Estado de pago (pendiente / pagada), fecha y medio de pago; historial por productor.
- Clientes frecuentes con su saldo de gamelas (entregadas, devueltas, pendientes).

## Reglas de negocio clave

Estas reglas son las que hacen que el sistema calce con cómo trabaja Luis; son la base para programar los cálculos.

1. **Unidad gamela:** el stock de tomate se lleva en gamelas enteras. En la recepción se ingresa la cantidad real de gamelas, no de pallets.
2. **Unidad kg (cálculo proporcional):** el precio se define por kg. Se puede vender ingresando kg o cajas (kg = cajas × peso base de la caja). Total = kg × precio por kg, redondeado al peso. Venta mínima: una caja.
3. **Consignación:** neto a pagar al productor = monto vendido de sus lotes − comisión (10% del monto vendido). La merma no se paga.
4. **Compra directa:** margen = precio de venta − costo de compra del lote.
5. **Primero en entrar, primero en salir:** cada venta y merma descuenta del lote más antiguo del producto; una línea de venta puede tomar de más de un lote.
6. **Merma** descuenta stock del lote y en consignación aparece en la liquidación del productor.
7. **Gamelas retornables:** el cliente devuelve gamelas vacías; las que no devuelve se cobran en la misma venta al valor configurado.
8. **Solo el administrador cambia precios.** Cada línea de venta guarda el precio usado en ese momento.
9. **Recepción disponible al tiro:** al guardarla, el stock se puede vender; solo el administrador la corrige después.
10. **Nada se borra:** ventas, recepciones y mermas solo se anulan o corrigen con motivo, y queda el registro.
11. **Los vendedores ven solo lo suyo:** totales globales y por vendedor son exclusivos del administrador.
12. **Jornada comercial:** como los turnos cruzan la medianoche, el "día" de cierres y reportes empieza a una hora configurable (por confirmar con Luis).
13. **Montos y cantidades:** pesos chilenos enteros; kg con hasta 2 decimales; gamelas siempre enteras.

## Modelo de datos

Entidades principales para la base de datos; sirve como instrucción directa para construir el backend.

| Entidad | Campos principales | Relación |
| --- | --- | --- |
| Configuración | nombre y RUT de la bodega, logo, valor gamela, comisión por defecto, hora de inicio de jornada | usada en todo el sistema |
| Usuario | nombre, usuario, hash de clave y PIN, rol, turno, activo | hace ventas, recepciones, movimientos |
| Familia | nombre (Tomate, Palta, Otros) | agrupa productos |
| Producto | SKU, nombre, familia, calibre/variedad, unidad (gamela/kg), precio de venta, peso base caja (kg), usa gamela, activo | stock actual = suma de movimientos de sus lotes |
| Historial de precio | producto, precio, vigente desde, usuario | auditoría de precios |
| Productor / Proveedor | nombre, RUT, teléfono, tipo, % comisión | entrega recepciones |
| Recepción | fecha, productor, modalidad (compra/consignación), pallets, foto de guía, usuario | crea lotes |
| Lote | recepción, producto, cantidad inicial, costo unitario, fecha de ingreso | recibe movimientos de stock |
| Movimiento de stock | lote, tipo (recepción, venta, merma, ajuste, anulación), cantidad con signo, usuario, fecha, motivo, línea de venta | Historial de movimientos; stock = suma |
| Cliente | nombre, teléfono, RUT, saldo de gamelas | compra en ventas |
| Venta | fecha/hora, vendedor, cliente, total, estado (vigente/anulada), cierre de caja | tiene líneas y pagos |
| Línea de venta | venta, producto, unidad, cantidad, precio unitario usado, subtotal | genera movimientos en uno o más lotes |
| Pago | venta, medio (efectivo/transferencia/tarjeta), monto | suma al cierre de caja |
| Movimiento de gamela | cliente, venta, entregadas, devueltas, cobradas | saldo por cliente |
| Cierre de caja | vendedor, turno, fecha, efectivo esperado, efectivo declarado, transferencias, diferencia, aprobado por | agrupa ventas del turno |
| Liquidación | productor, periodo, cantidad vendida, monto vendido, comisión, merma, neto, estado de pago | cierra la consignación |
| Gasto | fecha, categoría, monto, descripción | resultado del mes |
| Meta | periodo, monto objetivo | dashboard y reportes |
| Nota de calendario | fecha desde/hasta, tipo (buena/mala/evento), texto, recordar | calendario de temporadas |
| Auditoría | usuario, acción, entidad, valor anterior, valor nuevo, fecha | cambios de precios, productos y usuarios |

## Requisitos técnicos para el desarrollo

Decisiones fijas para construir sin ambigüedad; se pueden cambiar, pero antes de empezar.

- **Stack:** Next.js (App Router) con TypeScript y Tailwind CSS; PostgreSQL en Supabase (base de datos, almacenamiento de fotos de guías y tiempo real); ORM Prisma o Drizzle; despliegue en Vercel.
- **App instalable (PWA):** manifest e íconos, para dejarla como app en la pantalla de inicio del celular. Diseño primero para celular; botones de al menos 44 px.
- **Autenticación propia:** usuario + contraseña o PIN, con hash (bcrypt o argon2) y sesión en cookie httpOnly. Los permisos se validan en el servidor, no solo ocultando menús.
- **Formatos:** pesos chilenos enteros con separador de miles ($24.000); kg con hasta 2 decimales; fechas dd-mm-aaaa; zona horaria America/Santiago; interfaz en español de Chile.
- **Stock como libro de movimientos:** el stock es la suma de movimientos por lote; nunca un campo editable.
- **Ventas simultáneas:** cada venta se guarda en una transacción que bloquea los lotes que usa, para que dos vendedores no vendan la misma gamela; si no alcanza el stock, se rechaza con mensaje claro.
- **Tiempo real:** stock y precios se actualizan en los celulares sin recargar (Supabase Realtime o consulta cada 10–15 segundos).
- **Precio congelado** en cada línea de venta; el historial de precios no altera ventas pasadas.
- **PDF:** comprobante de recepción y liquidación al productor, con nombre, RUT y logo de la bodega.
- **WhatsApp:** compartir el comprobante de venta con un enlace wa.me con el texto del detalle.
- **Respaldos:** copia automática diaria de la base de datos.
- **Datos iniciales:** usuario administrador Luis; productos de ejemplo (tomate calibres 9, 8, 7½, 7, 6½, 6 y descarte; tomate en rama; tomate pera; palta súper y extra por kg) hasta recibir la lista real.
- **Pruebas:** unitarias para los cálculos (kg proporcional, primero en entrar primero en salir, comisión de 10%, cobro de gamelas, diferencia de caja) y una prueba de punta a punta del flujo recepción → venta → cierre → liquidación.

## Plan de entrega (1 semana)

El sistema completo se entrega en **7 días corridos** desde la aprobación del presupuesto, antes de que llegue el productor el **15 de noviembre**. El día 1 es el día siguiente a la aprobación; este es el orden de construcción.

1. **Día 1:** base de datos, acceso, usuarios, configuración e Inventario (catálogo y precios).
2. **Día 2:** Recepción de productos / Merma, lotes y libro de movimientos.
3. **Día 3:** Punto de venta con gamela y kg, franja de precios de hoy, cobro de gamelas y pagos.
4. **Día 4:** Historial de ventas, cierre de caja por turno e Historial de movimientos.
5. **Día 5:** Productores, liquidaciones y PDFs (comprobante de recepción y liquidación).
6. **Día 6:** Dashboard y Reportes (comparativos, metas, gastos, calendario).
7. **Día 7:** carga de productos reales, pruebas en la bodega con Luis y los vendedores, ajustes, capacitación y puesta en producción.

**Entregables:** sistema en producción con dominio propio, usuarios creados, capacitación a Luis y a los vendedores, manual breve de uso y respaldos automáticos. Luego, periodo de soporte y ajustes menores según el presupuesto.

## Fuera de alcance y pendientes por confirmar

Dejar esto por escrito en el presupuesto evita discusiones cuando aparezcan pedidos nuevos en el camino.

**Fuera de alcance (cotizable aparte):**

- Integración con bancos (transferencias desde el sistema o lectura de cartola).
- Emisión de boleta o factura electrónica en el SII.
- Integración con máquina de tarjetas (POS).
- Modo sin conexión para vender sin señal (se cotiza aparte si la cobertura en la bodega lo exige).
- Múltiples sucursales o bodegas.
- Control de vehículos, combustible o ubicación de trabajadores.
- App nativa en tiendas (App Store / Google Play); se entrega como web instalable en el celular.

**Cambios menores incluidos:** agregar productos, calibres o usuarios, y ajustes de colores, textos y tamaños.

**Pendientes por confirmar con Luis:**

- [ ] Nombres de los vendedores, turnos y horarios exactos. En la reunión solo quedó claro que el administrador es Luis; se escucharon "Gonzalo", "Samuel" y "mi papá", sin confirmar quiénes usarán el sistema.
- [ ] Lista completa de productos con nombre exacto, calibre, unidad y precio actual. Aclarar "zapato", "comarola" y la variedad de palta, que salieron mal en la grabación.
- [ ] Peso base de la caja de palta (ej. 15 kg) y si otro producto se vende por kg.
- [ ] Valor de cobro de cada gamela no devuelta (en la grabación parece "una luca").
- [ ] Si los vendedores pueden negociar dentro de un rango de precio o nunca lo tocan.
- [ ] Si el vendedor puede registrar merma, o solo el administrador.
- [ ] Hora de inicio de la jornada comercial para cierres y reportes.
- [ ] Cómo y cada cuánto se liquida al productor (por recepción, semanal), si la comisión es siempre 10% y si hay otros descuentos (flete, descarga).
- [ ] Si se vende a crédito o fiado a clientes frecuentes.
- [ ] Nombre comercial, RUT y logo de la bodega para comprobantes y liquidaciones.
- [ ] Cobertura de señal celular o Wi-Fi en toda la bodega.
- [ ] Si necesita boleta SII desde el sistema en esta etapa.
- [ ] Qué datos históricos (Excel de 3 años) quiere cargar.
- [ ] Qué indicadores quiere ver primero en el dashboard.
- [ ] Nombre de dominio y quién paga el hosting mensual.
