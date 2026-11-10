import { useState, type ReactNode } from 'react';
import { Icon } from './icons';

/** Encabezado de módulo: solo el título (sin descripción), por pedido de Felipe. */
export function Head({ t, acts }: { t: string; acts?: ReactNode }) {
  return (
    <div className="head">
      <div><h1>{t}</h1></div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{acts}</div>
    </div>
  );
}

/* Paginación numerada (estilo Google): 5 por página para que cada tarjeta quede liviana; las tablas principales a todo el ancho (ventas y movimientos) usan PAGE_LONG. Ventana de hasta 5 números para que quepa en una línea aun en columnas angostas. */
export const PAGE_SIZE = 5;
export const PAGE_SHORT = 5;
export const PAGE_LONG = 10;
export interface Page<T> { rows: T[]; p: number; n: number; from: number; to: number; total: number }
export function paginate<T>(rows: T[], page: number, size = PAGE_SIZE): Page<T> {
  const n = Math.max(1, Math.ceil(rows.length / size)), p = Math.min(Math.max(1, page || 1), n);
  return { rows: rows.slice((p - 1) * size, p * size), p, n, from: rows.length ? (p - 1) * size + 1 : 0, to: Math.min(p * size, rows.length), total: rows.length };
}
/** `inline`: para listas dentro de una tarjeta que es un atajo (Dashboard): no desplaza la página ni activa el atajo de la tarjeta. */
export function Pager({ pg, onPage, label = 'Paginación', inline = false }: { pg: Page<unknown>; onPage: (p: number) => void; label?: string; inline?: boolean }) {
  if (pg.n < 2) return null;
  const { p, n } = pg, start = Math.max(1, Math.min(p - 2, n - 4)), end = Math.min(n, start + 4);
  const go = (i: number, el: HTMLElement) => { onPage(i); if (!inline) requestAnimationFrame(() => el.closest('.card')?.scrollIntoView({ block: 'start' })); };
  const B = ({ i, t, aria }: { i: number; t: ReactNode; aria?: string }) => (
    <button className={`btn sm ${i === p && !aria ? 'pri' : 'ghost'}`} aria-current={i === p && !aria ? 'page' : undefined} aria-label={aria || 'Página ' + i} onClick={(e) => go(i, e.currentTarget)}>{t}</button>
  );
  const nums = [];
  for (let i = start; i <= end; i++) nums.push(<B key={i} i={i} t={i} />);
  // en celular solo se ven Anterior · «3 de 96» · Siguiente (ver .pager-info en app.css)
  return (
    <nav className="pager" aria-label={label} onClick={inline ? (e) => e.stopPropagation() : undefined} onKeyDown={inline ? (e) => e.stopPropagation() : undefined}>
      {p > 1 && <B i={p - 1} t="‹ Anterior" aria="Página anterior" />}
      <span className="pager-info" aria-hidden="true">{p} de {n}</span>
      {start > 1 && <><B i={1} t={1} />{start > 2 && <span className="gap" aria-hidden="true">…</span>}</>}
      {nums}
      {end < n && <>{end < n - 1 && <span className="gap" aria-hidden="true">…</span>}<B i={n} t={n} /></>}
      {p < n && <B i={p + 1} t="Siguiente ›" aria="Página siguiente" />}
    </nav>
  );
}

/* Tema: oscuro o mixto (mint). */
export const THEMES: [string, string, string][] = [['dark', 'moon', 'Oscuro'], ['mint', 'half', 'Mixto']];
export function applyTheme(t: string | null): void {
  const th = t === 'dark' || t === 'mint' ? t : 'mint';
  document.documentElement.dataset.theme = th;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', th === 'dark' ? '#171614' : '#e8ebd9');
}
export function ThemePicker({ onChange }: { onChange: () => void }) {
  const cur = document.documentElement.dataset.theme;
  return (
    <div className="themes">
      {THEMES.map(([t, i, n]) => (
        <button key={t} type="button" title={`Tema ${n}`} aria-label={`Tema ${n}`} aria-pressed={cur === t} className={cur === t ? 'on' : ''}
          onClick={() => { applyTheme(t); try { localStorage.setItem('bodegaLV.theme', t); } catch { /* sin almacenamiento */ } onChange(); }}>
          <Icon n={i} s={17} />
        </button>
      ))}
    </div>
  );
}

/** Control segmentado (botones excluyentes). */
export function Seg<T extends string>({ value, options, onChange, label, className = '' }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; label?: string; className?: string }) {
  return (
    <div className={`seg ${className}`} role="group" aria-label={label}>
      {options.map(([v, t]) => <button type="button" key={v} className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>)}
    </div>
  );
}

/** Fila/elemento clickeable accesible (rol botón, Enter/Espacio). */
export function clickable(onActivate: () => void, label?: string) {
  return {
    role: 'button' as const, tabIndex: 0, 'aria-label': label,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); onActivate(); }
      if (e.key === ' ') e.preventDefault();
    },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && e.key === ' ') onActivate(); },
  };
}

/** Lista de productos resumida: muestra los primeros y un botón "+N más" que despliega el resto (por ejemplo, una recepción con 12 calibres). */
export function ItemList({ items, max = 2 }: { items: string[]; max?: number }) {
  const [open, setOpen] = useState(false);
  if (items.length <= max + 1) return <>{items.join(', ')}</>;
  return (
    <span className="item-list">{(open ? items : items.slice(0, max)).join(', ')}{' '}
      <button type="button" className="more-link" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{open ? 'ver menos' : `+${items.length - max} más`}</button>
    </span>
  );
}
