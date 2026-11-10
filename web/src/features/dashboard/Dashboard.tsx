import { useEffect, useRef, useState } from 'react';
import { Emo, Icon } from '../../components/icons';
import { clickable, Head, PAGE_SHORT, paginate, Pager } from '../../components/ui';
import { P, productFamilies, U } from '../../domain/catalog';
import { ctx } from '../../domain/ctx';
import { clp, DAY, dayKey, fdate, fdt, ftime, monthKey, monthName, now, qtyFmt, today } from '../../domain/format';
import { approveCloseCmd } from '../../domain/operations';
import { anulTxt, dayStats, monthStats } from '../../domain/balance';
import { IncomeSub, ShortageAlert } from '../balance/Balance';
import { moneyEntries, saleCard, saleCash, saleTr } from '../../domain/sales';
import { prodStock } from '../../domain/stock';
import { useApp, type View } from '../../state/store';
import { exec, go } from '../../app/actions';
import { intent } from '../../app/intent';
import { CreditCard } from '../credits/Credits';
import { openProductSheet } from '../inventory/Inventory';

/** Atajos del Dashboard: llevan al módulo con el filtro que corresponde a la tarjeta. */
function dashGo(v: View, o: { hoy?: boolean; desde?: string; vend?: string; medio?: string; fam?: string } = {}): void {
  if (v === 'sales') { const d = o.hoy ? today() : o.desde || ''; intent.sales = { desde: d, hasta: o.hoy ? today() : '', vend: o.vend || '', medio: o.medio || '', doc: '' }; try { sessionStorage.setItem('bodegaLV.salesTab', 'list'); } catch { /* nada */ } }
  if (v === 'inv') intent.invFam = o.fam || 'Todas';
  go(v);
}

/** Animación única de las barras (equivale a la de GSAP del prototipo), sin librería externa. */
let animated = false;
function useMeterReveal(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (animated || !ref.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bars = [...ref.current.querySelectorAll<HTMLElement>('.sales-meter-fill[data-value]:not([data-value="0"])')];
    if (!bars.length || typeof bars[0].animate !== 'function') return;
    animated = true;
    bars.forEach((b, i) => b.animate([{ transform: 'scaleX(.08)' }, { transform: 'scaleX(1)' }], { duration: 250, delay: i * 5, easing: 'cubic-bezier(.215,.61,.355,1)', fill: 'backwards' }));
  }, [ref]);
}

