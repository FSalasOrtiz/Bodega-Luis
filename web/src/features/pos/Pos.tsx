import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Head, Seg } from '../../components/ui';
import { gamProd, P, productFamilies, U } from '../../domain/catalog';
import { isAdmin, me } from '../../domain/ctx';
import { creditBalance, findClientByName, liveClients } from '../../domain/credits';
import { clp, pctTxt, qtyFmt, searchText } from '../../domain/format';
import { gamCalc, gamError, type GamCalc } from '../../domain/gamelas';
import { cartHasConsig, cartPrice, cancelRequestCmd, filteredProducts, posLeft, posSrc, saleCom } from '../../domain/pos';
import { comBase } from '../../domain/catalog';
import { comReq, comRequestMatches, creditReq, creditRequestMatches, priceReq, priceRequestMatches } from '../../domain/requests';
import { receiptPayment } from '../../domain/receipts';
import { SRC_LBL, srcStock } from '../../domain/stock';
import type { CartLine, Fuente, MedioPago } from '../../types/model';
import { store, useApp } from '../../state/store';
import { exec } from '../../app/actions';
import { closeModal, openModal } from '../../components/modal';
import { openItem } from './ItemDialog';
import { openCheckout } from './Checkout';
import { openComForm, openPriceForm, requestCredit } from './Requests';

