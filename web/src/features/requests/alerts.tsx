import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/icons';
import { CL, P, U } from '../../domain/catalog';
import { clp, pctTxt } from '../../domain/format';
import { pendingAbonoRequests, pendingComRequests, pendingCreditRequests, pendingPriceRequests, pendingVoidRequests } from '../../domain/requests';
import { useApp } from '../../state/store';

/* Alertas a Luis cuando un vendedor pide autorización: notificación del sistema (celular o PC),
   sonido, vibración y contador en el título de la pestaña. Funcionan mientras la app esté abierta,
   aunque esté en segundo plano o con la pantalla en otra aplicación. */

interface Pending { id: string; text: string }

function pendingNow(): Pending[] {
  return [
    ...pendingCreditRequests().map((r) => ({ id: 'c:' + r.id, text: `${U(r.user).nombre} quiere fiar ${clp(r.monto)} a ${r.clienteNombre}` })),
    ...pendingAbonoRequests().map((r) => ({ id: 'a:' + r.id, text: `${U(r.user).nombre} recibió un pago de deuda de ${clp(r.monto)} (${CL(r.cliente).nombre})` })),
    ...pendingPriceRequests().map((r) => ({ id: 'p:' + r.id, text: `${U(r.user).nombre} quiere vender ${P(r.prod).nombre} a ${clp(r.precio)}` })),
    ...pendingComRequests().map((r) => ({ id: 'm:' + r.id, text: `${U(r.user).nombre} quiere cobrar ${pctTxt(r.pct)} de comisión` })),
    ...pendingVoidRequests().map((s) => ({ id: 'v:' + s.id, text: `${U(s.vendedor).nombre} pide anular la venta N° ${s.num} (${clp(s.total)})` })),
  ];
}

const supported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;
const BASE_TITLE = typeof document !== 'undefined' ? document.title : '';

let audio: AudioContext | null = null;
/** El navegador solo deja sonar después de un toque del usuario: se prepara en el primer clic. */
function unlockAudio(): void {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!audio && Ctor) audio = new Ctor();
    if (audio?.state === 'suspended') void audio.resume();
  } catch { /* sin sonido */ }
}
function chime(): void {
  try {
    if (!audio || audio.state !== 'running') return;
    const t0 = audio.currentTime;
    [880, 1175].forEach((f, i) => {
      const o = audio!.createOscillator(), g = audio!.createGain(), t = t0 + i * 0.18;
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(audio!.destination); o.start(t); o.stop(t + 0.4);
    });
  } catch { /* sin sonido */ }
}

/** En Android Chrome `new Notification()` no existe: hay que pasar por un service worker. */
let swReg: Promise<ServiceWorkerRegistration | null> | null = null;
function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!swReg) swReg = ('serviceWorker' in navigator ? navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready) : Promise.resolve(null)).catch(() => null);
  return swReg;
}
async function showSystem(title: string, body: string, tag: string): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return;
  const opts: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = { body, tag, icon: '/brand/favicon.png', badge: '/brand/favicon.png', renotify: true, requireInteraction: true, vibrate: [200, 100, 200] };
  const reg = await registration();
  try {
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch { /* se intenta abajo */ }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; } catch { /* sin notificación */ }
}

/** Vigila las solicitudes pendientes y avisa solo por las nuevas (no repite las que ya estaban al abrir). */
export function useRequestAlerts(enabled: boolean): void {
  useApp();
  const seen = useRef<Set<string> | null>(null);
  const list = enabled ? pendingNow() : [];
  const key = list.map((p) => p.id).join('|');

  useEffect(() => {
    if (!enabled) return;
    const onTouch = () => unlockAudio();
    window.addEventListener('pointerdown', onTouch, { capture: true });
    window.addEventListener('keydown', onTouch, { capture: true });
    if (supported() && Notification.permission === 'granted') void registration();
    return () => { window.removeEventListener('pointerdown', onTouch, { capture: true }); window.removeEventListener('keydown', onTouch, { capture: true }); };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { document.title = BASE_TITLE; return; }
    document.title = list.length ? `(${list.length}) ${BASE_TITLE}` : BASE_TITLE;
    const ids = new Set(list.map((p) => p.id));
    if (seen.current === null) { seen.current = ids; return; }
    const fresh = list.filter((p) => !seen.current!.has(p.id));
    seen.current = ids;
    if (!fresh.length) return;
    chime();
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* sin vibración */ }
    const title = fresh.length === 1 ? 'Solicitud por autorizar' : `${fresh.length} solicitudes por autorizar`;
    void showSystem(title, fresh.map((p) => p.text).join('\n'), 'solicitudes');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  useEffect(() => () => { document.title = BASE_TITLE; }, []);
}

/** Botón para que Luis active las notificaciones del sistema (el navegador exige un toque). */
export function AlertsToggle() {
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(supported() ? Notification.permission : 'unsupported');
  if (perm === 'granted') return null;
  if (perm === 'unsupported') return (
    <p className="muted alerts-note" role="note"><Icon n="bell" s={15} /> Este navegador no permite notificaciones. En iPhone, agrega la app a la pantalla de inicio (Compartir → Agregar a inicio) para recibirlas.</p>
  );
  if (perm === 'denied') return (
    <p className="muted alerts-note" role="note"><Icon n="bell" s={15} /> Las notificaciones están bloqueadas. Actívalas en los permisos del sitio del navegador para enterarte de las solicitudes.</p>
  );
  const enable = async () => {
    unlockAudio();
    const r = await Notification.requestPermission();
    setPerm(r);
    if (r === 'granted') { await registration(); void showSystem('Avisos activados', 'Te avisaremos cuando un vendedor pida una autorización.', 'solicitudes-ok'); }
  };
  return (
    <div className="card request-alert alerts-toggle" role="region" aria-label="Activar avisos">
      <div className="grow"><b>Activa los avisos de solicitudes</b><span className="muted"> Te llegará una notificación con sonido cuando un vendedor pida autorizar algo, aunque estés en otra aplicación.</span></div>
      <button className="btn sm pri" onClick={() => void enable()}><Icon n="bell" s={15} /> Activar avisos</button>
    </div>
  );
}
