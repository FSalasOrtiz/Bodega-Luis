import { useState } from 'react';
import { Head } from '../../components/ui';
import { U } from '../../domain/catalog';
import { ctx, isAdmin, me } from '../../domain/ctx';
import { clp, fdt } from '../../domain/format';
import { approveCloseCmd, closeShiftCmd, pendingShift, shiftSplit } from '../../domain/operations';
import { pendingAbonoRequests } from '../../domain/requests';
import { saleCard, saleCash, saleTr } from '../../domain/sales';
import { saleCredit } from '../../domain/credits';
import { useApp } from '../../state/store';
import { exec } from '../../app/actions';

/** Separación de la plata del turno: de lo facturado en consignación, la comisión es ganancia y el resto es del proveedor. */
function SplitRows({ x }: { x: ReturnType<typeof shiftSplit> }) {
  if (!x.vendido && !x.consig) return null;
  return (
    <>
      <h4 className="exp-group" style={{ marginTop: 14 }}>Separación de la plata</h4>
      <div className="rows">
        <div><div className="grow"><b>Facturado</b><span>todo lo vendido en el turno</span></div><b className="num">{clp(x.vendido)}</b></div>
        {x.consig !== 0 && <>
          <div><div className="grow"><b>Consignación</b><span>facturado del stock de consignación</span></div><b className="num">{clp(x.consig)}</b></div>
          <div><div className="grow"><b>· Ganancia de la bodega</b><span>la comisión</span></div><b className="num" style={{ color: 'var(--g700)' }}>{clp(x.comision)}</b></div>
          <div><div className="grow"><b>· Plata del proveedor</b><span>se le paga en la liquidación</span></div><b className="num" style={{ color: 'var(--warn)' }}>{clp(x.deProductores)}</b></div>
        </>}
        {x.propias !== 0 && <div><div className="grow"><b>Compra directa</b><span>mercadería propia</span></div><b className="num">{clp(x.propias)}</b></div>}
        {x.gamelas !== 0 && <div><div className="grow"><b>Gamelas</b><span>garantía neta</span></div><b className="num">{clp(x.gamelas)}</b></div>}
      </div>
    </>
  );
}
const splitTxt = (c: Record<string, unknown>) => (c.consig ? `ganancia ${clp(Number(c.comision))} · proveedor ${clp(Number(c.deProductores))}` : '—');

