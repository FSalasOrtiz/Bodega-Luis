# Progreso de la migración

Registro único del trabajo. Cada paso tiene un commit en la rama `migracion`. El original queda intacto en `main` con el tag `prototipo-auditado`.

| Fase | Estado | Fecha |
|---|---|---|
| 1. Skill y auditoría inicial | ✅ Completada | 07-11-2026 |
| 1.5 Correcciones de la auditoría (HTML actual) | ✅ Completada | 07-11-2026 |
| 2. React + TypeScript | ⏳ Siguiente | — |
| 3. Firebase | ⏸ | — |
| 4. Auditoría final | ⏸ | — |
| 5. Publicación | ⏸ Requiere autorización explícita | — |

## Decisiones del cliente (07-11-2026)

| Tema | Decisión |
|---|---|
| Contraseñas | Todos los usuarios parten con **111111**. Cada uno la cambia al implementar el sistema. Se quitan las credenciales visibles del login |
| Foto de la guía (P-01) | Se quitó a propósito. Se mantiene solo la lectura de fotos de recepciones antiguas |
| Créditos del vendedor (P-02) | **Se mantiene.** Si llega un cliente a pagar y Luis no está, el vendedor registra el pago y espera la autorización |
| Motivo de merma (M-02) | **No se implementa.** Se eliminó el caso MER-03 de la suite |
| Resto de hallazgos | Se corrigen todos |
| Organización y commits | A criterio del equipo, con registro en este archivo |

## Historial

### Fase 1. Auditoría inicial

**Instalación:**

- Skill `webapp-testing` en `.agents/skills/webapp-testing`, con un symlink en `.claude/skills` y `skills-lock.json`.
- Playwright (Python) y Chromium en un entorno virtual fuera del repositorio.

**Resultado:** 63 casos E2E, con 54 aprobados y 9 fallidos. Las 4 suites de Node pasaron y hubo 0 errores de consola. Detalle en `AUDITORIA_INICIAL.md`.

**Commits:**

- `afc28e1`: base con los cambios que estaban sin commitear (tag `prototipo-auditado`).
- `9d0584b`: informe y suite.

### Fase 1.5. Correcciones en `bodega-lo-valledor.html`

| Hallazgo | Corrección |
|---|---|
| C-01 (parcial) | Claves iniciales 111111 para los 4 usuarios en los datos de demostración. Se quitó la línea "Prototipo · luis / …" del login. *Las claves siguen guardándose en el navegador: se resuelve en la Fase 3 con Firebase Auth* |
| C-02 (parcial) | Control de rol dentro de cada escritura de administrador: `voidRec`, `setPrice`, `saveProduct`, `adjustStock`/`doAdjust`, `saveLiq`, `saveUser`, `saveGasto`, `delFixed`, `updFixed`, `doDelVar`, `confirmDeleteClient` y editar productor. Crear un productor desde Recepción sigue permitido al vendedor. *La garantía real llega con las reglas de Firestore (Fase 3)* |
| A-01 | `save()` ya no traga el error: avisa "No se pudo guardar…", vuelve al último estado guardado y suprime el aviso de éxito que venía después |
| A-02 | No se puede cambiar el rol propio (selector deshabilitado y validación al guardar). Siempre debe quedar al menos un administrador activo |
| A-03 | Se rechaza una liquidación cuyo periodo se superpone con otra del mismo productor, y también un periodo invertido |
| M-01 | Si la anulación queda pendiente de verificación, el mensaje lo dice en vez de "Venta anulada." |
| M-03 | No se puede ajustar el stock de un producto sin lotes: el stock entra con una recepción. Se valida que el lote pertenezca al producto |
| M-04 | Las columnas `.g2.stack` se apilan bajo 1000 px. El Balance se ve bien en tablet |
| B-01 | Gamelas con decimales: se rechazan en el POS y en la recepción con un mensaje |
| B-02 | Precio en pesos enteros, mayor que 0 y con tope de $10.000.000, al cambiar el precio y al crear o editar un producto |
| B-03 | Ajuste: gamelas enteras y kg distinto de 0 |
| B-04 | Montos negativos con formato `-$1.403.595` |

**Pruebas:**

- `node tests/*.cjs`: 4 de 4 en verde. En `smoke.cjs` se actualizó la clave inicial de Samuel a 111111.
- `audit_suite.py`: **64 casos, con 61 aprobados y 3 fallidos.** Los 3 fallidos son inherentes a guardar en el navegador y se resuelven en la Fase 3:
  - AUTH-09: claves legibles en localStorage.
  - AUTH-10: el rol se puede alterar en la consola.
  - STO-04: no hay sincronización entre dispositivos.
- Casos nuevos: BAL-02 (formato de negativos) y USR-03 (último administrador).
- Casos endurecidos: POS-03, REC-03, INV-03, INV-04, INV-05, PRD-01 y AUTH-12.

**Nota:** los navegadores que ya tienen datos guardados (`bodegaLV.v6`) conservan sus claves anteriores. Las claves 111111 aplican al iniciar con datos nuevos o tras "Reiniciar datos".

## Pendientes

- Fase 2: estructura React + TypeScript y núcleo de dominio tipado.
- Fase 3: Firebase (Auth, Firestore, Hosting, reglas, emuladores).
