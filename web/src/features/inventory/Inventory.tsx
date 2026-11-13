import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Head, PAGE_LONG, paginate, Pager } from '../../components/ui';
import { closeModal, openModal } from '../../components/modal';
import { kgGam, P, PR, productFamilies, U } from '../../domain/catalog';
import { ctx, isAdmin } from '../../domain/ctx';
import { clp, DAY, dayKey, fdate, fdt, now, qtyFmt, today } from '../../domain/format';
import { kgGamTxt } from '../../domain/gamelas';
import { adjustStockCmd, saveFamilyCmd, saveProductCmd, setPriceCmd, type ProductInput } from '../../domain/operations';
import { filteredProducts } from '../../domain/pos';
import { lotSrc, lotStock, prodLots, prodStock, SRC_LBL, srcStock } from '../../domain/stock';
import type { Unidad } from '../../types/model';
import { useApp } from '../../state/store';
import { exec, execOk } from '../../app/actions';
import { intent } from '../../app/intent';

export function Inventory() {
  useApp();
  const [q, setQ] = useState(''), [fam, setFam] = useState(() => { const f = intent.invFam || 'Todas'; intent.invFam = undefined; return f; }), [page, setPage] = useState(1);
  const admin = isAdmin(), ps = filteredProducts(q, fam, admin), k = today(), pg = paginate(ps, page, PAGE_LONG);
  return (
    <>
      <Head t="Inventario" acts={admin && <><button className="btn ghost" onClick={openNewFamily}><Icon n="plus" s={18} />Nueva familia</button><button className="btn pri" onClick={() => openEditProduct('')}><Icon n="plus" s={18} />Nuevo producto</button></>} />
      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="tabs">{['Todas', ...productFamilies()].map((f) => <button key={f} className={`btn sm ${fam === f ? 'pri' : 'ghost'}`} aria-pressed={fam === f} onClick={() => { setFam(f); setPage(1); }}>{f}</button>)}</div>
          <input className="in" style={{ maxWidth: 280, marginBottom: 14 }} placeholder="Buscar nombre o SKU" aria-label="Buscar nombre o SKU" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <div className="scroll"><table className="tbl m-cards"><thead><tr>{admin && <th className="m-hide">SKU</th>}<th>Producto</th>{admin && <><th className="m-hide">Familia</th><th className="m-hide">Unidad</th></>}<th className="right">Precio</th><th className="right m-hide">Consignación</th><th className="right m-hide">Compra directa</th><th className="right">Stock total</th>{admin && <><th className="right m-hide">Llegó hoy</th><th className="right m-hide">Vendido hoy</th><th></th></>}</tr></thead>
          <tbody>{pg.rows.map((p) => {
            const s = prodStock(p.id), ms = ctx.S.moves.filter((m) => m.prod === p.id && dayKey(m.fecha) === k);
            const sum = (t: string) => Math.abs(ms.filter((m) => m.tipo === t).reduce((a, m) => a + m.qty, 0));
            const open = () => (admin ? openEditProduct(p.id) : openProductSheet(p.id));
            return (
              <tr key={p.id} className="click" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); }}>
                {admin && <td className="muted nowrap">{p.sku}</td>}
                <td><b>{p.nombre}</b>{!p.activo && <> <span className="pill mute">Inactivo</span></>}{kgGam(p) && <><br /><small className="muted">{kgGamTxt(p.id)}</small></>}</td>
                {admin && <><td>{p.familia === 'Otros' ? 'Sin clasificar' : p.familia}</td><td>{p.unidad}{p.unidad === 'kg' && p.pesoCaja ? ` (caja ${p.pesoCaja} kg)` : ''}</td></>}
                <td className="right num"><b>{clp(p.precio)}</b>{p.unidad === 'kg' ? '/kg' : ''}</td>
                {(['consig', 'directa'] as const).map((x) => { const v = p.envase ? null : srcStock(p.id, x); return <td key={x} className="right num">{v == null ? '—' : v <= 0 ? <span className="muted">0</span> : qtyFmt(v, p.unidad)}</td>; })}
                <td className="right num">{s <= 0 ? <span className="pill bad">0</span> : qtyFmt(s, p.unidad)}</td>
                {admin && <><td className="right num">{qtyFmt(sum('recepción'), p.unidad)}</td><td className="right num">{qtyFmt(sum('venta'), p.unidad)}</td>
                  <td className="right" onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}><button className="btn sm pri" onClick={() => openEditProduct(p.id)}>Editar</button> <button className="btn sm ghost" onClick={() => openProductSheet(p.id)}>Lotes</button></td></>}
              </tr>
            );
          })}</tbody></table></div>
        <Pager pg={pg} onPage={setPage} label="Páginas de productos" />
      </div>
    </>
  );
}

