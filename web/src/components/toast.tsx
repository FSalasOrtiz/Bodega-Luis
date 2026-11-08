import { useSyncExternalStore } from 'react';

/* Avisos breves (role="status"). Si falló un guardado, los avisos de éxito inmediatos se silencian. */
let msg = '', timer: ReturnType<typeof setTimeout> | undefined, version = 0, suppressUntil = 0;
const subs = new Set<() => void>();
const emit = () => { version++; subs.forEach((f) => f()); };

export function toast(text: string, force = false): void {
  if (!force && Date.now() < suppressUntil) return;
  msg = text;
  clearTimeout(timer);
  timer = setTimeout(() => { msg = ''; emit(); }, 2600);
  emit();
}
/** Muestra un error de guardado y silencia los avisos de éxito de los próximos segundos. */
export function toastError(text: string): void {
  suppressUntil = Date.now() + 3000;
  toast(text, true);
}
export const currentToast = (): string => msg;

export function Toast() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);
  return msg ? <div className="toast" role="status" aria-live="polite">{msg}</div> : null;
}
