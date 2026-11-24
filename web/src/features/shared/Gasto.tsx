import { useState } from 'react';
import { Seg } from '../../components/ui';
import { closeModal, openModal } from '../../components/modal';
import { isAdmin } from '../../domain/ctx';
import { today } from '../../domain/format';
import { FIX_CATS, GAMELA_CAT, VAR_CATS } from '../../domain/balance';
import { saveGastoCmd, type GastoInput } from '../../domain/operations';
import { exec } from '../../app/actions';

/**
 * Agregar gasto. Lo usan todos los perfiles:
 * - el vendedor registra un gasto variable de hoy pagado con el efectivo de su caja (se descuenta en su cierre);
 * - el administrador además registra gastos fijos y gastos con otra fecha o que no salieron de la caja.
 * `fromCash`: abierto desde el cierre de caja (por defecto «pagado con la caja»).
 */
export function openGasto(onSaved?: (monthKey: string) => void, fromCash = false): void { openModal(() => <Gasto onSaved={onSaved} fromCash={fromCash} />); }

function Gasto({ onSaved, fromCash }: { onSaved?: (mk: string) => void; fromCash: boolean }) {
  const admin = isAdmin();
  const [g, setG] = useState<GastoInput>({ tipo: 'variable', cat: VAR_CATS[0], fecha: today(), monto: '', desc: '', qty: '', deCaja: !admin || fromCash });
  const fijo = admin && g.tipo === 'fijo', cats = fijo ? FIX_CATS : VAR_CATS, cat = cats.includes(g.cat) ? g.cat : cats[0], gam = !fijo && cat === GAMELA_CAT;
  const deCaja = !fijo && (!admin || !!g.deCaja);
  const set = (p: Partial<GastoInput>) => setG((x) => ({ ...x, ...p }));
  const save = async () => {
    const mk = await exec(() => saveGastoCmd({ ...g, tipo: fijo ? 'fijo' : 'variable', cat, deCaja }), deCaja ? 'Gasto registrado · se descuenta del efectivo de tu caja' : 'Gasto registrado');
    if (mk) { onSaved?.(mk); closeModal(); }
  };
  return (
    <>
      <h2>Agregar gasto</h2>
      <p className="muted">{fijo ? 'Se repetirá todos los meses desde este mes, hasta que lo desactives.' : deCaja ? 'Se pagó con el efectivo de la caja: se descuenta de lo esperado en tu cierre de caja.' : 'Se registra solo en el mes de la fecha.'}</p>
      {admin && <div className="f"><Seg value={fijo ? 'fijo' : 'variable'} options={[['variable', 'Variable'], ['fijo', 'Fijo mensual']]} onChange={(t) => set({ tipo: t })} label="Tipo de gasto" /></div>}
      <div className="row"><div className="f"><label htmlFor="g_c">Categoría</label><select id="g_c" className="in" value={cat} onChange={(e) => set({ cat: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select></div>
        {admin && !fijo && !deCaja && <div className="f"><label htmlFor="g_f">Fecha</label><input id="g_f" className="in" type="date" value={g.fecha} max={today()} onChange={(e) => set({ fecha: e.target.value })} /></div>}</div>
      {gam && <div className="f"><label htmlFor="g_q">Cantidad de gamelas compradas</label><input id="g_q" className="in num" type="number" inputMode="numeric" value={g.qty} onChange={(e) => set({ qty: e.target.value })} /><small className="muted">Se suman al stock de gamelas para vender.</small></div>}
      <div className="row"><div className="f"><label htmlFor="g_m">Monto total</label><input id="g_m" className="in num" type="number" inputMode="numeric" value={g.monto} onChange={(e) => set({ monto: e.target.value })} /></div>
        <div className="f"><label htmlFor="g_d">Descripción</label><input id="g_d" className="in" value={g.desc} onChange={(e) => set({ desc: e.target.value })} placeholder={fijo ? 'Ej: sueldo Gonzalo' : 'Ej: desayuno'} /></div></div>
      {admin && !fijo && <label className="f" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={deCaja} onChange={(e) => set({ deCaja: e.target.checked })} /> Se pagó con el efectivo de mi caja (hoy)</label>}
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={() => void save()}>Guardar</button></div>
    </>
  );
}
