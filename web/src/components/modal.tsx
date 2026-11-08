import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useApp } from '../state/store';

/*
 * Ventana modal accesible, equivalente a la del prototipo:
 * role="dialog", aria-modal, título enlazado, foco atrapado, Escape y clic fuera cierran,
 * el resto de la app queda inerte y el foco vuelve al control que la abrió.
 * El contenido es una función: se vuelve a dibujar cuando cambian los datos (sin cerrar ni parpadear).
 */
interface ModalSpec { render: () => ReactNode; wide?: boolean; variant?: 'invoice'; key: number }
let current: ModalSpec | null = null, seq = 0, version = 0, returnFocus: HTMLElement | null = null;
const subs = new Set<() => void>();
const emit = () => { version++; subs.forEach((f) => f()); };
let keyboard = false;
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', () => { keyboard = true; }, true);
  document.addEventListener('pointerdown', () => { keyboard = false; }, true);
}

export function openModal(render: () => ReactNode, opts: { wide?: boolean; variant?: 'invoice' } = {}): void {
  if (!current) returnFocus = document.activeElement as HTMLElement | null;
  current = { render, ...opts, key: current ? current.key : ++seq };
  emit();
}
export function closeModal(): void {
  if (!current) return;
  current = null;
  emit();
  const r = returnFocus;
  returnFocus = null;
  if (r?.isConnected) r.focus({ preventScroll: true });
}
export const modalOpen = (): boolean => !!current;

const FOCUSABLE = 'button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]';

export function ModalHost() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);
  useApp(); // vuelve a dibujar el contenido cuando cambian los datos
  const ref = useRef<HTMLDivElement>(null);
  const spec = current;
  // la clase is-open la controla React (si la pusiéramos a mano, un cambio de ancho del diálogo la borraría)
  const [openKey, setOpenKey] = useState(0);
  const [instant, setInstant] = useState(false);

  useEffect(() => {
    const root = document.getElementById('root');
    const skip = document.querySelector('.skip-link');
    if (spec) {
      root?.querySelector('.app')?.setAttribute('inert', '');
      skip?.setAttribute('tabindex', '-1');
      document.body.classList.add('dialog-open');
    } else {
      root?.querySelector('.app')?.removeAttribute('inert');
      skip?.removeAttribute('tabindex');
      document.body.classList.remove('dialog-open');
    }
  }, [spec]);

  // al abrir: foco en el diálogo (o en el campo con autoFocus); el teclado del móvil no se abre solo
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d || !spec) return;
    setInstant(keyboard);
    void d.offsetWidth; // estado inicial antes de la transición
    setOpenKey(spec.key);
    const auto = d.querySelector<HTMLElement>('[autofocus]:not(:disabled)');
    (auto || d).focus({ preventScroll: true });
  }, [spec?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // título accesible
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    const h = d.querySelector('h2');
    if (h) { h.id = 'active-dialog-title-' + spec?.key; d.setAttribute('aria-labelledby', h.id); d.removeAttribute('aria-label'); }
    else { d.removeAttribute('aria-labelledby'); d.setAttribute('aria-label', 'Bodega Lo Valledor'); }
  });

  if (!spec) return null;
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length && x.tabIndex >= 0);
    const first = items[0], last = items[items.length - 1], act = document.activeElement;
    if (!first) { e.preventDefault(); ref.current.focus(); }
    else if (e.shiftKey && (act === first || act === ref.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (act === last || act === ref.current)) { e.preventDefault(); first.focus(); }
  };
  return (
    <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div ref={ref} key={spec.key} className={`modal t-modal ${spec.wide ? 'wide' : ''} ${spec.variant === 'invoice' ? 'invoice-preview' : ''} ${openKey === spec.key ? 'is-open' : ''} ${instant ? 'instant-motion' : ''}`} role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={onKey}>
        {spec.render()}
      </div>
    </div>
  );
}
