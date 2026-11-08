"""Reconocimiento: login por rol, recorre cada módulo del menú, captura consola y pantallas."""
import json, os, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:8123/bodega-lo-valledor.html')
OUT = os.path.join(os.path.dirname(__file__), '..', 'capturas')
ROLES = {'luis': '123456', 'gonzalo': '111111', 'genesis': '333333'}
report = {}
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    for user, pw in ROLES.items():
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        logs, fails = [], []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        page.on('requestfailed', lambda r: fails.append(f'{r.url} {r.failure}'))
        page.goto(BASE); page.wait_for_load_state('networkidle')
        page.fill('#lg_u', user); page.fill('#lg_p', pw); page.click('button[type=submit]')
        page.wait_for_timeout(600)
        items = page.locator('aside .nav').first.locator('a').all_inner_texts()
        r = {'menu': [i.strip() for i in items], 'views': {}}
        for idx, name in enumerate(r['menu']):
            page.locator('aside .nav').first.locator('a').nth(idx).click(); page.wait_for_timeout(500)
            h = page.locator('main h1').first.inner_text() if page.locator('main h1').count() else ''
            btns = [t.strip() for t in page.locator('main button:visible').all_inner_texts()][:40]
            r['views'][name] = {'h1': h, 'buttons': btns, 'inputs': page.locator('main input:visible, main select:visible').count()}
            page.screenshot(path=f'{OUT}/recon-{user}-{idx:02d}.png', full_page=False)
        r['console'] = logs; r['failed'] = fails
        report[user] = r
        ctx.close()
    b.close()
print(json.dumps(report, ensure_ascii=False, indent=1))
