import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Head, ItemList, PAGE_LONG, paginate, Pager } from '../../components/ui';
import { CL, lineName, P, Popt, U } from '../../domain/catalog';
import { ctx, isAccountant, isAdmin, me } from '../../domain/ctx';
import { clp, dayKey, fdt, kg, qtyFmt, searchText, today } from '../../domain/format';
import { receiptData, receiptKind, receiptPayment } from '../../domain/receipts';
import { vig } from '../../domain/requests';
import type { Sale } from '../../types/model';
import { useApp } from '../../state/store';
import { intent } from '../../app/intent';
import { openReceipt } from '../pos/Receipt';
import { openVoidSale, requestVoid } from './VoidSale';
import { openReport } from './Report';
import { ReceptionHistory as ReceptionHistoryCard } from '../reception/Reception';

/* Historial: una sola lista de ventas para todos.
   Vendedor: solo sus ventas. Luis: todas, con anular y recepciones. Contadora: todas, solo lectura. */
export interface SalesFilter { desde: string; hasta: string; vend: string; medio: string; doc: string }
const EMPTY: SalesFilter = { desde: '', hasta: '', vend: '', medio: '', doc: '' };
type Tab = 'list' | 'recepciones' | 'movimientos';

export function salesRows(sf: SalesFilter, q: string): Sale[] {
  let ss = ctx.S.sales.filter((s) => isAdmin() || isAccountant() || s.vendedor === me()?.id);
  if (sf.desde) ss = ss.filter((s) => dayKey(s.fecha) >= sf.desde);
  if (sf.hasta) ss = ss.filter((s) => dayKey(s.fecha) <= sf.hasta);
  if (sf.vend) ss = ss.filter((s) => s.vendedor === sf.vend);
  if (sf.medio) ss = ss.filter((s) => s.pagos.some((p) => p.medio === sf.medio && p.monto));
  if (sf.doc) ss = ss.filter((s) => (receiptKind(s) === 'Factura' ? 'factura' : 'boleta') === sf.doc);
  if (q) { const t = q.toLowerCase(); ss = ss.filter((s) => s.lineas.some((l) => { const p = P(l.prod); return p.nombre.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t); })); }
  return ss.sort((a, b) => b.fecha - a.fecha);
}

export function Sales() {
  useApp();
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('bodegaLV.salesTab') as Tab) || 'list');
  const [sf, setSf] = useState<SalesFilter>(() => { const p = intent.sales || EMPTY; intent.sales = undefined; return p; });
  const t: Tab = isAccountant() ? 'list' : tab === 'movimientos' && !isAdmin() ? 'list' : tab;
  const pick = (x: Tab) => { setTab(x); try { sessionStorage.setItem('bodegaLV.salesTab', x); } catch { /* nada */ } };
  const TabBtn = ({ id, label }: { id: Tab; label: string }) => <button className={`btn sm ${t === id ? 'pri' : 'ghost'}`} aria-pressed={t === id} onClick={() => pick(id)}>{label}</button>;
  return (
    <>
      <Head t="Historial" acts={(isAdmin() || isAccountant()) && t !== 'movimientos' && <button className="btn pri" onClick={() => openReport(sf)}><Icon n="print" s={17} />Descargar reporte</button>} />
      {!isAccountant() && <div className="tabs"><TabBtn id="list" label="Ventas" /><TabBtn id="recepciones" label="Recepciones" />{isAdmin() && <TabBtn id="movimientos" label="Movimientos" />}</div>}
      {t === 'recepciones' ? <ReceptionHistoryCard /> : t === 'movimientos' ? <MovesList /> : <SalesList sf={sf} setSf={setSf} />}
    </>
  );
}

