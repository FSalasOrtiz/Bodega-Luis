# Progreso de la migración

| Fase | Estado | Fecha |
|---|---|---|
| 1. Skill y auditoría inicial | ✅ Completada (a la espera de revisión) | 07-11-2026 |
| 2. React + TypeScript | ⏸ No iniciada: requiere decisiones (ver Pendientes) | — |
| 3. Firebase | ⏸ No iniciada | — |
| 4. Auditoría final | ⏸ No iniciada | — |
| 5. Publicación | ⏸ No iniciada: requiere autorización explícita | — |

## Fase 1. Registro

**Instalación**

- `npx skills add https://github.com/anthropics/skills --skill webapp-testing` dejó la skill en `.agents/skills/webapp-testing`, con un symlink en `.claude/skills/webapp-testing`. Se verificó que existen `SKILL.md` y `scripts/with_server.py`.
- Playwright (Python) y Chromium headless se instalaron en un entorno virtual fuera del repositorio.

**Análisis:** estructura, módulos, modelo de datos, roles, dependencias y persistencia. Todo está documentado en `AUDITORIA_INICIAL.md` §2.

**Pruebas ejecutadas**

| Suite | Resultado |
|---|---|
| `node tests/smoke.cjs` | 23 grupos OK |
| `node tests/receipts.cjs` | 4 OK |
| `node tests/transactions.cjs` | 12 OK |
| `node tests/reception-inventory.cjs` | 2 OK |
| `audit/playwright/audit_suite.py` | 63 casos: 54 ✅ y 9 ❌ |
| `audit/playwright/xss.py` | ✅ |
| Consola y red | 0 errores |

**Errores:** 3 críticos, 3 altos, 4 medios y 4 bajos. Ver `AUDITORIA_INICIAL.md` §4.

**Archivos creados:**

- `AUDITORIA_INICIAL.md`
- `PROGRESO_MIGRACION.md`
- `audit/` (scripts, resultados y capturas)
- `.agents/skills/webapp-testing/`
- `.claude/skills/webapp-testing`

**Archivos de la aplicación modificados:** ninguno.

## Pendientes antes de la Fase 2

1. **Respaldar la base.** Commitear o respaldar los cambios sin commitear actuales (5 archivos) y crear la rama de trabajo.
2. **Decidir P-01, P-02 y P-03** (`AUDITORIA_INICIAL.md` §4).
3. **Aprobar qué correcciones de la §5 se aplican durante la migración**, en especial las que cambian reglas de negocio.
4. **Definir el destino de la versión actual.**
   - Hoy está publicada en GitHub Pages con datos de demostración.
   - La versión de producción vivirá en Firebase Hosting.
