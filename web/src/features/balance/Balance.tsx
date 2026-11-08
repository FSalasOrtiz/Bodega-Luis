import { useState } from 'react';
import { Icon, Logo } from '../../components/icons';
import { Head, Seg } from '../../components/ui';
import { closeModal, openModal } from '../../components/modal';
import { toast } from '../../components/toast';
import { lineName, P, productFamilies, U } from '../../domain/catalog';
import { ctx } from '../../domain/ctx';
import { clp, dayKey, fdate, fdt, MESES, monthKey, monthName, now, pad2, prevMonth, qtyFmt, today } from '../../domain/format';
import { anulTxt, FIX_CATS, monthStats, unitTotals, VAR_CATS } from '../../domain/balance';
import { producersOwed } from '../../domain/producers';
import { canDelVar, delFixedCmd, delVarCmd, endFixedCmd, saveGastoCmd, updFixedCmd, updVarCmd, type GastoInput } from '../../domain/operations';
import { receiptKind, receiptPayment } from '../../domain/receipts';
import { revenueEntries } from '../../domain/sales';
import { lotSrc, SRC_LBL } from '../../domain/stock';
import { downloadCSV } from '../../utils/csv';
import { useApp } from '../../state/store';
import { exec, go } from '../../app/actions';

/* Balance: un mes a la vez (por defecto el actual) con ingresos, egresos fijos/variables y lo vendido; abajo los meses anteriores. */
let bmCache = '';
export function Balance() {
  useApp();
  const S = ctx.S;
  const [bm, setBmState] = useState(() => bmCache || monthKey(now()));
  const setBm = (v: string) => { bmCache = v; setBmState(v); };
  const b = monthStats(bm), vars = b.vars.slice().sort((a, c) => c.fecha - a.fecha);
  const Row = ({ t, sub, v, neg, edit }: { t: string; sub?: string; v: number; neg?: boolean; edit?: () => void }) => (
    <div><div className="grow"><b>{t}</b>{sub && <span>{sub}</span>}</div><b className="num" style={{ color: neg ? 'var(--bad)' : 'var(--g700)' }}>{neg ? '− ' : '+ '}{clp(Math.abs(v))}</b>{edit && <button className="btn sm ghost" onClick={edit}>Editar</button>}</div>
  );
  const sold = S.products.filter((p) => b.byProd[p.id] || b.merma[p.id]).map((p) => ({ p, q: b.byProd[p.id]?.qty || 0, m: b.byProd[p.id]?.monto || 0, merma: b.merma[p.id] || 0 })).sort((x, y) => y.m - x.m);
  const last6 = [...Array(6)].map((_, i) => { let k = monthKey(now()); for (let j = 0; j < i; j++) k = prevMonth(k); return k; });
  const months = [...new Set([...revenueEntries().map((s) => monthKey(s.fecha)), ...S.expenses.map((e) => monthKey(e.fecha)), ...last6])].sort().reverse();
  const ms = months.map(monthStats).filter((m) => m.mk === monthKey(now()) || m.ventas || m.egresos);
  const fams = [...productFamilies(), ...(S.products.some((p) => !p.envase && p.familia === 'Otros') ? ['Otros'] : [])];
  const owed = producersOwed();
  return (
    <>
      <Head t="Balance" acts={<><button type="button" className="btn ghost month-btn" onClick={() => openMonthCal(bm, setBm)} aria-label={`Elegir mes: ${monthName(bm)}`}><Icon n="cal" s={17} />{MESES[+bm.slice(5) - 1]} {bm.slice(0, 4)}</button>
        <button className="btn pri" onClick={() => openGasto(setBm)}><Icon n="plus" s={18} />Agregar gasto</button></>} />
      <div className="grid g3">
        <div className="card kpi hero"><div className="lbl">Resultado del mes</div><div className="val num" style={{ fontSize: 34 }}>{clp(b.bolsillo)}</div><div className="sub">ingresos − egresos de {monthName(bm)}</div></div>
        <div className="card kpi"><div className="lbl">Ingresos</div><div className="val num" style={{ fontSize: 30, color: 'var(--g700)' }}>{clp(b.ingresos)}</div><div className="sub">de {clp(b.ventas)} vendidos en {b.n} ventas{anulTxt(b.anul)}</div></div>
        <div className="card kpi"><div className="lbl">Egresos</div><div className="val num" style={{ fontSize: 30, color: 'var(--bad)' }}>{clp(b.egresos)}</div><div className="sub" style={{ color: 'var(--muted)' }}>compras {clp(b.compras)} · fijos {clp(b.tFijos)} · variables {clp(b.tVars)}</div></div>
      </div>
      <div className="grid g2 stack" style={{ marginTop: 14 }}>
        <div className="card"><h3>Ingresos</h3>
          <div className="rows">
            <Row t="Venta de mercadería propia" sub="compra directa (palta, otros…)" v={b.propias} />
            <Row t="Comisión de productores" sub={`sobre ${clp(b.consig)} vendidos en consignación`} v={b.comision} />
            <Row t="Gamelas (garantía neta)" sub={`${b.gamCobN} cobradas − ${b.gamDevN} descontadas`} v={b.gamVend} neg={b.gamVend < 0} />
          </div>
          <h4 className="exp-group">Consignación de {monthName(bm)}</h4>
          <div className="rows">
            <div><div className="grow"><b>Vendido en consignación</b><span>todo lo que salió del stock de consignación</span></div><b className="num">{clp(b.consig)}</b></div>
            <div><div className="grow"><b>Tu comisión</b><span>se suma arriba en Ingresos</span></div><b className="num" style={{ color: 'var(--g700)' }}>{clp(b.comision)}</b></div>
            <div><div className="grow"><b>Parte de los productores</b><span>no es ingreso de la bodega; se les paga en la liquidación</span></div><b className="num">{clp(b.deProductores)}</b></div>
          </div>
          {owed > 0 && <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>Por pagar a productores hoy (todas las fechas): <b>{clp(owed)}</b> · <button type="button" className="btn sm ghost" onClick={() => go('prod')}>Ver productores</button></p>}
          {b.devolucionesPendientes > 0 && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Devoluciones de dinero aún pendientes (todas las fechas): <b>{clp(b.devolucionesPendientes)}</b>.</p>}
        </div>
        <div className="card"><h3>Egresos</h3>
          <div className="rows"><Row t="Compra de mercadería" sub="recepciones en compra directa" v={b.compras} neg /></div>
          <h4 className="exp-group">Gastos fijos <span className="pill mute">se repiten cada mes</span><b className="num">− {clp(b.tFijos)}</b></h4>
          <div className="rows">{b.fijos.map((f) => <Row key={f.id} t={f.desc || f.cat} sub={f.cat} v={f.monto} neg edit={() => openEditFixed(f.id)} />)}{!b.fijos.length && <div className="empty">Sin gastos fijos</div>}</div>
          <h4 className="exp-group">Gastos variables <span className="pill mute">solo este mes</span><b className="num">− {clp(b.tVars)}</b></h4>
          <div className="rows">{vars.map((e) => <Row key={e.id} t={e.cat + (e.cantidad ? ` · ${e.cantidad} gamelas` : '')} sub={fdate(e.fecha) + (e.desc ? ' · ' + e.desc : '')} v={e.monto} neg edit={() => openEditVar(e.id, setBm)} />)}{!vars.length && <div className="empty">Sin gastos variables este mes</div>}</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}><h3>Lo vendido en {monthName(bm)}<button className="btn sm ghost" onClick={() => openMonthDetail(bm)}><Icon n="print" s={15} />Cierre del mes (PDF)</button></h3>
        <div className="scroll"><table className="tbl"><thead><tr><th>Producto</th><th className="right">Vendido</th><th className="right">Merma</th><th className="right">Monto</th></tr></thead>
          <tbody>{sold.map((x) => <tr key={x.p.id}><td><b>{x.p.nombre}</b></td><td className="right num">{qtyFmt(x.q, x.p.unidad)}</td><td className="right num">{x.merma ? qtyFmt(x.merma, x.p.unidad) : '—'}</td><td className="right num">{clp(x.m)}</td></tr>)}
            {!sold.length && <tr><td colSpan={4} className="empty">Sin ventas este mes</td></tr>}</tbody></table></div>
      </div>
      <div className="card" style={{ marginTop: 14 }}><h3>Últimos meses<span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn sm ghost" onClick={exportSalesCSV}>Exportar ventas</button><button className="btn sm ghost" onClick={exportMonths}>Exportar meses</button></span></h3>
        <div className="scroll"><table className="tbl"><thead><tr><th>Mes</th><th className="right">Ventas</th><th className="right">N° ventas</th>{fams.map((f) => <th key={f} className="right">{f === 'Otros' ? 'Sin clasificar' : f}</th>)}<th className="right">Gamelas (envase)</th><th className="right">Ingresos</th><th className="right">Egresos</th><th className="right">Resultado</th></tr></thead>
          <tbody>{ms.map((m) => {
            const u = unitTotals(m), c = (k: string) => (u[k] ? qtyFmt(u[k].qty, u[k].unidad) : '—');
            const pick = () => { setBm(m.mk); window.scrollTo(0, 0); };
            return (
              <tr key={m.mk} className={`click ${m.mk === bm ? 'row-sel' : ''}`} tabIndex={0} onClick={pick} onKeyDown={(e) => { if (e.key === 'Enter') pick(); }}>
                <td><b>{monthName(m.mk)}</b>{m.mk === monthKey(now()) && <> <span className="pill warn">en curso</span></>}</td><td className="right num">{clp(m.ventas)}</td>
                <td className="right num">{m.n}{m.anul > 0 && <><br /><small className="muted">{m.anul} anulada{m.anul > 1 ? 's' : ''}</small></>}</td>
                {fams.map((f) => <td key={f} className="right num">{c(f)}</td>)}<td className="right num">{c('Gamelas (envase)')}</td>
                <td className="right num">{clp(m.ingresos)}</td><td className="right num">{clp(m.egresos)}</td><td className="right num" style={{ color: m.bolsillo < 0 ? 'var(--bad)' : 'var(--g700)' }}><b>{clp(m.bolsillo)}</b></td>
              </tr>
            );
          })}</tbody></table></div>
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Toca un mes para verlo arriba.</p>
      </div>
    </>
  );
}

