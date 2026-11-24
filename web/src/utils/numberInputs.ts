/**
 * Los campos numéricos (precios, montos, cantidades) no cambian solos con la rueda del mouse ni con las flechas:
 * un roce del scroll o una flecha alteraba el monto sin que el usuario lo notara.
 */
export function installNumberInputGuard(): void {
  if (typeof document === 'undefined') return;
  const isNum = (t: EventTarget | null): t is HTMLInputElement => t instanceof HTMLInputElement && t.type === 'number';
  // rueda: si el campo tiene el foco, se le quita para que la página haga scroll y el número no cambie
  document.addEventListener('wheel', (e) => { if (isNum(e.target) && document.activeElement === e.target) e.target.blur(); }, { passive: true, capture: true });
  document.addEventListener('keydown', (e) => { if (isNum(e.target) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) e.preventDefault(); }, { capture: true });
}
