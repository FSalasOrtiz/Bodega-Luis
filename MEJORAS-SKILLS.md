# Revisión de la versión activa

Solo se modificó `bodega-lo-valledor.html` y se añadieron estas notas y `tests/smoke.cjs`. La copia `versiones/bodega-lo-valledor.antes-skills.html` conserva su SHA-256 original: `7e62cb159915312e7276d114862bce5726bfd80d994507493d9b6e45423d88fe`.

## Skills aplicadas en esta revisión

- **mobile-native**: buscador de ventas visible en móvil, áreas seguras, altura dinámica, controles táctiles, corrección de hover en pantallas táctiles, desplazamiento contenido de diálogos y color de la barra del navegador coherente con el tema.
- **emil-design-eng**: estados seleccionados explícitos, controles consistentes y contenido resistente a nombres largos.
- **impeccable (harden / polish)**: controles accesibles, etiquetas de formularios, regiones de tablas desplazables, salto al contenido, errores anunciados y protección de foco.

No se añadieron librerías de React, Expo ni plugins de GSAP: no corresponden al HTML actual. Se conserva la animación de GSAP de la revisión anterior.

## Problemas corregidos

| Antes | Ahora | Motivo |
| --- | --- | --- |
| El buscador se ocultaba en móvil | Visible en el punto de venta | Permite encontrar productos desde el teléfono |
| Filas de formularios rígidas | Se redistribuyen y permiten saltos de línea | Evita campos comprimidos en pantallas pequeñas |
| Elementos clicables sin teclado | Controles personalizados accesibles con Enter y Espacio | Acceso sin ratón |
| Todos los filtros anunciaban estado falso | Selección comunicada con aria-pressed | La selección se entiende sin depender del color |
| Identificadores automáticos repetidos en página y diálogo | Identificadores únicos y etiquetas asociadas | Los lectores de pantalla identifican el campo correcto |
| Diálogo forzaba teclado móvil y dejaba mover el fondo | Foco inicial en diálogo y bloqueo del fondo | Mantiene el contexto y evita abrir el teclado al consultar información |
| Se perdía el origen del foco al reemplazar diálogos | Se conserva el control de origen | Retorno al cerrar |
| Fecha de gasto no persistía al cambiar categoría | Fecha almacenada en el borrador | Evita volver a introducirla |
| Se podía invocar confirmación con carrito vacío o efectivo negativo | Validación antes de registrar la venta | Evita registros vacíos y pagos incoherentes |
| Barra del navegador conservaba colores antiguos | Color alineado con el tema | Continuidad visual móvil |

## Verificación

Ejecutar `node tests/smoke.cjs`. Prueba lógica y HTML generado con almacenamiento aislado; no usa ni modifica los datos del navegador. Incluye 15 combinaciones de pantalla/rol, tres temas, ausencia de GSAP, persistencia del borrador de gasto, protecciones de venta, nombres largos con caracteres HTML, búsqueda vacía y tema desconocido.

La sintaxis JavaScript también fue comprobada con `node --check`. El entorno bloquea Chrome: no se verificaron visualmente las pantallas, el árbol de accesibilidad, Tab/Escape ni gestos. Requieren revisión en navegador; áreas seguras, teclado, hover táctil y desplazamiento deben probarse además en un teléfono real.

## Segunda revisión: búsqueda y movimiento

Skills: `animation-performance` y `review-animations` para identificar los problemas; correcciones en la versión activa según la autorización del usuario.

| Antes | Después | Motivo |
| --- | --- | --- |
| GSAP apuntaba a `.bars .bar i`, elementos ausentes | Apunta a `.sales-meter-fill`, los indicadores existentes | La animación se ejecuta sobre el gráfico real |
| Entrada de 450 ms más stagger | 250 ms más 5 ms entre siete indicadores | Respuesta breve; solo transformaciones |
| Movimiento al usar teclado | Diálogos instantáneos e indicadores sin entrada animada desde teclado | Reduce interrupciones en tareas frecuentes |
| Precio actualizado parpadeaba y tenía temporizadores | Etiqueta estática hasta salir de la pantalla | Evita repintados repetidos y comunica el cambio sin movimiento |
| Buscar “limon” no encontraba “Limón” | Búsqueda y resaltado ignoran tildes y mayúsculas | Admite escritura rápida y acentos compuestos/descompuestos |
| Búsqueda sin resultados sin recuperación | Botón para mostrar todos y devolver foco al buscador | Recuperación directa |
| Etiqueta envolvía campo y botón de limpiar | Contenedor con campo etiquetado por separado | Semántica correcta del control compuesto |

Verificación adicional: búsqueda y resaltado con tildes, restablecimiento de filtros, HTML de indicadores, ejecución de animación una sola vez y supresión desde teclado. La prueba de animación usa un doble de GSAP; no mide FPS ni sustituye una revisión visual. La descripción textual de fechas y montos sigue visible; los medidores duplicados son decorativos para lectores de pantalla.

## Acceso por red local

Iniciar desde esta carpeta con `python3 -m http.server 8000 --bind 0.0.0.0`. Si ya hay un servidor en el puerto 8000, detenerlo primero con Ctrl+C en su terminal. Consultar `hostname -I` en el equipo y abrir `http://IP-DEL-EQUIPO:8000/bodega-lo-valledor.html` desde otro dispositivo de la misma red.

Este prototipo guarda datos en localStorage: otro navegador/dispositivo tendrá sus propios datos. Compartir la URL no sincroniza ventas o inventario.
