import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Head } from '../../components/ui';
import { closeModal, openModal } from '../../components/modal';
import { toast } from '../../components/toast';
import { U } from '../../domain/catalog';
import { ctx, isAdmin, me } from '../../domain/ctx';
import { clp, dayKey, today } from '../../domain/format';
import { saveCfgCmd, userInputError, type UserInput } from '../../domain/operations';
import { revenueEntries } from '../../domain/sales';
import type { Rol } from '../../types/model';
import { useApp } from '../../state/store';
import { exec } from '../../app/actions';
import { adminServices } from '../../app/services';
import { ROLE_LABEL } from '../../routes/menu';

export function Users() {
  useApp();
  const S = ctx.S, k = today(), c = S.cfg;
  const [cfg, setCfg] = useState({ nombre: c.nombre, rut: c.rut, giro: c.giro || '', direccion: c.direccion || '', comuna: c.comuna || '', telefonoEmisor: c.telefonoEmisor || '' });
  const set = (p: Partial<typeof cfg>) => setCfg((x) => ({ ...x, ...p }));
  const rev = revenueEntries();
  return (
    <>
      <Head t="Usuarios y ajustes" acts={<button className="btn pri" onClick={() => openEditUser('')}><Icon n="plus" s={18} />Nuevo usuario</button>} />
      <div className="grid g3 stack">
        <div className="card span2"><h3>Usuarios</h3>
          <div className="scroll"><table className="tbl"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Turno</th><th className="right">Ventas hoy</th><th className="right">Ventas mes</th><th>Estado</th><th></th></tr></thead>
            <tbody>{S.users.map((u) => {
              const s = rev.filter((x) => x.vendedor === u.id);
              return (
                <tr key={u.id}><td><b>{u.nombre}</b></td><td className="muted">{u.usuario}</td><td>{ROLE_LABEL[u.rol] || 'Vendedor'}</td><td>{u.turno}</td>
                  <td className="right num">{clp(s.filter((x) => dayKey(x.fecha) === k).reduce((a, x) => a + x.total, 0))}</td>
                  <td className="right num">{clp(s.filter((x) => dayKey(x.fecha).slice(0, 7) === k.slice(0, 7)).reduce((a, x) => a + x.total, 0))}</td>
                  <td>{u.activo ? <span className="pill ok">Activo</span> : <span className="pill mute">Inactivo</span>}</td><td><button className="btn sm ghost" onClick={() => openEditUser(u.id)}>Editar</button></td></tr>
              );
            })}</tbody></table></div>
        </div>
        <div className="card"><h3>Ajustes de la bodega</h3>
          <div className="f"><label htmlFor="s_n">Nombre comercial</label><input id="s_n" className="in" value={cfg.nombre} onChange={(e) => set({ nombre: e.target.value })} /></div>
          <div className="f"><label htmlFor="s_r">RUT</label><input id="s_r" className="in" value={cfg.rut} onChange={(e) => set({ rut: e.target.value })} /></div>
          <div className="f"><label htmlFor="s_giro">Giro (para el comprobante)</label><input id="s_giro" className="in" maxLength={80} value={cfg.giro} placeholder="Actividad de la bodega" onChange={(e) => set({ giro: e.target.value })} /></div>
          <div className="f"><label htmlFor="s_dir">Dirección</label><input id="s_dir" className="in" maxLength={70} value={cfg.direccion} placeholder="Calle y número" onChange={(e) => set({ direccion: e.target.value })} /></div>
          <div className="f"><label htmlFor="s_com">Comuna</label><input id="s_com" className="in" maxLength={20} value={cfg.comuna} onChange={(e) => set({ comuna: e.target.value })} /></div>
          <div className="f"><label htmlFor="s_fono_emisor">Teléfono de la bodega</label><input id="s_fono_emisor" className="in" type="tel" maxLength={20} value={cfg.telefonoEmisor} onChange={(e) => set({ telefonoEmisor: e.target.value })} /></div>
          <button className="btn pri big" onClick={() => void exec(() => saveCfgCmd(cfg), 'Ajustes guardados')}>Guardar ajustes</button>
          <button className="btn bad big" style={{ marginTop: 10 }} onClick={openReset}>Reiniciar datos</button>
        </div>
      </div>
    </>
  );
}