export function openProductSheet(pid: string): void { openModal(() => <ProductSheet pid={pid} />, { wide: true }); }
function ProductSheet({ pid }: { pid: string }) {
  const [lotPage, setLotPage] = useState(1), [mvPage, setMvPage] = useState(1);
  const p = P(pid), admin = isAdmin();
  const lots = prodLots(pid).filter((l) => lotStock(l.id) > 0), lotPg = paginate(lots, lotPage);
  const mvPg = paginate(ctx.S.moves.filter((m) => m.prod === pid).sort((a, b) => b.fecha - a.fecha), mvPage);
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>{p.sku} · {p.familia} · calibre/variedad {p.calibre}</p><h2>{p.nombre}</h2>
      <div className="grid g2" style={{ margin: '14px 0' }}>
        <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Precio</div><div className="val num" style={{ fontSize: 28 }}>{clp(p.precio)}{p.unidad === 'kg' ? '/kg' : ''}</div></div>
        <div className="card kpi" style={{ background: 'var(--panel)' }}><div className="lbl">Stock</div><div className="val num" style={{ fontSize: 28 }}>{qtyFmt(prodStock(pid), p.unidad)}</div>
          {!p.envase && <div className="sub">Consignación {qtyFmt(srcStock(pid, 'consig'), p.unidad)} · Compra directa {qtyFmt(srcStock(pid, 'directa'), p.unidad)}</div>}{kgGam(p) && <div className="sub">{kgGamTxt(pid)}</div>}</div>
      </div>
      <h3 style={{ fontSize: 15, margin: '6px 0' }}>Lotes en bodega (se vende primero el más antiguo)</h3>
      <div className="scroll"><table className="tbl m-cards"><thead><tr><th>Ingreso</th><th>Productor</th><th>Stock</th><th className="right">Queda</th><th className="right">Días</th></tr></thead>
        <tbody>{lotPg.rows.map((l) => { const d = Math.floor((now() - l.fecha) / DAY); return (
          <tr key={l.id}><td className="when">{fdate(l.fecha)}</td><td>{PR(l.productor).nombre}</td><td>{p.envase ? l.modalidad : SRC_LBL[lotSrc(l)] + (['consignación', 'compra'].includes(l.modalidad) ? '' : ' · ' + l.modalidad)}</td><td className="right num">{qtyFmt(lotStock(l.id), p.unidad)}</td><td className="right"><span className={`pill ${d >= 4 ? 'bad' : d >= 2 ? 'warn' : 'ok'}`}>{d}</span></td></tr>
        ); })}{!lots.length && <tr><td colSpan={5} className="muted">Sin stock</td></tr>}</tbody></table></div>
      <Pager pg={lotPg} onPage={setLotPage} label="Páginas de lotes" />
      {admin && <><h3 style={{ fontSize: 15, margin: '14px 0 6px' }}>Movimientos</h3>
        <div className="scroll"><table className="tbl"><tbody>{mvPg.rows.map((m) => <tr key={m.id}><td className="when">{fdt(m.fecha)}</td><td>{m.tipo}</td><td>{U(m.user).nombre}</td><td className="right num" style={{ color: m.qty < 0 ? 'var(--bad)' : 'var(--g700)' }}>{m.qty > 0 ? '+' : ''}{qtyFmt(m.qty, p.unidad)}</td></tr>)}</tbody></table></div>
        <Pager pg={mvPg} onPage={setMvPage} label="Páginas de movimientos del producto" /></>}
      <div className="acts">{admin && <><button className="btn ghost" onClick={() => openAdjustStock(pid)}>Ajustar stock</button><button className="btn ghost" onClick={() => openEditProduct(pid)}>Editar</button>{!p.envase && <button className="btn" onClick={() => openChangePrice(pid)}>Cambiar precio</button>}</>}<button className="btn pri" onClick={closeModal}>Cerrar</button></div>
    </>
  );
}