/** Selector de mes: no deja elegir meses futuros. */
function openMonthCal(sel: string, onPick: (v: string) => void): void {
  openModal(() => <MonthCal sel={sel} onPick={onPick} />);
}
function MonthCal({ sel, onPick }: { sel: string; onPick: (v: string) => void }) {
  const cur = monthKey(now()), maxY = +cur.slice(0, 4);
  const [y, setY] = useState(+sel.slice(0, 4));
  const pick = (k: string) => { onPick(k); closeModal(); };
  return (
    <>
      <h2>Elegir mes</h2>
      <div className="month-cal-head"><button type="button" className="btn sm ghost" aria-label="Año anterior" onClick={() => setY(y - 1)}>‹</button><b>{y}</b><button type="button" className="btn sm ghost" aria-label="Año siguiente" disabled={y >= maxY} onClick={() => setY(y + 1)}>›</button></div>
      <div className="month-cal">{MESES.map((m, i) => { const k = y + '-' + pad2(i + 1); return <button type="button" key={k} className={`btn ${k === sel ? 'pri' : 'ghost'}`} disabled={k > cur} aria-current={k === sel ? 'true' : undefined} onClick={() => pick(k)}>{m.slice(0, 3)}</button>; })}</div>
      <div className="acts"><button className="btn ghost" onClick={() => pick(cur)}>Mes actual</button><button className="btn pri" onClick={closeModal}>Cerrar</button></div>
    </>
  );
}

