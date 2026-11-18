import type { Receptor } from '../types/model';

export const cleanRut = (value: unknown): string => String(value || '').replace(/[.\s]/g, '').toUpperCase();
export function validRut(value: unknown): boolean {
  const rut = cleanRut(value);
  if (!/^\d{1,8}-[0-9K]$/.test(rut)) return false;
  const [body, dv] = rut.split('-');
  if (Number(body) === 0) return false;
  let sum = 0, factor = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += Number(body[i]) * factor; factor = factor === 7 ? 2 : factor + 1; }
  const remainder = 11 - (sum % 11);
  return dv === (remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder));
}
export function invoiceRecipientError(receptor: Partial<Receptor> | null | undefined): string {
  if (!receptor || !validRut(receptor.rut)) return 'Ingresa un RUT válido del cliente para la factura, con guion y dígito verificador.';
  const nombre = String(receptor.razonSocial || '').trim();
  if (!nombre) return 'Completa el nombre o razón social del cliente para la factura.';
  if (nombre.length > 100) return 'El nombre del cliente admite hasta 100 caracteres.';
  return '';
}
