"""Capturas de evidencia para hallazgos visuales de la Fase 1."""
import os
from playwright.sync_api import sync_playwright
BASE='http://localhost:8123/bodega-lo-valledor.html'; OUT=os.path.join(os.path.dirname(__file__),'..','capturas')
with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    c=b.new_context(viewport={'width':768,'height':1024},is_mobile=True,has_touch=True); pg=c.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
    pg.fill('#lg_u','luis'); pg.fill('#lg_p','111111'); pg.click('button[type=submit]'); pg.wait_for_timeout(400)
    pg.evaluate("go('bal')"); pg.wait_for_timeout(400)
    el=pg.evaluate("""(()=>{const W=document.documentElement.clientWidth;const e=[...document.querySelectorAll('main b.num')].find(e=>e.getBoundingClientRect().right>W+1);if(!e)return null;e.style.outline='3px solid red';e.scrollIntoView({block:'center'});const t=e.closest('table,.card');return {txt:e.textContent,ctx:(t&&t.className)||'',right:e.getBoundingClientRect().right,W}})()""")
    print('desborde',el); pg.wait_for_timeout(200); pg.screenshot(path=f'{OUT}/correccion-768-balance.png'); c.close()
    c=b.new_context(viewport={'width':1440,'height':900}); pg=c.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
    pg.fill('#lg_u','gonzalo'); pg.fill('#lg_p','111111'); pg.click('button[type=submit]'); pg.wait_for_timeout(400)
    pg.evaluate("go('rec')"); pg.wait_for_timeout(300); pg.get_by_role('button',name='Merma').first.click(); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/merma-actual.png'); c.close(); b.close()