function SalesList({ sf, setSf }: { sf: SalesFilter; setSf: (f: SalesFilter) => void }) {
  const [q, setQ] = useState(''), [page, setPage] = useState(1);
  const set = (k: keyof SalesFilter, v: string) => { setSf({ ...sf, [k]: v }); setPage(1); };
  const inverted = !!(sf.desde && sf.hasta && sf.desde > sf.hasta);
  const all = inverted ? [] : salesRows(sf, q), pg = paginate(all, page, PAGE_LONG), readOnly = isAccountant(), seeAll = isAdmin() || readOnly;
  const sum = (kind?: string) => { const r = all.filter((s) => vig(s) && (!kind || receiptKind(s) === kind)); return { n: r.length, total: r.reduce((a, s) => a + s.total, 0), neto: r.reduce((a, s) => a + receiptData(s).neto, 0) }; };
  const tot = sum(), bo = sum('Boleta'), fa = sum('Factura'), withClient = pg.rows.some((s) => receiptKind(s) === 'Factura');
  return (
    <>
      <div className="card">
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="f"><label htmlFor="sf-desde">Desde</label><input id="sf-desde" className="in" type="date" value={sf.desde} max={today()} onChange={(e) => set('desde', e.target.value)} /></div>
          <div className="f"><label htmlFor="sf-hasta">Hasta</label><input id="sf-hasta" className="in" type="date" value={sf.hasta} max={today()} onChange={(e) => set('hasta', e.target.value)} /></div>
          <div className="f"><label htmlFor="sf-doc">Documento</label><select id="sf-doc" className="in" value={sf.doc} onChange={(e) => set('doc', e.target.value)}>{[['', 'Todos'], ['boleta', 'Boletas'], ['factura', 'Facturas']].map(([k, tt]) => <option key={k} value={k}>{tt}</option>)}</select></div>
          {seeAll && <div className="f"><label htmlFor="sf-vend">Vendedor</label><select id="sf-vend" className="in" value={sf.vend} onChange={(e) => set('vend', e.target.value)}><option value="">Todos</option>{ctx.S.users.filter((u) => u.rol !== 'contador').map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>}
          <div className="f"><label htmlFor="sf-medio">Medio de pago</label><select id="sf-medio" className="in" value={sf.medio} onChange={(e) => set('medio', e.target.value)}><option value="">Todos</option>{['efectivo', 'transferencia', 'tarjeta', 'credito'].map((m) => <option key={m} value={m}>{receiptPayment(m)}</option>)}</select></div>
          <div className="f"><label htmlFor="sf-q">Producto</label><input id="sf-q" className="in" placeholder="Nombre o SKU" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        </div>
        {inverted && <p className="err">La fecha "desde" no puede ser posterior a "hasta".</p>}
      </div>
      <div className="grid g3 sales-totals" style={{ marginTop: 14 }}>
        <div className="card kpi"><div className="lbl">Total vendido</div><div className="val num">{clp(tot.total)}</div><div className="sub">{tot.n} ventas vigentes</div></div>
        <div className="card kpi"><div className="lbl">Boletas</div><div className="val num">{clp(bo.total)}</div><div className="sub">{bo.n} · neto {clp(bo.neto)}</div></div>
        <div className="card kpi"><div className="lbl">Facturas</div><div className="val num">{clp(fa.total)}</div><div className="sub">{fa.n} · neto {clp(fa.neto)}</div></div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="scroll"><table className="tbl m-cards"><thead><tr><th>N°</th><th className="m-hide">Documento</th><th>Fecha</th>{seeAll && <th>Vendedor</th>}{withClient && <th>Cliente</th>}<th>Productos</th><th>Pago</th><th className="right">Total</th>{!readOnly && <th></th>}</tr></thead>
          <tbody>{pg.rows.map((s) => {
            const rc = receiptData(s).receptor, paid = s.pagos.filter((p) => p.monto);
            return (
              <tr key={s.id} className={`click ${s.pagos.some((p) => p.medio === 'transferencia' && p.monto) ? 'row-tr' : ''}`} tabIndex={0} onClick={() => openReceipt(s.id)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openReceipt(s.id); }}>
                <td className="muted">{s.num}</td><td>{receiptKind(s)}{readOnly && s.estado === 'anulada' && <> <span className="pill bad">Anulada</span></>}</td><td className="when">{fdt(s.fecha)}</td>
                {seeAll && <td>{U(s.vendedor).nombre}</td>}
                {withClient && <td>{rc ? <><b>{rc.razonSocial || ''}</b><br /><span className="muted">{rc.rut || ''}</span></> : <span className="muted">—</span>}</td>}
                <td><ItemList items={s.lineas.map((l) => lineName(l).replace('Tomate calibre', 'Cal.') + ' ×' + (l.unidad === 'kg' ? kg(l.qty) + 'kg' : l.qty))} /></td>
                <td>{paid.map((p, i) => <span key={i}>{i > 0 && ' + '}{p.medio === 'transferencia' ? <span className="pay-tr">Transferencia{paid.length > 1 ? ' ' + clp(p.monto) : ''}</span> : receiptPayment(p.medio) + (p.medio === 'credito' && s.cliente ? ' · ' + CL(s.cliente).nombre : '')}</span>)}</td>
                <td className="right num"><b>{clp(s.total)}</b></td>
                {!readOnly && <td onClick={(e) => e.stopPropagation()}>{s.estado === 'anulada' ? <span className="pill bad">Anulada</span> : isAdmin() ? <button className="btn sm bad" onClick={() => openVoidSale(s.id)}>Anular</button> : s.solicitud ? <span className="pill warn">Anulación pedida</span> : <button className="btn sm ghost" onClick={() => requestVoid(s.id)}>Solicitar anulación</button>}</td>}
              </tr>
            );
          })}{!pg.rows.length && <tr><td colSpan={9} className="empty">Sin ventas con estos filtros</td></tr>}</tbody></table></div>
        <p className="muted" style={{ margin: '10px 0 0' }}>Mostrando {pg.from}–{pg.to} de {all.length} ventas. Toca una venta para ver su boleta o factura.</p>
        <Pager pg={pg} onPage={setPage} label="Páginas de ventas" />
      </div>
    </>
  );
}

