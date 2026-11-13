// @vitest-environment node
/** Embarques: precio por lote, venta por embarque y cambio de precios sin mezclar lo antiguo con lo nuevo. */
import { beforeEach, describe, expect, it } from 'vitest';
import { ctx } from '../src/domain/ctx';
import { setClock } from '../src/domain/format';
import { seedState } from '../src/domain/seed';
import { embNum, lotPrice, openEmbarques, priceRange } from '../src/domain/embarques';
import { saveMermaCmd, saveReceptionCmd, setEmbarquePricesCmd } from '../src/domain/operations';
import { POS_DEFAULT } from '../src/domain/pos';
import { lotStock } from '../src/domain/stock';
import { registerSaleCommand, type SaleDraft } from '../src/domain/workflow';
import type { Product } from '../src/types/model';

let t = new Date('2026-11-10T09:00:00').getTime();
setClock(() => t);
let p: Product, prod = '';

const login = (usuario: string) => { ctx.meId = ctx.S.users.find((u) => u.usuario === usuario)!.id; };
const receive = (qty: number, precio = '') => {
  t += 3600e3;
  return saveReceptionCmd({ productor: ctx.S.producers[0].id, modalidad: 'consignación', lineas: [{ prod, qty, precio }] });
};
const sell = (items: { lot?: string; qty: number; precio: number; precioEsp?: boolean }[]) => {
  t += 60e3;
  const total = items.reduce((n, i) => n + i.qty * i.precio, 0);
  const draft: SaleDraft = { key: 'k' + t, user: ctx.meId!, items: items.map((i) => ({ prod, src: 'consig' as const, ...i })), documento: 'boleta', receptor: null,
    payments: [{ medio: 'efectivo', monto: total }], total, gamelas: null, clienteNombre: '', creditReq: '', paymentConfirmed: true };
  return registerSaleCommand(draft);
};

beforeEach(() => {
  ctx.S = seedState(true);
  ctx.ui = POS_DEFAULT();
  ctx.S.producers.push({ id: 'pr1', nombre: 'Rodrigo', rut: '', fono: '', tipo: 'productor' });
  p = ctx.S.products.find((x) => !x.envase && x.unidad === 'gamela')!;
  prod = p.id;
  login('luis');
});

describe('embarques', () => {
  it('numera los embarques por producto en orden de llegada', () => {
    const a = receive(10), b = receive(5);
    const [la, lb] = [a, b].map((r) => ctx.S.lots.find((l) => l.id === r.lineas[0].lot)!);
    expect([embNum(la), embNum(lb)]).toEqual([1, 2]);
  });

  it('un embarque nuevo con otro precio no cambia el precio de lo que ya estaba en bodega', () => {
    const viejo = p.precio;
    const a = receive(10), b = receive(5, String(viejo + 2000));
    const la = ctx.S.lots.find((l) => l.id === a.lineas[0].lot)!, lb = ctx.S.lots.find((l) => l.id === b.lineas[0].lot)!;
    expect(lotPrice(la)).toBe(viejo);
    expect(lotPrice(lb)).toBe(viejo + 2000);
    expect(p.precio).toBe(viejo + 2000); // precio para los próximos embarques
    expect(priceRange(prod, 'consig')).toEqual([viejo, viejo + 2000]); // el vendedor ve ambos precios
  });

  it('cada embarque se vende a su precio y descuenta solo de su lote', () => {
    const viejo = p.precio, a = receive(10), b = receive(5, String(viejo + 2000));
    const [la, lb] = [a.lineas[0].lot, b.lineas[0].lot];
    const s = sell([{ lot: la, qty: 3, precio: viejo }, { lot: lb, qty: 2, precio: viejo + 2000 }]);
    expect(s.lineas.map((l) => [l.precio, l.allocs.map((x) => x.lot)])).toEqual([[viejo, [la]], [viejo + 2000, [lb]]]);
    expect(s.total).toBe(3 * viejo + 2 * (viejo + 2000));
    expect([lotStock(la), lotStock(lb)]).toEqual([7, 3]);
  });

  it('rechaza una venta con el precio de otro embarque o más cantidad de la que tiene el embarque', () => {
    const viejo = p.precio, a = receive(10); receive(5, String(viejo + 2000));
    expect(() => sell([{ lot: a.lineas[0].lot, qty: 1, precio: viejo + 2000 }])).toThrow(/precios cambiaron/);
    expect(() => sell([{ lot: a.lineas[0].lot, qty: 11, precio: viejo }])).toThrow(/embarque elegido/);
  });

  it('un vendedor no puede fijar el precio de un embarque al recibir', () => {
    login('gonzalo');
    expect(() => receive(5, '99000')).toThrow(/administrador/);
    expect(() => receive(5)).not.toThrow();
  });

  it('precios por embarque: igual al general vuelve a seguirlo; distinto queda propio', () => {
    const a = receive(10), b = receive(5);
    const [la, lb] = [a.lineas[0].lot, b.lineas[0].lot];
    setEmbarquePricesCmd(prod, '40000', { [la]: '35000', [lb]: '40000' });
    const [A, B] = [la, lb].map((id) => ctx.S.lots.find((l) => l.id === id)!);
    expect([A.precio, B.precio, p.precio]).toEqual([35000, undefined, 40000]);
    setEmbarquePricesCmd(prod, '42000', { [la]: '35000', [lb]: '42000' });
    expect([lotPrice(A), lotPrice(B)]).toEqual([35000, 42000]);
    expect(openEmbarques(prod).length).toBe(2);
  });

  it('la merma sale del embarque que elige el usuario (con varios, es obligatorio elegir)', () => {
    const a = receive(10), b = receive(5);
    const [la, lb] = [a.lineas[0].lot, b.lineas[0].lot];
    expect(() => saveMermaCmd(prod, 'consig', '2', '')).toThrow(/Elige de qué embarque/);
    saveMermaCmd(prod, 'consig', '2', '', lb);
    expect([lotStock(la), lotStock(lb)]).toEqual([10, 3]);
    expect(() => saveMermaCmd(prod, 'consig', '4', '', lb)).toThrow(/cantidad válida/);
  });
});
