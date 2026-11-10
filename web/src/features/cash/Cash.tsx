import { useState } from 'react';
import { Head, paginate, Pager } from '../../components/ui';
import { closeModal, openModal } from '../../components/modal';
import { U } from '../../domain/catalog';
import { ctx, isAdmin, me } from '../../domain/ctx';
import { clp, fdt } from '../../domain/format';
import { approveCloseCmd, closeShiftCmd, pendingShift, recoverShortageCmd, shiftSplit } from '../../domain/operations';
import { shortagePending, shortageRecoveries } from '../../domain/balance';
import { pendingAbonoRequests } from '../../domain/requests';
import { saleCard, saleCash, saleTr } from '../../domain/sales';
import { saleCredit } from '../../domain/credits';
import type { Closure } from '../../types/model';
import { useApp } from '../../state/store';
import { exec } from '../../app/actions';

/** Separación de la plata del turno: de lo facturado en consignación, la comisión es ganancia y el resto es del proveedor. */
/** Desglose del turno (consignación, compra directa, gamelas): plegado por defecto para que la tarjeta quede a la altura del historial. */
function SplitRows({ x }: { x: ReturnType<typeof shiftSplit> }) {
  const [open, setOpen] = useState(false);
  if (!x.vendido && !x.consig) return null;
  return (
    <>
      <button type="button" className="fold" aria-expanded={open} aria-controls="split-rows" onClick={() => setOpen(!open)}>
        <span className="chev" aria-hidden="true">›</span><b>Separación de la plata</b><span className="num muted">{clp(x.vendido)} facturado</span>
      </button>
      {open && <div className="rows" id="split-rows">
        <div><div className="grow"><b>Facturado</b><span>todo lo vendido en el turno</span></div><b className="num">{clp(x.vendido)}</b></div>
        {x.consig !== 0 && <>
          <div><div className="grow"><b>Consignación</b><span>facturado del stock de consignación</span></div><b className="num">{clp(x.consig)}</b></div>
          <div><div className="grow"><b>· Ganancia de la bodega</b><span>la comisión</span></div><b className="num" style={{ color: 'var(--g700)' }}>{clp(x.comision)}</b></div>
          <div><div className="grow"><b>· Plata del proveedor</b><span>se le paga en la liquidación</span></div><b className="num" style={{ color: 'var(--warn)' }}>{clp(x.deProductores)}</b></div>
        </>}
        {x.propias !== 0 && <div><div className="grow"><b>Compra directa</b><span>mercadería propia</span></div><b className="num">{clp(x.propias)}</b></div>}
        {x.gamelas !== 0 && <div><div className="grow"><b>Gamelas</b><span>garantía neta</span></div><b className="num">{clp(x.gamelas)}</b></div>}
      </div>}
    </>
  );
}
const splitTxt = (c: Record<string, unknown>) => (c.consig ? `ganancia ${clp(Number(c.comision))} · proveedor ${clp(Number(c.deProductores))}` : '—');

/** Faltante recuperado: lo autoriza el administrador desde el detalle desplegable del cierre; recién ahí se suma de vuelta en el Balance. */
function DiffRecovery({ c }: { c: Closure }) {
  if (c.diferencia >= 0) return null;
  const resta = shortagePending(c), hist = shortageRecoveries(c).map((r) => clp(r.monto) + ' · ' + fdt(r.en) + (r.por ? ' · ' + U(r.por).nombre : '')).join('\n');
  return (
    <>
      {c.recuperado ? <><br /><span className={`pill ${resta ? 'warn' : 'ok'}`} title={hist}>{resta ? `Recuperado ${clp(c.recuperado)} · falta ${clp(resta)}` : `Recuperado ${clp(c.recuperado)}`}</span></> : null}
      {resta > 0 && isAdmin() && <><br /><button className="btn sm ghost" style={{ marginTop: 4 }} onClick={() => openModal(() => <RecoverShortage c={c} />)}>{c.recuperado ? 'Recuperar más' : 'Autorizar recuperación'}</button></>}
    </>
  );
}
function RecoverShortage({ c }: { c: Closure }) {
  const faltante = -c.diferencia, resta = shortagePending(c);
  const [m, setM] = useState(String(resta));
  const save = async () => { if (await exec(() => recoverShortageCmd(c.id, m), 'Recuperación autorizada. Se suma en el Balance.')) closeModal(); };
  return (
    <>
      <h2>Autorizar recuperación de faltante</h2>
      <p className="muted">Cierre de <b>{U(c.vendedor).nombre}</b> del {fdt(c.fecha)} con faltante de <b>{clp(faltante)}</b>{c.recuperado ? <>; ya se recuperaron <b>{clp(c.recuperado)}</b> y faltan <b>{clp(resta)}</b></> : null}. Lo recuperado se suma a los ingresos del Balance en el mes de hoy. Puedes autorizar montos parciales hasta completar el faltante.</p>
      <div className="f"><label htmlFor="rec_m">Monto recuperado</label><input id="rec_m" className="in num" type="number" min="1" max={resta} inputMode="numeric" value={m} onChange={(e) => setM(e.target.value)} /></div>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={() => void save()}>Autorizar</button></div>
    </>
  );
}

