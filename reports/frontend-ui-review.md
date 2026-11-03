# Frontend UI Engineering — revisión de la versión activa

## Resultado

Revisión de código y comportamiento aislado completada. No equivale a una validación visual, de lector de pantalla ni de funcionamiento real en teléfono. Se mantuvo la arquitectura HTML/CSS/JavaScript, los temas Oscuro/Mixto, los datos y las copias protegidas.

Fuente de trabajo: `skills/addyosmani/skills/frontend-ui-engineering/SKILL.md` y su checklist de accesibilidad. Contrato de interfaz: operar ventas/recepciones/inventario con acciones visibles, conservar filtros y borradores al editar, usar teclado y táctil, mantener los dos temas y los estados vacíos/error/selección existentes. No se adopta un framework nuevo ni se reemplaza la identidad verde del producto.

## Correcciones aplicadas

| Antes | Después | Evidencia |
| --- | --- | --- |
| Una celda con `onclick="event.stopPropagation()"` recibía rol de botón y entraba en Tab sin tener acción | Se excluyen límites de propagación de la mejora de controles | `bodega-lo-valledor.html:833`, prueba de celda sin acción |
| Una fila clicable recibía `role="button"`, reemplazando su semántica de fila | Se mantiene la semántica de tabla y la activación por teclado | `bodega-lo-valledor.html:834`, prueba de fila |
| Espacio activaba acciones al presionar y Enter repetido podía reactivarlas | Espacio activa al soltar; Enter ignora repetición; eventos de hijos no disparan la fila | `bodega-lo-valledor.html:837`, pruebas de keydown/keyup/repeat y control anidado |
| Cada exportación CSV conservaba su object URL | El enlace se retira y la URL se libera después de iniciar la descarga | `bodega-lo-valledor.html:1552`, prueba de creación/clic/limpieza |

## Hallazgos abiertos, priorizados

### [P1] Fallos de persistencia silenciados

- Ubicación: `bodega-lo-valledor.html:566`, `save()`.
- Evidencia: el `catch` está vacío; la llamada no devuelve un resultado que los formularios puedan distinguir de un guardado correcto.
- Impacto: al agotarse localStorage o bloquearse el almacenamiento, la UI puede mostrar éxito aunque el cambio solo esté en memoria.
- Recomendación: exponer el fallo de guardado y conservar el formulario. Requiere revisar conjuntamente los flujos de escritura para evitar éxitos engañosos; no se cambió transaccionalidad en esta revisión de UI.

### [P2] Carga de datos sin validación de estructura

- Ubicación: `bodega-lo-valledor.html:567`, `load()`.
- Evidencia: cualquier JSON parseable se asigna a `S` sin validar que existan `users`, `products`, etc.
- Impacto: datos locales incompatibles pueden romper el arranque posterior.
- Recomendación: validar versión y estructura, ofrecer recuperación sin borrar datos automáticamente.

### [P2] Jerarquía de encabezados incompleta

- Ubicación: `bodega-lo-valledor.html:775` (login) y `bodega-lo-valledor.html:65` / `:339` (`.card h3`).
- Evidencia: login no tiene h1; las pantallas principales saltan de h1 a h3 en las tarjetas.
- Impacto: navegación por encabezados menos clara para lectores de pantalla.
- Recomendación: un título principal en login y encabezados de sección h2, conservando la apariencia con clases de componente. Comprobar documentos de impresión y diálogos por separado.

### [P2] Reemplazo completo del DOM al buscar

- Ubicación: `render()` y los manejadores `oninput` de búsqueda.
- Evidencia: se sustituye `root.innerHTML` en cada pulsación y se reconstruyen controles; se restaura el foco manualmente.
- Impacto: riesgo de latencia y pérdida de contexto con catálogos/historiales grandes. No se midieron FPS ni latencias.
- Recomendación: perfilar primero y actualizar solo la región de resultados. No agregar debounce o virtualización sin medición.

## State coverage

| Estado | Evidencia disponible |
| --- | --- |
| Login y pantallas por rol | 15 combinaciones generan HTML sin excepción en prueba aislada |
| Vacío de búsqueda | Mensaje y recuperación comprobados en HTML generado |
| Error de validación | Protecciones de venta vacía / efectivo mixto negativo probadas |
| Selección de tema | Solo Oscuro/Mixto; Claro heredado pasa a Mixto |
| Borrador de gasto | Fecha y monto conservados al cambiar categoría/tipo en prueba de función |
| Datos largos / caracteres HTML | Escape y generación de nombres largos probados |
| Sin GSAP | Generación de pantallas funciona sin la biblioteca |
| Cargando | No hay API de datos asíncrona; no se añade skeleton ficticio |
| Foco, hover y táctil reales | No verificados en navegador; dobles de DOM verifican solo manejadores |
| Render 320/768/1024/1440, contraste compuesto, axe y lector de pantalla | Pendientes por falta de navegador |

## Verificación

`node tests/smoke.cjs` pasó. El código inline pasó `node --check`. Las pruebas usan almacenamiento aislado y no tocan datos del usuario. La auditoría de tokens se reproduce con `python3 scripts/audit_design_tokens.py` y no modifica la interfaz. La copia original conserva su hash inicial.