function openReset(): void {
  openModal(() => (
    <>
      <h2>¿Reiniciar datos?</h2>
      <p className="muted">Se borra todo lo registrado: ventas, recepciones, stock, productores, clientes, créditos, cierres y gastos. Se mantienen los usuarios y el catálogo de productos con sus precios.</p>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button>
        {adminServices.allowDemoData && <button className="btn ghost" onClick={() => void reset(false)}>Cargar datos de ejemplo</button>}
        <button className="btn bad" onClick={() => void reset(true)}>Dejar en blanco</button></div>
    </>
  ));
}
async function reset(blank: boolean): Promise<void> {
  if (!isAdmin()) { toast('Requiere administrador.'); return; }
  try {
    await adminServices.reset(blank);
    try { Object.keys(localStorage).filter((k) => k.startsWith('bodegaLV.pos.')).forEach((k) => localStorage.removeItem(k)); } catch { /* nada */ }
    closeModal();
    toast(blank ? 'Datos borrados: la bodega parte en blanco.' : 'Datos de ejemplo cargados.');
  } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
}

function openEditUser(id: string): void { openModal(() => <EditUser id={id} />); }
function EditUser({ id }: { id: string }) {
  const u = id ? ctx.S.users.find((x) => x.id === id) : null, self = !!id && id === me()?.id;
  const [f, setF] = useState<UserInput>({ nombre: u?.nombre || '', usuario: u?.usuario || '', rol: u?.rol || 'vendedor', turno: u?.turno || 'mañana', clave: '', activo: u ? u.activo : true });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<UserInput>) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    const err = userInputError(id, f, ctx.S.users, me()!.id);
    if (err) { toast(err); return; }
    setBusy(true);
    try { await adminServices.users.save(id, f); closeModal(); toast('Usuario guardado'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <h2>{id ? 'Editar' : 'Nuevo'} usuario</h2>
      <div className="f"><label htmlFor="u_n">Nombre</label><input id="u_n" className="in" value={f.nombre} onChange={(e) => set({ nombre: e.target.value })} /></div>
      <div className="row"><div className="f"><label htmlFor="u_r">Rol</label>
        <select id="u_r" className="in" value={f.rol} disabled={self} title={self ? 'No puedes cambiar tu propio rol' : undefined} onChange={(e) => set({ rol: e.target.value as Rol })}>
          <option value="vendedor">Vendedor</option><option value="admin">Administrador</option><option value="contador">Contador(a) · solo lectura</option></select></div>
        <div className="f"><label htmlFor="u_t">Turno</label><select id="u_t" className="in" value={f.turno} onChange={(e) => set({ turno: e.target.value })}>{['mañana', 'noche', '-'].map((t) => <option key={t}>{t}</option>)}</select></div></div>
      <div className="row"><div className="f"><label htmlFor="u_u">Usuario</label><input id="u_u" className="in" autoCapitalize="none" value={f.usuario} disabled={!!id && services_isFirebase()} onChange={(e) => set({ usuario: e.target.value })} /></div>
        <div className="f"><label htmlFor="u_p">{id ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña'}</label><input id="u_p" className="in" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" placeholder="6 números" value={f.clave} onChange={(e) => set({ clave: e.target.value })} /></div></div>
      {id && !self && <label className="f" style={{ flexDirection: 'row', alignItems: 'center' }}><input id="u_a" type="checkbox" checked={!!f.activo} onChange={(e) => set({ activo: e.target.checked })} /> Activo (desactivar cierra su sesión)</label>}
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
    </>
  );
}
/** Con Firebase el usuario (correo interno de Auth) no se renombra después de creado. */
const services_isFirebase = (): boolean => adminServices.allowDemoData === false && import.meta.env.VITE_DATA_MODE === 'firebase';
export const userName = (id: string): string => U(id).nombre;
