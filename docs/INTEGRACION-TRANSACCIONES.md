# Ventas, documentos tributarios y reversiones

## Implementación local

El motor está en `assets/transaction-workflow.js`, cargado por el HTML. No hay llamadas de red ni credenciales en el motor. `transactionAdapters.fiscal` y `.payments` están desconectados y sus métodos rechazan explícitamente emitir, devolver o consultar servicios reales. Las observaciones de proveedor se prueban exclusivamente con fixtures.

El punto de venta primero crea un borrador en memoria con productos, cantidades, precios, documento, cliente, medios y referencias. Abrir/cerrar esta revisión no registra venta, no reserva/descuenta stock ni prepara documentos. El usuario confirma que recibió todos los pagos. Solo entonces se ejecuta `registerSaleCommand`, que recalcula FIFO y precios, valida pagos y guarda venta, movimientos y solicitudes en una escritura local. La interfaz permite volver y corregir.

La misma clave de confirmación devuelve la misma venta. Una clave reutilizada con otro contenido se rechaza. Una referencia única del terminal no se puede reutilizar en otra venta. Incluye operador/terminal/operación en esa referencia; una numeración abreviada que el operador reutiliza no identifica de forma suficiente una transacción.

Las líneas repetidas de un producto comparten reservas FIFO temporales antes de registrar movimientos: no pueden consumir dos veces las mismas existencias. Precio, costo y comisión aplicables se conservan en las asignaciones de la venta nueva.

## Tres estados independientes

| Ámbito | Estados principales | Qué significa |
| --- | --- | --- |
| Comercial | registrada, reversion_pendiente, revertida | Venta y su compensación comercial |
| Pago | confirmado_manual, registrado_sin_verificar, devolucion_pendiente, devuelto | Recepción declarada o devolución conciliada; no autorización bancaria automática |
| Documento | pendiente_integracion, pendiente_validacion_voucher, pendiente_conciliacion, sin_verificar, desconocido, error, emitido, cancelado_sin_emision | Cobertura tributaria y resultado independiente |
| Nota de crédito | pendiente_integracion, error_conciliacion, emitida | Referencia y compensación de un DTE emitido |

`estado` histórico se conserva para compatibilidad, pero los nuevos controles no lo usan para inferir cobro o emisión. Los comprobantes internos/PDF siguen identificados como demostración, incluso cuando una futura observación indique que hay un DTE asociado. El DTE real y su representación deberán provenir del proveedor.

## Cobertura tributaria, sin duplicaciones

Se guarda una instantánea del modelo declarado y operador con cada venta:

- Efectivo/transferencia: se prepara una boleta por el total al registrar el pago confirmado, sin esperar al cierre.
- Factura: se prepara una factura por el total, con receptor, cualquiera sea el medio de pago. Un voucher financiero no la sustituye.
- Tarjeta, modelo `siempre_boleta` con referencia de declaración: se prepara una boleta por el total.
- Tarjeta, modelo `voucher_sustituye`, operador/referencia declarados y confirmación de validez del voucher: se registra ese voucher y su referencia, pendiente de validación; no se prepara otra boleta por ese importe.
- Mixto efectivo + tarjeta bajo ese modelo: boleta por la parte en efectivo y voucher por la parte de tarjeta. La suma de coberturas debe ser exactamente el total.
- Mixto efectivo + transferencia: boleta por el total.
- Modelo o voucher no verificados: conciliación pendiente; no se adivina el tratamiento ni se prepara un envío susceptible de duplicar la venta.

El modelo es una declaración administrativa local, no una inscripción o validación real ante el SII. El plan de cobertura no es XML: el futuro backend deberá distribuir ítems, impuestos y redondeos entre documentos conforme a esquema y reglas vigentes, evitando copiar el detalle completo en dos documentos que cubren solo partes del pago.

