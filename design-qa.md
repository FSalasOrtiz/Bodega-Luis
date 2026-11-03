# Design QA — Bodega Lo Valledor · marca LMA Agro Comercial (2026-11-01)

final result: pass with notes (P3 pendientes, sin P0/P1/P2 abiertos)

## Source visual truth

- Referencia: `LMA Agro Comercial Shield Logo.png` (2057×765, RGBA). No existe mock de pantallas: la referencia cubre **marca, logo y paleta**, no el layout.
- Paleta muestreada del logo: verde bosque `#01280b` (texto LMA), verde campo `#155602`, hoja `#5c9b03`/`#70ba02`, dorado `#e1a20a`/`#facd1e`, bronce `#a16403`, crema `#f7f4eb`.

## Implementation evidence

- Implementación: `bodega-lo-valledor.html`, servida en `http://127.0.0.1:8765/` y capturada con Chrome headless (CDP), `deviceScaleFactor: 1`.
- Capturas en `reports/qa-lma/`: login (oscuro), dashboard 1440/390 (Mixto y Oscuro), punto de venta 1440 (ambos), inventario 768 (Mixto).
- Logo cargado en todas las vistas (`naturalWidth` 640 completo / 148 escudo).

## Findings

- **[P2 · corregido] Inicial del avatar ilegible.** `.me span{color:var(--muted)}` pisaba `.avatar{color:#fff}`: “L” gris sobre verde. Evidencia: `reports/qa-lma/mint-1440-dash.png` (antes) → píxel claro tras el cambio. Fix: `.avatar,.me .avatar{…;color:#fff}`. Defecto previo al cambio de marca.
- **[P2 · corregido] Logo raster sustituido por SVG dibujado a mano.** La skill exige el asset real. Ahora `LOGO()` usa `assets/brand/lma-logo.png` (completo) y `assets/brand/lma-escudo.png` (escudo recortado del mismo PNG, sin redibujar).
- **[P2 · corregido] Logo invisible en tema oscuro.** El texto “LMA” es verde bosque sobre transparente. Se presenta sobre una placa crema (`--brand-plate`) en barra lateral, login y cabecera móvil.
- **[P3] “AGRO COMERCIAL” queda en ~7 px en la barra lateral (176 px de ancho).** Legible en login (240 px). Si se quiere más legibilidad: versión del logo sin la cinta/hoja izquierda o barra lateral más ancha.
- **[P3] Nombre de la empresa.** El logo dice “LMA Agro Comercial”, pero `<title>`, `S.cfg.nombre` y los comprobantes siguen “Bodega Lo Valledor”. No se cambió porque afecta datos tributarios; confirmar con el usuario.

## Required fidelity surfaces

| Superficie | Estado |
| --- | --- |
| Fuentes y tipografía | Sin cambios (Plus Jakarta Sans). El logo usa serif propia dentro del raster; no se imitó en la UI. |
| Espaciado y layout | Sin cambios de layout; placa de logo con 12–16 px de padding. Sin desbordes en 390/768/1440. |
| Colores y tokens | Tokens remapeados al verde bosque + dorado; contraste AA verificado (tabla abajo). |
| Imagen y assets | PNG original recortado/redimensionado con Lanczos; sin halos visibles; favicon del escudo. |
| Copy | Sin cambios; ver P3 sobre el nombre. |

Contraste (WCAG): texto `--ink` 16.3:1, `--muted` 6.1:1 (claro), botón primario blanco/`#14501f` 9.6:1 (oscuro: ver iteración 2), `--gold-ink` 6.8:1, `--warn` `#9a5200` sobre `--warn-bg` ≥ 5:1 (antes `#d98b00` ≈ 2.5:1, fallaba).

## Límites

- No se probó en teléfono real, ni con lector de pantalla, ni impresión de liquidación/cierre (usan el escudo).
- Las pruebas `tests/*.cjs` verifican lógica y HTML, no render.

## Iteración 2 — tema oscuro "Carbón cálido" (propuesta B, elegida por el usuario)

- Motivo: el oscuro anterior (verde casi negro + botón lima con texto oscuro) no se sentía como la misma app que el claro.
- Cambio: solo el bloque `:root[data-theme="dark"]` de tokens y el color de la barra del navegador (`#171614`). El tema claro no cambió.
- Superficies piedra `#171614 / #1f1e1b / #282723`, texto `#f2eee5`, botón primario verde bosque `#2f7a3c` con texto blanco (igual que el claro), montos `#93cf7f`, dorado `#e6bd55`.
- Contraste: texto 12,9:1, secundario 6,8:1, montos 8,2:1, dorado 8,4:1, botón blanco/verde 5,3:1.
- Evidencia: `reports/qa-lma/dark-1440-dash.png`, `dark-1440-pos.png`, `dark-390-dash.png`, `dark-1440-login.png` (recapturadas tras el cambio). Propuesta comparativa: https://claude.ai/artifact/7TSZgo1bA6aa6qPDRYe57q
- Detector Impeccable: avisa de fuente muy usada (Plus Jakarta Sans, se mantiene por ser la identidad actual) y de brillos/halos radiales de capas CSS antiguas del tema neón que ya quedan anuladas por la capa final; no visibles en las capturas.
