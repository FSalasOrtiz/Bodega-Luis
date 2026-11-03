# Bodega Lo Valledor

Trabajar sobre `bodega-lo-valledor.html`. No modificar `versiones/` ni `bodega-lo-valledor.solido.html` salvo instrucción expresa del usuario.

## Skills instaladas en el proyecto

Los directorios de descubrimiento `.agents` y `.codex` están montados en solo lectura en este entorno. Estas copias locales conservan sus instrucciones de origen y se cargan explícitamente desde este archivo:

- **Design QA**: `skills/product-design/skills/design-qa/SKILL.md`. Comparación de referencia visual e implementación renderizada. Si falta evidencia, documentar el bloqueo; no afirmar que pasó QA visual.
- **Frontend UI Engineering**: `skills/addyosmani/skills/frontend-ui-engineering/SKILL.md`. Revisiones e implementación de UI accesible y adaptable; seguir el HTML/CSS/JS existente.
- **Audit Design Tokens**: `skills/audit-design-tokens/SKILL.md`. Auditoría de tokens por tema y plan de consolidación. No modificar automáticamente los tokens como resultado de una auditoría.

Leer la skill correspondiente antes de usarla. La instalación es local a este proyecto; no equivale a habilitar el plugin Product Design completo ni una instalación global.

## Verificación

Ejecutar `node tests/smoke.cjs` después de cambiar comportamiento de la interfaz. Esta prueba verifica lógica y HTML generado, sin simular un navegador. Para cambios en comprobantes/PDF, ejecutar también `node tests/receipts.cjs`. Para cambios de ventas/reversiones/conciliación ejecutar `node tests/transactions.cjs`.

No presentar pruebas estáticas como evidencia de render, accesibilidad completa, contraste compuesto ni funcionamiento real en móvil.

Para recepción, imágenes, merma, familias e historial ejecutar también `node tests/reception-inventory.cjs`. El almacenamiento IndexedDB se simula en estas pruebas; comprobar la persistencia real de adjuntos en navegador.