export function Pos() {
  const { ui } = useApp();
  const [q, setQ] = useState(''), [fam, setFam] = useState('Todas');
  const ps = filteredProducts(q, fam);
  const items = ui.cart.map((c, i) => { const p = P(c.prod), precio = cartPrice(c); return { ...c, p, i, precio, sub: Math.round(c.qty * precio) }; });
  const prodTotal = items.reduce((a, c) => a + c.sub, 0), g = gamCalc(), gErr = gamError(g, prodTotal);
  const total = prodTotal + g.monto, canSell = (items.length > 0 || g.net > 0) && !gErr;
  // crédito: se anota cuánto paga ahora y el resto queda a crédito
  const fiado = ui.credito ? total - Math.min(Math.max(0, Number(ui.creditoPaga) || 0), total) : 0, rest = total - fiado;
  const priceWaiting = ui.cart.some((c) => priceReq(c.priceReq)?.estado === 'pendiente') || (cartHasConsig() && comReq(ui.comReq)?.estado === 'pendiente');
  const waiting = priceWaiting || (ui.credito && !isAdmin() && !creditRequestMatches(creditReq(ui.creditReq), { user: me()!.id, nombre: ui.clienteNombre || '', monto: fiado, total }));
  const src = posSrc();
  const clearSearch = () => { setQ(''); setFam('Todas'); document.querySelector<HTMLInputElement>('.search input')?.focus(); };
  return (
    <>
      <Head t="Punto de venta" />
      <div className="pos">
        <div>
          <div className="f src-pick"><label>Sacar del stock de</label>
            <Seg<Fuente> value={src} options={[['consig', SRC_LBL.consig], ['directa', SRC_LBL.directa]]} onChange={(s) => store.setUi({ src: s })} label="Sacar del stock de" />
          </div>
          <SuggestBox q={q} setQ={setQ} />
          <div className="tabs">{['Todas', ...productFamilies()].map((f) => <button key={f} className={`btn sm ${fam === f ? 'pri' : 'ghost'}`} aria-pressed={fam === f} onClick={() => setFam(f)}>{f}</button>)}</div>
          <div className="prods">
            {ps.map((p) => {
              const s = posLeft(p.id);
              return (
                <button key={p.id} className={`prod ${s <= 0 ? 'out' : ''}`} onClick={() => openItem(p.id)} onContextMenu={(e) => { e.preventDefault(); priceCheck(p.id); }}>
                  <span className="muted" style={{ fontSize: 11 }}>{p.sku}</span><span className="nm">{p.nombre}</span>
                  <span className="st">{s <= 0 ? <span className="pill bad">Sin stock</span> : 'Quedan ' + qtyFmt(s, p.unidad)}</span>
                  <span className="pr num">{clp(p.precio)}<small style={{ fontSize: 12, fontWeight: 600 }}>{p.unidad === 'kg' ? ' /kg' : ' /gamela'}</small></span>
                </button>
              );
            })}
            {!ps.length && <div className="empty">Sin resultados. Prueba otro nombre o SKU.<br /><button className="btn ghost sm" style={{ marginTop: 12 }} onClick={clearSearch}>Mostrar todos los productos</button></div>}
          </div>
        </div>
        <div className="card cart">
          <h3>Venta actual<span className="pill mute">{me()!.nombre}</span></h3>
          {items.length ? items.map((c) => (
            <div className="line" key={c.i}>
              <div className="grow"><b>{c.p.nombre}</b>
                <small>{c.src && <><span className={`pill ${c.src === 'consig' ? 'mute' : 'ok'}`}>{SRC_LBL[c.src]}</span> </>}{qtyFmt(c.qty, c.p.unidad)}{c.gam ? ` (${c.gam} gamela${c.gam === 1 ? '' : 's'})` : ''} × {c.precio !== c.p.precio ? <><s>{clp(c.p.precio)}</s> <b>{clp(c.precio)}</b></> : clp(c.p.precio)}</small>
                <PriceLineStatus c={c} i={c.i} />
              </div>
              <b className="num">{clp(c.sub)}</b>
              <button className="x" aria-label={`Quitar ${c.p.nombre} de la venta`} onClick={() => void removeCartLine(c.i)}>✕</button>
            </div>
          )) : <div className="empty">Agrega productos desde la lista</div>}
          <ComBox />
          <GamBox g={g} err={gErr} />
          <div className="f"><label>Documento</label><Seg value={ui.documento} options={[['boleta', 'Boleta'], ['factura', 'Factura']]} onChange={(d) => store.setUi({ documento: d })} label="Documento" /></div>
          {ui.documento === 'factura' && <InvoiceFields />}
          <CreditBox total={total} fiado={fiado} rest={rest} />
          {(rest > 0 || !ui.credito) && <>
            <div className="f"><label>{ui.credito ? `Medio de pago de lo que paga ahora (${clp(rest)})` : 'Medio de pago'}</label>
              <Seg className="payment-options" value={ui.pago} options={(['efectivo', 'transferencia', 'tarjeta', 'mixto'] as const).map((m) => [m, m[0].toUpperCase() + m.slice(1)])} onChange={(m) => store.setUi({ pago: m })} label="Medio de pago" />
            </div>
            {ui.pago === 'mixto' && <MixedBox total={rest} />}
          </>}
          <div className="total"><span>Total</span><span className="num">{clp(total)}</span></div>
          {fiado > 0 && <div className="rows credit-split"><div><div className="grow"><b>Paga ahora</b></div><b className="num">{clp(rest)}</b></div><div><div className="grow"><b>Queda a crédito</b></div><b className="num" style={{ color: 'var(--warn)' }}>{clp(fiado)}</b></div></div>}
          {waiting && canSell && <p className="muted" role="status">Para registrar la venta, Luis tiene que autorizar {priceWaiting ? 'el cambio pedido' : 'el crédito'}.</p>}
          <button className="btn pri big" disabled={!canSell || waiting} onClick={openCheckout}>Revisar venta</button>
        </div>
      </div>
    </>
  );
}

