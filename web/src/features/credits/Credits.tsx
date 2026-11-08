import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Head } from '../../components/ui';
import { closeModal, openModal } from '../../components/modal';
import { toast } from '../../components/toast';
import { CL, lineName, U } from '../../domain/catalog';
import { ctx, isAdmin, me } from '../../domain/ctx';
import { abonoAvailable, creditBalance, creditPayments, creditSales, creditTotal, debtors, liveClients, saleCredit } from '../../domain/credits';
import { clp, dayKey, fdt, ftime, qtyFmt, today } from '../../domain/format';
import { deleteClientCmd, saveClientCmd } from '../../domain/operations';
import { cancelAbonoRequestCmd, saveAbonoCmd } from '../../domain/pos';
import { receiptPayment } from '../../domain/receipts';
import { useApp } from '../../state/store';
import { exec, go } from '../../app/actions';

/** Tarjeta "Créditos por cobrar" del Dashboard. */
export function CreditCard() {
  const t = creditTotal(), n = debtors().length;
  return (
    <button type="button" className="card credit-card" onClick={() => go('credits')}>
      <span className="lbl"><Icon n="coin" s={18} /> Créditos por cobrar</span><span className="val num">{clp(t)}</span>
      <span className="sub">{n ? `${n} cliente${n > 1 ? 's' : ''} te debe${n > 1 ? 'n' : ''} · toca para ir a Créditos` : 'Nadie te debe'}</span>
    </button>
  );
}

function DebtorRows() {
  const d = debtors();
  if (!d.length) return <div className="empty">Nadie te debe en este momento.</div>;
  return <>{d.map((c) => (
    <div key={c.id} className="click" role="button" tabIndex={0} onClick={() => openCreditDetail(c.id)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openCreditDetail(c.id); }}>
      <span className="avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{c.nombre[0]}</span>
      <div className="grow"><b>{c.nombre}</b><span>{creditSales(c.id).length} compras a crédito</span></div>
      <b className="num credit-owed">{clp(c.saldo)}</b>
      <button type="button" className="btn sm pri" onClick={(e) => { e.stopPropagation(); openAbonoForm(c.id); }}>Pagar</button>
    </div>
  ))}</>;
}

export function Credits() {
  useApp();
  const all = liveClients().map((c) => ({ ...c, saldo: creditBalance(c.id) })), aldia = all.filter((c) => c.saldo <= 0).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return (
    <>
      <Head t="Créditos" acts={isAdmin() && <button className="btn pri" onClick={() => openEditClient('')}><Icon n="plus" s={18} />Nuevo cliente</button>} />
      <div className="grid g3 stack">
        <div className="card kpi hero"><div className="lbl">Total por cobrar</div><div className="val num">{clp(creditTotal())}</div><div className="sub">{debtors().length} clientes con deuda</div></div>
        <div className="card span2"><h3>Me deben</h3><div className="rows"><DebtorRows /></div></div>
      </div>
      {!isAdmin() && <MyAbonoRequests />}
      <div className="card" style={{ marginTop: 14 }}><h3>Al día</h3>
        <div className="rows">{aldia.map((c) => (
          <div key={c.id} className="click" role="button" tabIndex={0} onClick={() => openCreditDetail(c.id)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openCreditDetail(c.id); }}>
            <div className="grow"><b>{c.nombre}</b><span>{c.activo === false ? 'Inactivo' : 'Sin deuda'}</span></div><span className="pill ok">Al día</span>
            {isAdmin() && <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); deleteClient(c.id); }} aria-label={`Borrar a ${c.nombre}`}>🗑️ Borrar</button>}
          </div>
        ))}{!aldia.length && <div className="muted">Todos los clientes tienen saldo pendiente.</div>}</div>
      </div>
    </>
  );
}

/** El vendedor ve sus pagos esperando a Luis y los que Luis respondió hoy. */
function MyAbonoRequests() {
  const rs = (ctx.S.abonoRequests || []).filter((r) => r.user === me()!.id && (r.estado === 'pendiente' || (['aprobada', 'rechazada'].includes(r.estado) && dayKey(r.resueltoEn || 0) === today()))).sort((a, b) => b.fecha - a.fecha);
  if (!rs.length) return null;
  return (
    <div className="card" style={{ marginTop: 14 }}><h3>Mis pagos de deuda</h3>
      <div className="rows">{rs.map((r) => (
        <div key={r.id} style={{ flexWrap: 'wrap', gap: '8px 12px' }}><div className="grow"><b>{CL(r.cliente).nombre} · {clp(r.monto)}</b><span>{receiptPayment(r.medio)} · {ftime(r.fecha)}</span></div>
          {r.estado === 'pendiente' ? <><span className="pill warn">Esperando a Luis</span><button className="btn sm ghost" onClick={() => void exec(() => cancelAbonoRequestCmd(r.id), 'Solicitud cancelada.')}>Cancelar</button></>
            : r.estado === 'aprobada' ? <span className="pill ok">Autorizado · entra a tu caja</span> : <span className="pill bad">Luis lo rechazó</span>}
        </div>
      ))}</div>
    </div>
  );
}

