/** Traduce errores de Firebase a mensajes claros para el usuario. */
export function friendlyError(e: unknown): Error {
  const code = (e as { code?: string })?.code || '';
  const msg = e instanceof Error ? e.message : String(e);
  if (/^(Otro|No alcanza|Esta venta|Revisa|Sin conexión|El stock)/.test(msg)) return e as Error;
  if (code.includes('permission-denied')) return new Error('No tienes permiso para esta operación. Si crees que es un error, pide a Luis que revise tu usuario.');
  if (code.includes('unavailable') || code.includes('network') || code.includes('deadline-exceeded')) return new Error('Sin conexión: no se pudo guardar. Revisa la señal e inténtalo de nuevo.');
  if (code.includes('aborted')) return new Error('Otro usuario estaba guardando al mismo tiempo. Inténtalo de nuevo.');
  if (code.includes('resource-exhausted')) return new Error('El sistema está recibiendo demasiadas operaciones. Espera unos segundos e inténtalo de nuevo.');
  if (code.includes('failed-precondition') || code.includes('invalid-argument') || code.includes('not-found')) return new Error(msg.replace(/^.*?:\s*/, ''));
  return new Error('No se pudo completar la operación. ' + msg);
}
