"""Recorrido de la app React: login por rol, cada módulo, consola y capturas."""
import json, os
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:4173/')
OUT = os.path.join(os.path.dirname(__file__), '..', 'capturas')
report = {}
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    for user in ['luis', 'gonzalo', 'genesis']:
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}); page = ctx.new_page(); logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        page.goto(BASE); page.wait_for_selector('#lg_u', timeout=20000)
        page.fill('#lg_u', user); page.fill('#lg_p', '111111'); page.click('button[type=submit]'); page.wait_for_selector('aside .nav', timeout=10000)
        items = [i.strip() for i in page.locator('aside .nav').first.locator('a').all_inner_texts()]
        r = {'menu': items, 'views': {}}
        for idx, name in enumerate(items):
            page.locator('aside .nav').first.locator('a').nth(idx).click(); page.wait_for_timeout(400)
            h = page.locator('main h1').first.inner_text() if page.locator('main h1').count() else '(sin h1)'
            r['views'][name.replace('\n', ' ')] = h
            page.screenshot(path=f'{OUT}/react-{user}-{idx:02d}.png')
        r['console'] = logs; report[user] = r; ctx.close()
    b.close()
print(json.dumps(report, ensure_ascii=False, indent=1))
