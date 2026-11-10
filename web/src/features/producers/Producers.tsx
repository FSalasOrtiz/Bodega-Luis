import { useState } from 'react';
import { Icon, Logo } from '../../components/icons';
import { Head, ItemList, paginate, Pager } from '../../components/ui';
import { closeModal, openModal } from '../../components/modal';
import { toast } from '../../components/toast';
import { P, PR } from '../../domain/catalog';
import { ctx, isAdmin } from '../../domain/ctx';
import { clp, fdate, fdt, qtyFmt } from '../../domain/format';
import { liqCalc, liqPctTxt, producerAccount } from '../../domain/producers';
import { payLiqCmd, saveLiqCmd } from '../../domain/operations';
import { lotSrc } from '../../domain/stock';
import { useApp } from '../../state/store';
import { exec } from '../../app/actions';
import { openProducerForm } from './ProducerForm';
import { openRecDoc } from '../reception/Reception';

export function Producers() {
  useApp();
  const S = ctx.S;
  const [sel, setSel] = useState(''), [desde, setDesde] = useState(''), [hasta, setHasta] = useState(''), [page, setPage] = useState(1), [q, setQ] = useState('');
  const prod = S.producers.some((p) => p.id === sel) ? sel : S.producers[0]?.id || '';
  const pick = (id: string) => { setSel(id); setDesde(''); setHasta(''); };
  const needle = q.trim().toLowerCase(), pg = paginate(S.producers.filter((p) => !needle || p.nombre.toLowerCase().includes(needle) || (p.rut || '').includes(needle)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), page);
  return (
    <>
      <Head t="Productores" acts={<button className="btn pri" onClick={() => openProducerForm('', pick)}><Icon n="plus" s={18} />Nuevo productor</button>} />
      <div className="grid g3 stack">
        <div className="card"><h3>Productores y proveedores</h3>
          <input className="in" style={{ marginBottom: 8 }} placeholder="Buscar nombre o RUT" aria-label="Buscar productor" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <div className="rows">{pg.rows.map((p) => {
            const d = producerAccount(p.id).debe;
            return (
              <div key={p.id} className={`click ${prod === p.id ? 'row-sel' : ''}`} role="button" tabIndex={0} aria-label={`Ver ficha de ${p.nombre}`} aria-pressed={prod === p.id} onClick={() => pick(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') pick(p.id); }}>
                <span className="ico p">{p.nombre[0]}</span><div className="grow"><b>{p.nombre}</b><span>{p.fono || 'Sin teléfono'}</span></div>
                {d > 0 && <b className="num" style={{ color: 'var(--warn)' }}>Le debes {clp(d)}</b>}
              </div>
            );
          })}{!pg.total && <div className="empty">{S.producers.length ? 'Sin resultados' : 'Aún no hay productores'}</div>}</div>
          <Pager pg={pg} onPage={setPage} label="Páginas de productores" />
        </div>
        <div className="card span2">{prod ? <ProducerSheet key={prod} id={prod} desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} /> : <div className="empty">Crea un productor para empezar</div>}</div>
      </div>
    </>
  );
}

function ProducerSheet({ id, desde, hasta, setDesde, setHasta }: { id: string; desde: string; hasta: string; setDesde: (v: string) => void; setHasta: (v: string) => void }) {
  const [recPage, setRecPage] = useState(1), [liqPage, setLiqPage] = useState(1), [tab, setTab] = useState<'rec' | 'cons' | 'liq'>('rec');
  const S = ctx.S, pr = PR(id) as { nombre: string; rut?: string; fono?: string };
  const recs = S.receptions.filter((r) => r.productor === id).sort((a, b) => b.fecha - a.fecha);
  const compra = recs.filter((r) => !r.anulada && r.modalidad === 'compra').reduce((a, r) => a + r.lineas.reduce((n, l) => n + l.qty * l.costo, 0), 0);
  const consig = recs.some((r) => r.modalidad === 'consignación') || S.lots.some((l) => l.productor === id && lotSrc(l) === 'consig');
  const L = consig ? liqCalc(id, desde, hasta) : null, liqs = S.liqs.filter((l) => l.prod === id).slice().reverse(), A = consig ? producerAccount(id) : null;
  const recPg = paginate(recs, recPage), liqPg = paginate(liqs, liqPage);
  const tabs: ['rec' | 'cons' | 'liq', string][] = [['rec', `Recepciones (${recs.length})`], ...(consig ? [['cons', 'Consignación'] as ['cons', string]] : []), ['liq', `Liquidaciones (${liqs.length})`]];
  const gen = async () => { const lid = await exec(() => saveLiqCmd(id, desde, hasta)); if (lid) openLiqDoc(lid); };
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div><h3 style={{ margin: 0 }}>{pr.nombre}</h3><p className="muted" style={{ margin: '4px 0 0' }}>{[pr.fono || 'Sin teléfono', pr.rut].filter(Boolean).join(' · ')}</p></div>
        <button className="btn sm ghost" onClick={() => openProducerForm(id)} aria-label={`Editar ${pr.nombre}`}>✏️ Editar</button>
      </div>
      <div className="grid g3" style={{ margin: '14px 0' }}>
        <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Recepciones</div><div className="val num" style={{ fontSize: 24 }}>{recs.filter((r) => !r.anulada).length}</div></div>
        <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Compras directas</div><div className="val num" style={{ fontSize: 24 }}>{clp(compra)}</div></div>
        <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Última entrega</div><div className="val num" style={{ fontSize: 20 }}>{recs[0] ? fdate(recs[0].fecha) : '—'}</div></div>
      </div>
      <div className="card-tabs" role="group" aria-label="Secciones de la ficha">{tabs.map(([k, t]) => <button key={k} type="button" className={`btn sm ${tab === k ? 'pri' : 'ghost'}`} aria-pressed={tab === k} onClick={() => setTab(k)}>{t}</button>)}</div>
      {tab === 'rec' && <>
      <div className="scroll"><table className="tbl m-cards"><thead><tr><th>Fecha</th><th>Modalidad</th><th>Productos</th><th className="right">Total compra</th><th></th></tr></thead>
        <tbody>{recPg.rows.map((r) => (
          <tr key={r.id}><td className="when">{fdt(r.fecha)}</td><td>{r.modalidad === 'compra' ? 'Compra directa' : 'Consignación'}{r.anulada && <> <span className="pill bad">Anulada</span></>}</td>
            <td><ItemList items={r.lineas.map((l) => (l.nombre || P(l.prod).nombre) + ' × ' + qtyFmt(l.qty, l.unidad || P(l.prod).unidad) + (l.gamelas ? ` (${l.gamelas} gam.)` : '')).concat(r.gamelas ? ['Gamelas × ' + r.gamelas] : [])} /></td>
            <td className="right num">{r.modalidad === 'compra' ? clp(r.lineas.reduce((n, l) => n + l.qty * l.costo, 0)) : '—'}</td><td><button className="btn sm ghost" onClick={() => openRecDoc(r.id)}>Ver</button></td></tr>
        ))}{!recs.length && <tr><td colSpan={5} className="empty">Sin recepciones</td></tr>}</tbody></table></div>
      <Pager pg={recPg} onPage={setRecPage} label="Páginas de recepciones del productor" />
      </>}
      {tab === 'cons' && A && <>
        <h4 style={{ margin: '0 0 6px' }}>Cuenta de consignación</h4>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>De todo lo vendido de este productor: tu comisión se queda en la bodega y el resto es de él hasta que le pagas.</p>
        <div className="grid g4">
          <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Vendido</div><div className="val num" style={{ fontSize: 20 }}>{clp(A.vendido)}</div></div>
          <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Tu comisión</div><div className="val num" style={{ fontSize: 20, color: 'var(--g700)' }}>{clp(A.comision)}</div></div>
          <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Su parte</div><div className="val num" style={{ fontSize: 20 }}>{clp(A.suParte)}</div><div className="sub">pagado {clp(A.pagado)}</div></div>
          <div className="card kpi hero"><div className="lbl">Le debes</div><div className="val num" style={{ fontSize: 20 }}>{clp(Math.max(0, A.debe))}</div></div>
        </div>
      </>}
      {tab === 'cons' && L && <>
        <h4 style={{ margin: '18px 0 6px' }}>Liquidación de consignación</h4>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>Neto = vendido − comisión. La merma no se paga.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="f"><label htmlFor="lf-desde">Desde</label><input id="lf-desde" className="in" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="f"><label htmlFor="lf-hasta">Hasta</label><input id="lf-hasta" className="in" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        </div>
        <div className="scroll"><table className="tbl"><thead><tr><th>Producto</th><th className="right">Recibido</th><th className="right">Vendido</th><th className="right">Merma</th><th className="right">Monto vendido</th></tr></thead>
          <tbody>{Object.entries(L.by).map(([pid, r]) => { const p = P(pid); return <tr key={pid}><td>{p.nombre}</td><td className="right num">{qtyFmt(r.recibido, p.unidad)}</td><td className="right num">{qtyFmt(r.vendido, p.unidad)}</td><td className="right num">{qtyFmt(r.merma, p.unidad)}</td><td className="right num">{clp(r.monto)}</td></tr>; })}
            {!Object.keys(L.by).length && <tr><td colSpan={5} className="empty">Sin movimientos en el periodo</td></tr>}</tbody></table></div>
        <div className="grid g3" style={{ marginTop: 14 }}>
          <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Vendido</div><div className="val num" style={{ fontSize: 22 }}>{clp(L.monto)}</div></div>
          <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Comisión {liqPctTxt(L)}</div><div className="val num" style={{ fontSize: 22 }}>− {clp(L.comision)}</div></div>
          <div className="card kpi hero"><div className="lbl">Neto a pagar</div><div className="val num" style={{ fontSize: 22 }}>{clp(L.neto)}</div></div>
        </div>
        <div className="acts"><button className="btn pri" disabled={!L.monto} onClick={() => void gen()}>Generar liquidación</button></div>
      </>}
      {tab === 'liq' && <>
        <div className="scroll"><table className="tbl m-cards"><thead><tr><th>Fecha</th><th>Periodo</th><th className="right">Neto</th><th>Estado</th><th></th></tr></thead>
          <tbody>{liqPg.rows.map((l) => (
            <tr key={l.id}><td className="when">{fdate(l.fecha)}</td><td className="muted">{l.desde || 'inicio'} a {l.hasta || 'hoy'}</td><td className="right num"><b>{clp(l.neto)}</b></td>
              <td>{l.neto <= 0 ? <span className="pill warn">Ajuste a compensar</span> : l.pagada ? <span className="pill ok">Pagada {fdate(l.pagada)} · {l.medio}</span> : <button className="btn sm" onClick={() => openPayLiq(l.id)}>Marcar pagada</button>}</td>
              <td><button className="btn sm ghost" onClick={() => openLiqDoc(l.id)}>PDF</button></td></tr>
          ))}{!liqs.length && <tr><td colSpan={5} className="empty">Aún no hay liquidaciones</td></tr>}</tbody></table></div>
        <Pager pg={liqPg} onPage={setLiqPage} label="Páginas de liquidaciones" />
      </>}
    </>
  );
}

