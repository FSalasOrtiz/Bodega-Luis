import { useState } from 'react';
import { Logo } from '../../components/icons';
import { ThemePicker } from '../../components/ui';
import { login } from '../../app/actions';

export function Login() {
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [, force] = useState(0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try { await login(u, p); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Usuario o contraseña incorrectos'); document.getElementById('lg_p')?.focus(); }
    finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="box" onSubmit={submit}>
        <div className="brand-plate login-brand"><Logo w={240} /></div>
        <p className="muted" style={{ margin: '0 0 20px' }}>Ingresa con tu usuario y contraseña</p>
        <div className="f" style={{ textAlign: 'left' }}><label htmlFor="lg_u">Usuario</label><input id="lg_u" className="in" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus value={u} onChange={(e) => setU(e.target.value)} /></div>
        <div className="f" style={{ textAlign: 'left' }}><label htmlFor="lg_p">Contraseña</label><input id="lg_p" className="in" type="password" autoComplete="current-password" required aria-describedby="perr" aria-invalid={err ? true : undefined} value={p} onChange={(e) => setP(e.target.value)} /></div>
        <div className="err" id="perr" role="alert">{err}</div>
        <button className="btn pri big" type="submit" style={{ marginTop: 6 }} disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}><ThemePicker onChange={() => force((x) => x + 1)} /></div>
      </form>
    </div>
  );
}
