"""SEC-XSS (React): nombres con HTML no se ejecutan en ninguna vista ni ventana."""
import json
from playwright.sync_api import sync_playwright
PAY='<img src=x onerror="window.__xss=1">'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); pg.goto('http://localhost:4173/'); pg.wait_for_selector('#lg_u')
    pg.fill('#lg_u','luis'); pg.fill('#lg_p','111111'); pg.click('button[type=submit]'); pg.wait_for_selector('aside .nav')
    pg.evaluate("(pay)=>mutate(S=>{S.products[0].nombre='P'+pay;S.producers[0].nombre='R'+pay;S.clients[0].nombre='C'+pay;S.users[1].nombre='U'+pay;S.cfg.nombre='E'+pay})",PAY); pg.wait_for_timeout(300)
    hits={}
    for v in ['dash','pos','rec','inv','sales','caja','credits','prod','bal','users']:
        pg.evaluate(f"go('{v}')"); pg.wait_for_timeout(250); hits[v]=pg.evaluate("window.__xss||null")
    for n,e in [('comprobante',"receipt(S.sales.at(-1).id)"),('recepcion',"recDoc(S.receptions.at(-1).id)"),('ficha',"productSheet(S.products[0].id)")]:
        pg.evaluate("closeModal()"); pg.evaluate(e); pg.wait_for_timeout(300); hits[n]=pg.evaluate("window.__xss||null")
    print(json.dumps(hits)); b.close()
