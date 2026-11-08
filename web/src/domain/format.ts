/** Formatos y utilidades puras (sin estado). Equivalen a las del prototipo. */
export const clp = (n: number | null | undefined): string => {
  const v = Math.round(n || 0);
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('es-CL');
};
export const kg = (n: number | null | undefined): string =>
  (Math.round((n || 0) * 100) / 100).toLocaleString('es-CL', { maximumFractionDigits: 2 });
export const qtyFmt = (q: number, u: string): string =>
  u === 'kg' ? kg(q) + ' kg' : Math.round(q).toLocaleString('es-CL') + ' gam.';
export const pad2 = (n: number): string => String(n).padStart(2, '0');
export const fdate = (t: number): string => {
  const d = new Date(t);
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
};
export const ftime = (t: number): string => {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
export const fdt = (t: number): string => fdate(t) + ' ' + ftime(t);
export const uid = (p: string): string => p + Math.random().toString(36).slice(2, 9);

/** Reloj sustituible en pruebas. */
let clock: () => number = () => Date.now();
export const now = (): number => clock();
export const setClock = (fn: () => number): void => {
  clock = fn;
};
export const DAY = 864e5;
/** El día es el de calendario: de 00:00 a 23:59 (decisión de Felipe); el cierre de caja va por turno, no por día. */
export const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
export const today = (): string => dayKey(now());
export const monthKey = (t: number): string => dayKey(t).slice(0, 7);
export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const searchText = (value: unknown): string =>
  String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es-CL');
/** Coma decimal: "92,73" se entiende como 92.73. */
export const decIn = (v: unknown): string => String(v ?? '').trim().replace(',', '.');
export const pctTxt = (v: number): string => String(v).replace('.', ',') + '%';

/** Precio de venta: pesos enteros, mayor que 0 y con tope razonable. */
export const PRICE_MAX = 10000000;
export const priceOk = (v: number): boolean => Number.isInteger(v) && v > 0 && v <= PRICE_MAX;
export const priceErr = (raw: string): string =>
  raw === '' || !(Number(raw) > 0)
    ? 'Precio inválido'
    : !Number.isInteger(Number(raw))
      ? 'El precio va en pesos enteros, sin decimales.'
      : `El precio no puede superar ${clp(PRICE_MAX)}.`;

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const monthName = (mk: string): string => {
  const [y, m] = mk.split('-');
  return ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][+m - 1] + ' ' + y;
};
export const prevMonth = (mk: string): string => {
  const [y, m] = mk.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
};
