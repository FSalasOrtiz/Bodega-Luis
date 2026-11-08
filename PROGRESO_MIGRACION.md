# Progreso de la migración

Registro único del trabajo. Cada paso tiene un commit en la rama `migracion`. El original sigue intacto en `main`, con el tag `prototipo-auditado`.

| Fase | Estado | Fecha |
|---|---|---|
| 1. Skill y auditoría inicial | ✅ | 07-11-2026 |
| 1.5 Correcciones en el prototipo HTML | ✅ | 07-11-2026 |
| 2. React + TypeScript | ✅ | 08-11-2026 |
| 3. Firebase | ✅ (en emulador) | 08-11-2026 |
| 4. Auditoría final | ✅ (`AUDITORIA_FINAL.md`) | 08-11-2026 |
| 5. Publicación | ⏸ **Requiere tu autorización y tu cuenta de Firebase** (lista en `AUDITORIA_FINAL.md` §8) | — |

## Decisiones del cliente (07-11-2026)

| Tema | Decisión |
|---|---|
| Contraseñas | Todos los usuarios parten con **111111** y cada uno la cambia al implementar el sistema. Se quitaron las credenciales visibles del login |
| Foto de la guía | Se quitó a propósito, así que no se usa Firebase Storage |
| Créditos del vendedor | Se mantiene: el vendedor registra el pago y queda esperando la autorización de Luis |
| Motivo de merma | No se implementa |
| Organización y commits | A criterio del equipo, con registro en este archivo |

## Decisiones técnicas

- **Arquitectura:**
  - React 19 + TypeScript estricto + Vite, en `web/`.
  - La lógica del prototipo se portó casi literal a `src/domain`, y una prueba diferencial demuestra que calcula lo mismo.
- **Immer** (única dependencia nueva de estado): los comandos mutan un borrador, igual que el prototipo, y se obtienen exactamente los documentos que cambiaron para guardarlos en una transacción.
- **GSAP reemplazado** por Web Animations: es la misma animación, sin CDN.
- **Firestore:**
  - Copia local con sincronización incremental, por costo.
  - Una transacción por comando, con control de versión, saldo por lote y número de venta del servidor.
  - Sin conexión no se registra nada: preferimos no vender a vender stock que no existe.
- **Usuarios:** solo a través de la Cloud Function `saveUser`. El documento del usuario es la fuente del rol.
- **Reiniciar datos en Firebase:** conserva usuarios, catálogo y ajustes (lo que prometía el mensaje del prototipo). No se pueden cargar datos de ejemplo en producción.
- **Nombre de usuario:** se agregó una regla de formato (minúsculas, números, `.`, `-`, `_`), porque Firebase Auth lo usa como parte de un correo interno.

## Historial de commits

| Commit | Contenido |
|---|---|
| `afc28e1` | Base: cambios que estaban sin commitear (tag `prototipo-auditado`) |
| `9d0584b` | Fase 1: auditoría, skill y suite Playwright |
| `dd0b40e` | Fase 1.5: correcciones en el prototipo |
| `9d1a2a0` | Fase 2: dominio tipado, store y prueba diferencial |
| `fcd1198` | Fase 2: interfaz React de los 10 módulos |
| `e6cb4d3` | Fase 3: Firebase (Auth, Firestore, Functions, reglas, emuladores) |
| siguiente | Fase 4: regresión, corrección del modal, documentación y veredicto |

## Pruebas (última ejecución)

| Suite | Resultado |
|---|---|
| Prototipo `node tests/*.cjs` | 4/4 |
| `web`: `vitest` (diferencial vs. prototipo) | 5/5 |
| `web`: reglas de Firestore (emulador) | 20/20 |
| `audit/playwright/audit_suite_react.py` (regresión de Fase 1 sobre React) | 64/64 |
| `audit/playwright/firebase_smoke.py` (emulador) | 10/10 |
| XSS React | sin ejecución |
| `tsc` / ESLint (web y functions) | 0 errores |

## Cómo ejecutar

| Qué | Comando |
|---|---|
| Emuladores | `npm run emulators` (raíz) |
| Cargar datos de ejemplo | `npm --prefix web run reset:emulator` |
| App contra los emuladores | `npm --prefix web run dev:emulator` |
| Demo sin servidor | `npm --prefix web run build:demo && npx --prefix web vite preview --outDir dist-e2e` |
| Suites Playwright | `audit/README.md` |

## Pendientes

- La Fase 5 completa (pasos manuales en Firebase Console y despliegue), con tu autorización.
- Una prueba en teléfonos reales con Luis y un vendedor.
