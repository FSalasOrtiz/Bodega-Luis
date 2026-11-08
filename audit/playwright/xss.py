"""SEC-XSS: nombres con HTML no deben ejecutarse en ninguna vista ni ventana."""
import json
from playwright.sync_api import sync_playwright
BASE='http://localhost:8123/bodega-lo-valledor.html'
PAY='<img src=x onerror="window.__xss=(window.__xss||[]).concat(location.hash||1)">'
with sync_playwright() as p:
    b=p.chromium.launch(headless=True); c=b.new_context(viewport={'width':1440,'height':900}); pg=c.new_page()
    pg.goto(BASE); pg.wait_for_load_state('networkidle')
    pg.fill('#lg_u','luis'); pg.fill('#lg_p','111111'); pg.click('button[type=submit]'); pg.wait_for_timeout(300)
    pg.evaluate("""(pay)=>{S.products[0].nombre='P'+pay;S.producers[0].nombre='R'+pay;(S.clients[0]||{}).nombre='C'+pay;S.users[1].nombre='U'+pay;S.cfg.nombre='E'+pay;S.sales.at(-1).clienteNombre='C'+pay;save();render()}""",PAY)
    hits={}
    for v in ['dash','pos','rec','inv','sales','caja','credits','prod','bal','users']:
        pg.evaluate("window.__xss=undefined"); pg.evaluate(f"go('{v}')"); pg.wait_for_timeout(250)
        hits[v]=pg.evaluate("window.__xss||null")
    for name,expr in [('comprobante',"receipt(S.sales.at(-1).id)"),('recepcion',"recDoc(S.receptions.at(-1).id)"),('ficha_producto',"productSheet(S.products[0].id)"),('editar_producto',"editProduct(S.products[0].id)")]:
        pg.evaluate("window.__xss=undefined;closeModal()"); pg.wait_for_timeout(200)
        try: pg.evaluate(expr); pg.wait_for_timeout(300); hits[name]=pg.evaluate("window.__xss||null")
        except Exception as e: hits[name]='error: '+str(e)[:80]
    print(json.dumps(hits,ensure_ascii=False)); b.close()
