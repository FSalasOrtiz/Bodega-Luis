/**
 * SOLO PRUEBAS (VITE_E2E=true). Expone los nombres globales que usaba la suite de la Fase 1 con el prototipo,
 * implementados sobre la interfaz React (abren los mismos diálogos y pulsan sus botones), para repetir los mismos casos.
 */
import { ctx, me } from '../domain/ctx';
import { P } from '../domain/catalog';
import { posLeft } from '../domain/pos';
import { lotStock, prodStock, srcStock } from '../domain/stock';
import { vig } from '../domain/requests';
import { menuFor } from '../routes/menu';
import { revenueEntries } from '../domain/sales';
import { creditBalance } from '../domain/credits';
import { clp } from '../domain/format';
import { approveCloseCmd } from '../domain/operations';
import { workflowTransaction } from '../domain/workflow';
import { store } from '../state/store';
import { exec, go, logout } from './actions';
import { adminServices } from './services';
import { closeModal } from '../components/modal';
import { openPasswordForm } from '../features/auth/PasswordForm';
import { openAdjustStock, openChangePrice, openEditProduct, openProductSheet } from '../features/inventory/Inventory';
import { openRecDoc } from '../features/reception/Reception';
import { openVoidSale, requestVoid } from '../features/sales/VoidSale';
import { salesRows, type SalesFilter } from '../features/sales/Sales';
import { openAbonoForm, deleteClient } from '../features/credits/Credits';
import { openProducerForm } from '../features/producers/ProducerForm';
import { openEditUser } from '../features/users/Users';
import { openReceipt } from '../features/pos/Receipt';

const W = window as unknown as Record<string, unknown>;
const wait = () => new Promise((r) => setTimeout(r, 60));
const clickPri = async () => { await wait(); document.querySelector<HTMLButtonElement>('.ov button.pri:not(:disabled)')?.click(); await wait(); };
const clickText = async (sel: string, text: string) => { await wait(); [...document.querySelectorAll<HTMLButtonElement>(sel)].find((b) => b.textContent?.trim().startsWith(text))?.click(); await wait(); };
const sf: SalesFilter = { desde: '', hasta: '', vend: '', medio: '', doc: '' };

export function installCompat(): void {
  Object.defineProperty(W, 'S', { get: () => ctx.S, configurable: true });
  Object.defineProperty(W, 'me', { get: () => me(), configurable: true });
  Object.defineProperty(W, 'view', { get: () => store.get().view, configurable: true });
  W.ui = new Proxy({}, { get: (_t, k) => (store.get().ui as unknown as Record<string, unknown>)[String(k)], set: (_t, k, v) => { store.setUi({ [String(k)]: v }); return true; } });
  Object.defineProperty(W, 'recForm', { get: () => ({ lineas: [{ prod: (document.querySelector('#rl-p-0') as HTMLSelectElement | null)?.value }] }), configurable: true });
  Object.defineProperty(W, 'mermaF', { get: () => ({ prod: (document.querySelector('#waste-product') as HTMLSelectElement | null)?.value }), configurable: true });
  Object.assign(W, {
    render: () => undefined, save: () => undefined, reportCount: () => undefined,
    go, logout, closeModal, P, lotStock, vig, menu: () => menuFor(me()), prodStock, posLeft, srcStock, revenueEntries, creditBalance, clp,
    pwForm: openPasswordForm, savePw: clickPri,
    changePrice: openChangePrice, setPrice: clickPri,
    adjustStock: openAdjustStock, doAdjust: clickPri,
    editProduct: (pid?: string) => openEditProduct(pid || ''), saveProduct: clickPri,
    productSheet: openProductSheet, recDoc: openRecDoc, receipt: openReceipt,
    voidRec: async (id: string) => { openRecDoc(id); await clickText('.ov button', 'Anular'); },
    voidSale: openVoidSale, approveSaleReversal: () => clickText('.ov button.bad', 'Anular venta'), requestVoid,
    abonoForm: openAbonoForm, saveAbono: clickPri, deleteClient,
    editProducer: (id?: string) => openProducerForm(id || ''), saveProducer: clickPri,
    saveGasto: clickPri, editUser: (id?: string) => openEditUser(id || ''), saveUser: clickPri,
    approveClose: (id: string) => exec(() => approveCloseCmd(id)),
    resetData: (blank: boolean) => adminServices.reset(blank),
    workflowTransaction: (fn: () => unknown) => workflowTransaction(fn),
    setSf: (k: keyof SalesFilter, v: string) => { sf[k] = v; const el = document.querySelector<HTMLSelectElement>(`#sf-${k}`); if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); } },
    salesRows: () => salesRows(sf, ''),
    commitCheckout: (key: string) => { const s = ctx.S.sales.find((x) => x.commandKey === key); if (s) openReceipt(s.id); },
    mutate: (fn: (S: unknown) => void) => store.run(() => fn(ctx.S)),
  });
}
