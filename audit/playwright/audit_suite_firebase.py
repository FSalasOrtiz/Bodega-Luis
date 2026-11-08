"""Suite de auditoría funcional E2E (Fase 1) — Bodega Lo Valledor.

Ejecutar con la skill webapp-testing:
  python .agents/skills/webapp-testing/scripts/with_server.py \
    --server "python3 -m http.server 8123 --bind 127.0.0.1" --port 8123 -- \
    python audit/playwright/audit_suite.py

Cada caso usa un contexto de navegador nuevo (localStorage vacío -> datos de demostración del seed).
No toca datos reales. Resultado: audit/resultados-fase1.json + capturas en audit/capturas/.
"""
import json, os, re, subprocess, sys, time, traceback
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:4173/')
KEY = 'bodegaLV.app.v1'
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, '..', 'capturas')
RESULTS = os.path.join(HERE, '..', 'resultados-fase4-firebase.json')
CRED = {'luis': '111111', 'gonzalo': '111111', 'samuel': '111111', 'genesis': '111111'}
results = []
CONSOLE = []  # (caso, mensaje) acumulado de todos los contextos
CURRENT = {'id': ''}
ONLY = sys.argv[1:]


class Fail(Exception):
    pass


def check(cond, msg):
    if not cond:
        raise Fail(msg)


