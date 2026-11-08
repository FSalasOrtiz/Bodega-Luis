/**
 * Reglas de usuarios compartidas con el frontend (web/src/domain/operations.ts → userInputError).
 * Se repiten aquí porque la Cloud Function es la que hace cumplir las reglas (el navegador no es confiable).
 */
export type Rol = 'admin' | 'vendedor' | 'contador';
export interface UserDoc { id: string; nombre: string; usuario: string; rol: Rol; turno: string; activo: boolean }
export interface UserInput { nombre: string; usuario: string; rol: Rol; turno: string; clave: string; activo?: boolean }

export const PW_OK = (v: unknown): boolean => /^\d{6}$/.test(String(v || ''));
export const ROLES: Rol[] = ['admin', 'vendedor', 'contador'];
export const TURNOS = ['mañana', 'noche', '-'];

export function userInputError(id: string, d: UserInput, users: UserDoc[], actorId: string): string {
  const n = String(d.nombre || '').trim(), usr = String(d.usuario || '').trim().toLowerCase();
  if (!n || !usr) return 'Nombre y usuario son obligatorios';
  if (n.length > 60) return 'El nombre admite hasta 60 caracteres.';
  if (!/^[a-z0-9._-]{2,30}$/.test(usr)) return 'El usuario solo admite letras minúsculas, números, punto, guion y guion bajo (2 a 30).';
  if (!ROLES.includes(d.rol)) return 'Rol no válido.';
  if (!TURNOS.includes(d.turno)) return 'Turno no válido.';
  if (d.clave && !PW_OK(d.clave)) return 'La contraseña debe tener exactamente 6 números';
  if (!id && !d.clave) return 'Ingresa una contraseña';
  if (users.some((u) => u.usuario === usr && u.id !== id)) return 'Ese usuario ya existe';
  const actor = users.find((u) => u.id === actorId);
  if (id === actorId && actor && d.rol !== actor.rol) return 'No puedes cambiar tu propio rol. Pídeselo a otro administrador.';
  const prev = users.find((u) => u.id === id), nextActive = id ? d.activo ?? prev?.activo ?? true : true;
  if (id === actorId && !nextActive) return 'No puedes desactivar tu propio usuario.';
  const wasAdmin = !!prev && prev.rol === 'admin' && prev.activo;
  if (wasAdmin && (d.rol !== 'admin' || !nextActive) && users.filter((u) => u.rol === 'admin' && u.activo && u.id !== id).length === 0) return 'Debe quedar al menos un administrador activo.';
  return '';
}