Fuente oficial: [SII, modelo de emisión y voucher](https://www.sii.cl/destacados/boleta_electronica_voucher/index.html). Su tabla diferencia efectivo/transferencia de pagos electrónicos y los dos modelos declarados.

## Reversión completa

1. El vendedor puede solicitar reversión de sus ventas, incluso incluidas en un cierre. No puede aprobarla, devolver stock, registrar devolución ni modificar documentos.
2. El administrador debe dar motivo y declarar si la mercadería fue recibida físicamente y corresponde reintegrarla. Sin esa declaración no se devuelve stock.
3. Documento local preparado pero nunca enviado: se cancelan sus intenciones de emisión y se registra una reversión administrativa.
4. Documento con estado desconocido, error de estado o histórico sin verificar: la reversión permanece pendiente de verificación; no devuelve stock ni registra un crédito comercial como completado.
5. DTE emitido: el original conserva tipo, folio, RUT, fecha, monto y referencia remota. Se prepara una nota de crédito por cada DTE, con clave estable y referencia exacta. La reversión comercial/stock espera a que las notas se observen emitidas y verificadas.
6. Voucher: la reversión comercial no prueba la devolución ni el ajuste tributario del operador. Permanecen conciliaciones separadas; solo una observación verificada puede resolver el estado tributario del voucher.
7. Cada devolución de dinero tiene registro y clave propia por componente. El administrador registra la referencia de una devolución que ya ejecutó por fuera. Para tarjeta se exige comprobante del operador. La acción no ejecuta una devolución bancaria.
8. Reintentos y callbacks repetidos no generan nuevos movimientos de devolución de stock, créditos, notas ni salidas de dinero.

Fuente oficial: [SII, anulación de boleta mediante nota de crédito](https://www.sii.cl/preguntas_frecuentes/factura_electronica/001_003_5352.htm).

El flujo implementado es de reversión **total**. No ofrece devoluciones parciales, cambios de documento después de emitir, reventa automática ni compensación monetaria automática de saldos de productores.

## Inventario, caja y contabilidad

- Los movimientos de venta originales nunca se borran. El reintegro crea movimientos positivos hacia exactamente los lotes originales, una sola vez y con motivo/actor.
- Los reportes de devengo usan `revenueEntries()`: venta en su fecha y compensación negativa en la fecha efectiva de reversión. No se vuelve a calcular un período pasado como si la venta nunca hubiera existido.
- Las liquidaciones guardadas no se modifican. Las compensaciones de consignaciones aparecen en la fecha de reversión, con referencia de productor, cierre y liquidaciones anteriores afectadas. Un saldo negativo se muestra como ajuste a compensar, no como pago al productor.
- El dinero usa `moneyEntries()`: ingresos registrados y salidas solo cuando se confirma manualmente la devolución. Una reversión comercial con devolución pendiente no se representa como dinero ya entregado.
- Un cierre conserva ventas, importes, diferencias, devoluciones y documentos pendientes tal como se registraron. Una devolución posterior aparece en un cierre posterior y no se resta dos veces de la venta/cierre original.
- El cierre incorpora fondo inicial, neto de efectivo y efectivo esperado. Si hay devoluciones sin ingresos actuales, debe declararse el efectivo inicial que las financia. La UI distingue ese fondo del neto de movimientos.
- Las ventas netas/consignaciones son datos de devengo; las devoluciones pendientes son obligaciones por conciliar. El balance comercial no equivale a una consulta de saldo bancario. El dashboard y cierre separan los canales de dinero.

El panel **Control tributario** permite buscar, paginar, filtrar pendientes/documentadas/anuladas/solicitudes/errores/devoluciones, revisar el historial y preparar consultas. Preparar una consulta no significa ejecutarla ni autorizar la emisión. El cierre informa pendientes, pero no dispara emisiones en lote.

## Persistencia y límites actuales

`workflowTransaction` conserva una instantánea previa y revierte los cambios en memoria si falla la escritura. Una revisión local detecta cambios de otra pestaña ya persistidos y exige recargar en vez de sobrescribirlos. Esto mejora el prototipo, pero **localStorage no ofrece transacciones entre pestañas**: la comparación/escritura no es una operación atómica distribuida. Tampoco hay sincronización entre dispositivos ni autenticación segura del lado servidor.

Las garantías actuales se limitan al flujo local y las claves conocidas por este navegador. No se debe conectar emisión/cobros reales a esta persistencia. Antes de producción se requiere backend y base de datos transaccional, con autorización del lado servidor, control de concurrencia y registro central de operaciones. Los datos históricos se marcan sin verificar cuando se gestionan: nunca se presupone que un comprobante interno equivalga a DTE o que una ausencia local pruebe ausencia externa.

## Contrato futuro de backend y adaptadores

### Comandos sugeridos

- `POST /sales/prepare`: valida precios, stock y permisos; devuelve revisión y versión, sin registrar movimientos.
- `POST /sales/confirm`: `Idempotency-Key`, revisión, pagos confirmados y evidencia; registra venta/FIFO/outbox en una transacción.
- `POST /sales/:id/reversal-requests`: motivo y actor vendedor.
- `POST /sales/:id/reversals`: motivo, autorización y decisión física de stock.
- `POST /documents/:id/reconcile`: consulta real previa a cualquier reintento.
- `POST /refunds/:id/reconcile`: evidencia del operador/banco y deduplicación de devolución.
- `POST /closures`: versión y movimientos aún no cerrados, con saldos de apertura.

### Identidades estables

- Venta: clave de confirmación persistida y hash canónico del payload.
- Documento: `saleId:boleta` o `saleId:factura`; voucher identificado además por operador, comercio/terminal y transacción.
- Reversión: `reversion:saleId`.
- Nota de crédito: `reversion:saleId:nc:documentId`.
- Devolución: `reversion:saleId:devolucion:paymentIndex`.
- Stock compensatorio: `reversion:saleId:stock:lineIndex:allocationIndex`.

El backend debe tener restricciones únicas por empresa para estas claves, identidad fiscal `(RUT emisor, tipo DTE, folio)`, transacciones del operador y referencias de devolución. Bloquear/validar lotes FIFO en la misma transacción que inserta venta y outbox. La versión de precios y el payload se revalidan al confirmar; nunca confiar en totales/roles enviados por el navegador.

### Consulta antes de reintentar

1. Un worker toma el intento de outbox con exclusión mutua.
2. Consulta al proveedor por la clave/identidad real. Desconocido o timeout significa conciliación pendiente, no ausencia.
3. Si ya existe el DTE/cobro/devolución, incorpora ese resultado; no vuelve a crearlo.
4. Solo una ausencia autoritativa y una transición permitida habilitan emitir/reintentar con la **misma** clave. Confirmar que el proveedor soporta idempotencia; si no, mantener conciliación y no reintentar ciegamente.
5. Guardar respuesta y observación con identificador de evento autenticado. Un timeout tras enviar puede significar que la operación sí ocurrió.
6. Verificar firma/autenticidad del webhook, empresa, tipo, folio, monto, referencia original y estado real antes de llamar al reductor. Callbacks fuera de orden no degradan un DTE emitido.

### Reductores locales de referencia

`observeFiscalDocument` acepta una observación de documento; para emitido exige identidad, monto y tipo compatibles con el plan. Rechaza cambiar un original o asociar el mismo DTE a otra venta. `observeCreditNote` verifica tipo 61, monto y referencia del DTE antes de desbloquear la compensación. Son puntos de transición probados, **no endpoints seguros**: `verified: true` no sustituye verificación criptográfica o consulta de proveedor. Solo el futuro servidor autenticado debe generar esas observaciones.

### Terminales y modelos tributarios

El adaptador de pago debe registrar autorización, captura/cobro, reversa/devolución y voucher como entidades distintas. No guardar PAN/CVV en este proyecto. En factura debe informar al operador la naturaleza del documento y conciliar el reporte para que el voucher no se use como sustituto de factura. La política de pagos mixtos y voucher debe validarse con el operador y modelo SII reales antes de habilitar producción.

## Verificación

- `node tests/smoke.cjs`: pantallas, temas y funciones anteriores.
- `node tests/receipts.cjs`: factura/boleta, snapshot, tarjeta, PDF y compartir.
- `node tests/transactions.cjs`: revisión sin escrituras; doble confirmación/reintento; cuota de almacenamiento; revisión concurrente; FIFO con líneas repetidas; retorno exacto/no retorno físico; NC pendiente/error/duplicada; estado desconocido; voucher/modelos/mixtos/factura; dinero separado; cierres/liquidaciones previas intactas; compensaciones en otro período; permisos; emisión tardía sin repetir devolución.

Las pruebas son de lógica y HTML generado en un contexto aislado. No demuestran render, navegación de teclado real, FPS, comunicación con un operador ni aceptación del SII. No se usaron credenciales, no se cobraron/devolvieron fondos y no se emitieron DTE reales.
