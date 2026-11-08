import { ctx } from './ctx';
import { now, uid } from './format';

/** Bitácora: quién hizo qué y cuándo. Solo dentro de un comando. */
export function audit(accion: string, entidad: string, antes: unknown, despues: unknown): void {
  ctx.S.audit.push({ id: uid('a'), user: ctx.meId || '', accion, entidad, antes: String(antes ?? ''), despues: String(despues ?? ''), fecha: now() });
}
