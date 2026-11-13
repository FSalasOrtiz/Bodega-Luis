import { setClock } from '../../domain/format';

/**
 * Hora del servidor.
 * Las reglas de Firestore rechazan documentos cuya `fecha` se aleja más de 15 minutos de la hora del servidor.
 * Un celular con la hora o la zona horaria mal configurada quedaría sin poder guardar ("No tienes permiso…"),
 * así que la app mide el desfase con la cabecera Date del hosting y corrige su reloj.
 */
let skew = 0;
let lastSync = 0;

/** Desfase medido (servidor − dispositivo), en milisegundos. */
export const clockSkew = (): number => skew;

export async function syncServerClock(timeoutMs = 4000): Promise<void> {
  if (typeof fetch !== 'function' || typeof location === 'undefined') return;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const t0 = Date.now();
    const res = await fetch(`${location.origin}/index.html?t=${t0}`, { method: 'HEAD', cache: 'no-store', signal: ctl?.signal });
    const t1 = Date.now();
    const server = Date.parse(res.headers.get('date') || '');
    if (!Number.isFinite(server)) return;
    // la cabecera Date tiene resolución de 1 s: se toma el punto medio del viaje y se ignoran diferencias pequeñas
    const measured = server + 500 - (t0 + t1) / 2;
    skew = Math.abs(measured) > 30000 ? Math.round(measured) : 0;
    lastSync = t1;
    setClock(skew ? () => Date.now() + skew : () => Date.now());
  } catch {
    /* sin señal: se mantiene la última medición */
  } finally {
    clearTimeout(timer);
  }
}

/** Vuelve a medir al regresar a la app (el usuario pudo corregir la hora del teléfono). */
export function watchServerClock(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastSync > 60000) void syncServerClock();
  });
}
