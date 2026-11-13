import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Head, ItemList, paginate, Pager, Seg } from '../../components/ui';
import { closeModal, openModal } from '../../components/modal';
import { kgGam, P, PR, recProducts, U } from '../../domain/catalog';
import { ctx, isAdmin, me } from '../../domain/ctx';
import { clp, fdt, kg, now, qtyFmt } from '../../domain/format';
import { kgGamTxt } from '../../domain/gamelas';
import { saveMermaCmd, saveReceptionCmd, voidReceptionCmd, type RecLineInput } from '../../domain/operations';
import { SRC_LBL, srcStock } from '../../domain/stock';
import type { Fuente, Modalidad } from '../../types/model';
import { useApp } from '../../state/store';
import { exec, execOk } from '../../app/actions';
import { askReason } from '../shared/askReason';
import { openProducerForm } from '../producers/ProducerForm';

interface RecForm { productor: string; modalidad: Modalidad; lineas: RecLineInput[] }
const firstProduct = () => ctx.S.products.find((p) => p.activo && !p.envase)?.id || '';
const newRecForm = (): RecForm => ({ productor: ctx.S.producers[0]?.id || '', modalidad: 'consignación', lineas: [{ prod: firstProduct(), qty: '', costo: '' }] });

export function Reception() {
  useApp();
  const [tab, setTab] = useState<'rec' | 'merma'>(() => (sessionStorage.getItem('bodegaLV.recTab') === 'merma' ? 'merma' : 'rec'));
  const pick = (t: 'rec' | 'merma') => { setTab(t); try { sessionStorage.setItem('bodegaLV.recTab', t); } catch { /* nada */ } };
  return (
    <>
      <Head t="Recepción / Merma" />
      <div className="big2">
        <button className={`bigbtn ${tab === 'rec' ? 'on' : ''}`} aria-pressed={tab === 'rec'} onClick={() => pick('rec')}><Icon n="rec" s={28} /><b>Recepción de producto</b><span>Llegó un camión o un productor</span></button>
        <button className={`bigbtn ${tab === 'merma' ? 'on' : ''}`} aria-pressed={tab === 'merma'} onClick={() => pick('merma')}><Icon n="moves" s={28} /><b>Merma</b><span>Producto podrido, dañado o reacondicionado</span></button>
      </div>
      {tab === 'rec' ? <RecView /> : <MermaView />}
    </>
  );
}