function openGasto(setBm: (v: string) => void): void { openModal(() => <Gasto setBm={setBm} />); }
function Gasto({ setBm }: { setBm: (v: string) => void }) {
  const [g, setG] = useState<GastoInput>({ tipo: 'variable', cat: VAR_CATS[0], fecha: today(), monto: '', desc: '', qty: '' });
  const fijo = g.tipo === 'fijo', cats = fijo ? FIX_CATS : VAR_CATS, cat = cats.includes(g.cat) ? g.cat : cats[0], gam = !fijo && cat === 'Compra de gamelas';
  const set = (p: Partial<GastoInput>) => setG((x) => ({ ...x, ...p }));
  const save = async () => { const mk = await exec(() => saveGastoCmd({ ...g, cat }), 'Gasto registrado'); if (mk) { setBm(mk); closeModal(); } };
  return (
    <>
      <h2>Agregar gasto</h2><p className="muted">{fijo ? 'Se repetirá todos los meses desde este mes, hasta que lo desactives.' : 'Se registra solo en el mes de la fecha.'}</p>
      <div className="f"><Seg value={g.tipo} options={[['variable', 'Variable'], ['fijo', 'Fijo mensual']]} onChange={(t) => set({ tipo: t })} label="Tipo de gasto" /></div>
      <div className="row"><div className="f"><label htmlFor="g_c">Categoría</label><select id="g_c" className="in" value={cat} onChange={(e) => set({ cat: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select></div>
        {!fijo && <div className="f"><label htmlFor="g_f">Fecha</label><input id="g_f" className="in" type="date" value={g.fecha} max={today()} onChange={(e) => set({ fecha: e.target.value })} /></div>}</div>
      {gam && <div className="f"><label htmlFor="g_q">Cantidad de gamelas compradas</label><input id="g_q" className="in num" type="number" inputMode="numeric" value={g.qty} onChange={(e) => set({ qty: e.target.value })} /><small className="muted">Se suman al stock de gamelas para vender.</small></div>}
      <div className="row"><div className="f"><label htmlFor="g_m">Monto total</label><input id="g_m" className="in num" type="number" inputMode="numeric" value={g.monto} onChange={(e) => set({ monto: e.target.value })} /></div>
        <div className="f"><label htmlFor="g_d">Descripción</label><input id="g_d" className="in" value={g.desc} onChange={(e) => set({ desc: e.target.value })} placeholder={fijo ? 'Ej: sueldo Gonzalo' : 'Opcional'} /></div></div>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={() => void save()}>Guardar</button></div>
    </>
  );
}

function openEditFixed(id: string): void { openModal(() => <EditFixed id={id} />); }
function EditFixed({ id }: { id: string }) {
  const f = ctx.S.fixed.find((x) => x.id === id);
  const [cat, setCat] = useState(f?.cat || FIX_CATS[0]), [m, setM] = useState(String(f?.monto ?? '')), [d, setD] = useState(f?.desc || '');
  if (!f) return null;
  const confirmDel = () => openModal(() => (
    <>
      <h2>¿Eliminar gasto fijo?</h2><p className="muted"><b>{f.desc || f.cat}</b> ({clp(f.monto)}/mes) se quitará de <b>todos</b> los meses, también de los ya cerrados. Si solo quieres que no siga desde ahora, usa “Dejar de repetir”.</p>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn bad" onClick={async () => { if (await exec(() => delFixedCmd(id), 'Gasto eliminado') !== undefined) closeModal(); }}>Eliminar</button></div>
    </>
  ));
  return (
    <>
      <h2>Gasto fijo</h2><p className="muted">Desde {monthName(f.desde)}{f.hasta ? ' hasta ' + monthName(f.hasta) : ' · se repite cada mes'}. Un cambio de monto rige desde este mes; los anteriores no cambian.</p>
      <div className="row"><div className="f"><label htmlFor="x_c">Categoría</label><select id="x_c" className="in" value={cat} onChange={(e) => setCat(e.target.value)}>{FIX_CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="f"><label htmlFor="x_m">Monto mensual</label><input id="x_m" className="in num" type="number" value={m} onChange={(e) => setM(e.target.value)} /></div></div>
      <div className="f"><label htmlFor="x_d">Descripción</label><input id="x_d" className="in" value={d} onChange={(e) => setD(e.target.value)} /></div>
      <div className="acts"><button className="btn bad" onClick={confirmDel}>Eliminar</button>
        {!f.hasta && <button className="btn ghost" onClick={async () => { if (await exec(() => endFixedCmd(id), 'Ya no se repetirá desde este mes') !== undefined) closeModal(); }}>Dejar de repetir</button>}
        <button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={async () => { if (await exec(() => updFixedCmd(id, m, d, cat), 'Gasto fijo actualizado') !== undefined) closeModal(); }}>Guardar</button></div>
    </>
  );
}

function openEditVar(id: string, setBm: (v: string) => void): void { openModal(() => <EditVar id={id} setBm={setBm} />); }
function EditVar({ id, setBm }: { id: string; setBm: (v: string) => void }) {
  const e = ctx.S.expenses.find((x) => x.id === id);
  const [cat, setCat] = useState(e?.cat || VAR_CATS[1]), [f, setF] = useState(e ? dayKey(e.fecha) : today()), [q, setQ] = useState(String(e?.cantidad ?? '')), [m, setM] = useState(String(e?.monto ?? '')), [d, setD] = useState(e?.desc || '');
  if (!e) return null;
  const gam = !!e.cantidad;
  const del = () => {
    const block = canDelVar(id);
    if (block) { toast(block); return; }
    openModal(() => (
      <>
        <h2>¿Eliminar gasto?</h2><p className="muted"><b>{e.cat}</b> del {fdate(e.fecha)} por {clp(e.monto)}{e.cantidad ? `. También se descuentan ${e.cantidad} gamelas del stock` : ''}. Queda registrado en el historial de movimientos.</p>
        <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn bad" onClick={async () => { if (await exec(() => delVarCmd(id), 'Gasto eliminado') !== undefined) closeModal(); }}>Eliminar</button></div>
      </>
    ));
  };
  const save = async () => { const mk = await exec(() => updVarCmd(id, m, f, d, cat, q), 'Gasto actualizado'); if (mk) { setBm(mk); closeModal(); } };
  return (
    <>
      <h2>Gasto variable</h2><p className="muted">{gam ? 'Compra de gamelas: cambiar la cantidad ajusta el stock de gamelas.' : 'Registrado el ' + fdate(e.fecha) + '.'}</p>
      <div className="row">{!gam && <div className="f"><label htmlFor="v_c">Categoría</label><select id="v_c" className="in" value={cat} onChange={(x) => setCat(x.target.value)}>{VAR_CATS.filter((c) => c !== 'Compra de gamelas').map((c) => <option key={c}>{c}</option>)}</select></div>}
        <div className="f"><label htmlFor="v_f">Fecha</label><input id="v_f" className="in" type="date" value={f} max={today()} onChange={(x) => setF(x.target.value)} /></div></div>
      {gam && <div className="f"><label htmlFor="v_q">Cantidad de gamelas</label><input id="v_q" className="in num" type="number" value={q} onChange={(x) => setQ(x.target.value)} /></div>}
      <div className="row"><div className="f"><label htmlFor="v_m">Monto total</label><input id="v_m" className="in num" type="number" value={m} onChange={(x) => setM(x.target.value)} /></div>
        <div className="f"><label htmlFor="v_d">Descripción</label><input id="v_d" className="in" value={d} onChange={(x) => setD(x.target.value)} /></div></div>
      <div className="acts"><button className="btn bad" onClick={del}>Eliminar</button><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={() => void save()}>Guardar</button></div>
    </>
  );
}

function openMonthDetail(mk: string): void { openModal(() => <MonthDetail mk={mk} />, { wide: true }); }
function MonthDetail({ mk }: { mk: string }) {
  const m = monthStats(mk);
  const rows = ctx.S.products.filter((p) => m.byProd[p.id] || m.merma[p.id]);
  return (
    <>
      <div className="printable doc">
        <div className="hd"><Logo w={48} mark alt="" /><div><b style={{ fontSize: 16 }}>Cierre de {monthName(mk)}</b><br /><span className="muted">{ctx.S.cfg.nombre}</span></div></div>
        <div className="grid g4" style={{ marginBottom: 12 }}>
          <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Vendido</div><div className="val num" style={{ fontSize: 22 }}>{clp(m.ventas)}</div><div className="sub">{m.n} ventas{anulTxt(m.anul)}</div></div>
          <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Ingresos</div><div className="val num" style={{ fontSize: 22 }}>{clp(m.ingresos)}</div>{m.consig !== 0 && <div className="sub">comisión {clp(m.comision)} · {clp(m.deProductores)} son de productores</div>}</div>
          <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Egresos</div><div className="val num" style={{ fontSize: 22 }}>{clp(m.egresos)}</div></div>
          <div className="card kpi hero"><div className="lbl">Resultado</div><div className="val num" style={{ fontSize: 22 }}>{clp(m.bolsillo)}</div></div>
        </div>
        <div className="scroll"><table className="tbl"><thead><tr><th>Producto</th><th className="right">Vendido</th><th className="right">Merma</th><th className="right">Monto</th></tr></thead>
          <tbody>{rows.map((p) => { const b = m.byProd[p.id] || { qty: 0, monto: 0 }; return <tr key={p.id}><td>{p.nombre}</td><td className="right num">{qtyFmt(b.qty, p.unidad)}</td><td className="right num">{m.merma[p.id] ? qtyFmt(m.merma[p.id], p.unidad) : '—'}</td><td className="right num">{clp(b.monto)}</td></tr>; })}</tbody></table></div>
      </div>
      <div className="acts noprint"><button className="btn ghost" onClick={() => window.print()}><Icon n="print" s={17} />PDF</button><button className="btn pri" onClick={closeModal}>Listo</button></div>
    </>
  );
}

function exportMonths(): void {
  const S = ctx.S, ps = S.products;
  const rows: (string | number)[][] = [['Mes', 'Vendido $', 'N° ventas', ...ps.map((p) => p.nombre + (p.unidad === 'kg' ? ' (kg)' : ' (gam.)')), 'Ingresos', 'Egresos', 'Resultado']];
  [...new Set([...revenueEntries().map((s) => monthKey(s.fecha)), ...S.expenses.map((e) => monthKey(e.fecha))])].sort().forEach((mk) => {
    const m = monthStats(mk);
    rows.push([monthName(mk), m.ventas, m.n, ...ps.map((p) => String(m.byProd[p.id]?.qty || 0).replace('.', ',')), m.ingresos, m.egresos, m.bolsillo]);
  });
  downloadCSV(rows, `cierres-de-mes-${today()}.csv`);
}
function exportSalesCSV(): void {
  const S = ctx.S;
  const rows: (string | number)[][] = [['N°', 'Documento', 'Fecha', 'Vendedor', 'Producto', 'Stock', 'Unidad', 'Cantidad', 'Precio', 'Subtotal', 'Comisión %', 'Estado', 'Medio de pago']];
  S.sales.forEach((s) => s.lineas.forEach((l) => {
    const src = l.src || (l.allocs?.some((a) => lotSrc(S.lots.find((x) => x.id === a.lot)) === 'consig') ? 'consig' : P(l.prod)?.envase ? '' : 'directa');
    const com = src === 'consig' ? s.comision ?? l.allocs?.[0]?.comision ?? '' : '';
    rows.push([s.num, receiptKind(s), fdt(s.fecha), U(s.vendedor).nombre, lineName(l), src ? SRC_LBL[src] : '', l.unidad, String(l.qty).replace('.', ','), l.precio, l.subtotal, String(com).replace('.', ','), s.estado, s.pagos.filter((p) => p.monto).map((p) => receiptPayment(p.medio)).join(' + ')]);
  }));
  downloadCSV(rows, `ventas-${today()}.csv`);
}
