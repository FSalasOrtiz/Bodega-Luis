# Representación de factura

La factura utiliza una hoja A4 independiente del ticket de boleta. Su estructura toma como referencia la muestra de factura de la página 16 del [manual oficial de muestras impresas del SII](https://www.sii.cl/factura_electronica/manual_muestras_impresas.pdf): emisor a la izquierda, recuadro tributario a la derecha, receptor, detalle por columnas, referencias, totales y espacio de timbre y acuse.

El SII permite variaciones de presentación: A4 es una elección de esta aplicación, no una plantilla única obligatoria. Consultar también la [Resolución 22 de 2016](https://www.sii.cl/normativa_legislacion/resoluciones/2016/reso22.pdf) y la [pregunta frecuente sobre representaciones impresas](https://www.sii.cl/preguntas_frecuentes/factura_electronica/001_003_0538.htm).

## Implementación

- Vista previa adaptable y PDF vectorial A4 con encabezados repetidos y paginación del detalle.
- Receptor: razón social, RUT, giro, dirección, comuna y teléfono.
- Emisor: datos configurados, teléfono y unidad SII opcionales en Usuarios y ajustes.
- Detalle: código cuando existe, descripción, cantidad, unidad, precio unitario neto referencial, descuento y valor neto.
- El neto guardado se distribuye por ítem con redondeo compensado, sin cambiar el total cobrado, inventario, caja ni registros históricos. Se mantiene la hipótesis actual de productos afectos a IVA; el futuro proveedor deberá validar la clasificación tributaria real.
- Descarga y compartir utilizan el PDF de factura; la boleta conserva su ticket. No se añadió botón de imprimir.

## Límite tributario

La representación sigue siendo de demostración y no cedible. No se inventan folios, TED, CAF, resoluciones ni una unidad SII. El recuadro muestra SIN FOLIO SII y el espacio del timbre informa que no está disponible. El acuse de demostración carece de efecto legal. Ningún servicio real fue conectado y no se emitieron DTE. Una integración futura deberá recuperar y mostrar la representación autorizada y los datos reales del proveedor, según su estado verificado.

## Verificación

Pasaron smoke.cjs, receipts.cjs y transactions.cjs. Se revisó visualmente el PDF rasterizado de una factura y la última página de una factura extensa de 21 páginas; dimensiones A4 verificadas con pdfinfo. Se comprobaron teléfonos, redondeo neto, escape de contenido, paginación, ausencia de cambios en el registro contable y persistencia de la copia original. No se ejecutó un navegador real en este entorno; falta comprobar la vista previa en dispositivos.