export function openCreditDetail(id: string): void { openModal(() => <CreditDetail id={id} />, { wide: true }); }
function CreditDetail({ id }: { id: string }) {
  const c = CL(id), saldo = creditBalance(id), espera = saldo - abonoAvailable(id);
  const cc = c as { rut?: string; fono?: string };
  const mov = [
    ...creditSales(id).map((s) => ({ k: s.id, f: s.fecha, t: `Venta N° ${s.num}: ${s.lineas.map((l) => `${qtyFmt(l.qty, l.unidad)} ${lineName(l)}`).join(', ')}`, cargo: saleCredit(s), abono: 0, u: s.vendedor })),
    ...creditPayments(id).map((a) => ({ k: a.id, f: a.fecha, t: `Pago en ${receiptPayment(a.medio).toLowerCase()}${a.ref ? ' · ' + a.ref : ''}`, cargo: 0, abono: a.monto, u: a.user })),
  ].sort((a, b) => b.f - a.f);
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>Cuenta de crédito</p><h2>{c.nombre}</h2>{(cc.rut || cc.fono) && <p className="muted">{[cc.rut, cc.fono].filter(Boolean).join(' · ')}</p>}
      <div className="total"><span>Debe</span><span className="num" style={{ color: saldo > 0 ? 'var(--bad)' : 'var(--g700)' }}>{clp(Math.max(0, saldo))}</span></div>
      {espera > 0 && <p><span className="pill warn">Pagos esperando a Luis: {clp(espera)}</span></p>}
      <div className="scroll"><table className="tbl"><thead><tr><th>Fecha</th><th>Detalle</th><th className="right">Crédito</th><th className="right">Pagó</th></tr></thead>
        <tbody>{mov.map((m) => <tr key={m.k}><td>{fdt(m.f)}</td><td>{m.t}<br /><small className="muted">{U(m.u).nombre}</small></td><td className="right num">{m.cargo ? clp(m.cargo) : ''}</td><td className="right num" style={{ color: 'var(--g700)' }}>{m.abono ? clp(m.abono) : ''}</td></tr>)}
          {!mov.length && <tr><td colSpan={4} className="empty">Sin movimientos</td></tr>}</tbody></table></div>
      <div className="acts">
        {isAdmin() && saldo <= 0 && <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={() => deleteClient(id)}>🗑️ Borrar cliente</button>}
        {isAdmin() && <button className="btn ghost" onClick={() => openEditClient(id)}>Editar cliente</button>}
        <button className="btn ghost" onClick={closeModal}>Cerrar</button>
        {saldo > 0 && <button className="btn pri" onClick={() => openAbonoForm(id)}>Pagar deuda</button>}
      </div>
    </>
  );
}

