import { useState } from 'react';
import { closeModal, openModal } from '../../components/modal';
import { toast } from '../../components/toast';
import { gamInt, gamProd, kgGam, P } from '../../domain/catalog';
import { isAdmin } from '../../domain/ctx';
import { clp, kg, qtyFmt, round2 } from '../../domain/format';
import { posLeft, posSrc } from '../../domain/pos';
import { lineTotal } from '../../domain/sales';
import { scaleOver, SRC_LBL } from '../../domain/stock';
import { store } from '../../state/store';
import { go } from '../../app/actions';
import { openPriceForm } from './Requests';

/** Ventana de cantidad: gamelas enteras o kilos (coma decimal). Al agregar, muestra lo que queda. */
export function openItem(pid: string): void {
  const p = P(pid), avail = posLeft(pid);
  if (avail <= 0 && p.unidad !== 'kg') { toast(`Sin stock de ${p.nombre} en ${SRC_LBL[posSrc()].toLowerCase()}`); return; }
  openModal(() => <ItemDialog pid={pid} />);
}

function ItemDialog({ pid }: { pid: string }) {
  const p = P(pid);
  const [raw, setRaw] = useState('1'), [gam, setGam] = useState('');
  const qty = Math.max(0, parseFloat(raw.replace(',', '.')) || 0);
  const avail = posLeft(p.id), over = scaleOver(p, avail, qty);
  // kg: cualquier peso mayor a 0 (sin mínimo de caja); gamela: al menos 1 y entera
  const bad = p.unidad !== 'kg' && !Number.isInteger(round2(qty)) ? 'Las gamelas deben ser un número entero.'
    : qty > avail + 1e-9 && !over ? `No alcanza: quedan ${qtyFmt(avail, p.unidad)}`
      : p.unidad === 'kg' ? (qty <= 0 ? 'Ingresa los kilos que se lleva' : '') : qty < 1 - 1e-9 ? 'Venta mínima: 1 gamela' : '';
  const err = bad || (kgGam(p) && !Number.isFinite(gamInt(gam)) ? 'Las gamelas deben ser un número entero.' : '');
  const step = (d: number) => setRaw(String(Math.max(0, round2(qty + d))));
  const add = (withPrice = false) => {
    if (err) return;
    const q = p.unidad === 'kg' ? round2(qty) : Math.round(qty), gm = kgGam(p) ? gamInt(gam) || 0 : 0, src = posSrc();
    store.setUi((u) => ({ cart: [...u.cart, { prod: p.id, qty: q, ...(p.envase ? {} : { src }), ...(gm ? { gam: gm } : {}) }] }));
    closeModal();
    if (store.get().view !== 'pos') go('pos');
    if (withPrice && !p.envase) { openPriceForm(store.get().ui.cart.length - 1); return; }
    toast(`${p.nombre}: quedan ${qtyFmt(posLeft(p.id), p.unidad)} en ${SRC_LBL[src].toLowerCase()}`);
  };
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>{p.sku} · {clp(p.precio)}{p.unidad === 'kg' ? '/kg' : '/gamela'}</p><h2>{p.nombre}</h2>
      <p className="muted" style={{ margin: '2px 0 14px' }}>Stock de <b style={{ color: 'var(--ink)' }}>{SRC_LBL[posSrc()].toLowerCase()}</b>: quedan <b id="it_left" style={{ color: 'var(--ink)' }}>{qtyFmt(Math.max(0, avail - qty), p.unidad)}</b> después de esta venta</p>
      <div className="f"><label id="it_lbl" htmlFor="it_q">{p.unidad === 'gamela' ? 'Gamelas' : 'Kilos'}</label>
        <div className="stepper"><button aria-label="Disminuir cantidad" onClick={() => step(-1)}>−</button>
          <input id="it_q" className="in num" type="text" inputMode="decimal" autoComplete="off" value={raw} onChange={(e) => setRaw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !err) add(); }} />
          <button aria-label="Aumentar cantidad" onClick={() => step(1)}>+</button></div></div>
      <p className="muted" id="it_kg">{p.unidad === 'kg' ? `${kg(qty)} kg × ${clp(p.precio)}${over ? ` · el sistema tenía ${kg(Math.max(0, avail))} kg: se anotan +${kg(over)} kg de ajuste` : ''}` : ''}</p>
      {kgGam(p) && <div className="f"><label htmlFor="it_g">Gamelas que se lleva</label><input id="it_g" className="in num" type="text" inputMode="numeric" autoComplete="off" value={gam} placeholder="0" onChange={(e) => setGam(e.target.value.trim())} /><small className="muted">Aparte de los kilos. Se suman a las gamelas de la venta.</small></div>}
      {p.usaGamela && <p className="muted" id="it_gtxt">{p.unidad === 'gamela' ? `Las gamelas (${clp(gamProd().precio)} c/u) se cobran en la venta, descontando las que traiga el cliente.` : 'Las gamelas que se lleva se cobran en la venta, descontando las que traiga el cliente.'}</p>}
      <div className="total"><span>Subtotal</span><span className="num" id="it_sub">{clp(lineTotal(p, qty))}</span></div>
      <div className="err" id="it_err" role="alert">{err}</div>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button>
        {!p.envase && <button className="btn ghost" id="it_price" disabled={!!err} onClick={() => add(true)}>💲 {isAdmin() ? 'Otro precio' : 'Pedir otro precio'}</button>}
        <button className="btn pri" id="it_ok" disabled={!!err} onClick={() => add()}>Agregar</button></div>
    </>
  );
}
