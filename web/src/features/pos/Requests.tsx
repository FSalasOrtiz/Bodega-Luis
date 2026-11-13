import { useState } from 'react';
import { closeModal, openModal } from '../../components/modal';
import { toast } from '../../components/toast';
import { comBase, P } from '../../domain/catalog';
import { isAdmin } from '../../domain/ctx';
import { clp, decIn, pctTxt, qtyFmt } from '../../domain/format';
import { cartBasePrice, cartHasConsig, cartPrice, requestCreditCmd, requestPriceCmd, saveComCmd } from '../../domain/pos';
import { store } from '../../state/store';
import { exec } from '../../app/actions';
import type { CartLine } from '../../types/model';

export async function requestCredit(): Promise<void> {
  const id = await exec(() => requestCreditCmd(), 'Solicitud enviada. Espera la respuesta de Luis.');
  if (id) store.setUi({ creditReq: id });
}

/** Precio especial por una sola venta: el admin lo aplica; el vendedor lo pide a Luis. */
export function openPriceForm(i: number): void {
  const c = store.get().ui.cart[i];
  if (!c || P(c.prod).envase) return;
  openModal(() => <PriceForm i={i} />);
}
/**
 * Precio especial para una línea que todavía no está en el carrito (desde la ventana de cantidad).
 * La línea entra al carrito solo al aplicar el precio o enviar la solicitud; si se cancela, no se agrega.
 */
export function openNewLinePriceForm(line: CartLine): void {
  if (P(line.prod).envase) return;
  openModal(() => <PriceForm draft={line} />);
}
function PriceForm({ i = -1, draft }: { i?: number; draft?: CartLine }) {
  const c = draft ?? store.get().ui.cart[i], p = P(c.prod), u = p.unidad === 'kg' ? 'kg' : 'gamela', cur = cartPrice(c), normal = cartBasePrice(c);
  const [raw, setRaw] = useState(cur !== normal ? String(cur) : '');
  const v = parseInt(raw.replace(/\D/g, '')) || 0;
  // línea nueva: se agrega con el cambio; línea existente: se modifica en su lugar
  const apply = (ch: Partial<CartLine>) => store.setUi((s) => ({ cart: draft ? [...s.cart, { ...draft, ...ch }] : s.cart.map((x, j) => (j === i ? { ...x, ...ch } : x)) }));
  const save = async (reset = false) => {
    if (isAdmin() && reset) { apply({ precioAdmin: undefined }); closeModal(); return; }
    if (!(v > 0)) return toast('Ingresa el nuevo precio.');
    if (v === normal) return toast('Es el mismo precio normal.');
    if (isAdmin()) { apply({ precioAdmin: v }); closeModal(); toast('Precio especial aplicado solo a esta venta.'); return; }
    const id = await exec(() => requestPriceCmd(c, v), 'Solicitud enviada. Espera la respuesta de Luis.');
    if (id) { apply({ priceReq: id }); closeModal(); }
  };
  return (
    <>
      <h2>Cambiar precio</h2>
      <p className="muted">{p.nombre} · {qtyFmt(c.qty, p.unidad)}. Precio normal {clp(normal)} por {u}. Solo vale para esta venta.</p>
      <div className="f"><label htmlFor="pe-precio">Nuevo precio por {u}</label>
        <input id="pe-precio" className="in num" type="text" inputMode="numeric" autoComplete="off" autoFocus value={raw} onChange={(e) => setRaw(e.target.value)} />
        <small className="muted" id="pe-total">{v ? `Total de la línea: ${clp(Math.round(c.qty * v))} (normal ${clp(Math.round(c.qty * normal))})` : ''}</small></div>
      {!isAdmin() && <p className="muted">Luis recibe el aviso y la venta queda en espera hasta que responda.</p>}
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button>
        {isAdmin() && c.precioAdmin && <button className="btn ghost" onClick={() => void save(true)}>Volver al precio normal</button>}
        <button className="btn pri" onClick={() => void save()}>{isAdmin() ? 'Aplicar precio' : 'Pedir autorización a Luis'}</button></div>
    </>
  );
}

/** Comisión de consignación: el admin la cambia y queda fija; un vendedor la pide a Luis y solo vale para esa venta. */
export function openComForm(): void {
  if (!cartHasConsig()) return;
  openModal(() => <ComForm />);
}
function ComForm() {
  const [raw, setRaw] = useState('');
  const save = async () => {
    const t = raw.trim(), v = Number(decIn(t));
    if (!t || !(Number.isFinite(v) && v >= 0 && v <= 100)) return toast('La comisión debe estar entre 0 y 100%.');
    if (v === comBase()) return toast('Es la misma comisión de ahora.');
    const admin = isAdmin();
    const r = await exec(() => saveComCmd(v), admin ? 'Comisión fijada en ' + pctTxt(v) + '.' : 'Solicitud enviada. Espera la respuesta de Luis.');
    if (r === undefined) return;
    if (r) store.setUi({ comReq: r });
    closeModal();
  };
  return (
    <>
      <h2>{isAdmin() ? 'Cambiar comisión' : 'Pedir otra comisión'}</h2>
      <p className="muted">Comisión actual: {pctTxt(comBase())}. {isAdmin() ? 'El nuevo % se aplica a esta venta y queda fijo para las siguientes.' : 'Si Luis lo autoriza, vale solo para esta venta.'}</p>
      <div className="f"><label htmlFor="com-pct">Nuevo %</label><input id="com-pct" className="in num" type="text" inputMode="decimal" autoComplete="off" autoFocus value={raw} onChange={(e) => setRaw(e.target.value)} /></div>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={() => void save()}>{isAdmin() ? 'Guardar' : 'Pedir autorización a Luis'}</button></div>
    </>
  );
}
