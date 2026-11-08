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
  for (const [key, label, max] of [['razonSocial', 'razón social', 100], ['giro', 'giro', 80], ['direccion', 'dirección', 70], ['comuna', 'comuna', 20]] as const) {
    const value = String(receptor[key] || '').trim();
    if (!value) return 'Completa ' + label + ' del cliente para la factura.';
    if (value.length > max) return 'El campo ' + label + ' admite hasta ' + max + ' caracteres.';
  }
  return '';
}