function SuggestBox({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  const t = q.trim();
  const sug = t ? filteredProducts(q, 'Todas').slice(0, 6) : [];
  return (
    <div style={{ position: 'relative', marginBottom: 10 }}>
      <div className="search" style={{ maxWidth: 'none', border: '1.5px solid var(--line)', minHeight: 50 }}>
        <Icon n="search" s={18} />
        <input placeholder="Buscar por nombre, calibre o SKU" aria-label="Buscar producto" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); if (e.key === 'Enter') { const p = filteredProducts(q, 'Todas')[0]; if (p) { setQ(''); openItem(p.id); } } }} />
        {t && <button type="button" className="x" aria-label="Limpiar búsqueda" onClick={() => { setQ(''); document.querySelector<HTMLInputElement>('.search input')?.focus(); }}>✕</button>}
      </div>
      {sug.length > 0 && (
        <div className="sug">{sug.map((p) => {
          const st = posLeft(p.id);
          return (
            <button key={p.id} onClick={() => { setQ(''); openItem(p.id); }}>
              <span className={`ico ${p.familia === 'Tomate' ? 't' : p.familia === 'Palta' ? 'p' : 'o'}`}>{p.calibre.slice(0, 3)}</span>
              <span className="grow"><b><Hl t={p.nombre} q={t} /></b><small><Hl t={p.sku} q={t} /> · {st > 0 ? 'quedan ' + qtyFmt(st, p.unidad) : 'sin stock'}</small></span>
              <b className="num">{clp(p.precio)}{p.unidad === 'kg' ? '/kg' : ''}</b>
            </button>
          );
        })}</div>
      )}
      {t && !sug.length && <div className="sug"><div className="empty" style={{ padding: 14 }}>Sin coincidencias</div></div>}
    </div>
  );
}
/** Resalta la coincidencia sin distinguir tildes ni mayúsculas. */
export function Hl({ t, q }: { t: string; q: string }) {
  const text = String(t ?? '').normalize('NFC'), needle = searchText(q), i = searchText(text).indexOf(needle);
  if (!needle || i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + needle.length)}</mark>{text.slice(i + needle.length)}</>;
}

export function priceCheck(pid: string): void {
  openModal(() => {
    const p = P(pid);
    return (
      <>
        <p className="muted" style={{ margin: 0 }}>Consulta de precio · {p.sku}</p><h2>{p.nombre}</h2>
        <div className="kpi"><div className="val num" style={{ color: 'var(--g800)' }}>{clp(p.precio)}{p.unidad === 'kg' && <small style={{ fontSize: 16 }}> /kg</small>}</div></div>
        <p>Stock en consignación: <b>{qtyFmt(srcStock(pid, 'consig'), p.unidad)}</b> · compra directa: <b>{qtyFmt(srcStock(pid, 'directa'), p.unidad)}</b></p>
        <div className="acts"><button className="btn ghost" onClick={closeModal}>Cerrar</button><button className="btn pri" onClick={() => openItem(pid)}>Vender</button></div>
      </>
    );
  });
}

async function removeCartLine(i: number): Promise<void> {
  const c = store.get().ui.cart[i];
  if (c?.priceReq) await exec(() => cancelRequestCmd('priceRequests', c.priceReq));
  store.setUi((u) => ({ cart: u.cart.filter((_, j) => j !== i) }));
}

function PriceLineStatus({ c, i }: { c: CartLine & { p: ReturnType<typeof P> }; i: number }) {
  if (c.p.envase) return null;
  const btn = (label: string) => <button type="button" className="btn sm ghost" onClick={() => openPriceForm(i)}>💲 {label}</button>;
  if (isAdmin()) return <div className="price-st">{c.precioAdmin && <span className="pill warn">Precio especial</span>}{btn(c.precioAdmin ? 'Cambiar' : 'Cambiar precio')}</div>;
  const r = priceReq(c.priceReq);
  if (r?.estado === 'pendiente') return <div className="price-st"><span className="pill warn">Esperando a Luis: {clp(r.precio)}</span><button type="button" className="btn sm ghost" onClick={async () => { await exec(() => cancelRequestCmd('priceRequests', c.priceReq)); store.setUi((u) => ({ cart: u.cart.map((x, j) => (j === i ? { ...x, priceReq: undefined } : x)) })); }}>Cancelar</button></div>;
  if (priceRequestMatches(r, c, me()!.id)) return <div className="price-st"><span className="pill ok">Precio autorizado por {U(r!.resueltoPor || '').nombre}</span></div>;
  return <div className="price-st">{r?.estado === 'rechazada' && <span className="pill bad">Luis rechazó {clp(r.precio)}</span>}{btn('Pedir otro precio')}</div>;
}