/** El formulario se conserva al cambiar de módulo, como en el prototipo (hasta guardarlo). */
let recFormCache: RecForm | null = null;
function RecView() {
  const [f, setFState] = useState<RecForm>(() => recFormCache || newRecForm());
  const setF = (v: RecForm | ((x: RecForm) => RecForm)) => setFState((x) => { const n = typeof v === 'function' ? v(x) : v; recFormCache = n; return n; });
  const [busy, setBusy] = useState(false);
  const S = ctx.S;
  const upd = (i: number, patch: Partial<RecLineInput>) => setF((x) => ({ ...x, lineas: x.lineas.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const tot = f.lineas.reduce((a, l) => { const p = P(l.prod); const q = Number(String(l.qty).replace(',', '.')) || 0; return { g: a.g + (p?.unidad === 'gamela' ? q : 0), k: a.k + (p?.unidad === 'kg' ? q : 0), c: a.c + q * (Number(l.costo) || 0) }; }, { g: 0, k: 0, c: 0 });
  const recent = S.receptions.slice().sort((a, b) => b.fecha - a.fecha).slice(0, 8);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const r = await exec(() => saveReceptionCmd(f), 'Recepción guardada · stock disponible');
    setBusy(false);
    if (r) { recFormCache = null; setFState(newRecForm()); openRecDoc(r.id); }
  };
  return (
    <>
      <div className="grid g3 stack">
        <div className="card span2">
          <div className="reception-form-header"><div><h3>Nueva recepción</h3><p className="muted">{fdt(now())}</p></div>
            <button className="btn pri sm" onClick={() => openProducerForm('', (id) => setF((x) => ({ ...x, productor: id })))}><Icon n="plus" s={17} />Agregar productor / proveedor</button></div>
          <div className="row">
            <div className="f"><label htmlFor="rec-prod">Productor o proveedor</label>
              <select id="rec-prod" className="in" value={f.productor} onChange={(e) => setF({ ...f, productor: e.target.value })}>{S.producers.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
            <div className="f"><label>Modalidad</label><Seg<Modalidad> value={f.modalidad} options={[['consignación', 'Consignación'], ['compra', 'Compra directa']]} onChange={(m) => setF({ ...f, modalidad: m })} label="Modalidad" /></div>
          </div>
          {f.lineas.map((l, i) => {
            const p = P(l.prod);
            return (
              <div className="row" key={i} style={{ alignItems: 'flex-end', borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
                <div className="f" style={{ flex: 2 }}><label htmlFor={`rl-p-${i}`}>Producto</label>
                  <select id={`rl-p-${i}`} className="in" value={l.prod} onChange={(e) => upd(i, { prod: e.target.value })}>{recProducts().map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
                <div className="f"><label htmlFor={`rl-q-${i}`}>{p?.unidad === 'kg' ? 'Kg totales' : 'Gamelas'}</label>
                  <input id={`rl-q-${i}`} className="in num" type="text" inputMode="decimal" autoComplete="off" placeholder="0" value={String(l.qty)} onChange={(e) => upd(i, { qty: e.target.value })} /></div>
                {kgGam(p) && <div className="f"><label htmlFor={`rl-g-${i}`}>Gamelas</label><input id={`rl-g-${i}`} className="in num" type="text" inputMode="numeric" autoComplete="off" placeholder="0" value={l.gam ?? ''} onChange={(e) => upd(i, { gam: e.target.value.trim() })} /></div>}
                {f.modalidad === 'compra' && !p?.envase && <div className="f"><label htmlFor={`rl-c-${i}`}>Costo {p?.unidad === 'kg' ? '/kg' : '/gamela'}</label><input id={`rl-c-${i}`} className="in num" type="number" inputMode="numeric" placeholder="$" value={String(l.costo ?? '')} onChange={(e) => upd(i, { costo: e.target.value })} /></div>}
              </div>
            );
          })}
          <button className="btn ghost sm" onClick={() => setF((x) => ({ ...x, lineas: [...x.lineas, { prod: firstProduct(), qty: '', costo: '' }] }))}><Icon n="plus" s={16} />Agregar producto</button>
          <div className="total" style={{ fontSize: 18 }}><span>Total recepción</span><span className="num">{tot.g ? tot.g + ' gamelas' : ''}{tot.g && tot.k ? ' · ' : ''}{tot.k ? kg(tot.k) + ' kg' : ''}{!tot.g && !tot.k ? '—' : ''}{f.modalidad === 'compra' && tot.c ? ' · ' + clp(tot.c) : ''}</span></div>
          <button className="btn pri big" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar recepción'}</button>
        </div>
        <div className="card"><h3>Últimas recepciones</h3>
          <div className="rows">{recent.map((r) => (
            <div key={r.id} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onClick={() => openRecDoc(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') openRecDoc(r.id); }}>
              <span className={`ico ${r.modalidad === 'compra' ? 'o' : 'p'}`}>{r.modalidad === 'compra' ? 'C' : 'P'}</span>
              <div className="grow"><b>{PR(r.productor).nombre}</b><span>{fdt(r.fecha)} · {U(r.user).nombre}</span></div>
              {r.anulada ? <span className="pill bad">Anulada</span> : <b className="num">{r.lineas.reduce((a, l) => a + l.qty, 0)}</b>}
            </div>
          ))}</div>
        </div>
      </div>
      <ReceptionHistory />
    </>
  );
}

export function ReceptionHistory() {
  const [page, setPage] = useState(1);
  const all = ctx.S.receptions.filter((r) => isAdmin() || r.user === me()!.id).slice().sort((a, b) => b.fecha - a.fecha), pg = paginate(all, page);
  return (
    <div className="card" style={{ marginTop: 14 }}><h3>Historial de recepciones</h3>
      <div className="scroll"><table className="tbl m-cards"><thead><tr><th>Fecha</th><th>Productor / proveedor</th><th>Modalidad</th><th>Productos</th><th>Estado</th><th></th></tr></thead>
        <tbody>{pg.rows.map((r) => (
          <tr key={r.id}><td className="when">{fdt(r.fecha)}</td><td>{(r.proveedor || PR(r.productor)).nombre}</td><td>{r.modalidad === 'compra' ? 'Compra directa' : 'Consignación'}</td>
            <td><ItemList items={r.lineas.map((l) => (l.nombre || P(l.prod).nombre) + ' × ' + qtyFmt(l.qty, l.unidad || P(l.prod).unidad) + (l.gamelas ? ` (${l.gamelas} gam.)` : '')).concat(r.gamelas ? ['Gamelas × ' + r.gamelas] : [])} /></td>
            <td>{r.anulada ? 'Anulada' : 'Registrada'}</td><td><button className="btn ghost sm" onClick={() => openRecDoc(r.id)}>Ver comprobante</button></td></tr>
        ))}{!pg.rows.length && <tr><td colSpan={6} className="empty">Sin recepciones</td></tr>}</tbody></table></div>
      {all.length > 0 && <p className="muted" style={{ margin: '10px 0 0' }}>Mostrando {pg.from}–{pg.to} de {all.length} recepciones.</p>}
      <Pager pg={pg} onPage={setPage} label="Páginas de recepciones" />
    </div>
  );
}

function MermaView() {
  const S = ctx.S;
  const [prod, setProd] = useState(() => S.products.find((p) => p.activo && !p.envase)?.id || '');
  const [src, setSrc] = useState<Fuente>('consig'), [qty, setQty] = useState(''), [gam, setGam] = useState('');
  const p = P(prod), available = srcStock(p.id, src), q = Number(qty.replace(',', '.'));
  const save = async () => { if (await execOk(() => saveMermaCmd(prod, src, qty, gam), 'Merma registrada.')) { setQty(''); setGam(''); } };
  return (
    <div className="card"><h3>Registrar merma</h3>
      <div className="f"><label>Sale del stock de</label><Seg<Fuente> value={src} options={[['consig', SRC_LBL.consig], ['directa', SRC_LBL.directa]]} onChange={setSrc} label="Sale del stock de" /></div>
      <div className="f"><label htmlFor="waste-product">Producto</label>
        <select id="waste-product" className="in" value={prod} onChange={(e) => { setProd(e.target.value); setQty(''); setGam(''); }}>{S.products.filter((x) => x.activo && !x.envase).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
      <p className="muted">Disponible en {SRC_LBL[src].toLowerCase()}: {qtyFmt(available, p.unidad)}</p>
      <div className="f"><label htmlFor="waste-qty">Cantidad que se bota ({p.unidad === 'kg' ? 'kg' : 'gamelas'})</label>
        <input id="waste-qty" className="in num" type="text" inputMode="decimal" autoComplete="off" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
      {kgGam(p) && <div className="f"><label htmlFor="waste-gam">Gamelas que se botan</label><input id="waste-gam" className="in num" type="text" inputMode="numeric" autoComplete="off" placeholder="0" value={gam} onChange={(e) => setGam(e.target.value.trim())} /><small className="muted">{kgGamTxt(p.id)}</small></div>}
      {q > available && <p className="err">La cantidad supera el stock disponible.</p>}
      <button className="btn pri big" disabled={!Number.isFinite(q) || q <= 0 || q > available} onClick={() => void save()}>Confirmar merma</button>
    </div>
  );
}

/* ---------- comprobante de recepción ---------- */
export function openRecDoc(id: string): void {
  if (!ctx.S.receptions.some((x) => x.id === id)) return;
  openModal(() => <RecDoc id={id} />, { wide: true });
}
function RecDoc({ id }: { id: string }) {
  const r = ctx.S.receptions.find((x) => x.id === id);
  if (!r) return null;
  const pr = r.proveedor || PR(r.productor), cfg = r.emisor || ctx.S.cfg, total = r.lineas.reduce((a, l) => a + l.qty * l.costo, 0);
  const voidIt = () => askReason('Anular recepción', 'Se descontará del stock lo que aún quede de estos lotes.', async (m) => {
    if (await execOk(() => voidReceptionCmd(r.id, m), 'Recepción anulada')) closeModal();
  });
  return (
    <>
      <article className="printable reception-paper">
        <header><div><h2>{cfg.nombre}</h2><p>RUT {cfg.rut}</p></div><div><h3>Comprobante de recepción</h3><p>{fdt(r.fecha)}</p></div></header>
        <p className="reception-status">Comprobante interno · {r.anulada ? 'ANULADO' : r.modalidad === 'compra' ? 'Compra directa' : 'Consignación'}</p>
        <dl><dt>Productor / proveedor</dt><dd>{pr.nombre}</dd><dt>RUT</dt><dd>{pr.rut || 'No registrado'}</dd><dt>Teléfono</dt><dd>{pr.fono || 'No registrado'}</dd><dt>Recibió</dt><dd>{U(r.user).nombre}</dd></dl>
        <div className="scroll"><table><thead><tr><th>Producto</th><th>Cantidad</th>{r.modalidad === 'compra' && <><th>Costo unitario</th><th>Subtotal</th></>}</tr></thead>
          <tbody>{r.lineas.map((l, i) => <tr key={i}><td>{l.nombre || P(l.prod).nombre}</td><td>{qtyFmt(l.qty, l.unidad || P(l.prod).unidad)}{l.gamelas ? ` · ${l.gamelas} gamela${l.gamelas === 1 ? '' : 's'}` : ''}</td>{r.modalidad === 'compra' && <><td>{clp(l.costo)}</td><td>{clp(l.qty * l.costo)}</td></>}</tr>)}</tbody></table></div>
        {r.gamelas ? <p>Gamelas recibidas: <b>{r.gamelas}</b></p> : null}
        {r.modalidad === 'compra' ? <p className="reception-total">Total compra <b>{clp(total)}</b></p> : r.comision != null ? <p>Comisión de consignación: {r.comision}%</p> : <p>Consignación: la comisión se fija en cada venta.</p>}
        <div className="reception-print-footer">{r.foto && <p>Guía adjunta: {r.foto} (archivo antiguo no almacenado)</p>}<p className="reception-signature">Firma recepción: __________________________</p><small>Registro interno de ingreso de mercadería. No constituye un documento tributario.</small></div>
      </article>
      <div className="acts noprint">
        {isAdmin() && !r.anulada && <button className="btn bad" onClick={voidIt}>Anular</button>}
        <button className="btn ghost" onClick={printReception}>PDF / Imprimir</button>
        <button className="btn pri" onClick={closeModal}>Listo</button>
      </div>
    </>
  );
}
const PRINT_CSS = '@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;color:#18221c;background:white;font:11pt Arial,sans-serif;line-height:1.45}article{width:100%;overflow-wrap:anywhere}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #354c3c;padding-bottom:12px;break-inside:avoid}h2{font-size:18pt}h3{font-size:13pt}h2,h3,p{margin:0 0 8px}.reception-status{padding:10px;background:#edf2ee;margin-top:16px}dl{display:grid;grid-template-columns:35% 65%;gap:8px 0;margin:20px 0;break-inside:avoid}dt{font-weight:bold}dd{margin:0}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10pt}th,td{padding:10px 6px;border-bottom:1px solid #ccd5cf;text-align:right;vertical-align:top;overflow-wrap:anywhere}th:first-child,td:first-child{text-align:left;width:38%}th{background:#edf2ee}thead{display:table-header-group}tr{break-inside:avoid}.scroll{overflow:visible}.reception-total{display:flex;justify-content:space-between;padding:16px 0;font-size:14pt;break-inside:avoid}.reception-signature{margin:32px 0}small{font-size:9pt}.reception-print-footer{break-inside:avoid}.noprint{display:none}';
/** Imprime solo el comprobante (A4) en un iframe aislado. */
function printReception(): void {
  const article = document.querySelector('.reception-paper');
  if (!article) return;
  document.getElementById('reception-print-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'reception-print-frame'; frame.title = 'Impresión de comprobante de recepción'; frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0;';
  frame.onload = () => { const t = frame.contentWindow; if (!t) return; t.addEventListener('afterprint', () => frame.remove(), { once: true }); t.focus(); t.print(); };
  frame.srcdoc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante de recepción</title><style>${PRINT_CSS}</style></head><body>${article.outerHTML}</body></html>`;
  document.body.appendChild(frame);
}
