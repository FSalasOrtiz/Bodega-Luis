import { useState } from 'react';
import { closeModal, openModal } from '../../components/modal';
import { toast } from '../../components/toast';
import { me } from '../../domain/ctx';
import { passwordChangeError, pwChangesToday, pwLimited, PW_MAX_DIA, recordPasswordChangeCmd } from '../../domain/operations';
import { services } from '../../app/services';
import { store } from '../../state/store';

/** El vendedor cambia su propia contraseña: máximo 2 veces por día. El administrador, sin límite. */
export function openPasswordForm(): void {
  const u = me();
  if (!u) return;
  const left = PW_MAX_DIA - pwChangesToday(u);
  if (pwLimited(u) && left <= 0) { toast('Ya cambiaste tu contraseña 2 veces hoy. Inténtalo mañana.'); return; }
  openModal(() => <PasswordForm />);
}

function PasswordForm() {
  const u = me()!;
  const [o, setO] = useState(''), [n, setN] = useState(''), [r, setR] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const left = PW_MAX_DIA - pwChangesToday(u);
  const save = async () => {
    if (busy) return;
    const pre = passwordChangeError(u, true, n, r, o);
    if (pre) return setErr(pre);
    setBusy(true);
    try {
      await services.auth.changePassword(u.usuario, o, n, store.get().S);
      await store.run(() => recordPasswordChangeCmd(services.auth.kind === 'local' ? n : null));
      closeModal();
      const v = me()!;
      toast(!pwLimited(v) ? 'Contraseña cambiada.' : pwChangesToday(v) >= PW_MAX_DIA ? 'Contraseña cambiada. Ya no puedes cambiarla de nuevo hoy.' : 'Contraseña cambiada. Puedes cambiarla 1 vez más hoy.');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <h2>Cambiar contraseña</h2>
      <p className="muted">{pwLimited(u) ? `Puedes cambiarla ${left === 1 ? '1 vez más' : '2 veces'} hoy (máximo ${PW_MAX_DIA} por día).` : 'Escribe tu contraseña actual y la nueva.'}</p>
      <div className="f"><label htmlFor="pw-old">Contraseña actual</label><input id="pw-old" className="in" type="password" autoComplete="current-password" autoFocus value={o} onChange={(e) => setO(e.target.value)} /></div>
      <div className="f"><label htmlFor="pw-new">Nueva contraseña</label><input id="pw-new" className="in" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={n} onChange={(e) => setN(e.target.value)} /><small className="muted">6 números.</small></div>
      <div className="f"><label htmlFor="pw-rep">Repite la nueva contraseña</label><input id="pw-rep" className="in" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={r} onChange={(e) => setR(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} /></div>
      <p className="err" id="pw-err" role="alert">{err}</p>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" disabled={busy} onClick={() => void save()}>Guardar contraseña</button></div>
    </>
  );
}
