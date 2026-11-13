import { useState } from 'react';
import { closeModal, openModal } from '../../components/modal';
import { toast } from '../../components/toast';
import { gamInt, gamProd, kgGam, P } from '../../domain/catalog';
import { isAdmin } from '../../domain/ctx';
import { clp, kg, qtyFmt, round2 } from '../../domain/format';
import { cartLotQty, posLeft, posSrc } from '../../domain/pos';
import { embLabel, embName, lotPrice, openEmbarques } from '../../domain/embarques';
import { lineTotal } from '../../domain/sales';
import { lotStock, scaleOver, SRC_LBL } from '../../domain/stock';
import { store } from '../../state/store';
import { go } from '../../app/actions';
import { openNewLinePriceForm } from './Requests';
import type { CartLine } from '../../types/model';

/** Ventana de cantidad: gamelas enteras o kilos (coma decimal). Al agregar, muestra lo que queda. */
export function openItem(pid: string): void {
  const p = P(pid), avail = posLeft(pid);
  if (avail <= 0 && p.unidad !== 'kg') { toast(`Sin stock de ${p.nombre} en ${SRC_LBL[posSrc()].toLowerCase()}`); return; }
  openModal(() => <ItemDialog pid={pid} />);
}

function ItemDialog({ pid }: { pid: string }) {
  const p = P(pid), src = posSrc();
  // embarques con stock descontando lo que ya está en el carrito; con más de uno, el vendedor elige (no se marca ninguno)
  const embs = p.envase ? [] : openEmbarques(p.id, src).map((l) => ({ l, left: lotStock(l.id) - cartLotQty(l.id), precio: lotPrice(l) }));
  const [lot, setLot] = useState(embs.length === 1 ? embs[0].l.id : '');
  const mustPick = embs.length > 1 && !lot;
  const emb = embs.find((e) => e.l.id === lot), price = emb ? emb.precio : p.precio;
  const [raw, setRaw] = useState('1'), [gam, setGam] = useState('');
  const qty = Math.max(0, parseFloat(raw.replace(',', '.')) || 0);
  const avail = emb ? emb.left : posLeft(p.id), over = scaleOver(p, avail, qty);
  // kg: cualquier peso mayor a 0 (sin mínimo de caja); gamela: al menos 1 y entera
  const bad = mustPick ? 'Elige de qué embarque sale.' : p.unidad !== 'kg' && !Number.isInteger(round2(qty)) ? 'Las gamelas deben ser un número entero.'
    : qty > avail + 1e-9 && !over ? `No alcanza: ${emb && embs.length > 1 ? `el ${embName(emb.l).toLowerCase()} tiene` : 'quedan'} ${qtyFmt(Math.max(0, avail), p.unidad)}.${emb && embs.length > 1 && avail > 0 ? ' Si necesitas más, agrega el resto desde otro embarque.' : ''}`
      : p.unidad === 'kg' ? (qty <= 0 ? 'Ingresa los kilos que se lleva' : '') : qty < 1 - 1e-9 ? 'Venta mínima: 1 gamela' : '';
  const err = bad || (kgGam(p) && !Number.isFinite(gamInt(gam)) ? 'Las gamelas deben ser un número entero.' : '');
  const step = (d: number) => setRaw(String(Math.max(0, round2(qty + d))));
  const add = (withPrice = false) => {
    if (err) return;
    const q = p.unidad === 'kg' ? round2(qty) : Math.round(qty), gm = kgGam(p) ? gamInt(gam) || 0 : 0;
    const line: CartLine = { prod: p.id, qty: q, ...(p.envase ? {} : { src }), ...(emb ? { lot: emb.l.id } : {}), ...(gm ? { gam: gm } : {}) };
    const priced = withPrice && !p.envase;
    // con otro precio, la línea entra al carrito solo si se confirma el precio: cancelar no la agrega
    if (!priced) store.setUi((u) => ({ cart: [...u.cart, line] }));
    closeModal();
    if (store.get().view !== 'pos') go('pos');
    if (priced) { openNewLinePriceForm(line); return; }
    toast(`${p.nombre}: quedan ${qtyFmt(posLeft(p.id), p.unidad)} en ${SRC_LBL[src].toLowerCase()}`);
  };
  const unit = p.unidad === 'kg' ? '/kg' : '/gamela';
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>{p.sku}{emb || embs.length < 2 ? ` · ${clp(price)}${unit}` : ''}</p><h2>{p.nombre}</h2>
      {embs.length > 1 && (
        <fieldset className="emb-pick"><legend>¿De qué embarque sale?</legend>
          {embs.map((e) => (
            <label key={e.l.id} className={`emb-opt ${lot === e.l.id ? 'on' : ''} ${e.left <= 1e-9 ? 'out' : ''}`}>
              <input type="radio" name="it_emb" value={e.l.id} checked={lot === e.l.id} disabled={e.left <= 1e-9 && p.unidad !== 'kg'} onChange={() => setLot(e.l.id)} />
              <span className="grow"><b>{embLabel(e.l)}</b><small>{e.left > 1e-9 ? 'Quedan ' + qtyFmt(e.left, p.unidad) : 'Ya está todo en la venta'}</small></span>
              <b className="num">{clp(e.precio)}<small>{unit}</small></b>
            </label>
          ))}
        </fieldset>
      )}
      {!mustPick && <p className="muted" style={{ margin: '2px 0 14px' }}>{emb && embs.length > 1 ? <>Del <b style={{ color: 'var(--ink)' }}>{embName(emb.l).toLowerCase()}</b> quedan</> : <>Stock de <b style={{ color: 'var(--ink)' }}>{SRC_LBL[src].toLowerCase()}</b>: quedan</>} <b id="it_left" style={{ color: 'var(--ink)' }}>{qtyFmt(Math.max(0, avail - qty), p.unidad)}</b> después de esta venta</p>}
      <div className="f"><label id="it_lbl" htmlFor="it_q">{p.unidad === 'gamela' ? 'Gamelas' : 'Kilos'}</label>
        <div className="stepper"><button aria-label="Disminuir cantidad" onClick={() => step(-1)}>−</button>
          <input id="it_q" className="in num" type="text" inputMode="decimal" autoComplete="off" value={raw} onChange={(e) => setRaw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !err) add(); }} />
          <button aria-label="Aumentar cantidad" onClick={() => step(1)}>+</button></div></div>
      <p className="muted" id="it_kg">{p.unidad === 'kg' ? `${kg(qty)} kg × ${clp(price)}${over ? ` · el sistema tenía ${kg(Math.max(0, avail))} kg: se anotan +${kg(over)} kg de ajuste` : ''}` : ''}</p>
      {kgGam(p) && <div className="f"><label htmlFor="it_g">Gamelas que se lleva</label><input id="it_g" className="in num" type="text" inputMode="numeric" autoComplete="off" value={gam} placeholder="0" onChange={(e) => setGam(e.target.value.trim())} /><small className="muted">Aparte de los kilos. Se suman a las gamelas de la venta.</small></div>}
      {p.usaGamela && <p className="muted" id="it_gtxt">{p.unidad === 'gamela' ? `Las gamelas (${clp(gamProd().precio)} c/u) se cobran en la venta, descontando las que traiga el cliente.` : 'Las gamelas que se lleva se cobran en la venta, descontando las que traiga el cliente.'}</p>}
      <div className="total"><span>Subtotal</span><span className="num" id="it_sub">{mustPick ? '—' : clp(lineTotal({ precio: price }, qty))}</span></div>
      <div className="err" id="it_err" role="alert">{err}</div>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button>
        {!p.envase && <button className="btn ghost" id="it_price" disabled={!!err} onClick={() => add(true)}>💲 {isAdmin() ? 'Otro precio' : 'Pedir otro precio'}</button>}
        <button className="btn pri" id="it_ok" disabled={!!err} onClick={() => add()}>Agregar</button></div>
    </>
  );
}