/* Movimientos: mermas, ajustes, anulaciones y la bitácora de cambios (precios, autorizaciones, cierres, usuarios…). */
const MOVE_CATS = ['Mermas', 'Ajustes de stock', 'Anulaciones', 'Precios y productos', 'Autorizaciones', 'Cierres y créditos', 'Gastos', 'Usuarios y ajustes'];
const SALE_EVENTS: Record<string, string> = { solicitud_vendedor: 'Pide anular venta', reversion_solicitada: 'Anula venta', solicitud_rechazada: 'Rechaza anular venta', devolucion_conciliada_manual: 'Confirma devolución de dinero' };
const HIDDEN_EVENTS = ['venta_registrada', 'reversion_comercial', 'migracion', 'consulta_documento', 'preparacion_documentos', 'nota_credito_consultada'];
interface MoveRow { mov?: boolean; fecha: number; tipo: string; user: string; det: string; cant: string; neg?: boolean; motivo: string; antes: string; despues: string; cat?: string; key: string }
function moveCat(r: MoveRow): string {
  if (r.cat) return r.cat;
  if (r.mov) return r.tipo === 'merma' ? 'Mermas' : r.tipo === 'anulación' ? 'Anulaciones' : 'Ajustes de stock';
  const t = searchText(r.tipo);
  if (t.includes('anula')) return 'Anulaciones';
  if (/^(pide|autoriza|rechaza)|precio especial/.test(t)) return 'Autorizaciones';
  if (/precio|producto|familia|comision/.test(t)) return 'Precios y productos';
  if (t.includes('gasto')) return 'Gastos';
  if (/usuario|contrasena|ajustes/.test(t)) return 'Usuarios y ajustes';
  return 'Cierres y créditos';
}
function MovesList() {
  const [tipo, setTipo] = useState(''), [user, setUser] = useState(''), [mq, setMq] = useState(''), [page, setPage] = useState(1);
  const S = ctx.S, q = searchText(mq);
  let rows: MoveRow[] = [
    ...S.moves.filter((m) => m.tipo !== 'venta' && m.tipo !== 'recepción').map((m) => { const p = Popt(m.prod); return { key: m.id, mov: true, fecha: m.fecha, tipo: m.tipo, user: m.user, det: p?.nombre || '—', cant: (m.qty > 0 ? '+' : '') + qtyFmt(m.qty, p?.unidad || 'gamela') + (m.gamelas ? ` · ${m.gamelas} gam.` : ''), neg: m.qty < 0, motivo: m.motivo || '', antes: '', despues: '' }; }),
    ...S.audit.filter((a) => !HIDDEN_EVENTS.includes(a.accion)).map((a) => { const ev = SALE_EVENTS[a.accion]; return { key: a.id, fecha: a.fecha, tipo: ev || a.accion, user: a.user, det: a.entidad || '', cant: '', motivo: ev ? a.despues || '' : '', antes: ev ? '' : a.antes || '', despues: ev ? '' : a.despues || '', ...(ev ? { cat: 'Anulaciones' } : {}) }; }),
  ].map((r) => ({ ...r, cat: moveCat(r) }));
  if (tipo) rows = rows.filter((r) => r.cat === tipo);
  if (user) rows = rows.filter((r) => r.user === user);
  if (q) rows = rows.filter((r) => searchText(r.det + ' ' + r.tipo + ' ' + r.motivo).includes(q));
  rows.sort((a, b) => b.fecha - a.fecha);
  const pg = paginate(rows, page, PAGE_LONG), pill = (c?: string) => (c === 'Mermas' || c === 'Anulaciones' ? 'bad' : c === 'Ajustes de stock' ? 'warn' : c === 'Autorizaciones' ? 'ok' : 'mute');
  return (
    <div className="card">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="f"><label htmlFor="mf-tipo">Tipo</label><select id="mf-tipo" className="in" value={tipo} onChange={(e) => { setTipo(e.target.value); setPage(1); }}><option value="">Todos</option>{MOVE_CATS.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="f"><label htmlFor="mf-user">Usuario</label><select id="mf-user" className="in" value={user} onChange={(e) => { setUser(e.target.value); setPage(1); }}><option value="">Todos</option>{S.users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
        <div className="f"><label htmlFor="mf-q">Buscar</label><input id="mf-q" className="in" placeholder="Producto, cliente, usuario…" value={mq} onChange={(e) => { setMq(e.target.value); setPage(1); }} /></div>
      </div>
      <div className="scroll"><table className="tbl m-cards"><thead><tr><th>Fecha</th><th>Tipo</th><th>Usuario</th><th>Detalle</th><th className="right">Cantidad</th><th>Antes → Después</th><th>Motivo</th></tr></thead>
        <tbody>{pg.rows.map((r) => <tr key={r.key}><td className="when">{fdt(r.fecha)}</td><td><span className={`pill ${pill(r.cat)}`}>{r.mov ? r.cat : r.tipo}</span></td><td>{U(r.user).nombre}</td><td>{r.det}</td><td className="right num" style={{ color: r.neg ? 'var(--bad)' : 'var(--g700)' }}>{r.cant}</td><td className="muted">{r.antes || r.despues ? r.antes + ' → ' + r.despues : ''}</td><td className="muted">{r.motivo}</td></tr>)}
          {!pg.rows.length && <tr><td colSpan={7} className="empty">Sin movimientos con estos filtros</td></tr>}</tbody></table></div>
      {rows.length > 0 && <p className="muted" style={{ margin: '10px 0 0' }}>Mostrando {pg.from}–{pg.to} de {rows.length} movimientos. Las ventas y recepciones están en sus pestañas.</p>}
      <Pager pg={pg} onPage={setPage} label="Páginas de movimientos" />
    </div>
  );
}