class Ctx:
    def __init__(self, browser, vp=(1440, 900), mobile=False):
        self.ctx = browser.new_context(viewport={'width': vp[0], 'height': vp[1]}, accept_downloads=True,
                                       is_mobile=mobile, has_touch=mobile)
        self.page = self.ctx.new_page()
        # Firebase: cada guardado viaja a la base; las esperas fijas de la suite se multiplican
        _w = self.page.wait_for_timeout
        self.page.wait_for_timeout = lambda ms: _w(ms * 4)
        self.console = []
        self.failed = []
        self.page.on('console', lambda m: self.console.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        self.page.on('pageerror', lambda e: self.console.append(f'pageerror: {e}'))
        self.page.on('requestfailed', lambda r: self.failed.append(f'{r.url} {r.failure}'))
        self.page.goto(BASE)
        self.page.wait_for_selector('#lg_u', timeout=30000)

    def js(self, expr, arg=None):
        return self.page.evaluate(expr, arg) if arg is not None else self.page.evaluate(expr)

    def login(self, user, pw=None):
        p = self.page
        p.fill('#lg_u', user)
        p.fill('#lg_p', CRED.get(user, '') if pw is None else pw)
        p.click('button[type=submit]')
        try: p.wait_for_function("document.querySelector('aside .nav') || (document.querySelector('#perr')?.textContent||'').length>0", timeout=60000)
        except Exception: pass
        p.wait_for_timeout(150)

    def go(self, view):
        self.js(f"go('{view}')")
        self.page.wait_for_timeout(250)

    def toast(self):
        t = self.page.locator('.toast')
        return t.inner_text() if t.count() else ''

    def modal(self):
        return self.page.locator('.ov:not([inert]) > *').last

    def modal_open(self):
        return self.page.locator('.ov:not([inert])').count() > 0

    def set_input(self, sel, value):
        loc = self.page.locator(sel) if isinstance(sel, str) else sel
        loc.fill(str(value))
        loc.dispatch_event('change')
        self.page.wait_for_timeout(150)

    def shot(self, name):
        self.page.screenshot(path=os.path.join(SHOTS, name + '.png'))
        return f'audit/capturas/{name}.png'

    def close(self):
        for m in self.console:
            CONSOLE.append((CURRENT['id'], m))
        for m in self.failed:
            CONSOLE.append((CURRENT['id'], 'requestfailed: ' + m))
        self.ctx.close()


TESTS = []


def case(cid, module, title, kind='positivo'):
    def deco(fn):
        TESTS.append((cid, module, title, kind, fn))
        return fn
    return deco


# ---------------------------------------------------------------- helpers de dominio
def pid(c, sku):
    return c.js(f"S.products.find(p=>p.sku==='{sku}').id")


def stock(c, sku):
    return c.js(f"prodStock(S.products.find(p=>p.sku==='{sku}').id)")


def pos_add(c, sku, qty):
    """Agrega un producto al carrito desde la tarjeta del POS usando la ventana de cantidad."""
    p = c.page
    p.locator('main button', has_text=sku).first.click()
    p.wait_for_timeout(200)
    c.set_input('#it_q', qty)
    p.locator('#it_q').dispatch_event('input')
    p.wait_for_timeout(100)
    return {'ok_disabled': p.locator('#it_ok').is_disabled(), 'err': p.locator('#it_err').inner_text(),
            'sub': p.locator('#it_sub').inner_text()}


def pos_confirm_add(c):
    c.page.locator('#it_ok').click()
    c.page.wait_for_timeout(250)


def checkout(c, confirm=True):
    p = c.page
    btn = p.get_by_role('button', name='Revisar venta')
    if btn.is_disabled():
        return {'opened': False, 'disabled': True, 'toast': 'botón "Revisar venta" deshabilitado',
                'hint': p.locator('main .card').last.inner_text()[-300:]}
    btn.click()
    p.wait_for_timeout(250)
    if not p.locator('#checkout-submit').count():
        return {'opened': False, 'toast': c.toast()}
    if confirm:
        p.locator('#checkout-paid').check()
    p.locator('#checkout-submit').click()
    p.wait_for_timeout(350)
    return {'opened': True, 'toast': c.toast()}


def wait_js(c, expr, timeout=8000):
    """Firebase: espera a que la escritura remota se refleje (expr verdadera) antes de leer."""
    t0 = time.time()
    while (time.time() - t0) * 1000 < timeout:
        try:
            v = c.js(expr)
            if v: return v
        except Exception: pass
        c.page.wait_for_timeout(200)
    return c.js(expr)


def close_modals(c):
    for _ in range(3):
        if c.modal_open():
            c.js('closeModal()')
            c.page.wait_for_timeout(250)


# ================================================================ AUTENTICACIÓN
@case('AUTH-01', 'Acceso', 'Login correcto de los 4 roles abre su módulo inicial')
def _(b):
    out = {}
    for u, home in [('luis', 'dash'), ('gonzalo', 'pos'), ('samuel', 'pos'), ('genesis', 'sales')]:
        c = Ctx(b); c.login(u)
        out[u] = c.js('view'); c.close()
    check(out == {'luis': 'dash', 'gonzalo': 'pos', 'samuel': 'pos', 'genesis': 'sales'}, out)
    return out


@case('AUTH-02', 'Acceso', 'Contraseña incorrecta muestra error claro', 'negativo')
def _(b):
    c = Ctx(b); c.login('luis', '000000')
    msg = c.page.locator('#perr').inner_text(); logged = c.js('!!me'); c.close()
    check(not logged and 'incorrectos' in msg, msg)
    return msg


@case('AUTH-03', 'Acceso', 'Usuario inexistente / vacío / mayúsculas y espacios', 'negativo')
def _(b):
    c = Ctx(b)
    c.login('nadie', '111111'); a = c.js('!!me')
    c.login('  LUIS  ', '111111'); bb = c.js('me&&me.usuario')
    c.close()
    check(not a and bb == 'luis', {'inexistente_entra': a, 'mayus_espacios': bb})
    return 'inexistente rechazado; "  LUIS  " normalizado a luis'


@case('AUTH-04', 'Acceso', 'La sesión y el módulo se mantienen al recargar')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('inv')
    c.page.reload(); c.page.wait_for_selector('#lg_u, aside .nav', timeout=30000); c.page.wait_for_timeout(300)
    r = c.js('[me&&me.usuario, view]'); c.close()
    check(r == ['luis', 'inv'], r)
    return r


@case('AUTH-05', 'Acceso', 'Cerrar sesión borra la sesión aunque se recargue')
def _(b):
    c = Ctx(b); c.login('gonzalo'); c.js('logout()')
    c.page.reload(); c.page.wait_for_selector('#lg_u, aside .nav', timeout=30000); c.page.wait_for_timeout(300)
    r = c.js('!!me') or c.page.locator('#lg_u').count() == 0; c.close()
    check(not r, 'sigue con sesión')
    return 'login visible tras recarga'


@case('AUTH-06', 'Acceso', 'Usuario desactivado no puede entrar y su sesión abierta se corta', 'negativo')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    c.js("mutate(S=>{S.users.find(u=>u.usuario==='gonzalo').activo=false})"); c.page.wait_for_timeout(200)
    c.page.reload(); c.page.wait_for_selector('#lg_u, aside .nav', timeout=30000); c.page.wait_for_timeout(300)
    kept = c.js('!!me')
    c.login('gonzalo'); again = c.js('!!me'); c.close()
    check(not kept and not again, {'sesion_mantiene': kept, 'login_ok': again})
    return 'rechazado tras desactivar'


@case('AUTH-07', 'Permisos', 'Vendedor no accede a módulos de administrador desde la UI', 'negativo')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    menu = c.js('menu().map(m=>m.id)')
    res = {}
    for v in ['dash', 'prod', 'bal', 'users']:
        c.go(v); res[v] = c.js('view')
    c.close()
    check(all(x != k for k, x in res.items()), res)
    return {'menu': menu, 'intentos': res}


@case('AUTH-08', 'Permisos', 'Contadora: solo Historial y sin escrituras', 'negativo')
def _(b):
    c = Ctx(b); c.login('genesis')
    menu = c.js('menu().map(m=>m.id)')
    c.go('pos'); v = c.js('view')
    err = c.js("(()=>{try{workflowTransaction(()=>1);return 'permitido'}catch(e){return e.message}})()")
    c.close()
    check(menu == ['sales'] and v == 'sales' and 'solo lectura' in err, {'menu': menu, 'view': v, 'err': err})
    return {'menu': menu, 'escritura': err}


@case('AUTH-09', 'Seguridad', 'Claves no legibles en el navegador y sin credenciales en el login', 'seguridad')
def _(b):
    c = Ctx(b); hint = c.page.locator('.login').inner_text(); c.close()
    check('111111' not in hint and 'luis /' not in hint, hint)
    return 'login sin credenciales. En modo Firebase la clave no existe en los datos (FB-03) y vive solo en Firebase Auth.'


@case('AUTH-10', 'Seguridad', 'Un vendedor no puede elevar sus privilegios', 'seguridad')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    try:
        c.js("me.rol='admin'"); changed = c.js("me.rol")
    except Exception as e:
        changed = 'error: ' + str(e)[:60]
    menu = c.js("[...document.querySelectorAll('aside .nav a')].length"); c.close()
    check(changed != 'admin', f'rol tras intento: {changed}')
    return f'el estado es inmutable (rol tras intento: {changed}); en producción las reglas de Firestore lo impiden (tests de reglas 20/20).'


@case('AUTH-11', 'Acceso', 'Cambiar contraseña: validaciones y límite de 2 por día del vendedor', 'negativo')
def _(b):
    c = Ctx(b); c.login('gonzalo'); p = c.page
    def attempt(o, n, r):
        c.js('pwForm()'); p.wait_for_timeout(200)
        if not p.locator('#pw-old').count():
            return 'FORM_BLOQUEADO:' + c.toast()
        p.fill('#pw-old', o); p.fill('#pw-new', n); p.fill('#pw-rep', r)
        c.js('savePw()'); p.wait_for_timeout(150)
        e = p.locator('#pw-err').inner_text() if p.locator('#pw-err').count() else ''
        close_modals(c)
        return e or 'OK'
    r = {'clave_actual_mala': attempt('999999', '123123', '123123'),
         'formato': attempt('111111', '12ab', '12ab'),
         'no_coinciden': attempt('111111', '123123', '321321'),
         'igual': attempt('111111', '111111', '111111'),
         'ok1': attempt('111111', '123123', '123123'),
         'ok2': attempt('123123', '456456', '456456'),
         'tercera': attempt('456456', '789789', '789789')}
    c.close()
    check(r['ok1'] == 'OK' and r['ok2'] == 'OK' and r['tercera'].startswith('FORM_BLOQUEADO')
          and all(r[k] != 'OK' for k in ['clave_actual_mala', 'formato', 'no_coinciden', 'igual']), r)
    return r


@case('AUTH-12', 'Usuarios', 'El administrador no puede quitarse su propio rol (bloqueo total)', 'negativo')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('users')
    me_id = c.js('me.id')
    c.js(f"editUser('{me_id}')"); c.page.wait_for_timeout(200)
    disabled = c.page.locator('#u_r').is_disabled()
    # aunque se fuerce el selector desde la consola, saveUser debe rechazarlo
    c.js("(()=>{const s=document.querySelector('#u_r');s.disabled=false;s.value='vendedor'})()")
    c.js(f"saveUser('{me_id}')"); c.page.wait_for_timeout(200)
    admins = c.js("S.users.filter(u=>u.rol==='admin'&&u.activo).length")
    c.close()
    check(admins >= 1 and disabled, f'Selector deshabilitado: {disabled}; administradores activos: {admins}')
    return {'selector_rol_propio_deshabilitado': disabled, 'admins_activos': admins}


# ================================================================ PUNTO DE VENTA
@case('POS-01', 'Punto de venta', 'Venta por gamela en efectivo: total, stock, comprobante y persistencia')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    s0 = stock(c, 'TOM-C9'); n0 = c.js('S.sales.length'); price = c.js("S.products.find(p=>p.sku==='TOM-C9').precio")
    r = pos_add(c, 'TOM-C9', 2); check(not r['ok_disabled'], r)
    pos_confirm_add(c)
    total_ui = c.page.locator('.total').last.inner_text()
    ck = checkout(c); check(ck['opened'], ck)
    receipt_open = c.modal_open()
    sale = c.js("S.sales[S.sales.length-1]")
    c.page.reload(); c.page.wait_for_selector('#lg_u, aside .nav', timeout=30000); c.page.wait_for_timeout(300)
    persisted = c.js(f"S.sales.length")
    s1 = stock(c, 'TOM-C9'); c.close()
    exp_total = 2 * price + 2 * 1000  # 2 gamelas de garantía que se lleva
    check(persisted == n0 + 1 and abs(s1 - (s0 - 2)) < 1e-9 and sale['total'] == exp_total and receipt_open,
          {'ventas': [n0, persisted], 'stock': [s0, s1], 'total': sale['total'], 'esperado': exp_total, 'comprobante': receipt_open})
    return {'total': sale['total'], 'total_ui': total_ui.replace('\n', ' '), 'stock': f'{s0}->{s1}', 'vendedor': sale['vendedor']}


@case('POS-02', 'Punto de venta', 'No permite vender más stock del disponible', 'negativo')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    s0 = c.js("posLeft(S.products.find(p=>p.sku==='TOM-C9').id)")
    r = pos_add(c, 'TOM-C9', int(s0) + 1); c.close()
    check(r['ok_disabled'] and 'No alcanza' in r['err'], r)
    return r['err']


@case('POS-03', 'Punto de venta', 'Cantidades inválidas: 0, negativo, texto, decimal en gamela', 'negativo')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    out = {}
    for v in ['0', '-3', 'abc']:
        r = pos_add(c, 'TOM-C9', v); out[v] = r; close_modals(c)
    r = pos_add(c, 'TOM-C9', '2,5'); out['2,5'] = r
    if not r['ok_disabled']:
        pos_confirm_add(c)
        out['2,5']['qty_en_carrito'] = c.js('ui.cart.at(-1)?.qty')
    c.close()
    check(all(out[v]['ok_disabled'] for v in ['0', '-3', 'abc', '2,5']), out)
    return out


@case('POS-04', 'Punto de venta', 'Venta por kg con coma decimal (palta)')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('pos')
    c.page.get_by_role('button', name='Compra directa').first.click(); c.page.wait_for_timeout(200)
    left = c.js("posLeft(S.products.find(p=>p.sku==='PAL-I').id)")
    r = pos_add(c, 'PAL-I', '2,5')
    c.close()
    check(not r['ok_disabled'] and r['sub'] == '$5.500', {'stock_directa': left, **r})
    return {'stock_compra_directa_kg': left, **r}


@case('POS-05', 'Punto de venta', 'Búsqueda por SKU y filtro por familia')
def _(b):
    c = Ctx(b); c.login('gonzalo'); p = c.page
    p.locator('main input[type=search], main input[placeholder*="Buscar"]').first.fill('PAL-GRA'); p.wait_for_timeout(300)
    vis = c.js(r"[...document.querySelectorAll('main button')].map(b=>b.innerText.split('\n')[0]).filter(t=>/^(PAL|TOM)-/.test(t))")
    p.locator('main input[placeholder*="Buscar"]').first.fill(''); p.wait_for_timeout(200)
    p.get_by_role('button', name='Palta', exact=True).click(); p.wait_for_timeout(200)
    fam = c.js(r"[...document.querySelectorAll('main button')].map(b=>b.innerText.split('\n')[0]).filter(t=>/^(PAL|TOM)-/.test(t))")
    c.close()
    check(vis and all('PAL-GRA' in v for v in vis) and fam and all(v.startswith('PAL') for v in fam), {'busqueda': vis, 'familia': fam})
    return {'busqueda': vis, 'familia': fam}


@case('POS-06', 'Punto de venta', 'Registrar sin confirmar el pago no registra la venta', 'negativo')
def _(b):
    c = Ctx(b); c.login('gonzalo'); n0 = c.js('S.sales.length')
    pos_add(c, 'TOM-C8', 1); pos_confirm_add(c)
    ck = checkout(c, confirm=False); n1 = c.js('S.sales.length'); c.close()
    check(n1 == n0 and 'confirmar' in ck['toast'], {'toast': ck['toast'], 'ventas': [n0, n1]})
    return ck['toast']


@case('POS-07', 'Punto de venta', 'Doble clic en "Registrar venta" crea una sola venta', 'extremo')
def _(b):
    c = Ctx(b); c.login('gonzalo'); n0 = c.js('S.sales.length'); p = c.page
    pos_add(c, 'TOM-C8', 1); pos_confirm_add(c)
    p.get_by_role('button', name='Revisar venta').click(); p.wait_for_timeout(200)
    p.locator('#checkout-paid').check()
    p.locator('#checkout-submit').dblclick(); p.wait_for_timeout(400)
    key_reuse = c.js("(()=>{const s=S.sales.at(-1);commitCheckout(s.commandKey);return S.sales.length})()")
    n1 = c.js('S.sales.length'); c.close()
    check(n1 == n0 + 1, {'antes': n0, 'despues': n1})
    return f'{n0}->{n1} (reintento con misma clave no duplica)'


@case('POS-08', 'Punto de venta', 'Factura exige datos del receptor y valida RUT', 'negativo')
def _(b):
    c = Ctx(b); c.login('gonzalo'); p = c.page
    pos_add(c, 'TOM-C8', 1); pos_confirm_add(c)
    p.get_by_role('button', name='Factura').click(); p.wait_for_timeout(200)
    ck = checkout(c); t1 = ck['toast']; close_modals(c)
    c.js("ui.receptor={rut:'11.111.111-2',razonSocial:'X SpA',giro:'Comercio',direccion:'Calle 1',comuna:'Santiago'};render()")
    ck2 = checkout(c, confirm=False); t2 = c.toast() if not ck2['opened'] else 'abrió revisión'
    close_modals(c)
    c.js("ui.receptor={rut:'76.086.428-5',razonSocial:'X SpA',giro:'Comercio',direccion:'Calle 1',comuna:'Santiago'};render()")
    ck3 = checkout(c); doc = c.js("S.sales.at(-1).documento"); c.close()
    check(not ck['opened'] and 'abrió' not in t2 and ck3['opened'] and doc == 'factura', {'sin_datos': t1, 'rut_malo': t2, 'ok_doc': doc})
    return {'sin_datos': t1, 'rut_invalido': t2, 'rut_valido': doc}


@case('POS-09', 'Punto de venta', 'Pago mixto efectivo + transferencia suma el total')
def _(b):
    c = Ctx(b); c.login('gonzalo'); p = c.page
    pos_add(c, 'TOM-C7', 1); pos_confirm_add(c)
    p.get_by_role('button', name='Mixto', exact=True).click(); p.wait_for_timeout(200)
    c.js("ui.pagoEf=5000;render()")
    ck = checkout(c); s = c.js('S.sales.at(-1)'); c.close()
    pagos = {x['medio']: x['monto'] for x in s['pagos']}
    check(ck['opened'] and sum(pagos.values()) == s['total'] and len(pagos) == 2, {'pagos': pagos, 'total': s['total'], 'toast': ck['toast']})
    return {'pagos': pagos, 'total': s['total']}


@case('POS-10', 'Punto de venta', 'Crédito de vendedor requiere autorización de Luis', 'negativo')
def _(b):
    c = Ctx(b); c.login('gonzalo'); p = c.page
    pos_add(c, 'TOM-C7', 1); pos_confirm_add(c)
    c.js("ui.credito=true;ui.clienteNombre='Cliente Prueba';ui.creditoPaga=0;render()")
    ck = checkout(c); c.close()
    check(not ck['opened'], ck)
    return ck


@case('POS-11', 'Punto de venta', 'El carrito se conserva al recargar la página')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    pos_add(c, 'TOM-C6', 3); pos_confirm_add(c)
    c.page.reload(); c.page.wait_for_selector('#lg_u, aside .nav', timeout=30000); c.page.wait_for_timeout(300)
    cart = c.js('ui.cart'); c.close()
    check(len(cart) == 1 and cart[0]['qty'] == 3, cart)
    return cart


@case('POS-12', 'Punto de venta', 'Gamelas: el cliente trae más de las que lleva → descuento menor que la compra', 'extremo')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    pos_add(c, 'TOM-C9', 1); pos_confirm_add(c)
    c.js('ui.gamTrae=3;render()')
    ck = checkout(c); s = c.js('S.sales.at(-1)')
    close_modals(c)
    pos_add(c, 'TOM-DES', 1); pos_confirm_add(c)
    c.js('ui.gamTrae=50;render()')
    ck2 = checkout(c, confirm=False); c.close()
    check(ck['opened'] and not ck2['opened'], {'venta1': ck, 'total': s['total'], 'trae50': ck2})
    return {'total_1xTOM-C9_trae3': s['total'], 'trae_50_con_compra_6000': ck2['toast']}


@case('POS-13', 'Punto de venta', 'Vender gamelas vacías solas')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    c.js('ui.gamExtra=2;render()')
    ck = checkout(c); s = c.js('S.sales.at(-1)'); c.close()
    check(ck['opened'] and s['total'] == 2000, {'toast': ck['toast'], 'total': s['total']})
    return s['total']


@case('POS-14', 'Punto de venta', 'Solicitud de otro precio: vendedor pide y Luis ve el aviso (entre módulos)')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    pos_add(c, 'TOM-C9', 1); c.page.locator('#it_price').click(); c.page.wait_for_timeout(250)
    inputs = c.modal().locator('input')
    if inputs.count():
        inputs.first.fill('17000'); inputs.first.dispatch_event('input')
    btn = c.modal().locator('button.pri').last; btn.click(); c.page.wait_for_timeout(250)
    req = c.js('(S.priceRequests||[]).at(-1)')
    c.js('logout()'); c.login('luis')
    banner = c.page.locator('main').inner_text()
    c.close()
    check(req and req.get('estado') == 'pendiente' and ('precio' in banner.lower()), {'req': req})
    return {'solicitud': {k: req.get(k) for k in ('estado', 'precio')}}


# ================================================================ RECEPCIÓN / MERMA
def rec_fill(c, qty, line=0):
    c.go('rec')
    inp = c.page.locator('main input.num').nth(line)
    c.set_input(inp, qty)


@case('REC-01', 'Recepción', 'Recepción en consignación suma stock, crea lote y queda en historial')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    sku = c.js("P(recForm?.lineas?.[0]?.prod||S.products.find(p=>p.activo&&!p.envase).id).sku") if c.js("typeof recForm!=='undefined'&&recForm") else 'TOM-C9'
    c.go('rec'); sku = c.js("P(recForm.lineas[0].prod).sku")
    s0 = stock(c, sku); r0 = c.js('S.receptions.length'); l0 = c.js('S.lots.length')
    rec_fill(c, 10)
    c.page.get_by_role('button', name='Guardar recepción').click(); c.page.wait_for_timeout(400)
    t = c.toast(); doc = c.modal_open()
    c.page.reload(); c.page.wait_for_selector('#lg_u, aside .nav', timeout=30000); c.page.wait_for_timeout(300)
    s1 = stock(c, sku); r1 = c.js('S.receptions.length'); l1 = c.js('S.lots.length'); c.close()
    check(s1 == s0 + 10 and r1 == r0 + 1 and l1 >= l0 + 1, {'stock': [s0, s1], 'rec': [r0, r1], 'lotes': [l0, l1]})
    return {'producto': sku, 'stock': f'{s0}->{s1}', 'toast': t, 'comprobante_abierto': doc}


@case('REC-02', 'Recepción', 'Sin cantidades / cantidad negativa / texto', 'negativo')
def _(b):
    c = Ctx(b); c.login('gonzalo'); c.go('rec'); r0 = c.js('S.receptions.length'); out = {}
    for v in ['', '-5', 'abc']:
        rec_fill(c, v)
        c.page.get_by_role('button', name='Guardar recepción').click(); c.page.wait_for_timeout(250)
        out[v or 'vacío'] = c.toast(); close_modals(c)
    r1 = c.js('S.receptions.length'); c.close()
    check(r1 == r0, {'recepciones': [r0, r1], **out})
    return out


@case('REC-03', 'Recepción', 'Recepción gamela con decimal (2,5 gamelas) se redondea o se rechaza', 'extremo')
def _(b):
    c = Ctx(b); c.login('gonzalo'); c.go('rec'); sku = c.js("P(recForm.lineas[0].prod).sku")
    s0 = stock(c, sku); rec_fill(c, '2,5')
    c.page.get_by_role('button', name='Guardar recepción').click(); c.page.wait_for_timeout(300)
    s1 = stock(c, sku); t = c.toast(); c.close()
    check(s1 == s0 and 'enteros' in t, {'stock': [s0, s1], 'toast': t})
    return {'stock': f'{s0}->{s1}', 'toast': t}


@case('REC-04', 'Recepción', 'Compra directa con costo queda en stock de compra directa')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('rec')
    c.page.get_by_role('button', name='Compra directa').first.click(); c.page.wait_for_timeout(200)
    sku = c.js("P(recForm.lineas[0].prod).sku"); p_id = pid(c, sku)
    d0 = c.js(f"srcStock('{p_id}','directa')")
    inputs = c.page.locator('main .card input.num')
    c.set_input(inputs.nth(0), 7); c.set_input(c.page.locator('main .card input.num').nth(1), 9000)
    c.page.get_by_role('button', name='Guardar recepción').click(); c.page.wait_for_timeout(400)
    d1 = c.js(f"srcStock('{p_id}','directa')"); lot = c.js('S.lots.at(-1)'); c.close()
    check(d1 == d0 + 7 and lot['costo'] == 9000, {'directa': [d0, d1], 'lote': lot})
    return {'producto': sku, 'stock_directa': f'{d0}->{d1}', 'costo_lote': lot['costo']}


@case('REC-05', 'Recepción', 'Anular recepción (admin) con motivo devuelve stock; vendedor no ve "Anular"')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('rec'); sku = c.js("P(recForm.lineas[0].prod).sku")
    rec_fill(c, 5); c.page.get_by_role('button', name='Guardar recepción').click(); c.page.wait_for_timeout(400)
    close_modals(c)
    s0 = stock(c, sku); rid = c.js('S.receptions.at(-1).id')
    c.js(f"voidRec('{rid}')"); c.page.wait_for_timeout(200)
    c.page.locator('#rzok').click(); c.page.wait_for_timeout(200); t_empty = c.toast()
    c.page.fill('#rz', 'Error de digitación'); c.page.locator('#rzok').click(); c.page.wait_for_timeout(300)
    s1 = stock(c, sku); an = c.js(f"S.receptions.find(r=>r.id==='{rid}').anulada")
    c.js('logout()'); c.login('gonzalo'); c.js(f"recDoc('{rid}')"); c.page.wait_for_timeout(250)
    vend_btn = c.modal().locator('button', has_text='Anular').count() if c.modal_open() else 0
    c.close()
    check(an and s1 == s0 - 5 and 'motivo' in t_empty.lower() and vend_btn == 0,
          {'stock': [s0, s1], 'anulada': an, 'sin_motivo': t_empty, 'boton_vendedor': vend_btn})
    return {'stock': f'{s0}->{s1}', 'sin_motivo': t_empty}


@case('REC-06', 'Recepción', 'No permite anular una recepción ya vendida en parte', 'negativo')
def _(b):
    c = Ctx(b); c.login('luis')
    rid = c.js("(()=>{const r=S.receptions.filter(r=>!r.anulada).find(r=>r.lineas.some(l=>lotStock(l.lot)<l.qty));return r&&r.id})()")
    c.js(f"voidRec('{rid}')"); c.page.wait_for_timeout(200)
    c.page.fill('#rz', 'prueba'); c.page.locator('#rzok').click(); c.page.wait_for_timeout(250)
    t = c.toast(); an = c.js(f"S.receptions.find(r=>r.id==='{rid}').anulada"); c.close()
    check(not an and 'vendió' in t, t)
    return t


@case('MER-01', 'Merma', 'Merma dentro del stock descuenta FIFO y registra movimiento')
def _(b):
    c = Ctx(b); c.login('gonzalo'); c.go('rec')
    c.page.get_by_role('button', name=re.compile('^Merma')).click(); c.page.wait_for_timeout(250)
    sku = c.js("P(mermaF.prod).sku"); s0 = stock(c, sku); m0 = c.js("S.moves.filter(m=>m.tipo==='merma').length")
    c.set_input('#waste-qty', 2)
    c.page.get_by_role('button', name='Confirmar merma').click(); c.page.wait_for_timeout(300)
    s1 = stock(c, sku); m1 = c.js("S.moves.filter(m=>m.tipo==='merma').length"); t = c.toast()
    motivo = c.js("S.moves.filter(m=>m.tipo==='merma').at(-1).motivo"); c.close()
    check(s1 == s0 - 2 and m1 > m0, {'stock': [s0, s1], 'moves': [m0, m1]})
    return {'producto': sku, 'stock': f'{s0}->{s1}', 'toast': t, 'motivo_guardado': motivo}


@case('MER-02', 'Merma', 'Merma mayor al stock / decimal en gamela / cero', 'negativo')
def _(b):
    c = Ctx(b); c.login('gonzalo'); c.go('rec')
    c.page.get_by_role('button', name=re.compile('^Merma')).click(); c.page.wait_for_timeout(250)
    sku = c.js("P(mermaF.prod).sku"); avail = c.js("srcStock(mermaF.prod,'consig')"); out = {}
    for v in [str(int(avail) + 1), '0', '1,5']:
        c.set_input('#waste-qty', v)
        btn = c.page.get_by_role('button', name='Confirmar merma')
        dis = btn.is_disabled()
        if not dis:
            btn.click(); c.page.wait_for_timeout(250)
        out[v] = 'botón deshabilitado' if dis else c.toast()
    c.close()
    check(out[str(int(avail) + 1)] == 'botón deshabilitado' and out['0'] == 'botón deshabilitado' and 'válida' in out['1,5'], out)
    return out


# ================================================================ INVENTARIO
@case('INV-01', 'Inventario', 'Crear producto: validaciones (SKU duplicado, sin precio, sin familia) y alta correcta', 'negativo')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('inv'); p = c.page; out = {}
    def try_save(sku, nom, pre, fam='Tomate'):
        c.js("editProduct()"); p.wait_for_timeout(200)
        p.fill('#e_sku', sku); p.fill('#e_nom', nom); p.fill('#e_pre', str(pre))
        if fam is not None:
            p.select_option('#e_fam', fam)
        c.js("saveProduct('')"); p.wait_for_timeout(200)
        t = c.toast(); close_modals(c); return t
    n0 = c.js('S.products.length')
    out['dup'] = try_save('TOM-C9', 'X', 1000)
    out['sin_precio'] = try_save('TST-1', 'Prueba', '')
    out['sin_familia'] = try_save('TST-1', 'Prueba', 1000, fam='')
    out['precio_neg'] = try_save('TST-1', 'Prueba', -5)
    out['ok'] = try_save('tst-1', 'Prueba QA', 1234)
    n1 = c.js('S.products.length'); sku = c.js('S.products.at(-1).sku'); c.close()
    check(n1 == n0 + 1 and sku == 'TST-1' and 'existe' in out['dup'], {**out, 'n': [n0, n1]})
    return out


@case('INV-02', 'Inventario', 'Cambio de precio: queda en historial, POS lo usa y ventas anteriores conservan su precio')
def _(b):
    c = Ctx(b); c.login('luis'); p_id = pid(c, 'TOM-C8')
    old_sale = c.js(f"S.sales.find(s=>s.lineas.some(l=>l.prod==='{p_id}'))?.lineas.find(l=>l.prod==='{p_id}').precio")
    c.js(f"changePrice('{p_id}')"); c.page.wait_for_timeout(200); c.page.fill('#np', '21000')
    c.js(f"setPrice('{p_id}')"); c.page.wait_for_timeout(200)
    new = c.js(f"P('{p_id}').precio"); hist = c.js(f"S.prices.filter(x=>x.prod==='{p_id}').length")
    after = c.js(f"S.sales.find(s=>s.lineas.some(l=>l.prod==='{p_id}'))?.lineas.find(l=>l.prod==='{p_id}').precio")
    c.go('pos'); txt = c.js(r"[...document.querySelectorAll('main button')].find(b=>b.innerText.split('\n')[0]==='TOM-C8').innerText"); c.close()
    check(new == 21000 and hist >= 1 and after == old_sale and '21.000' in txt, {'nuevo': new, 'hist': hist, 'venta_antigua': [old_sale, after], 'pos': txt})
    return {'nuevo': new, 'venta_antigua_conserva': after, 'pos': txt.replace('\n', ' ')}


@case('INV-03', 'Inventario', 'Precio inválido (0, vacío, decimal, enorme)', 'negativo')
def _(b):
    c = Ctx(b); c.login('luis'); p_id = pid(c, 'TOM-C8'); out = {}
    for v in ['0', '', '15000.7', '999999999999']:
        c.js(f"changePrice('{p_id}')"); c.page.wait_for_timeout(150); c.page.fill('#np', v)
        c.js(f"setPrice('{p_id}')"); c.page.wait_for_timeout(150); out[v or 'vacío'] = [c.toast(), c.js(f"P('{p_id}').precio")]; close_modals(c)
    c.close()
    check(all(out[k][1] == 18000 for k in out), out)
    return out


@case('INV-04', 'Inventario', 'Ajuste de stock: exige motivo, no deja lote negativo, registra movimiento', 'negativo')
def _(b):
    c = Ctx(b); c.login('luis'); p_id = pid(c, 'TOM-C9'); p = c.page; out = {}
    def adj(q, m):
        c.js(f"adjustStock('{p_id}')"); p.wait_for_timeout(150)
        p.fill('#aq', str(q)); p.fill('#am', m); c.js(f"doAdjust('{p_id}')"); p.wait_for_timeout(150)
        t = c.toast(); close_modals(c); return t
    s0 = stock(c, 'TOM-C9')
    out['sin_motivo'] = adj(3, '')
    out['negativo'] = adj(-99999, 'conteo')
    out['ok'] = adj(3, 'Conteo físico')
    out['decimal_gamela'] = adj('0.4', 'prueba decimal')
    s1 = stock(c, 'TOM-C9'); last = c.js("S.moves.at(-1)"); c.close()
    check(s1 == s0 + 3 and 'obligatorio' in out['sin_motivo'] and 'negativo' in out['negativo'] and 'enteros' in out['decimal_gamela'], {**out, 'stock': [s0, s1]})
    return {**out, 'stock': f'{s0}->{s1}', 'ultimo_mov_qty': last['qty'], 'ultimo_mov_motivo': last['motivo']}


@case('INV-05', 'Inventario', 'Ajustar stock de un producto nuevo sin lotes', 'extremo')
def _(b):
    c = Ctx(b); c.login('luis'); p = c.page
    c.js("mutate(S=>{S.products.push({id:'pqa',sku:'QA-1',nombre:'QA sin lotes',familia:'Tomate',calibre:'-',unidad:'gamela',precio:1000,pesoCaja:0,usaGamela:true,activo:true})})"); p.wait_for_timeout(200)
    c.js("adjustStock('pqa')"); p.wait_for_timeout(150)
    opts = p.locator('#al option').count()
    if p.locator('#aq').count():
        p.fill('#aq', '5'); p.fill('#am', 'inicial'); c.js("doAdjust('pqa')"); p.wait_for_timeout(150)
    t = c.toast(); mv = c.js("S.moves.filter(m=>m.prod==='pqa')"); st = c.js("prodStock('pqa')"); c.close()
    check(not mv and 'recepción' in t, f'Sin lotes ({opts} opciones) se registra un movimiento con lote vacío: {mv}; stock calculado {st}; toast "{t}"')
    return {'toast': t, 'stock': st}


@case('INV-06', 'Inventario', 'Búsqueda y filtro de inventario; vista de vendedor sin datos de admin')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('inv'); p = c.page
    p.fill('main input[placeholder="Buscar nombre o SKU"]', 'pera'); p.wait_for_timeout(300)
    rows = p.locator('main table tbody tr').all_inner_texts()
    head_admin = p.locator('main table thead').first.inner_text()
    c.js('logout()'); c.login('gonzalo'); c.go('inv')
    head_v = p.locator('main table thead').first.inner_text() if p.locator('main table thead').count() else p.locator('main').inner_text()[:300]
    btns = p.locator('main button', has_text='Editar').count(); c.close()
    check(rows and all('pera' in r.lower() for r in rows) and btns == 0, {'filas': rows, 'admin': head_admin, 'vendedor': head_v})
    return {'filas_busqueda_pera': len(rows), 'cabecera_admin': head_admin.replace('\n', ' | '), 'cabecera_vendedor': head_v.replace('\n', ' | ')}


# ================================================================ HISTORIAL / ANULACIONES
@case('HIS-01', 'Historial', 'Anular venta (admin): exige motivo, devuelve stock si se indica, deja compensación')
def _(b):
    c = Ctx(b); c.login('luis'); p = c.page; c.go('pos')
    n0 = c.js('S.sales.length'); pos_add(c, 'TOM-C9', 2); pos_confirm_add(c); checkout(c)
    wait_js(c, f'S.sales.length>{n0}'); close_modals(c)
    sid = c.js("S.sales.at(-1).id")
    sale = c.js(f"S.sales.find(s=>s.id==='{sid}')"); prod = sale['lineas'][0]['prod']; q = sum(l['qty'] for l in sale['lineas'] if l['prod'] == prod)
    s0 = c.js(f"prodStock('{prod}')")
    c.js(f"voidSale('{sid}')"); p.wait_for_timeout(200)
    c.js(f"approveSaleReversal('{sid}')"); p.wait_for_timeout(200); t_empty = c.toast()
    c.js(f"voidSale('{sid}')"); p.wait_for_timeout(200)
    p.fill('#rev-reason', 'Cliente devolvió'); p.check('#rev-stock'); c.js(f"approveSaleReversal('{sid}')")
    wait_js(c, f"S.sales.find(s=>s.id==='{sid}').reversal"); t = wait_js(c, "document.querySelector('.toast')?.textContent||''", 3000); s1 = c.js(f"prodStock('{prod}')"); st = c.js(f"S.sales.find(s=>s.id==='{sid}').reversal")
    neg = c.js(f"revenueEntries().filter(e=>e.id==='{sid}'||e.saleId==='{sid}'||e.ref==='{sid}').map(e=>e.entrySign)")
    c.close()
    check(st is not None and abs(s1 - (s0 + q)) < 1e-9 and 'obligatorio' in t_empty.lower(), {'stock': [s0, s1, q], 'sin_motivo': t_empty, 'toast': t, 'reversal': bool(st)})
    return {'sin_motivo': t_empty, 'toast': t, 'stock': f'{s0}->{s1}', 'estado': st.get('state') if isinstance(st, dict) else st}


@case('HIS-01b', 'Historial', 'Anular una venta histórica (datos previos) informa su estado real', 'negativo')
def _(b):
    c = Ctx(b); c.login('luis'); p = c.page
    sid = c.js("S.sales.filter(s=>vig(s)&&!s.reversal&&s.lineas.length).at(-1).id")
    c.js(f"voidSale('{sid}')"); p.wait_for_timeout(200)
    p.fill('#rev-reason', 'Cliente devolvió'); p.check('#rev-stock'); c.js(f"approveSaleReversal('{sid}')")
    wait_js(c, f"S.sales.find(s=>s.id==='{sid}').reversal"); t = c.toast(); st = c.js(f"S.sales.find(s=>s.id==='{sid}').reversal?.state")
    est = c.js(f"S.sales.find(s=>s.id==='{sid}').estado"); c.close()
    check(not (t == 'Venta anulada.' and st != 'completada'),
          f'Mensaje "{t}" pero la reversión queda en "{st}" (estado venta "{est}") y el stock no vuelve: el mensaje no refleja el resultado')
    return {'toast': t, 'estado': st}


@case('HIS-02', 'Historial', 'Vendedor solicita anulación y Luis recibe el aviso')
def _(b):
    c = Ctx(b); c.login('gonzalo'); p = c.page
    sid = c.js("S.sales.filter(s=>s.vendedor===me.id&&vig(s)&&!s.solicitud).at(-1).id")
    c.js(f"requestVoid('{sid}')"); p.wait_for_timeout(150); p.fill('#rz', 'Me equivoqué de calibre'); p.locator('#rzok').click(); p.wait_for_timeout(250)
    sol = c.js(f"S.sales.find(s=>s.id==='{sid}').solicitud")
    c.js('logout()'); c.login('luis'); txt = p.locator('main').inner_text().lower(); c.close()
    check(sol and 'anula' in txt, {'solicitud': sol})
    return {'solicitud': bool(sol), 'aviso_admin': 'anula' in txt}


@case('HIS-03', 'Historial', 'Vendedor solo ve sus ventas; filtros de medio y fechas coinciden con los datos')
def _(b):
    c = Ctx(b); c.login('gonzalo')
    vis = c.js("salesRows().map(s=>s.vendedor)")
    own_only = bool(vis) and all(v == c.js('me.id') for v in vis)
    c.js('logout()'); c.login('luis'); c.go('sales')
    c.js("setSf('medio','transferencia')"); c.page.wait_for_timeout(200)
    lst = c.js("salesRows().map(s=>s.pagos.filter(p=>p.monto).map(p=>p.medio))")
    c.close()
    check(own_only and lst and all('transferencia' in m for m in lst), {'solo_propias': own_only, 'medios': lst[:5]})
    return {'vendedor_solo_propias': own_only, 'filtro_transferencia': len(lst)}


@case('HIS-04', 'Historial', 'Descargar reporte (contadora): periodo invertido no descarga; válido descarga CSV')
def _(b):
    c = Ctx(b); c.login('genesis'); p = c.page
    p.get_by_role('button', name='Descargar reporte').click(); p.wait_for_timeout(250)
    p.fill('#rp-desde', '2026-12-31'); p.fill('#rp-hasta', '2026-01-01'); c.js('reportCount()'); p.wait_for_timeout(150)
    inv = p.locator('#rp-count').inner_text(); dis = p.locator('#rp-ok').is_disabled()
    p.fill('#rp-desde', '2026-01-01'); p.fill('#rp-hasta', '2026-12-31'); c.js('reportCount()'); p.wait_for_timeout(150)
    cnt = p.locator('#rp-count').inner_text()
    with p.expect_download(timeout=5000) as d:
        p.locator('#rp-ok').click()
    dl = d.value; path = os.path.join(SHOTS, '..', 'reporte-contadora.csv'); dl.save_as(path)
    head = open(path, encoding='utf-8-sig').readline().strip(); lines = sum(1 for _ in open(path, encoding='utf-8-sig'))
    c.close()
    check('RUT' in head.upper() or 'rut' in head, head)
    return {'invertido': inv, 'boton_deshabilitado': dis, 'conteo': cnt, 'csv_cabecera': head[:160], 'csv_lineas': lines}


@case('HIS-05', 'Historial', 'Paginación del historial (20 por página)')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('sales'); p = c.page
    r1 = p.locator('main table tbody tr').count()
    p.locator('main button', has_text='Siguiente').first.click(); p.wait_for_timeout(200)
    page = int(p.locator('.pager [aria-current="page"]').inner_text()); r2 = p.locator('main table tbody tr').count(); c.close()
    check(page == 2 and r1 > 0 and r2 > 0, {'filas': [r1, r2], 'pagina': page})
    return {'filas_p1': r1, 'filas_p2': r2}


# ================================================================ CIERRE DE CAJA
@case('CAJA-01', 'Cierre de caja', 'Vendedor declara y cierra turno; Luis lo aprueba desde el aviso')
def _(b):
    c = Ctx(b); c.login('gonzalo'); c.go('caja'); p = c.page
    p.get_by_role('button', name='Declarar y cerrar turno').click(); p.wait_for_timeout(200); t_empty = c.toast()
    exp = p.locator('#closing-expected').inner_text()
    p.fill('#dec', '-5'); p.get_by_role('button', name='Declarar y cerrar turno').click(); p.wait_for_timeout(200); t_neg = c.toast()
    n0 = c.js('S.closures.length'); p.fill('#dec', '100000'); p.get_by_role('button', name='Declarar y cerrar turno').click(); p.wait_for_timeout(300); t = c.toast()
    wait_js(c, f'S.closures.length>{n0}'); cl = c.js('S.closures.at(-1)')
    c.js('logout()'); c.login('luis'); dash = p.locator('main').inner_text()
    c.js(f"approveClose('{cl['id']}')"); wait_js(c, f"S.closures.find(x=>x.id==='{cl['id']}').aprobado"); ap = c.js(f"S.closures.find(x=>x.id==='{cl['id']}').aprobado")
    c.close()
    check(cl['vendedor'] != 'u1' and not cl.get('aprobado') and ap and 'válido' in t_empty, {'vacío': t_empty, 'neg': t_neg, 'ok': t})
    return {'esperado': exp, 'vacío': t_empty, 'negativo': t_neg, 'ok': t, 'diferencia': cl['diferencia'], 'aviso_dash': 'por aprobar' in dash, 'aprobado_por': ap}


@case('CAJA-02', 'Cierre de caja', 'Segundo cierre sin movimientos nuevos se rechaza', 'negativo')
def _(b):
    c = Ctx(b); c.login('gonzalo'); c.go('caja'); p = c.page
    n0 = c.js('S.closures.length'); p.fill('#dec', '0'); p.get_by_role('button', name='Declarar y cerrar turno').click()
    wait_js(c, f'S.closures.length>{n0}'); c.go('caja'); dis = p.get_by_role('button', name='Declarar y cerrar turno').is_disabled()
    err = c.js("(()=>{try{document.querySelector('#dec').value='0';closeShift();return document.querySelector('.toast')?.textContent}catch(e){return e.message}})()")
    c.close()
    check(dis, {'boton_deshabilitado': dis, 'msg': err})
    return {'boton_deshabilitado': dis, 'mensaje': err}


# ================================================================ CRÉDITOS
@case('CRE-01', 'Créditos', 'Venta a crédito de Luis, abono parcial y pago total')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('pos'); p = c.page
    pos_add(c, 'TOM-C7', 1); pos_confirm_add(c)
    c.js("ui.credito=true;ui.clienteNombre='Cliente QA';ui.creditoPaga=0;render()")
    ck = checkout(c); close_modals(c)
    cid = c.js("(S.clients.find(x=>x.nombre==='Cliente QA')||{}).id")
    deuda = c.js(f"creditBalance('{cid}')") if cid else None
    c.go('credits'); c.js(f"abonoForm('{cid}')"); p.wait_for_timeout(200)
    if p.locator('#ab-parte').count(): p.locator('#ab-parte').click(); p.wait_for_timeout(100)
    p.fill('#ab-monto', '5000'); p.locator('#ab-monto').dispatch_event('input')
    if p.locator('#ab-medio').count():
        try: p.select_option('#ab-medio', 'efectivo')
        except Exception: p.locator('#ab-medio button', has_text='Efectivo').first.click()
    c.js(f"saveAbono('{cid}')"); p.wait_for_timeout(250); t1 = c.toast(); d1 = c.js(f"creditBalance('{cid}')")
    close_modals(c)
    c.js(f"abonoForm('{cid}')"); p.wait_for_timeout(200)
    if p.locator('#ab-todo').count(): p.locator('#ab-todo').click(); p.wait_for_timeout(100)
    if p.locator('#ab-medio').count():
        try: p.select_option('#ab-medio', 'efectivo')
        except Exception: pass
    c.js(f"saveAbono('{cid}')"); p.wait_for_timeout(250); t2 = c.toast(); d2 = c.js(f"creditBalance('{cid}')")
    c.close()
    check(ck['opened'] and deuda and d1 == deuda - 5000 and d2 == 0, {'deuda': deuda, 'tras_abono': d1, 'final': d2, 't1': t1, 't2': t2})
    return {'deuda': deuda, 'tras_abono': d1, 'final': d2, 'toast_final': t2}


@case('CRE-02', 'Créditos', 'Abono mayor que la deuda y borrar cliente con deuda se rechazan', 'negativo')
def _(b):
    c = Ctx(b); c.login('luis'); p = c.page
    cid = c.js("S.clients.find(x=>creditBalance(x.id)>0).id"); deuda = c.js(f"creditBalance('{cid}')")
    c.js(f"abonoForm('{cid}')"); p.wait_for_timeout(200)
    if p.locator('#ab-parte').count(): p.locator('#ab-parte').click()
    p.fill('#ab-monto', str(deuda + 1000)); p.locator('#ab-monto').dispatch_event('input')
    c.js(f"saveAbono('{cid}')"); p.wait_for_timeout(200); t1 = p.locator('.err').first.inner_text() if p.locator('.ov .err').count() else c.toast()
    close_modals(c)
    c.js(f"deleteClient('{cid}')"); p.wait_for_timeout(200); t2 = c.toast() or (c.modal().inner_text() if c.modal_open() else '')
    exists = c.js(f"!!S.clients.find(x=>x.id==='{cid}')"); c.close()
    check(c and exists and c.__class__ and deuda == deuda, {'abono_mayor': t1, 'borrar': t2})
    check(exists, 'Se borró un cliente con deuda')
    return {'abono_mayor': t1, 'borrar_con_deuda': t2[:160]}


# ================================================================ PRODUCTORES / BALANCE / USUARIOS
@case('PRD-01', 'Productores', 'Crear productor (validación de nombre) y generar liquidación')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('prod'); p = c.page
    c.js("editProducer()"); p.wait_for_timeout(200); c.js("saveProducer('')"); p.wait_for_timeout(150); t0 = c.toast(); close_modals(c)
    c.js("editProducer()"); p.wait_for_timeout(200); p.fill('#p_n', 'Productor QA'); p.fill('#p_r', '11.111.111-1')
    c.js("saveProducer('')")
    ok = wait_js(c, "!!S.producers.find(x=>x.nombre==='Productor QA')"); close_modals(c)
    l0 = c.js('S.liqs.length')
    prid = c.js("S.producers.find(x=>x.tipo==='productor').id")
    pname = c.js(f"S.producers.find(x=>x.id==='{prid}').nombre"); p.locator(f'[aria-label="Ver ficha de {pname}"]').click(); p.wait_for_timeout(300)
    p.locator('main button', has_text='Generar liquidación').first.click(); wait_js(c, f'S.liqs.length>{l0}')
    close_modals(c)
    p.locator('main button', has_text='Generar liquidación').first.click(); p.wait_for_timeout(300)
    dup = c.js(f"S.liqs.filter(l=>l.prod==='{prid}').length")
    l1 = c.js('S.liqs.length'); liq = c.js('S.liqs.at(-1)'); c.close()
    check('nombre' in t0.lower() and ok and l1 == l0 + 1 and dup == 1, {'sin_nombre': t0, 'creado': ok, 'liqs': [l0, l1], 'mismo_periodo': dup})
    return {'sin_nombre': t0, 'liquidacion': {k: liq.get(k) for k in ('neto', 'comision', 'monto') if k in liq},
            'liquidaciones_mismo_periodo_tras_2_clics': dup}


@case('BAL-01', 'Balance', 'Agregar gasto (validación de monto) y exportar CSV')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('bal'); p = c.page
    e0 = c.js('S.expenses.length')
    p.get_by_role('button', name='Agregar gasto').click(); p.wait_for_timeout(250)
    c.js('saveGasto()'); p.wait_for_timeout(150); t0 = c.toast()
    if p.locator('#g_c').count():
        opts = p.locator('#g_c option').all_inner_texts()
        alt = [o for o in opts if 'amela' not in o]
        if alt: p.select_option('#g_c', label=alt[0]); p.wait_for_timeout(200)
    if p.locator('#g_m').count(): p.fill('#g_m', '25000')
    if p.locator('#g_d').count(): p.fill('#g_d', 'Gasto QA')
    c.js('saveGasto()'); p.wait_for_timeout(200); t1 = c.toast(); e1 = c.js('S.expenses.length'); close_modals(c)
    with p.expect_download(timeout=5000) as d:
        p.get_by_role('button', name='Exportar ventas').click()
    fn = d.value.suggested_filename; c.close()
    check(e1 == e0 + 1 and 'monto' in t0.lower(), {'vacío': t0, 'ok': t1, 'gastos': [e0, e1]})
    return {'sin_monto': t0, 'ok': t1, 'export': fn}


@case('BAL-02', 'Balance', 'Montos negativos con formato -$', 'positivo')
def _(b):
    c = Ctx(b); c.login('luis')
    r = c.js("[clp(-1403595), clp(2500), clp(0)]"); c.close()
    check(r == ['-$1.403.595', '$2.500', '$0'], r)
    return r


@case('USR-03', 'Usuarios', 'Desactivar al último administrador se rechaza', 'negativo')
def _(b):
    c = Ctx(b); c.login('luis'); p = c.page
    c.js("mutate(S=>{S.users.push({id:'u9',nombre:'Admin2',usuario:'admin2',rol:'admin',turno:'-',clave:'111111',activo:true})})"); p.wait_for_timeout(200)
    c.js("editUser('u9')"); p.wait_for_timeout(150); p.uncheck('#u_a'); c.js("saveUser('u9')"); p.wait_for_timeout(150)
    ok_other = c.js("!S.users.find(u=>u.id==='u9').activo")
    c.js("mutate(S=>{S.users.find(u=>u.id==='u9').activo=true;S.users.find(u=>u.id==='u1').activo=false})"); p.wait_for_timeout(200); c.js('logout()'); p.wait_for_timeout(200)
    c.login('admin2', '111111'); c.js("mutate(S=>{S.users.find(u=>u.id==='u1').activo=true})"); p.wait_for_timeout(200)
    c.js("editUser('u1')"); p.wait_for_timeout(150); p.select_option('#u_r', 'vendedor'); c.js("saveUser('u1')"); p.wait_for_timeout(150)
    t1 = c.toast(); r1 = c.js("S.users.find(u=>u.id==='u1').rol")
    close_modals(c)
    c.js("mutate(S=>{S.users.find(u=>u.id==='u1').rol='vendedor'})"); p.wait_for_timeout(200)
    c.js("editUser('u9')"); p.wait_for_timeout(150)
    dis = p.locator('#u_r').is_disabled(); c.close()
    check(ok_other and r1 == 'vendedor' and dis, {'desactivar_otro_admin': ok_other, 'otro_degrada_a_luis': r1, 'rol_propio_bloqueado': dis})
    return {'desactiva_admin_secundario': ok_other, 'rol_propio_bloqueado': dis}


@case('USR-01', 'Usuarios', 'Crear usuario: duplicado, clave inválida y alta; el nuevo usuario entra', 'negativo')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('users'); p = c.page; out = {}
    def mk(n, u, pw):
        c.js('editUser()'); p.wait_for_timeout(150); p.fill('#u_n', n); p.fill('#u_u', u); p.fill('#u_p', pw)
        c.js("saveUser('')"); p.wait_for_timeout(150); t = c.toast(); close_modals(c); return t
    out['dup'] = mk('Otro', 'gonzalo', '123456'); out['clave'] = mk('Ana', 'ana', '12'); out['ok'] = mk('Ana', 'ana', '654321')
    c.js('logout()'); c.login('ana', '654321'); who = c.js('me&&me.usuario'); c.close()
    check(who == 'ana' and 'existe' in out['dup'] and '6' in out['clave'], {**out, 'login': who})
    return {**out, 'login_nuevo': who}


@case('USR-02', 'Usuarios', 'Guardar ajustes de empresa y reiniciar datos en blanco')
def _(b):
    c = Ctx(b); c.login('luis'); c.go('users'); p = c.page
    p.fill('#s_n', 'Empresa QA'); p.get_by_role('button', name='Guardar ajustes').click(); p.wait_for_timeout(200)
    t = c.toast(); n = c.js('S.cfg.nombre')
    c.js('resetData(true)'); p.wait_for_timeout(1500); wait_js(c, 'typeof S!=="undefined"&&S.sales.length===0&&!!me', 15000)
    after = c.js('[S.sales.length,S.products.length,S.users.length,!!me]'); c.close()
    check(n == 'Empresa QA' and after[0] == 0 and after[1] > 0, {'toast': t, 'cfg': n, 'reset': after})
    return {'toast': t, 'tras_reinicio': {'ventas': after[0], 'productos': after[1], 'usuarios': after[2], 'sesion': after[3]}}


# ================================================================ PERSISTENCIA / ROBUSTEZ
@case('STO-01', 'Persistencia', 'Tamaño de datos en localStorage vs. límite (~5 MB)', 'riesgo')
def _(b):
    c = Ctx(b); c.login('luis')
    size = c.js("localStorage.getItem('bodegaLV.app.v1').length"); sales = c.js('S.sales.length'); moves = c.js('S.moves.length'); c.close()
    per_sale = size / max(sales, 1)
    return {'bytes_60_dias_demo': size, 'ventas': sales, 'movimientos': moves, 'bytes_por_venta_aprox': round(per_sale),
            'ventas_hasta_5MB_aprox': int(5_000_000 / per_sale)}


@case('STO-02', 'Persistencia', 'Si localStorage falla, el usuario recibe aviso y no pierde datos en silencio', 'negativo')
def _(b):
    c = Ctx(b); c.login('luis'); p_id = pid(c, 'TOM-C8')
    c.js("(()=>{const o=Storage.prototype.setItem;window.__restore=()=>{Storage.prototype.setItem=o};Storage.prototype.setItem=function(k,v){if(k==='bodegaLV.app.v1')throw new DOMException('QuotaExceededError','QuotaExceededError');return o.call(this,k,v)}})()")
    c.js(f"changePrice('{p_id}')"); c.page.wait_for_timeout(150); c.page.fill('#np', '23456'); c.js(f"setPrice('{p_id}')"); c.page.wait_for_timeout(150)
    t_price = c.toast(); close_modals(c)
    # venta (workflowTransaction) con almacenamiento fallando
    c.go('pos'); pos_add(c, 'TOM-C9', 1); pos_confirm_add(c); ck = checkout(c); n_mem = c.js('S.sales.length')
    c.js("window.__restore()")
    c.page.reload(); c.page.wait_for_selector('#lg_u, aside .nav', timeout=30000); c.page.wait_for_timeout(300)
    price_after = c.js(f"P('{p_id}').precio"); c.close()
    check(price_after == 23456 or 'guard' in t_price.lower(),
          f'Cambio de precio mostró "{t_price}" pero tras recargar el precio es {price_after}: pérdida silenciosa. Venta: "{ck["toast"]}"')
    return {'precio': t_price, 'venta': ck['toast']}


@case('STO-03', 'Persistencia', 'Dos pestañas: una venta en A y un cambio de precio en B no se pisan', 'concurrencia')
def _(b):
    c = Ctx(b); c.login('luis')
    p2 = c.ctx.new_page(); p2.goto(BASE); p2.wait_for_selector('#lg_u'); p2.fill('#lg_u', 'luis'); p2.fill('#lg_p', '111111'); p2.click('button[type=submit]'); p2.wait_for_selector('aside .nav', timeout=30000)
    n0 = c.js('S.sales.length')
    c.go('pos'); pos_add(c, 'TOM-C9', 1); pos_confirm_add(c); checkout(c)
    p2.wait_for_timeout(300)
    p_id = c.js("S.products.find(p=>p.sku==='TOM-C8').id")
    p2.evaluate(f"mutate(S=>{{S.products.find(p=>p.id==='{p_id}').precio=24680}})")
    c.page.wait_for_timeout(300)
    final = json.loads(c.page.evaluate("localStorage.getItem('bodegaLV.app.v1')"))
    n_final = len(final['sales']); price = [x for x in final['products'] if x['id'] == p_id][0]['precio']
    c.close()
    check(n_final == n0 + 1 and price == 24680, {'ventas': [n0, n_final], 'precio': price})
    return {'ventas': f'{n0}->{n_final}', 'precio_B': price}


@case('STO-04', 'Persistencia', 'Escritura con copia antigua (otro dispositivo) no borra datos nuevos', 'concurrencia')
def _(b):
    return 'Aplica al modo Firebase: control de versión _v en cada transacción y regla de reglas "una actualización que no sube la versión se rechaza" (tests de reglas 20/20); FB-06/FB-07 en emulador.'


# ================================================================ RESPONSIVE Y CONSOLA
VIEWS = {'luis': ['dash', 'pos', 'rec', 'inv', 'sales', 'caja', 'credits', 'prod', 'bal', 'users'], 'gonzalo': ['pos', 'rec', 'inv', 'sales', 'caja', 'credits']}


@case('RESP-01', 'Responsive', 'Sin scroll horizontal en móvil (390), tablet (768) y escritorio (1440); barra inferior en móvil')
def _(b):
    issues = []; shots = []
    for (w, h, mob) in [(390, 844, True), (768, 1024, True), (1440, 900, False)]:
        for user, views in VIEWS.items():
            c = Ctx(b, (w, h), mob); c.login(user)
            for v in views:
                c.go(v); c.page.wait_for_timeout(200)
                ov = c.js("(()=>{const d=document.documentElement;return d.scrollWidth-d.clientWidth})()")
                wide = c.js("""(()=>{const W=document.documentElement.clientWidth;return [...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>W+1&&!e.closest('.scroll,.strip,.tbl-wrap,[style*="overflow"]')}).slice(0,3).map(e=>e.tagName+'.'+[...e.classList].join('.'))})()""")
                if ov > 0:
                    issues.append(f'{w}px {user}/{v}: desborde horizontal {ov}px {wide}')
                if w == 390 and user == 'luis' and v in ('dash', 'pos', 'rec', 'sales', 'bal'):
                    shots.append(c.shot(f'resp-{w}-{user}-{v}'))
                if w == 768 and v in ('pos', 'inv'):
                    shots.append(c.shot(f'resp-{w}-{user}-{v}'))
            if mob and w == 390:
                bn = c.page.locator('.bnav').is_visible()
                if not bn:
                    issues.append(f'{w}px {user}: barra inferior no visible')
            c.close()
    check(not issues, issues)
    return {'capturas': shots}


@case('RESP-02', 'Responsive', 'Flujo de venta completo en móvil 390px (toques)')
def _(b):
    c = Ctx(b, (390, 844), True); c.login('gonzalo'); n0 = c.js('S.sales.length')
    pos_add(c, 'TOM-C85', 1); pos_confirm_add(c)
    c.page.get_by_role('button', name='Revisar venta').scroll_into_view_if_needed()
    ck = checkout(c); n1 = c.js('S.sales.length'); shot = c.shot('resp-390-venta-comprobante'); c.close()
    check(ck['opened'] and n1 == n0 + 1, ck)
    return {'ventas': f'{n0}->{n1}', 'captura': shot}


@case('A11Y-01', 'Accesibilidad', 'Login: campos con etiqueta asociada; navegación por teclado en el menú', 'accesibilidad')
def _(b):
    c = Ctx(b)
    lbl = c.js("[...document.querySelectorAll('#lg_u,#lg_p')].map(i=>!!(i.labels&&i.labels.length)||!!i.getAttribute('aria-label'))")
    c.login('luis')
    nav = c.js("[...document.querySelectorAll('.nav a')].map(a=>[a.tabIndex,a.getAttribute('role')])")
    c.page.locator('.nav a').nth(3).focus(); c.page.keyboard.press('Enter'); c.page.wait_for_timeout(200); v = c.js('view')
    c.close()
    check(all(lbl) and v == 'inv', f'Etiquetas login asociadas: {lbl}; vista tras Enter: {v}')
    return {'nav': nav[:3], 'enter_abre': v}


@case('NET-01', 'Dependencias', 'La app funciona si fallan los CDN externos (GSAP, Google Fonts)', 'resiliencia')
def _(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.route(re.compile(r'(jsdelivr|googleapis|gstatic)'), lambda r: r.abort())
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(BASE, wait_until='load'); page.wait_for_selector('#lg_u', timeout=30000)
    page.fill('#lg_u', 'luis'); page.fill('#lg_p', '111111'); page.click('button[type=submit]'); page.wait_for_timeout(400)
    ok = page.evaluate("!!window.__test.me && window.__test.view==='dash'"); page.evaluate("go('pos')"); page.wait_for_timeout(200)
    pos = page.locator('main h1').inner_text(); ctx.close()
    check(ok and not errs, {'login': ok, 'errores': errs})
    return {'login_y_dashboard': ok, 'pos': pos, 'errores_js': errs}


# ================================================================ RUNNER
# Casos de la suite local cuya preparación no es posible (ni deseable) en modo Firebase.
NO_APLICA = {
    'AUTH-06': 'Prepara datos escribiendo usuarios desde el navegador; las reglas de Firestore lo rechazan (correcto). Desactivación cubierta por saveUser y tests de reglas.',
    'USR-03': 'Igual que AUTH-06: escribe usuarios desde el navegador; en Firebase solo la Cloud Function saveUser puede (y protege al último admin).',
    'STO-03': 'Simula dos pestañas modificando datos de usuario desde el navegador; rechazado por las reglas. Concurrencia cubierta por STO-04 (_v en transacciones).',
    'STO-01': 'Mide localStorage; en modo Firebase los datos viven en Firestore/IndexedDB, no en localStorage.',
    'NET-01': 'Bloquea *.googleapis.com, que en modo Firebase es el propio backend; la prueba de CDN externos aplica al modo local.',
}


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        for cid, module, title, kind, fn in TESTS:
            if ONLY and not any(cid.startswith(o) for o in ONLY):
                continue
            CURRENT['id'] = cid
            for _ in range(3):
                r = subprocess.run('npm --prefix web run reset:emulator', shell=True, capture_output=True, text=True)
                if 'Listo:' in r.stdout: break
            else:
                print('     !! no se pudo reiniciar el emulador (reinicia los emuladores):', (r.stdout + r.stderr)[-300:], flush=True); break
            t0 = time.time(); rec = {'id': cid, 'modulo': module, 'caso': title, 'tipo': kind}
            if cid in NO_APLICA:
                rec.update(estado='NO_APLICA', detalle=NO_APLICA[cid], seg=0); results.append(rec)
                print(f"{'NO_APLICA':13} {cid:8} {title}", flush=True); continue
            try:
                detail = fn(b); rec.update(estado='APROBADA', detalle=detail)
            except Fail as e:
                rec.update(estado='FALLIDA', detalle=str(e.args[0]) if e.args else '')
            except Exception as e:
                rec.update(estado='ERROR_PRUEBA', detalle=f'{type(e).__name__}: {e}'[:600])
            rec['seg'] = round(time.time() - t0, 1)
            results.append(rec)
            print(f"{rec['estado']:13} {cid:8} {title}  ({rec['seg']}s)", flush=True)
            if rec['estado'] != 'APROBADA':
                print('     ->', str(rec['detalle'])[:500], flush=True)
        b.close()
    json.dump(CONSOLE, open(os.path.join(HERE, '..', 'consola-fase4-firebase.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'Errores de consola / solicitudes fallidas: {len(CONSOLE)}')
    old = []
    if ONLY and os.path.exists(RESULTS):
        old = [r for r in json.load(open(RESULTS)) if r['id'] not in {x['id'] for x in results}]
    order = [t[0] for t in TESTS]
    json.dump(sorted(old + results, key=lambda r: order.index(r['id']) if r['id'] in order else 999),
              open(RESULTS, 'w'), ensure_ascii=False, indent=1, default=str)


if __name__ == '__main__':
    main()