export function Dashboard() {
  useApp();
  const S = ctx.S, k = today(), st = dayStats(k), mes = monthStats(monthKey(now()));
  const ref = useRef<HTMLDivElement>(null);
  const [stockPage, setStockPage] = useState(1), [vendPage, setVendPage] = useState(1), [famPage, setFamPage] = useState(1);
  useMeterReveal(ref);
  const DN = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const days = [...Array(7)].map((_, i) => { const t = now() - i * DAY; const s = dayStats(dayKey(t)); return { l: i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : DN[new Date(t).getDay()], f: fdate(t).slice(0, 5), v: s.ingresos, vendido: s.total, n: s.n, anul: s.anul }; });
  const max = Math.max(...days.map((d) => d.v), 1), week = days.reduce((a, d) => a + d.v, 0);
  const llego: Record<string, number> = {};
  S.moves.filter((m) => m.tipo === 'recepción' && dayKey(m.fecha) === k).forEach((m) => (llego[m.prod] = (llego[m.prod] || 0) + m.qty));
  const byV: Record<string, number> = {};
  st.ss.forEach((s) => (byV[s.vendedor] = (byV[s.vendedor] || 0) + s.total));
  const money = moneyEntries().filter((e) => dayKey(e.fecha) === k), sumMoney = (m: string) => money.filter((e) => e.medio === m).reduce((n, e) => n + e.monto, 0);
  const ef = sumMoney('efectivo'), tr = sumMoney('transferencia'), card = sumMoney('tarjeta');
  const fam: Record<string, number> = {};
  st.ss.forEach((s) => s.lineas.forEach((l) => { const f = P(l.prod).familia; fam[f] = (fam[f] || 0) + l.subtotal; }));
  // 7 filas: queda a la par de la tarjeta de los últimos 7 días
  const stockPg = paginate(S.products.filter((p) => p.activo), stockPage, 7);
  const vendPg = paginate(S.users.filter((u) => u.activo && u.rol !== 'contador'), vendPage, PAGE_SHORT), famPg = paginate(productFamilies(), famPage, PAGE_SHORT);
  const salesN = (fn: (s: (typeof st.ss)[number]) => number) => st.ss.filter((s) => s.entrySign !== -1 && fn(s) > 0).length;
  const Kpi = ({ label, val, sub, hero, onGo, aria, bad }: { label: string; val: string; sub?: React.ReactNode; hero?: boolean; onGo: () => void; aria: string; bad?: boolean }) => (
    <div className={`card kpi shortcut ${hero ? 'hero' : ''}`} {...clickable(onGo, aria)}><div className="lbl">{label}<span className="arrow"><Icon n="arrow" s={15} /></span></div><div className="val num" style={bad ? { color: 'var(--bad)' } : undefined}>{val}</div>{sub && <div className="sub"><span>{sub}</span></div>}</div>
  );
  return (
    <div ref={ref}>
      <Head t="Dashboard" />
      <ClosureApprovals />
      <CreditCard />
      <ShortageAlert b={mes} style={{ marginBottom: 14 }} />
      <div className="grid g4 payments-kpis">
        <Kpi hero label={`Ingresos de ${monthName(mes.mk)}`} val={clp(mes.ingresos)} aria="Ingresos del mes: ver en Balance" onGo={() => go('bal')} sub={<><IncomeSub b={mes} /> · hoy {st.n} venta{st.n === 1 ? '' : 's'}{anulTxt(st.anul)}</>} />
        <Kpi label="Resultado del mes" val={clp(mes.bolsillo)} bad={mes.bolsillo < 0} aria="Resultado del mes: ver en Balance" onGo={() => go('bal')} sub={<>ingresos − egresos ({clp(mes.egresos)})</>} />
        <Kpi label="Efectivo hoy" val={clp(ef)} aria="Efectivo hoy: ver ventas en efectivo" onGo={() => dashGo('sales', { hoy: true, medio: 'efectivo' })} sub={`${salesN(saleCash)} ventas`} />
        <Kpi label="Transferencias hoy" val={clp(tr)} aria="Transferencias hoy: ver ventas por transferencia" onGo={() => dashGo('sales', { hoy: true, medio: 'transferencia' })} sub={`${salesN(saleTr)} ventas`} />
        <Kpi label="Tarjetas hoy" val={clp(card)} aria="Tarjetas hoy: ver ventas con tarjeta" onGo={() => dashGo('sales', { hoy: true, medio: 'tarjeta' })} sub={`${salesN(saleCard)} ventas`} />
      </div>
      <div className="grid g3 stack" style={{ marginTop: 14 }}>
        <div className="card span2 shortcut" {...clickable(() => dashGo('inv'), 'Llegó hoy y stock total: ir a Inventario')}>
          <h3>Llegó hoy y stock total<span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>a las {ftime(now())}</span></h3>
          <div className="scroll"><table className="tbl"><thead><tr><th>Producto</th><th className="right">Llegó hoy</th><th className="right">Stock total</th></tr></thead>
            <tbody>{stockPg.rows.map((p) => {
              const l = llego[p.id] || 0, q = prodStock(p.id);
              return (
                <tr key={p.id} className="click" onClick={(e) => { e.stopPropagation(); dashGo('inv'); openProductSheet(p.id); }}>
                  <td><b>{p.nombre}</b></td><td className="right num">{l ? qtyFmt(l, p.unidad) : <span className="muted">—</span>}</td><td className="right num"><b>{q > 0 ? qtyFmt(q, p.unidad) : <span className="pill bad">Sin stock</span>}</b></td>
                </tr>
              );
            })}</tbody></table></div>
          <Pager pg={stockPg} onPage={setStockPage} label="Páginas de stock" inline />
        </div>
        <div className="card shortcut" {...clickable(() => dashGo('sales', { desde: dayKey(now() - 6 * DAY) }), 'Últimos 7 días: ver en Historial')}>
          <h3>Ingresos últimos 7 días<span className="pill ok">{clp(week)}</span></h3>
          <div className="rows">{days.map((d, i) => (
            <div key={i} style={{ flexWrap: 'wrap', gap: '4px 12px' }}>
              <div className="grow"><b>{d.l}</b><span>{d.f} · {d.n} ventas{anulTxt(d.anul)}{d.vendido !== d.v ? ` · vendido ${clp(d.vendido)}` : ''}</span></div><b className="num">{clp(d.v)}</b>
              <div className="sales-meter" aria-hidden="true"><div className="sales-meter-fill" data-value={d.v} style={{ width: `${(d.v / max) * 100}%`, background: i === 0 ? 'var(--g700)' : 'var(--g500)' }} /></div>
            </div>
          ))}</div>
        </div>
      </div>
      <div className="grid g2 stack" style={{ marginTop: 14 }}>
        <div className="card shortcut" {...clickable(() => dashGo('sales', { hoy: true }), 'Ventas por vendedor: ver en Historial')}><h3>Ventas por vendedor</h3>
          <div className="rows">{vendPg.rows.map((u) => (
            <div key={u.id} className="click" onClick={(e) => { e.stopPropagation(); dashGo('sales', { hoy: true, vend: u.id }); }}>
              <span className="avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{u.nombre[0]}</span><div className="grow"><b>{u.nombre}</b><span>{st.ss.filter((s) => s.entrySign !== -1 && s.vendedor === u.id).length} ventas</span></div><b className="num">{clp(byV[u.id] || 0)}</b>
            </div>
          ))}</div>
          <Pager pg={vendPg} onPage={setVendPage} label="Páginas de vendedores" inline />
        </div>
        <div className="card shortcut" {...clickable(() => dashGo('inv'), 'Ventas de hoy por familia: ir a Inventario')}><h3>Ventas de hoy por familia</h3>
          <div className="rows">{famPg.rows.map((f) => (
            <div key={f} className="click" onClick={(e) => { e.stopPropagation(); dashGo('inv', { fam: f }); }}>
              <span className={`ico ${f === 'Tomate' ? 't' : f === 'Palta' ? 'p' : 'o'}`}>{f[0]}</span><div className="grow"><b>{f}</b></div><b className="num">{clp(fam[f] || 0)}</b>
            </div>
          ))}</div>
          <Pager pg={famPg} onPage={setFamPage} label="Páginas de familias" inline />
        </div>
      </div>
    </div>
  );
}