function openLiqDoc(id: string): void { openModal(() => <LiqDoc id={id} />, { wide: true }); }
function LiqDoc({ id }: { id: string }) {
  const l = ctx.S.liqs.find((x) => x.id === id);
  if (!l) return null;
  const pr = PR(l.prod) as { nombre: string; rut?: string }, cfg = ctx.S.cfg;
  return (
    <>
      <div className="printable doc">
        <div className="hd"><Logo w={48} mark alt="" /><div><b style={{ fontSize: 16 }}>{cfg.nombre}</b><br /><span className="muted">RUT {cfg.rut} · Liquidación de consignación</span></div></div>
        <p style={{ margin: 0 }}><b>{pr.nombre}</b> · RUT {pr.rut}</p><p className="muted" style={{ margin: '2px 0 10px' }}>Emitida {fdate(l.fecha)} · Periodo {l.desde || 'inicio'} a {l.hasta || fdate(l.fecha)}</p>
        <table className="tbl"><thead><tr><th>Producto</th><th className="right">Recibido</th><th className="right">Vendido</th><th className="right">Merma</th><th className="right">Monto</th></tr></thead>
          <tbody>{Object.entries(l.by).map(([pid, r]) => { const p = P(pid); return <tr key={pid}><td>{p.nombre}</td><td className="right">{qtyFmt(r.recibido, p.unidad)}</td><td className="right">{qtyFmt(r.vendido, p.unidad)}</td><td className="right">{qtyFmt(r.merma, p.unidad)}</td><td className="right">{clp(r.monto)}</td></tr>; })}</tbody></table>
        <table className="tbl" style={{ marginTop: 10, maxWidth: 320, marginLeft: 'auto' }}><tbody>
          <tr><td>Monto vendido</td><td className="right">{clp(l.monto)}</td></tr><tr><td>Comisión {liqPctTxt(l)}</td><td className="right">− {clp(l.comision)}</td></tr><tr><td><b>Neto a pagar</b></td><td className="right"><b>{clp(l.neto)}</b></td></tr>
        </tbody></table>
        <p className="muted">{l.pagada ? `Pagada el ${fdate(l.pagada)} por ${l.medio}.` : 'Pendiente de pago.'}</p>
      </div>
      <div className="acts noprint"><button className="btn ghost" onClick={() => window.print()}><Icon n="print" s={17} />PDF / Imprimir</button><button className="btn pri" onClick={closeModal}>Listo</button></div>
    </>
  );
}
function openPayLiq(id: string): void {
  if (!isAdmin()) { toast('Requiere administrador.'); return; }
  if (!((ctx.S.liqs.find((l) => l.id === id)?.neto ?? 0) > 0)) { toast('Este saldo es un ajuste a compensar, no un pago al productor.'); return; }
  openModal(() => <PayLiq id={id} />);
}
function PayLiq({ id }: { id: string }) {
  const [m, setM] = useState('transferencia');
  return (
    <>
      <h2>Registrar pago</h2>
      <div className="f"><label htmlFor="pm">Medio</label><select id="pm" className="in" value={m} onChange={(e) => setM(e.target.value)}><option>transferencia</option><option>efectivo</option></select></div>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={async () => { if (await exec(() => payLiqCmd(id, m)) !== undefined) closeModal(); }}>Confirmar</button></div>
    </>
  );
}
