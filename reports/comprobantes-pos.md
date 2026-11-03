# Comprobantes del punto de venta

## Flujo implementado

Confirmar una venta abre la vista previa: boleta en ticket de 80 mm y factura en hoja completa A4, según el documento seleccionado. La estructura de factura y sus fuentes se documentan en `reports/factura-formato-sii.md`. Desde ella se puede descargar un PDF o abrir el selector nativo para compartir el PDF. Se eliminó el botón Imprimir por solicitud del usuario. El botón WhatsApp no descarga archivos ni abre mensajes de texto.

El documento incluye emisor, RUT, giro/dirección/comuna si están configurados, número interno, fecha, vendedor, productos, cantidad/unidad, precio, subtotal, total y medios de pago. Neto e IVA se muestran como un desglose referencial que considera todos los productos afectos y los precios finales con IVA incluido; no altera el total ni los movimientos de stock de la venta. La tasa general se contrastó con la [pregunta frecuente del SII](https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_0572.htm).

Las ventas nuevas guardan una instantánea `comprobante` del emisor, vendedor, detalle y montos para reimpresiones. Las ventas anteriores que no tienen esa instantánea usan los datos disponibles del catálogo/configuración al abrirse. El estado anulado se consulta desde la venta y se refleja tanto en vista previa como en PDF y mensaje.

Los datos adicionales del emisor se completan en Usuarios y ajustes. No se inventan giro, dirección, comuna ni identidad de clientes.

## Impresión y PDF

- Vista previa con papel blanco y texto negro en ambos temas.
- Impresión HTML de 80 mm con márgenes de 4 mm; solo se imprime el comprobante. El navegador/driver debe admitir ese tamaño de papel.
- PDF autónomo: boleta de 80 mm y factura A4, texto seleccionable, varias páginas para comprobantes extensos. No necesita librería externa ni conexión de red.
- La tipografía PDF soporta caracteres españoles y WinAnsi; otros alfabetos y emoji se sustituyen por `?`. HTML conserva el texto original.
- Las URL temporales de descarga se liberan después de iniciar la descarga.

## Compartir

El botón WhatsApp comparte exclusivamente el archivo PDF mediante el selector nativo del dispositivo. El usuario debe seleccionar WhatsApp y el destinatario; el navegador no puede forzar el destino ni enviar sin esa interacción.

Requiere contexto seguro (HTTPS para acceso por IP de la red) y soporte de archivos en Web Share API. En HTTP local por IP o en navegadores incompatibles se muestra un mensaje persistente en la vista previa. No se realiza ninguna descarga automática ni se abre un mensaje con `wa.me`; Descargar PDF permanece como acción independiente y explícita. Cancelar el selector no tiene efectos secundarios.

Referencia: [Navigator.share — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share).

## Alcance tributario

El documento lleva la identificación **demostración / documento no válido tributariamente**, tanto en pantalla como al imprimir, descargar o compartir. No genera folios autorizados, CAF, TED, XML firmado ni envío al SII. El número sigue siendo interno. Implementar la apariencia de boleta no sustituye esa integración.

## Verificación

Pasaron `node tests/smoke.cjs`, `node tests/receipts.cjs` y `node --check` del JavaScript inline. Se generó un PDF de prueba, se leyó con `pdfinfo` y `pdftotext` y se inspeccionó una imagen rasterizada con `pdftoppm` para comprobar legibilidad y alineación.

Las pruebas cubren cálculo referencial, total, pagos mixtos, datos históricos, venta real con snapshot, anulación, escape HTML, PDF/xref, paginación, impresión/limpieza y ramas de compartir/cancelación/contexto inseguro/navegador incompatible, y ausencia del botón de imprimir. Los controles de impresión y compartir se verifican con dobles de navegador: no se probó una impresora física ni se envió un mensaje. El entorno sigue sin permitir ver la UI en un navegador real.

La copia original permanece intacta.

## Boleta/factura y tarjeta

Se añadió selector Boleta/Factura en POS. Factura solicita RUT, razón social, giro, dirección y comuna del cliente; comprueba dígito verificador y campos antes de registrar movimientos. La instantánea conserva el tipo y receptor en venta, vista previa, PDF y texto. Ventas antiguas sin tipo se presentan como Boleta de demostración. No se emiten facturas tributarias ni se asignan folios SII.

Tarjeta es un medio independiente de efectivo y transferencia: aparece en POS, comprobantes, filtro/historial de ventas, dashboard, exportación CSV y cierres. Se registra el pago realizado en el terminal externo; no hay integración bancaria ni captura de números de tarjeta. Mixto mantiene su significado anterior: efectivo más transferencia. Los cierres antiguos sin monto de tarjeta muestran cero.

Pruebas adicionales: factura sin receptor no modifica ventas/stock; validación de RUT; instantánea del cliente; formato de factura y tarjeta en PDF; tarjeta no suma a efectivo/transferencia; filtro, dashboard y cierre de turno con tarjeta.
