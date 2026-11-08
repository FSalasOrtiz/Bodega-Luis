import { useState, type ReactNode } from 'react';
import { Emo, Icon, Logo } from '../../components/icons';
import { clickable, ThemePicker } from '../../components/ui';
import { closeModal, openModal } from '../../components/modal';
import { me } from '../../domain/ctx';
import { useApp } from '../../state/store';
import { bottomLabel, bottomNav, MENU, menuFor, ROLE_LABEL } from '../../routes/menu';
import { go, logout } from '../../app/actions';
import { openPasswordForm } from '../auth/PasswordForm';
import { AdminBanners } from '../requests/Banners';

export function Shell({ children }: { children: ReactNode }) {
  const { view, online } = useApp();
  const [, force] = useState(0);
  const u = me()!;
  const m = menuFor(u), admin = u.rol === 'admin', accountant = u.rol === 'contador';
  const bn = bottomNav(u);
  return (
    <>
      <div className="app">
        <aside className="side">
          <div className="brand-plate side-brand"><Logo w={176} /></div>
          <div className="navlbl">Menú</div>
          <nav className="nav" aria-label="Módulos">
            {m.map((x) => (
              <a key={x.id} className={view === x.id ? 'on' : ''} aria-current={view === x.id ? 'page' : undefined} {...clickable(() => go(x.id))}>
                <Emo e={x.e} />{!admin && x.tv ? x.tv : x.t}
              </a>
            ))}
          </nav>
          <div className="navlbl">General</div>
          <nav className="nav" aria-label="General">
            <a {...clickable(openPasswordForm)}><Emo e="🔑" />Cambiar contraseña</a>
            <a {...clickable(() => void logout())}><Emo e="🚪" />Cerrar sesión</a>
          </nav>
        </aside>
        <main className="main" id="main-content" tabIndex={-1}>
          <div className="top">
            <div className="mobile-brand"><Logo w={52} mark /></div>
            <div className="me">
              <ThemePicker onChange={() => force((x) => x + 1)} />
              <span className="avatar">{u.nombre[0]}</span>
              <div><b>{u.nombre}</b><span>{u.rol === 'vendedor' ? 'Vendedor · ' + u.turno : ROLE_LABEL[u.rol]}</span></div>
              <button className="iconbtn" onClick={() => void logout()} title="Salir" aria-label="Cerrar sesión"><Icon n="out" s={17} /></button>
            </div>
          </div>
          {!online && <p className="err" role="status" style={{ margin: '0 0 12px' }}>Sin conexión: los cambios se guardarán cuando vuelva la señal. No cierres la aplicación.</p>}
          {admin && <AdminBanners />}
          {children}
        </main>
      </div>
      <nav className="bnav" aria-label="Navegación inferior">
        {bn.map((id) => {
          const x = MENU.find((y) => y.id === id)!;
          return <a key={id} className={view === id ? 'on' : ''} aria-current={view === id ? 'page' : undefined} {...clickable(() => go(id))}><Emo e={x.e} s={22} />{bottomLabel(id, u)}</a>;
        })}
        {!accountant && <a {...clickable(openMoreMenu)}><Emo e="➕" s={22} />Más</a>}
      </nav>
    </>
  );
}

function openMoreMenu(): void {
  openModal(() => {
    const u = me()!;
    const skip = bottomNav(u);
    return (
      <>
        <h2>Más opciones</h2>
        <div className="rows" style={{ marginTop: 10 }}>
          {menuFor(u).filter((m) => !skip.includes(m.id)).map((m) => (
            <div key={m.id} style={{ cursor: 'pointer' }} {...clickable(() => { closeModal(); go(m.id); })}><Emo e={m.e} s={22} /><div className="grow"><b>{m.t}</b></div></div>
          ))}
          <div style={{ cursor: 'pointer' }} {...clickable(() => { closeModal(); openPasswordForm(); })}><Emo e="🔑" s={22} /><div className="grow"><b>Cambiar contraseña</b></div></div>
        </div>
      </>
    );
  });
}
