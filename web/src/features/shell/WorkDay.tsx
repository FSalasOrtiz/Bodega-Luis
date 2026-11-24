import { getWorkDay, fdate, realNow, setWorkDay, dayKey, DAY } from '../../domain/format';
import { store } from '../../state/store';

/** Calendario del administrador (arriba a la derecha): elegir un día pasado para ver y registrar lo de ese día. */
export function WorkDayPicker() {
  const hoy = dayKey(realNow()), wd = getWorkDay();
  const set = (k: string) => { setWorkDay(k); store.refresh(); };
  const shift = (n: number) => { const base = new Date((wd || hoy) + 'T12:00').getTime() + n * DAY, k = dayKey(base); set(k >= hoy ? '' : k); };
  return (
    <div className={`workday ${wd ? 'past' : ''}`} role="group" aria-label="Calendario: día de trabajo">
      <button type="button" className="iconbtn" aria-label="Día anterior" title="Día anterior" onClick={() => shift(-1)}>‹</button>
      <label className="sr-only" htmlFor="workday">Día de trabajo</label>
      <input id="workday" type="date" className="in" max={hoy} value={wd || hoy} onChange={(e) => set(e.target.value && e.target.value < hoy ? e.target.value : '')} />
      <button type="button" className="iconbtn" aria-label="Día siguiente" title="Día siguiente" disabled={!wd} onClick={() => shift(1)}>›</button>
    </div>
  );
}

/** Aviso fijo mientras se trabaja en un día pasado. */
export function WorkDayBanner() {
  const wd = getWorkDay();
  if (!wd) return null;
  return (
    <p className="err workday-banner" role="status" style={{ margin: '0 0 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>📅 Estás trabajando en el <b>{fdate(new Date(wd + 'T12:00').getTime())}</b>. Lo que veas «de hoy» es de ese día y lo que registres (ventas, recepciones, gastos, cierres) queda con esa fecha.</span>
      <button className="btn sm pri" onClick={() => { setWorkDay(''); store.refresh(); }}>Volver a hoy</button>
    </p>
  );
}