export function Cash() {
  useApp();
  const u = me()!;
  const [opening, setOpening] = useState('0'), [dec, setDec] = useState('');
  const { mine, refunds, abonos } = pendingShift(u.id);
  const returns = (m: string) => refunds.filter((r) => r.medio === m).reduce((n, r) => n + r.amount, 0);
  const ab = (m: string) => abonos.filter((a) => a.medio === m).reduce((n, a) => n + a.monto, 0);
  const fiado = mine.reduce((a, s) => a + saleCredit(s), 0), cheques = ab('cheque');
  const esp = mine.reduce((a, s) => a + saleCash(s), 0) - returns('efectivo') + ab('efectivo');
  const tr = mine.reduce((a, s) => a + saleTr(s), 0) - returns('transferencia') + ab('transferencia');
  const card = mine.reduce((a, s) => a + saleCard(s), 0) - returns('tarjeta');
  const cl = ctx.S.closures.filter((c) => isAdmin() || c.vendedor === u.id).sort((a, b) => b.fecha - a.fecha);
  const split = shiftSplit(mine), open = Number(opening) || 0;
  const pend = pendingAbonoRequests().filter((r) => r.user === u.id && r.medio === 'efectivo').reduce((n, r) => n + r.monto, 0);
  const close = async () => {
    const c = await exec(() => closeShiftCmd(opening, dec), (r) => (r.registrado ? 'Cierre registrado.' : 'Turno cerrado. Luis lo verá para aprobarlo.'));
    if (c) { setOpening('0'); setDec(''); }
  };
  return (
    <>
      <Head t="Cierre de caja" />
      <div className="grid g3 stack">
        <div className="card"><h3>Cerrar mi turno</h3>
          <div className="rows">
            <div><div className="grow"><b>Ventas sin cerrar</b></div><b>{mine.length}</b></div>
            <div><div className="grow"><b>Devoluciones de dinero</b></div><b>{refunds.length}</b></div>
            <div><div className="grow"><b>Efectivo esperado</b></div><b className="num" id="closing-expected">{clp(esp + open)}</b></div>
            <div><div className="grow"><b>Transferencias</b></div><b className="num">{clp(tr)}</b></div>
            <div><div className="grow"><b>Tarjetas</b></div><b className="num">{clp(card)}</b></div>
            <div><div className="grow"><b>Cheques recibidos</b><span>abonos de crédito</span></div><b className="num">{clp(cheques)}</b></div>
            <div><div className="grow"><b>Abonos de crédito</b><span>{abonos.length} abonos · ya sumados arriba</span></div><b className="num">{clp(abonos.reduce((n, a) => n + a.monto, 0))}</b></div>
            <div><div className="grow"><b>Vendido a crédito</b><span>no entra a la caja</span></div><b className="num" style={{ color: 'var(--warn)' }}>{clp(fiado)}</b></div>
          </div>
          <SplitRows x={split} />
          <div className="f" style={{ marginTop: 12 }}><label htmlFor="opening">Fondo inicial / efectivo recibido del turno anterior</label><input id="opening" className="in num" type="number" min="0" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} /></div>
          <div className="f" style={{ marginTop: 12 }}><label htmlFor="dec">Efectivo contado en caja</label><input id="dec" className="in num" type="number" inputMode="numeric" style={{ fontSize: 22, fontWeight: 700 }} value={dec} onChange={(e) => setDec(e.target.value)} /></div>
          {pend > 0 && <p className="err">Tienes {clp(pend)} en pagos de deuda en efectivo esperando a Luis. No se suman a lo esperado hasta que los autorice.</p>}
          <p id="dif" className="muted">{dec !== '' ? 'Diferencia: ' + clp(Number(dec || 0) - open - esp) : 'Diferencia: —'}</p>
          <button className="btn pri big" disabled={!(mine.length || refunds.length || abonos.length)} onClick={() => void close()}>Declarar y cerrar turno</button>
        </div>
        <div className="card span2"><h3>Historial de cierres</h3>
          <div className="scroll"><table className="tbl"><thead><tr><th>Fecha</th><th>Vendedor</th><th className="right">Esperado</th><th className="right">Declarado</th><th className="right">Transf.</th><th className="right">Tarjetas</th><th className="right">Pagos de crédito</th><th className="right">Crédito</th><th>Consignación</th><th className="right">Diferencia</th><th>Estado</th></tr></thead>
            <tbody>{cl.map((c) => (
              <tr key={c.id}><td>{fdt(c.fecha)}</td><td>{U(c.vendedor).nombre} <small className="muted">{c.turno}</small></td><td className="right num">{clp(c.esperado)}</td><td className="right num">{clp(c.declarado)}</td><td className="right num">{clp(c.transf)}</td><td className="right num">{clp(c.tarjeta || 0)}</td>
                <td className="right num">{clp(c.abonosTotal || 0)}{c.cheques ? <><br /><small className="muted">{clp(c.cheques)} cheque</small></> : null}</td><td className="right num">{clp(c.fiado || 0)}</td>
                <td className="muted" style={{ fontSize: 12 }}>{splitTxt(c)}</td><td className="right num" style={{ color: c.diferencia ? 'var(--bad)' : 'var(--g700)' }}><b>{clp(c.diferencia)}</b></td>
                <td>{c.registrado ? <span className="pill mute">Registrado</span> : c.aprobado ? <span className="pill ok">Aprobado · {U(c.aprobado).nombre}</span> : isAdmin() ? <button className="btn sm pri" onClick={() => void exec(() => approveCloseCmd(c.id))}>Aprobar</button> : <span className="pill warn">Pendiente</span>}</td></tr>
            ))}{!cl.length && <tr><td colSpan={11} className="empty">Aún no hay cierres</td></tr>}</tbody></table></div>
        </div>
      </div>
    </>
  );
}