/** Cierres de caja pendientes: Luis los ve en el Dashboard y al tocar abre Cierre de caja. */
function ClosureApprovals() {
  const [page, setPage] = useState(1);
  const cs = ctx.S.closures.filter((c) => !c.aprobado && !c.registrado).sort((a, b) => a.fecha - b.fecha), pg = paginate(cs, page, PAGE_SHORT);
  if (!cs.length) return null;
  return (
    <section className="card request-alert" role="region" aria-label="Cierres de caja por aprobar">
      <h3><Emo e="💵" s={18} /> {cs.length === 1 ? 'Un cierre de caja por aprobar' : cs.length + ' cierres de caja por aprobar'}</h3>
      <div className="rows">{pg.rows.map((c) => (
        <div key={c.id} className="click" style={{ flexWrap: 'wrap', gap: '8px 12px' }} {...clickable(() => go('caja'), `Ver cierre de ${U(c.vendedor).nombre} en Cierre de caja`)}>
          <div className="grow"><b>{U(c.vendedor).nombre} · {fdt(c.fecha)}</b>
            <span>Efectivo esperado {clp(c.esperado)} · contado {clp(c.declarado)} · transferencias {clp(c.transf)} · tarjetas {clp(c.tarjeta || 0)}{c.consig ? ` · consignación: ganancia ${clp(Number(c.comision))}, proveedor ${clp(Number(c.deProductores))}` : ''}</span></div>
          <b className="num" style={{ color: c.diferencia ? 'var(--bad)' : 'var(--g700)' }}>{c.diferencia ? 'Diferencia ' + clp(c.diferencia) : 'Cuadra'}</b>
          <button className="btn sm pri" onClick={(e) => { e.stopPropagation(); void exec(() => approveCloseCmd(c.id)); }}>Aprobar</button>
        </div>
      ))}</div>
      <Pager pg={pg} onPage={setPage} label="Páginas de cierres por aprobar" inline />
    </section>
  );
}