export function openChangePrice(pid: string): void { openModal(() => <ChangePrice pid={pid} />); }
function ChangePrice({ pid }: { pid: string }) {
  const p = P(pid);
  const [v, setV] = useState(String(p.precio));
  const save = async () => { const r = await exec(() => setPriceCmd(pid, v), (nv) => `Nuevo precio ${p.nombre}: ${clp(nv)}`); if (r !== undefined) closeModal(); };
  return (
    <>
      <h2>Cambiar precio</h2><p className="muted">{p.nombre} · actual {clp(p.precio)}{p.unidad === 'kg' ? '/kg' : '/gamela'}</p>
      <div className="f"><label htmlFor="np">Nuevo precio {p.unidad === 'kg' ? 'por kg' : 'por gamela'}</label><input id="np" className="in num" type="number" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} autoFocus onFocus={(e) => e.target.select()} style={{ fontSize: 22, fontWeight: 700 }} /></div>
      <p className="muted" style={{ fontSize: 12 }}>Los vendedores verán el aviso en la franja de precios. Las ventas anteriores mantienen su precio.</p>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={() => void save()}>Guardar</button></div>
    </>
  );
}

export function openAdjustStock(pid: string): void {
  if (!prodLots(pid).length) { void exec(() => adjustStockCmd(pid, '', '0', '')); return; }
  openModal(() => <AdjustStock pid={pid} />);
}
function AdjustStock({ pid }: { pid: string }) {
  const p = P(pid), lots = prodLots(pid).slice().reverse();
  const [lot, setLot] = useState(lots[0]?.id || ''), [q, setQ] = useState(''), [m, setM] = useState('');
  const save = async () => { if (await execOk(() => adjustStockCmd(pid, lot, q, m), 'Ajuste registrado')) closeModal(); };
  return (
    <>
      <h2>Ajustar stock</h2><p className="muted">{p.nombre} · stock {qtyFmt(prodStock(pid), p.unidad)}. Usa negativo para descontar.</p>
      <div className="f"><label htmlFor="al">Lote</label><select id="al" className="in" value={lot} onChange={(e) => setLot(e.target.value)}>
        {lots.map((l) => <option key={l.id} value={l.id}>{fdate(l.fecha)} · {p.envase ? '' : SRC_LBL[lotSrc(l)] + ' · '}{PR(l.productor).nombre} · {qtyFmt(lotStock(l.id), p.unidad)}</option>)}</select></div>
      <div className="f"><label htmlFor="aq">Cantidad (+/−)</label><input id="aq" className="in num" type="number" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="f"><label htmlFor="am">Motivo (obligatorio)</label><input id="am" className="in" placeholder="Ej: conteo físico" value={m} onChange={(e) => setM(e.target.value)} /></div>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={() => void save()}>Registrar ajuste</button></div>
    </>
  );
}

