// @vitest-environment node
/** Cambios de nov-2026: gastos pagados con la caja, cerrar la caja de otro, entregar/recibir turno, gamelas en la recepción y día de trabajo. */
import { beforeEach, describe, expect, it } from 'vitest';
import { ctx } from '../src/domain/ctx';
import { dayKey, now, setClock, setWorkDay } from '../src/domain/format';
import { seedState } from '../src/domain/seed';
import { closeShiftCmd, pendingShift, receiveShiftCmd, saveGastoCmd, saveReceptionCmd, setPriceCmd } from '../src/domain/operations';
import { gamId, gamProd } from '../src/domain/catalog';
import { POS_DEFAULT } from '../src/domain/pos';
import { prodStock } from '../src/domain/stock';
import { registerSaleCommand, type SaleDraft } from '../src/domain/workflow';
import type { Product } from '../src/types/model';

let t = new Date('2026-11-24T09:00:00').getTime();
setClock(() => t);
let p: Product;

const login = (usuario: string) => { ctx.meId = ctx.S.users.find((u) => u.usuario === usuario)!.id; };
const idOf = (usuario: string) => ctx.S.users.find((u) => u.usuario === usuario)!.id;
const receive = (qty: number) => { t += 60e3; return saveReceptionCmd({ productor: 'pr1', modalidad: 'consignación', lineas: [{ prod: p.id, qty }] }); };
const sell = (qty: number) => {
  t += 60e3;
  const total = qty * p.precio;
  const draft: SaleDraft = { key: 'k' + t, user: ctx.meId!, items: [{ prod: p.id, src: 'consig', qty, precio: p.precio }], documento: 'boleta', receptor: null,
    payments: [{ medio: 'efectivo', monto: total }], total, gamelas: null, clienteNombre: '', creditReq: '', paymentConfirmed: true };
  return registerSaleCommand(draft);
};
const gasto = (monto: number, cat = 'Colación / alimentación') => saveGastoCmd({ tipo: 'variable', cat, fecha: '', monto: String(monto), desc: 'desayuno', qty: '' });

beforeEach(() => {
  ctx.S = seedState(true);
  ctx.ui = POS_DEFAULT();
  ctx.S.producers.push({ id: 'pr1', nombre: 'Rodrigo', rut: '', fono: '', tipo: 'productor' });
  p = ctx.S.products.find((x) => !x.envase && x.unidad === 'gamela' && x.usaGamela)!;
  setWorkDay('');
  login('luis');
});

describe('caja y turnos', () => {
  it('un gasto de un desayuno no pide gamelas y el vendedor lo descuenta de su caja', () => {
    receive(20);
    login('samuel');
    sell(2);
    expect(() => gasto(20000)).not.toThrow();
    const e = ctx.S.expenses.at(-1)!;
    expect([e.cantidad, e.deCaja, e.user, e.cierre]).toEqual([undefined, true, idOf('samuel'), '']);
    expect(pendingShift(idOf('samuel')).gastos).toHaveLength(1);
    const c = closeShiftCmd('30000', '0');
    expect(c.esperado).toBe(30000 + 2 * p.precio - 20000);
    expect(c.gastoCaja).toBe(20000);
    expect(e.cierre).toBe(c.id);
  });

  it('el vendedor no registra gastos fijos', () => {
    login('samuel');
    expect(() => saveGastoCmd({ tipo: 'fijo', cat: 'Arriendo', fecha: '', monto: '1000', desc: '', qty: '' })).toThrow(/administrador/);
  });

  it('otro vendedor cierra la caja de quien se fue sin cerrarla y queda recibida por él', () => {
    receive(20);
    login('samuel');
    sell(3);
    login('gonzalo');
    const c = closeShiftCmd('0', String(3 * p.precio), idOf('samuel'));
    expect([c.vendedor, c.cerradoPor, c.recibidoPor, c.diferencia]).toEqual([idOf('samuel'), idOf('gonzalo'), idOf('gonzalo'), 0]);
    expect(pendingShift(idOf('samuel')).mine).toHaveLength(0);
  });

  it('el administrador cierra la caja de un vendedor y queda aprobada', () => {
    receive(20);
    login('samuel');
    sell(1);
    login('luis');
    const c = closeShiftCmd('0', String(p.precio), idOf('samuel'));
    expect([c.aprobado, c.registrado]).toEqual([idOf('luis'), undefined]);
  });

  it('al entregar el turno, quien lo recibe lo acepta', () => {
    receive(20);
    login('samuel');
    sell(1);
    const c = closeShiftCmd('0', String(p.precio), '', idOf('gonzalo'));
    expect([c.recibe, c.recibidoPor]).toEqual([idOf('gonzalo'), undefined]);
    expect(() => receiveShiftCmd(c.id)).toThrow(/otra persona/);
    login('gonzalo');
    receiveShiftCmd(c.id);
    expect(c.recibidoPor).toBe(idOf('gonzalo'));
  });
});

describe('recepción y gamelas', () => {
  it('solo el administrador recibe; las gamelas del producto suman stock de gamelas', () => {
    const antes = prodStock(gamId());
    const r = receive(15);
    expect(r.gamelas).toBe(15);
    expect(prodStock(gamId())).toBe(antes + 15);
    login('samuel');
    expect(() => receive(1)).toThrow(/administrador/);
  });

  it('el administrador cambia el precio de la gamela', () => {
    setPriceCmd(gamId(), '1500');
    expect(gamProd().precio).toBe(1500);
  });
});

describe('calendario', () => {
  it('con un día pasado, lo que se registra queda con esa fecha', () => {
    setWorkDay('2026-11-20');
    expect(dayKey(now())).toBe('2026-11-20');
    const r = receive(5);
    expect(dayKey(r.fecha)).toBe('2026-11-20');
    setWorkDay('2026-12-01'); // futuro: se ignora
    expect(dayKey(now())).toBe(dayKey(t));
  });
});
