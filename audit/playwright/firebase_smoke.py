"""E2E en modo Firebase contra Emulator Suite (proyecto demo-bodega, solo datos de ejemplo)."""
import json, os, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:4174/')
res = []
def rec(cid, ok, det): res.append({'id': cid, 'estado': 'APROBADA' if ok else 'FALLIDA', 'detalle': det}); print(('OK  ' if ok else 'FAIL'), cid, det, flush=True)
def login(page, u, pw='111111'):
    page.goto(BASE); page.wait_for_selector('#lg_u', timeout=30000)
    page.fill('#lg_u', u); page.fill('#lg_p', pw); page.click('button[type=submit]')
def wait_app(page): page.wait_for_selector('aside .nav', timeout=60000)
def T(page, expr): return page.evaluate(f'(() => {{ const t = window.__test; return {expr}; }})()')
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    errs = []
    # FB-01 login incorrecto
    c = b.new_context(); pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    login(pg, 'luis', '999999'); pg.wait_for_function("document.querySelector('#perr')?.textContent.length>0", timeout=20000)
    rec('FB-01', 'incorrectos' in pg.inner_text('#perr'), pg.inner_text('#perr'))
    # FB-02 login admin, datos cargados
    login(pg, 'luis'); wait_app(pg); pg.wait_for_timeout(500)
    n = T(pg, 't.S.sales.length'); rec('FB-02', n > 900 and T(pg, 't.view') == 'dash', f'ventas cargadas {n}')
    # FB-03 claves no presentes en los datos del navegador
    rec('FB-03', T(pg, "t.S.users.every(u => !('clave' in u))"), 'usuarios sin campo clave')
    c.close()
    # FB-04 vendedor vende; número correlativo del servidor; persistencia tras recargar
    c = b.new_context(); pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    login(pg, 'gonzalo'); wait_app(pg); pg.wait_for_timeout(500)
    pid = T(pg, "t.S.products.find(p=>p.sku==='TOM-C9').id"); s0 = T(pg, f"t.prodStock('{pid}')"); nbefore = T(pg, 't.S.sales.length')
    pg.locator('main button', has_text='TOM-C9').first.click(); pg.wait_for_selector('#it_q'); pg.fill('#it_q', '2'); pg.click('#it_ok')
    pg.get_by_role('button', name='Revisar venta').click(); pg.check('#checkout-paid'); pg.click('#checkout-submit')
    pg.wait_for_selector('.receipt-paper', timeout=20000)
    sale = T(pg, 't.S.sales.reduce((a,s)=>s.num>a.num?s:a)'); s1 = T(pg, f"t.prodStock('{pid}')")
    rec('FB-04', sale['vendedor'] == 'u2' and sale['num'] == 1000 + nbefore + 1 and s1 == s0 - 2, f"N° {sale['num']} (esperado {1000 + nbefore + 1}) stock {s0}->{s1}")
    pg.reload(); wait_app(pg)
    try: pg.wait_for_function(f"window.__test.S.sales.some(s=>s.id==='{sale['id']}')", timeout=10000)
    except Exception: pass
    has = T(pg, f"t.S.sales.some(s=>s.id==='{sale['id']}')"); s2 = T(pg, f"t.prodStock('{pid}')")
    rec('FB-05', has and abs(s2 - s1) < 1e-9, f'venta presente={has}, stock tras recargar {s2} (antes {s1})')
    # FB-06 sincronización: Luis en otro dispositivo ve la venta en tiempo real
    c2 = b.new_context(); p2 = c2.new_page(); login(p2, 'luis'); wait_app(p2); p2.wait_for_timeout(500)
    pg.locator('main button', has_text='TOM-C8').first.click(); pg.wait_for_selector('#it_q'); pg.fill('#it_q', '1'); pg.click('#it_ok')
    pg.get_by_role('button', name='Revisar venta').click(); pg.check('#checkout-paid'); pg.click('#checkout-submit'); pg.wait_for_selector('.receipt-paper', timeout=20000)
    sid = T(pg, 't.S.sales.reduce((a,s)=>s.num>a.num?s:a).id')
    p2.wait_for_function(f"window.__test.S.sales.some(s=>s.id==='{sid}')", timeout=15000)
    rec('FB-06', True, 'Luis recibió la venta de Gonzalo sin recargar')
    # FB-07 sobreventa concurrente: dos vendedores intentan vender todo el stock de un producto
    c3 = b.new_context(); p3 = c3.new_page(); login(p3, 'samuel'); wait_app(p3); p3.wait_for_timeout(500)
    pid2 = T(pg, "t.S.products.find(p=>p.sku==='TOM-PER').id"); left = int(T(pg, f"t.srcStock('{pid2}','consig')"))
    for page in (pg, p3):
        page.evaluate("window.__test.closeModal()")
        page.locator('main button', has_text='TOM-PER').first.click(); page.wait_for_selector('#it_q'); page.fill('#it_q', str(left)); page.click('#it_ok')
        page.get_by_role('button', name='Revisar venta').click(); page.check('#checkout-paid')
    pg.click('#checkout-submit'); p3.click('#checkout-submit'); pg.wait_for_timeout(4000)
    ok1 = pg.locator('.receipt-paper').count() > 0; ok2 = p3.locator('.receipt-paper').count() > 0
    toast = (p3.locator('.toast').inner_text() if p3.locator('.toast').count() else '') or (pg.locator('.toast').inner_text() if pg.locator('.toast').count() else '')
    final = T(p2, f"t.srcStock('{pid2}','consig')")
    rec('FB-07', (ok1 != ok2) and final >= 0, f'una sola venta aceptada (A={ok1}, B={ok2}); stock final {final}; aviso: {toast}')
    # FB-08 desactivar usuario (función) corta su acceso
    p2.evaluate("window.__test.go('users')"); p2.wait_for_timeout(300)
    p2.locator('tr', has_text='Samuel').get_by_role('button', name='Editar').click(); p2.uncheck('#u_a'); p2.locator('.ov button.pri').click()
    p2.wait_for_timeout(4000)
    inactive = T(p2, "t.S.users.find(u=>u.id==='u3').activo") is False
    c4 = b.new_context(); p4 = c4.new_page(); login(p4, 'samuel'); p4.wait_for_timeout(5000)
    blocked = p4.locator('aside .nav').count() == 0
    rec('FB-08', inactive and blocked, f'samuel inactivo={inactive}, login bloqueado={blocked}: {p4.inner_text("#perr") if p4.locator("#perr").count() else ""}')
    # FB-09 crear usuario por Cloud Function y entrar con él
    p2.get_by_role('button', name='Nuevo usuario').click(); p2.fill('#u_n', 'Prueba QA'); p2.fill('#u_u', 'qa1'); p2.fill('#u_p', '654321'); p2.locator('.ov button.pri').click()
    p2.wait_for_timeout(4000)
    c5 = b.new_context(); p5 = c5.new_page(); login(p5, 'qa1', '654321')
    try: wait_app(p5); okq = True
    except Exception: okq = False
    rec('FB-09', okq, 'usuario creado por la función entra con su clave')
    rec('FB-10', not errs, f'errores JS: {errs[:3]}')
    b.close()
json.dump(res, open(os.path.join(os.path.dirname(__file__), '..', 'resultados-firebase.json'), 'w'), ensure_ascii=False, indent=1)
sys.exit(0 if all(r['estado'] == 'APROBADA' for r in res) else 1)
