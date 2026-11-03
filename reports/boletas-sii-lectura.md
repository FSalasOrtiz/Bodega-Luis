# Lectura del formato de boletas electrónicas SII

Fecha de revisión: 2026-10-28.

## Documento entregado

`formato_boletas_elec_202306.pdf`: 18 páginas, versión 4.00, portada de 2023-06-01. Se leyeron introducción, obligatoriedad, encabezado, detalle, subtotales, descuentos/recargos, referencias, georreferenciación y timbre. Algunos pies de página muestran 2023-03-01; se conserva la fecha de portada como identificación del archivo.

## Qué establece el PDF entregado

| Área | Contenido relevante | Páginas |
| --- | --- | --- |
| Conservación y envío | XML; conservación de seis años; consulta de documentos recientes; límite de 500 boletas por envío | 6 |
| Zonas | Encabezado, detalle condicional, subtotales, descuentos/recargos, referencias, georreferenciación, timbre y firma | 7 |
| Identificación | TipoDTE 39 para boleta electrónica y 41 para no afecta/exenta; folio autorizado, fecha de emisión e indicador de servicio | 8 |
| Emisor/receptor | RUT, identificación y datos condicionales de sucursal y receptor | 9–10 |
| Proveedor de software | RutProvSW; el texto indica informar el RUT del emisor para desarrollo propio | 10 |
| Montos | MntNeto, MntExe, IVA, MntTotal; distinción entre total, no facturable y valor a pagar | 10–11 |
| Detalle de productos | Hasta 1000 líneas; nombre, cantidad, unidad, precio, descuentos/recargos e importe | 12–14 |
| Precios | Precios e importes de detalle brutos por defecto; IndMntNeto=2 declara detalle neto en boleta afecta | 8 y 14 |
| Subtotales / descuentos globales | Hasta 20 líneas por sección; subtotales informativos no alteran los totales | 14–16 |
| Referencias | Hasta 40 referencias, con datos opcionales de vendedor y caja | 17 |
| Timbre | TED basado en datos representativos y CAF del SII; información del código PDF417 | 18 |

Las tablas diferencian campo obligatorio, condicional, opcional y obligatoriedad en representación digital/impresa. No se debe marcar toda la tabla como obligatoria ni construir el XML solo por el orden visual de las filas: debe validarse contra el schema aplicable.

## Actualización localizada en el SII

El SII publica una versión posterior, **4.2 de 2025-09-08**, de 19 páginas. Su bitácora incorpora cambios de 2024–2025: MedioPago, CorreoRecep, TelefonoRecep, condiciones de identificación del receptor y longitudes de nombres. La versión 2023 sirve como antecedente, pero la implementación debe contrastarse con esa versión posterior, los esquemas XML y las instrucciones operativas vigentes.

Fuente: [Formato publicado por el SII, versión 4.2](https://www.sii.cl/factura_electronica/factura_mercado/formato_boleta_electronica.pdf). Versión entregada: [PDF 2023 del SII](https://www.sii.cl/factura_electronica/factura_mercado/formato_boletas_elec_202306.pdf).

No se adopta automáticamente como obligación vigente toda frase operativa de la introducción (por ejemplo, reportes diarios): este documento describe principalmente el formato y debe contrastarse con las resoluciones/instrucciones aplicables antes de implementar esas obligaciones.

## Correspondencia con el proyecto actual

Observado directamente en `bodega-lo-valledor.html`:

- `makeSale()` guarda ventas y genera una numeración interna basada en la longitud del historial. Ese número no es un folio autorizado por el SII.
- `receipt()` y `saleText()` identifican el resultado como **Comprobante interno**.
- El modelo ya contiene vendedor, productos, cantidades, precios, total y medios de pago internos.
- No se encontró implementación de XML tributario, CAF, TED, firma ni envío/consulta de recepción ante el SII.

Por tanto, el comprobante actual no implementa una boleta electrónica tributaria. Como orientación técnica, el futuro módulo debería separar la venta de su documento tributario: instantánea de emisor/receptor y detalle, totales tributarios, folio autorizado, XML validado y firmado, envío y estado de recepción. El formato leído no basta por sí solo para resolver autorización del emisor, certificación, credenciales, servicios de envío, reintentos o contingencias.

Esta lectura no modifica la aplicación, no emite documentos y no cambia las copias originales.
