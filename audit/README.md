# Auditoría E2E (Playwright + skill webapp-testing)

Requisitos: Python 3 con `playwright` y Chromium. Por ejemplo, en un entorno virtual:

```bash
python3 -m venv .venv-audit && .venv-audit/bin/pip install playwright && .venv-audit/bin/python -m playwright install chromium
```

Suite completa (cada caso usa un navegador limpio y solo datos de demostración):

```bash
.venv-audit/bin/python .agents/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 8123 --bind 127.0.0.1" --port 8123 -- \
  .venv-audit/bin/python audit/playwright/audit_suite.py            # todos
#  ... audit/playwright/audit_suite.py POS- HIS-01                 # solo prefijos
```

Otros scripts: `recon.py` (recorrido por rol), `xss.py` (XSS almacenado) y `evidencias.py` (capturas de hallazgos).

Salidas: `resultados-fase1.json`, `consola-fase1.json` y `capturas/`.

## Fase 4 (app React)

```bash
npm --prefix web run build:demo
python .agents/skills/webapp-testing/scripts/with_server.py --server "cd web && npx vite preview --outDir dist-e2e --port 4173 --strictPort" --port 4173 -- python audit/playwright/audit_suite_react.py
# modo Firebase (con `npm run emulators` corriendo):
npm --prefix web run build:emulator && npm --prefix web run reset:emulator
python .agents/skills/webapp-testing/scripts/with_server.py --server "cd web && npx vite preview --outDir dist-emulator --port 4174 --strictPort" --port 4174 -- python audit/playwright/firebase_smoke.py
```
Resultados: `resultados-fase4.json`, `resultados-firebase.json`.
