/**
 * Puente de pruebas E2E: SOLO se incluye cuando VITE_E2E=true (nunca en el build de producción).
 * Permite a Playwright leer el estado y preparar escenarios sin depender de detalles internos de React.
 */
import { ctx, me } from '../domain/ctx';
import * as stock from '../domain/stock';
import * as credits from '../domain/credits';
import * as sales from '../domain/sales';
import * as balance from '../domain/balance';
import * as producers from '../domain/producers';
import * as format from '../domain/format';
import * as pos from '../domain/pos';
import { P } from '../domain/catalog';
import { store } from '../state/store';
import { go, logout } from './actions';
import { closeModal } from '../components/modal';
import { salesRows } from '../features/sales/Sales';

declare global { interface Window { __test?: unknown } }

import { installCompat } from './testCompat';

export function installTestBridge(): void {
  installCompat();
  window.__test = {
    get S() { return ctx.S; },
    get me() { return me(); },
    get view() { return store.get().view; },
    get ui() { return store.get().ui; },
    P, ...stock, ...credits, ...sales, ...balance, ...producers, clp: format.clp, posLeft: pos.posLeft, salesRows,
    go, logout, closeModal,
    setUi: (p: object) => store.setUi(p),
    /** Ejecuta una mutación como comando atómico (para preparar escenarios). */
    mutate: (fn: (S: typeof ctx.S) => void) => store.run(() => fn(ctx.S)),
  };
}