function ComBox() {
  const { ui } = useApp();
  if (!cartHasConsig()) return null;
  const v = saleCom(), r = comReq(ui.comReq);
  const st = isAdmin() ? <button type="button" className="btn sm ghost" onClick={openComForm}>✏️ Cambiar</button>
    : r?.estado === 'pendiente' ? <><span className="pill warn">Esperando a Luis: {pctTxt(r.pct)}</span><button type="button" className="btn sm ghost" onClick={async () => { await exec(() => cancelRequestCmd('comRequests', ui.comReq)); store.setUi({ comReq: '' }); }}>Cancelar</button></>
      : comRequestMatches(r, me()!.id) ? <span className="pill ok">Autorizada por {U(r!.resueltoPor || '').nombre} · solo esta venta</span>
        : <>{r?.estado === 'rechazada' && <span className="pill bad">Luis rechazó {pctTxt(r.pct)}</span>}<button type="button" className="btn sm ghost" onClick={openComForm}>Pedir otro %</button></>;
  return (
    <div className="com-box"><div className="grow"><b>Comisión consignación {isAdmin() || v !== comBase() ? '' : '🔒'} {pctTxt(v)}</b><small>Tu ganancia sobre lo que sale de consignación en esta venta</small></div><div className="price-st">{st}</div></div>
  );
}

