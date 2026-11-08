import type { ReactNode } from 'react';
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

/* Paginación numerada (estilo Google): 20 por página, ventana de hasta 10 números. */
export const PAGE_SIZE = 20;
export interface Page<T> { rows: T[]; p: number; n: number; from: number; to: number; total: number }
export function paginate<T>(rows: T[], page: number): Page<T> {
  const n = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), p = Math.min(Math.max(1, page || 1), n);
  return { rows: rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), p, n, from: rows.length ? (p - 1) * PAGE_SIZE + 1 : 0, to: Math.min(p * PAGE_SIZE, rows.length), total: rows.length };
}
export function Pager({ pg, onPage, label = 'Paginación' }: { pg: Page<unknown>; onPage: (p: number) => void; label?: string }) {
  if (pg.n < 2) return null;
  const { p, n } = pg, start = Math.max(1, Math.min(p - 5, n - 9)), end = Math.min(n, start + 9);
  const go = (i: number, el: HTMLElement) => { onPage(i); requestAnimationFrame(() => el.closest('.card')?.scrollIntoView({ block: 'start' })); };
  const B = ({ i, t, aria }: { i: number; t: ReactNode; aria?: string }) => (
    <button className={`btn sm ${i === p && !aria ? 'pri' : 'ghost'}`} aria-current={i === p && !aria ? 'page' : undefined} aria-label={aria || 'Página ' + i} onClick={(e) => go(i, e.currentTarget)}>{t}</button>
  );
  const nums = [];
  for (let i = start; i <= end; i++) nums.push(<B key={i} i={i} t={i} />);
  return (
    <nav className="pager" aria-label={label}>
      {p > 1 && <B i={p - 1} t="‹ Anterior" aria="Página anterior" />}
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