export function openAbonoForm(id: string): void {
  const c = CL(id), saldo = abonoAvailable(id);
  if (creditBalance(id) <= 0) { toast(`${c.nombre} no tiene deuda.`); return; }
  if (saldo <= 0) { toast(`Ya hay pagos de ${c.nombre} esperando a Luis por toda la deuda.`); return; }
  openModal(() => <AbonoForm id={id} />);
}
function AbonoForm({ id }: { id: string }) {
  const c = CL(id), saldo = abonoAvailable(id);
  const [all, setAll] = useState(true), [raw, setRaw] = useState(String(saldo)), [medio, setMedio] = useState('efectivo');
  const m = Number(raw.replace(/\D/g, '')) || 0;
  const left = m > saldo ? `Supera la deuda (${clp(saldo)}).` : m === saldo ? 'Queda saldada la deuda.' : m ? `Queda debiendo ${clp(saldo - m)}.` : 'Ingresa cuánto paga.';
  const mode = (t: boolean) => { setAll(t); setRaw(t ? String(saldo) : ''); if (!t) setTimeout(() => document.getElementById('ab-monto')?.focus(), 0); };
  const save = async () => {
    const r = await exec(() => saveAbonoCmd(id, Number(raw.replace(/\D/g, '')), medio));
    if (r === 'solicitud') { closeModal(); toast('Pago enviado. Espera la autorización de Luis.'); }
    else if (r === 'pago') { openCreditDetail(id); toast(creditBalance(id) <= 0 ? `Deuda de ${CL(id).nombre} saldada.` : `Pago registrado. Queda debiendo ${clp(creditBalance(id))}.`); }
  };
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>{c.nombre} debe {clp(saldo)}</p><h2>Pagar deuda</h2>
      <div className="seg" role="group" aria-label="Cuánto paga"><button type="button" className={all ? 'on' : ''} aria-pressed={all} id="ab-todo" onClick={() => mode(true)}>Paga todo</button><button type="button" className={!all ? 'on' : ''} aria-pressed={!all} id="ab-parte" onClick={() => mode(false)}>Paga una parte</button></div>
      <div className="f"><label htmlFor="ab-monto">Monto que paga</label><input id="ab-monto" className="in num" type="text" inputMode="numeric" autoComplete="off" value={raw} onChange={(e) => setRaw(e.target.value)} /><small className="muted" id="ab-left">{left}</small></div>
      <div className="f"><label htmlFor="ab-medio">Cómo paga</label><select id="ab-medio" className="in" value={medio} onChange={(e) => setMedio(e.target.value)}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="cheque">Cheque</option></select></div>
      <p className="muted">{isAdmin() ? 'El pago entra a tu caja de hoy y se descuenta de la deuda.' : 'Luis tiene que autorizar el pago. Cuando lo autorice, se descuenta de la deuda y entra a tu caja.'}</p>
      <div className="acts"><button className="btn ghost" onClick={() => openCreditDetail(id)}>Ver detalle</button><button className="btn pri" onClick={() => void save()}>{isAdmin() ? 'Registrar pago' : 'Pedir autorización a Luis'}</button></div>
    </>
  );
}

export function openEditClient(id: string): void {
  if (!isAdmin()) { toast('Solo Luis crea clientes de crédito.'); return; }
  openModal(() => <EditClient id={id} />);
}
function EditClient({ id }: { id: string }) {
  const c = id ? (CL(id) as { nombre: string; rut?: string; fono?: string; activo?: boolean }) : { nombre: '', rut: '', fono: '', activo: true };
  const [n, setN] = useState(c.nombre), [r, setR] = useState(c.rut || ''), [f, setF] = useState(c.fono || ''), [a, setA] = useState(c.activo !== false);
  const save = async () => { if (await exec(() => saveClientCmd(id, n, r, f, id ? a : undefined), 'Cliente guardado.')) closeModal(); };
  return (
    <>
      <h2>{id ? 'Editar' : 'Nuevo'} cliente de crédito</h2>
      <div className="f"><label htmlFor="cl-n">Nombre</label><input id="cl-n" className="in" maxLength={60} value={n} placeholder="Ej: Sergio" onChange={(e) => setN(e.target.value)} autoFocus /></div>
      <div className="row"><div className="f"><label htmlFor="cl-r">RUT (opcional)</label><input id="cl-r" className="in" maxLength={12} value={r} onChange={(e) => setR(e.target.value)} /></div>
        <div className="f"><label htmlFor="cl-f">Teléfono (opcional)</label><input id="cl-f" className="in" type="tel" maxLength={20} value={f} onChange={(e) => setF(e.target.value)} /></div></div>
      {id && <label className="f" style={{ flexDirection: 'row', alignItems: 'center' }}><input id="cl-a" type="checkbox" checked={a} onChange={(e) => setA(e.target.checked)} /> Activo (se le puede dar crédito)</label>}
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={() => void save()}>Guardar</button></div>
    </>
  );
}

/** Borrar cliente: solo si no debe nada. Se oculta para que las ventas antiguas sigan mostrando su nombre. */
function deleteClient(id: string): void {
  if (!isAdmin()) { toast('Solo Luis puede borrar clientes.'); return; }
  const c = CL(id), saldo = creditBalance(id);
  if (saldo > 0) { toast(`${c.nombre} debe ${clp(saldo)}. Primero tiene que pagar su deuda.`); return; }
  openModal(() => (
    <>
      <h2>¿Borrar a {c.nombre}?</h2><p className="muted">Deja de aparecer en Créditos y en el punto de venta. Sus ventas anteriores no cambian.</p>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn bad" onClick={async () => { if (await exec(() => deleteClientCmd(id), 'Cliente borrado') !== undefined) closeModal(); }}>Borrar</button></div>
    </>
  ));
}