export function Cash() {
  useApp();
  const u = me()!;
  const [opening, setOpening] = useState('0'), [dec, setDec] = useState(''), [page, setPage] = useState(1), [openId, setOpenId] = useState('');
  const { mine, refunds, abonos } = pendingShift(u.id);
  const returns = (m: string) => refunds.filter((r) => r.medio === m).reduce((n, r) => n + r.amount, 0);
  const ab = (m: string) => abonos.filter((a) => a.medio === m).reduce((n, a) => n + a.monto, 0);
  const fiado = mine.reduce((a, s) => a + saleCredit(s), 0), cheques = ab('cheque');
  const esp = mine.reduce((a, s) => a + saleCash(s), 0) - returns('efectivo') + ab('efectivo');
  const tr = mine.reduce((a, s) => a + saleTr(s), 0) - returns('transferencia') + ab('transferencia');
  const card = mine.reduce((a, s) => a + saleCard(s), 0) - returns('tarjeta');
  const cl = ctx.S.closures.filter((c) => isAdmin() || c.vendedor === u.id).sort((a, b) => b.fecha - a.fecha), pg = paginate(cl, page, 7); // 7 filas: el historial queda a la altura de «Cerrar mi turno»
  const split = shiftSplit(mine), open = Number(opening) || 0;
  const pend = pendingAbonoRequests().filter((r) => r.user === u.id && r.medio === 'efectivo').reduce((n, r) => n + r.monto, 0);
  const maxDec = esp + open, over = dec !== '' && Number(dec) > maxDec;
  const close = async () => {
    const c = await exec(() => closeShiftCmd(opening, dec), (r) => (r.registrado ? 'Cierre registrado.' : 'Turno cerrado. Luis lo verá para aprobarlo.'));
    if (c) { setOpening('0'); setDec(''); }
  };
  return (
    <>
      <Head t="Cierre de caja" />
      <div className="grid g3 stack eq">
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
          <div className="f" style={{ marginTop: 12 }}><label htmlFor="dec">Efectivo contado en caja</label><input id="dec" className="in num" type="number" min="0" max={maxDec} inputMode="numeric" aria-invalid={over || undefined} aria-describedby="dif" style={{ fontSize: 22, fontWeight: 700 }} value={dec} onChange={(e) => setDec(e.target.value)} /></div>
          {pend > 0 && <p className="err">Tienes {clp(pend)} en pagos de deuda en efectivo esperando a Luis. No se suman a lo esperado hasta que los autorice.</p>}
          {over ? <p id="dif" className="err" role="alert">El efectivo contado no puede ser mayor al esperado ({clp(maxDec)}).</p>
            : <p id="dif" className="muted">{dec !== '' ? 'Diferencia: ' + clp(Number(dec || 0) - open - esp) : 'Diferencia: —'}</p>}
          <button className="btn pri big" disabled={over || !(mine.length || refunds.length || abonos.length)} onClick={() => void close()}>Declarar y cerrar turno</button>
        </div>
        <div className="card span2 fill"><h3>Historial de cierres</h3>
          <div className="scroll"><table className="tbl m-cards"><thead><tr><th>Fecha</th><th>Vendedor</th><th className="right">Esperado</th><th className="right">Declarado</th><th className="right">Diferencia</th><th>Estado</th></tr></thead>
            <tbody>{pg.rows.map((c) => <ClosureRow key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? '' : c.id)} />)}
              {!cl.length && <tr><td colSpan={6} className="empty">Aún no hay cierres</td></tr>}</tbody></table></div>
          <Pager pg={pg} onPage={setPage} label="Páginas de cierres" />
        </div>
      </div>
    </>
  );
}

/** Fila del historial: lo esencial a la vista y el desglose (transferencias, tarjetas, créditos, consignación) al desplegarla. */
function ClosureRow({ c, open, onToggle }: { c: Closure; open: boolean; onToggle: () => void }) {
  const det: [string, React.ReactNode][] = [
    ['Efectivo del turno', clp(c.netoEfectivo ?? c.esperado - (c.apertura || 0))], ['Fondo inicial', clp(c.apertura || 0)], ['Transferencias', clp(c.transf)], ['Tarjetas', clp(c.tarjeta || 0)],
    ['Pagos de crédito', clp(c.abonosTotal || 0) + (c.cheques ? ` (${clp(c.cheques)} cheque)` : '')], ['Vendido a crédito', clp(c.fiado || 0)], ['Consignación', splitTxt(c) || '—'],
  ];
  return (
    <>
      <tr className="click" aria-expanded={open} tabIndex={0} onClick={onToggle} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onToggle(); } }}>
        <td className="when"><span className="chev" aria-hidden="true">›</span> {fdt(c.fecha)}<span className="sr-only">{open ? ', ocultar detalle' : ', ver detalle'}</span></td><td className="nowrap">{U(c.vendedor).nombre}<br /><small className="muted">{c.turno}</small></td>
        <td className="right num">{clp(c.esperado)}</td><td className="right num">{clp(c.declarado)}</td>
        <td className="right num" style={{ color: c.diferencia ? 'var(--bad)' : 'var(--g700)' }}><b>{clp(c.diferencia)}</b>{shortagePending(c) > 0 && <><br /><span className="pill warn" style={{ marginTop: 4 }}>por recuperar</span></>}</td>
        <td onClick={(e) => e.stopPropagation()}>{c.registrado ? <span className="pill mute">Registrado</span> : c.aprobado ? <span className="pill ok">Aprobado · {U(c.aprobado).nombre}</span> : isAdmin() ? <button className="btn sm pri" onClick={() => void exec(() => approveCloseCmd(c.id))}>Aprobar</button> : <span className="pill warn">Pendiente</span>}</td>
      </tr>
      {open && <tr className="detail"><td colSpan={6}><div className="detail-grid">{det.map(([k, v]) => <div key={k}>{k}<b>{v}</b></div>)}</div>
        {c.diferencia < 0 && <div className="detail-recovery"><span>Faltante de <b>{clp(-c.diferencia)}</b></span><DiffRecovery c={c} /></div>}</td></tr>}
    </>
  );
}