function GamBox({ g, err }: { g: GamCalc; err: string }) {
  const vg = gamProd().precio, pl = (n: number) => (Math.abs(n) === 1 ? '' : 's');
  const res = g.net > 0 ? `Cobrar ${g.net} gamela${pl(g.net)} × ${clp(vg)} = ${clp(g.monto)}` : g.net < 0 ? `Devuelve ${-g.net} gamela${pl(g.net)} de más: se descuentan ${clp(-g.monto)} de la compra` : g.lleva ? 'Trae las mismas que se lleva: no se cobran gamelas' : 'Sin gamelas en esta venta';
  const detail = [g.auto ? `${g.auto} con los productos` : '', g.extra ? `${g.extra} agregada${pl(g.extra)}` : ''].filter(Boolean).join(' + ');
  const Field = ({ id, label, sub, val, onMinus, onPlus, onSet }: { id: string; label: string; sub?: string; val: number; onMinus?: () => void; onPlus: () => void; onSet: (n: number) => void }) => (
    <div className="gam-row">
      <div className="grow"><label htmlFor={id}><b>{label}</b></label>{sub && <small>{sub}</small>}</div>
      <div className="stepper sm">
        <button type="button" aria-label={`${label}: una menos`} disabled={!onMinus} onClick={onMinus}>−</button>
        <input id={id} className="in num" type="text" inputMode="numeric" autoComplete="off" defaultValue={val} key={val} onBlur={(e) => onSet(parseInt(e.target.value) || 0)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <button type="button" aria-label={`${label}: una más`} onClick={onPlus}>+</button>
      </div>
    </div>
  );
  return (
    <fieldset className="gam-box"><legend>Gamelas · {clp(vg)} c/u</legend>
      <Field id="gam-lleva" label="Se lleva" sub={detail} val={g.lleva} onMinus={g.extra ? () => store.setUi({ gamExtra: g.extra - 1 }) : undefined} onPlus={() => store.setUi({ gamExtra: g.extra + 1 })} onSet={(n) => store.setUi({ gamExtra: Math.max(0, n - g.auto) })} />
      <Field id="gam-trae" label="Trae el cliente" val={g.trae} onMinus={g.trae ? () => store.setUi({ gamTrae: g.trae - 1 }) : undefined} onPlus={() => store.setUi({ gamTrae: g.trae + 1 })} onSet={(n) => store.setUi({ gamTrae: Math.max(0, n) })} />
      <p className={`gam-result ${g.net < 0 ? 'neg' : ''}`} role="status"><b>{res}</b></p>{err && <p className="err" role="alert">{err}</p>}
    </fieldset>
  );
}

const INVOICE_FIELDS: [keyof import('../../types/model').Receptor, string, string, number][] = [
  ['rut', 'RUT', '12.345.678-5', 12], ['razonSocial', 'Razón social', 'Nombre de la empresa', 100], ['giro', 'Giro', 'Actividad comercial', 80],
  ['direccion', 'Dirección', 'Calle y número', 70], ['comuna', 'Comuna', 'Comuna del cliente', 20], ['telefono', 'Teléfono (opcional)', '+56 9 1234 5678', 20],
];
function InvoiceFields() {
  const { ui } = useApp();
  return (
    <fieldset className="invoice-fields"><legend>Datos del cliente</legend>
      {INVOICE_FIELDS.map(([key, label, ph, max]) => (
        <div className="f" key={key}><label htmlFor={`inv-${key}`}>{label}</label>
          <input type={key === 'telefono' ? 'tel' : 'text'} autoComplete={key === 'telefono' ? 'tel' : undefined} className="in" id={`inv-${key}`} value={ui.receptor?.[key] || ''} placeholder={ph} maxLength={max} required={key !== 'telefono'}
            onChange={(e) => store.setUi((u) => ({ receptor: { ...u.receptor, [key]: e.target.value } }))} />
        </div>
      ))}
    </fieldset>
  );
}

const PAY_METHODS: MedioPago[] = ['efectivo', 'transferencia', 'tarjeta'];
function mixedPair(first: MedioPago, second: MedioPago): [MedioPago, MedioPago] {
  const a = PAY_METHODS.includes(first) ? first : 'efectivo';
  let b = PAY_METHODS.includes(second) ? second : 'transferencia';
  if (b === a) b = PAY_METHODS.find((m) => m !== a)!;
  return [a, b];
}
export const currentMixedPair = (): [MedioPago, MedioPago] => { const u = store.get().ui; return mixedPair(u.mixFirst, u.mixedSecond); };
function MixedBox({ total }: { total: number }) {
  const { ui } = useApp();
  const [a, b] = mixedPair(ui.mixFirst, ui.mixedSecond), first = Math.max(0, Number(ui.pagoEf) || 0);
  const set = (slot: 1 | 2, m: MedioPago) => {
    if (slot === 1) store.setUi({ mixFirst: m, ...(m === b ? { mixedSecond: a } : {}) });
    else store.setUi({ mixedSecond: m, ...(m === a ? { mixFirst: b } : {}) });
  };
  return (
    <>
      <div className="row mixed-pay">
        <div className="f"><label htmlFor="mix-1">Primer medio</label><select id="mix-1" className="in" value={a} onChange={(e) => set(1, e.target.value as MedioPago)}>{PAY_METHODS.map((m) => <option key={m} value={m}>{receiptPayment(m)}</option>)}</select></div>
        <div className="f"><label htmlFor="mix-2">Segundo medio</label><select id="mix-2" className="in" value={b} onChange={(e) => set(2, e.target.value as MedioPago)}>{PAY_METHODS.map((m) => <option key={m} value={m}>{receiptPayment(m)}</option>)}</select></div>
      </div>
      <div className="f"><label htmlFor="mix-amount">Monto en {receiptPayment(a).toLowerCase()}</label>
        <input id="mix-amount" className="in num" type="text" inputMode="numeric" autoComplete="off" defaultValue={first || ''} key={first} onBlur={(e) => store.setUi({ pagoEf: parseInt(e.target.value.replace(/\D/g, '')) || 0 })} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <small className="muted">{first >= total ? `Debe ser menor que ${clp(total)}` : `${receiptPayment(b)}: ${clp(total - first)}`}</small>
      </div>
    </>
  );
}

function CreditBox({ total, fiado, rest }: { total: number; fiado: number; rest: number }) {
  const { ui } = useApp();
  const cs = liveClients().filter((c) => c.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const known = ui.clienteNombre ? findClientByName(ui.clienteNombre) : null;
  const toggle = async (on: boolean) => {
    if (!on && ui.creditReq) await exec(() => cancelRequestCmd('creditRequests', ui.creditReq));
    store.setUi({ credito: on, ...(on ? { creditoPaga: 0 } : { creditReq: '' }) });
  };
  return (
    <>
      <label className="gamchk credit-check"><input type="checkbox" checked={ui.credito} onChange={(e) => void toggle(e.target.checked)} /><span><b>Crédito</b>{!isAdmin() && <small>Requiere autorización de Luis</small>}</span></label>
      {ui.credito && (
        <div className="credit-fields">
          <div className="f"><label htmlFor="credit-amount">¿Cuánto paga ahora?</label>
            <input id="credit-amount" className="in num" type="text" inputMode="numeric" autoComplete="off" defaultValue={Number(ui.creditoPaga) || 0} key={ui.creditoPaga} onBlur={(e) => store.setUi({ creditoPaga: parseInt(e.target.value.replace(/\D/g, '')) || 0 })} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            <small className="muted">Total de la venta {clp(total)} · {fiado ? <>queda a crédito <b>{clp(fiado)}</b></> : 'no queda nada a crédito'}{!rest && fiado ? ' (todo a crédito)' : ''}</small>
            {(Number(ui.creditoPaga) || 0) >= total && total > 0 && <small className="err">Si paga todo, no es crédito: desmarca Crédito.</small>}
          </div>
          <div className="f"><label htmlFor="credit-client">Nombre del cliente</label>
            <input id="credit-client" className="in" list="credit-clients" maxLength={60} autoComplete="off" defaultValue={ui.clienteNombre || ''} key={ui.clienteNombre} placeholder="Ej: Sergio" onBlur={(e) => store.setUi({ clienteNombre: e.target.value.trim() })} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            <datalist id="credit-clients">{cs.map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
            <small className="muted">{!ui.clienteNombre ? 'Escribe o elige un cliente.' : known ? (known.activo === false ? `${known.nombre} está desactivado para crédito.` : `${known.nombre} debe hoy ${clp(creditBalance(known.id))}.`) : 'Cliente nuevo: se agrega al módulo de créditos.'}</small>
          </div>
          {!isAdmin() && <CreditAuthStatus total={total} fiado={fiado} />}
        </div>
      )}
    </>
  );
}
function CreditAuthStatus({ total, fiado }: { total: number; fiado: number }) {
  const { ui } = useApp();
  const r = creditReq(ui.creditReq), cur = { user: me()!.id, nombre: ui.clienteNombre || '', monto: fiado, total };
  if (creditRequestMatches(r, cur)) return <p><span className="pill ok">Crédito autorizado por {U(r!.resueltoPor || '').nombre}</span></p>;
  const same = r && r.estado === 'pendiente' && r.monto === fiado && r.total === total && searchText(r.clienteNombre) === searchText(cur.nombre);
  if (same) return <p><span className="pill warn">Esperando autorización de Luis</span> <button className="btn sm ghost" onClick={async () => { await exec(() => cancelRequestCmd('creditRequests', ui.creditReq)); store.setUi({ creditReq: '' }); }}>Cancelar</button></p>;
  const note = r?.estado === 'rechazada' ? <span className="pill bad">Luis rechazó el crédito</span> : r && ['aprobada', 'pendiente'].includes(r.estado) ? <span className="pill warn">La venta cambió: pide autorización de nuevo</span> : null;
  if (ui.cart.some((c) => priceReq(c.priceReq)?.estado === 'pendiente')) return <p>{note}{note && ' '}<span className="muted">Primero Luis tiene que responder el precio pedido; después pides el crédito.</span></p>;
  return <p>{note}{note && ' '}<button className="btn sm pri" onClick={() => void requestCredit()}>Pedir autorización a Luis</button></p>;
}