export function openEditProduct(pid: string): void { openModal(() => <EditProduct pid={pid} />); }
function EditProduct({ pid }: { pid: string }) {
  const p = pid ? P(pid) : null;
  const [f, setF] = useState<ProductInput>({ sku: p?.sku || '', nombre: p?.nombre || '', familia: p ? (p.familia === 'Otros' ? '' : p.familia) : 'Tomate', calibre: p?.calibre || '', unidad: p?.unidad || 'gamela', precio: p ? String(p.precio) : '', usaGamela: p ? p.usaGamela : true, activo: p ? p.activo : true });
  const set = (k: Partial<ProductInput>) => setF((x) => ({ ...x, ...k }));
  const save = async () => { if (await execOk(() => saveProductCmd(pid, f), 'Producto guardado')) closeModal(); };
  return (
    <>
      <h2>{pid ? 'Editar' : 'Nuevo'} producto</h2>
      <div className="row"><div className="f"><label htmlFor="e_sku">SKU</label><input id="e_sku" className="in" value={f.sku} placeholder="TOM-C9" onChange={(e) => set({ sku: e.target.value })} /></div>
        <div className="f"><label htmlFor="e_fam">Familia</label><select id="e_fam" className="in" value={f.familia} onChange={(e) => set({ familia: e.target.value })}><option value="">Selecciona una familia</option>{productFamilies().map((x) => <option key={x}>{x}</option>)}</select></div></div>
      <div className="f"><label htmlFor="e_nom">Nombre</label><input id="e_nom" className="in" value={f.nombre} placeholder="Tomate calibre 9" onChange={(e) => set({ nombre: e.target.value })} /></div>
      <div className="row"><div className="f"><label htmlFor="e_cal">Calibre / variedad</label><input id="e_cal" className="in" value={f.calibre} onChange={(e) => set({ calibre: e.target.value })} /></div>
        <div className="f"><label htmlFor="e_uni">Unidad</label><select id="e_uni" className="in" value={f.unidad} onChange={(e) => set({ unidad: e.target.value as Unidad })}><option value="gamela">Gamela</option><option value="kg">Kg</option></select></div></div>
      <div className="row"><div className="f"><label htmlFor="e_pre">Precio de venta ({f.unidad === 'kg' ? 'por kg' : 'por gamela'})</label><input id="e_pre" className="in num" type="number" inputMode="numeric" value={f.precio} onChange={(e) => set({ precio: e.target.value })} /></div></div>
      <div className="row"><label className="f" style={{ flexDirection: 'row', alignItems: 'center' }}><input id="e_gam" type="checkbox" checked={f.usaGamela} onChange={(e) => set({ usaGamela: e.target.checked })} /> Usa gamela retornable</label>
        <label className="f" style={{ flexDirection: 'row', alignItems: 'center' }}><input id="e_act" type="checkbox" checked={f.activo} onChange={(e) => set({ activo: e.target.checked })} /> Activo</label></div>
      {pid && <p className="muted" style={{ fontSize: 12 }}>Stock actual: <b>{qtyFmt(prodStock(pid), p!.unidad)}</b>. El stock no se edita aquí: se corrige con un ajuste con motivo.</p>}
      <div className="acts">{pid && <><button className="btn ghost" onClick={() => openAdjustStock(pid)}>Ajustar stock</button><button className="btn ghost" onClick={() => openProductSheet(pid)}>Ver lotes</button></>}
        <button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={() => void save()}>Guardar</button></div>
    </>
  );
}

function openNewFamily(): void { openModal(() => <NewFamily />); }
function NewFamily() {
  const [n, setN] = useState('');
  const save = async () => { if (await execOk(() => saveFamilyCmd(n), 'Familia agregada.')) closeModal(); };
  return (
    <>
      <h2>Nueva familia</h2>
      <div className="f"><label htmlFor="family-name">Nombre de la familia</label><input id="family-name" className="in" maxLength={50} placeholder="Ej. Cítricos" value={n} onChange={(e) => setN(e.target.value)} autoFocus /></div>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={() => void save()}>Guardar familia</button></div>
    </>
  );
}
