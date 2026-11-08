import { Icon } from '../../components/icons';
import { CL, P, U } from '../../domain/catalog';
import { creditBalance, findClientByName } from '../../domain/credits';
import { clp, fdt, ftime, pctTxt, qtyFmt } from '../../domain/format';
import { receiptPayment } from '../../domain/receipts';
import { pendingAbonoRequests, pendingComRequests, pendingCreditRequests, pendingPriceRequests, pendingVoidRequests } from '../../domain/requests';
import { resolveAbonoRequestCmd, resolveComRequestCmd, resolveCreditRequestCmd, resolvePriceRequestCmd } from '../../domain/pos';
import { rejectReversalRequest } from '../../domain/workflow';
import { exec } from '../../app/actions';
import { askReason } from '../shared/askReason';
import { closeModal } from '../../components/modal';
import { openReceipt } from '../pos/Receipt';
import { openVoidSale } from '../sales/VoidSale';

/** Avisos a Luis arriba de la pantalla (sin campana): crédito, pago de deuda, otro precio, comisión y anulación. */
export function AdminBanners() {
  return <><CreditBanner /><AbonoBanner /><PriceBanner /><ComBanner /><VoidBanner /></>;
}
const Section = ({ label, title, children }: { label: string; title: string; children: React.ReactNode }) => (
  <section className="card request-alert" role="region" aria-label={label}><h3><Icon n="bell" s={18} /> {title}</h3><div className="rows">{children}</div></section>
);
const Row = ({ children }: { children: React.ReactNode }) => <div style={{ flexWrap: 'wrap', gap: '8px 12px' }}>{children}</div>;
const Resolve = ({ onNo, onYes }: { onNo: () => void; onYes: () => void }) => (
  <><button className="btn sm bad" onClick={onNo}>Rechazar</button><button className="btn sm pri" onClick={onYes}>Autorizar</button></>
);

function CreditBanner() {
  const rs = pendingCreditRequests();
  if (!rs.length) return null;
  return (
    <Section label="Solicitudes de crédito" title={`${rs.length === 1 ? 'Un vendedor pide' : 'Vendedores piden'} autorización de crédito`}>
      {rs.map((r) => {
        const c = findClientByName(r.clienteNombre), debe = c ? creditBalance(c.id) : 0;
        return (
          <Row key={r.id}><div className="grow"><b>{U(r.user).nombre} quiere fiar {clp(r.monto)} a {r.clienteNombre}</b><span>{c ? `Hoy debe ${clp(debe)} · quedaría en ${clp(debe + r.monto)}` : 'Cliente nuevo'} · venta de {clp(r.total)}: {r.detalle} · {ftime(r.fecha)}</span></div>
            <Resolve onNo={() => exec(() => resolveCreditRequestCmd(r.id, false), 'Crédito rechazado.')} onYes={() => exec(() => resolveCreditRequestCmd(r.id, true), 'Crédito autorizado.')} /></Row>
        );
      })}
    </Section>
  );
}
function AbonoBanner() {
  const rs = pendingAbonoRequests();
  if (!rs.length) return null;
  return (
    <Section label="Pagos de deuda por autorizar" title={`${rs.length === 1 ? 'Un vendedor registró' : 'Vendedores registraron'} un pago de deuda`}>
      {rs.map((r) => {
        const debe = creditBalance(r.cliente);
        return (
          <Row key={r.id}><div className="grow"><b>{U(r.user).nombre} recibió {clp(r.monto)} de {CL(r.cliente).nombre}</b><span>{receiptPayment(r.medio)} · debe {clp(debe)} · quedaría en {clp(Math.max(0, debe - r.monto))} · {ftime(r.fecha)}</span></div>
            <Resolve onNo={() => exec(() => resolveAbonoRequestCmd(r.id, false), 'Pago rechazado.')} onYes={() => exec(() => resolveAbonoRequestCmd(r.id, true), 'Pago autorizado.')} /></Row>
        );
      })}
    </Section>
  );
}
function PriceBanner() {
  const rs = pendingPriceRequests();
  if (!rs.length) return null;
  return (
    <Section label="Solicitudes de precio" title={`${rs.length === 1 ? 'Un vendedor pide' : 'Vendedores piden'} cambiar un precio`}>
      {rs.map((r) => {
        const p = P(r.prod), normal = r.precioNormal || 0;
        return (
          <Row key={r.id}><div className="grow"><b>{U(r.user).nombre} quiere vender {p.nombre} a {clp(r.precio)} (normal {clp(normal)})</b><span>{qtyFmt(r.qty, p.unidad)} · total {clp(Math.round(r.qty * r.precio))} en vez de {clp(Math.round(r.qty * normal))} · solo esta venta · {ftime(r.fecha)}</span></div>
            <Resolve onNo={() => exec(() => resolvePriceRequestCmd(r.id, false), 'Precio rechazado.')} onYes={() => exec(() => resolvePriceRequestCmd(r.id, true), 'Precio autorizado.')} /></Row>
        );
      })}
    </Section>
  );
}
function ComBanner() {
  const rs = pendingComRequests();
  if (!rs.length) return null;
  return (
    <Section label="Solicitudes de comisión" title={`${rs.length === 1 ? 'Un vendedor pide' : 'Vendedores piden'} cambiar la comisión`}>
      {rs.map((r) => (
        <Row key={r.id}><div className="grow"><b>{U(r.user).nombre} quiere cobrar {pctTxt(r.pct)} de comisión (normal {pctTxt(r.pctNormal ?? 0)})</b><span>Sobre lo que sale de consignación · solo esa venta · {ftime(r.fecha)}</span></div>
          <Resolve onNo={() => exec(() => resolveComRequestCmd(r.id, false), 'Comisión rechazada.')} onYes={() => exec(() => resolveComRequestCmd(r.id, true), 'Comisión autorizada para esa venta.')} /></Row>
      ))}
    </Section>
  );
}
function VoidBanner() {
  const rs = pendingVoidRequests();
  if (!rs.length) return null;
  return (
    <Section label="Solicitudes de anulación" title={`${rs.length === 1 ? 'Un vendedor pide' : 'Vendedores piden'} anular una venta`}>
      {rs.map((s) => (
        <Row key={s.id}><div className="grow"><b>{U(s.vendedor).nombre} pide anular la venta N° {s.num} · {clp(s.total)}</b><span>Motivo: “{s.solicitud}” · venta del {fdt(s.fecha)}</span></div>
          <button className="btn sm ghost" onClick={() => openReceipt(s.id)}>Ver venta</button>
          <button className="btn sm bad" onClick={() => askReason('Rechazar anulación', 'El motivo queda en el historial.', async (reason) => { if (await exec(() => rejectReversalRequest(s.id, reason), 'Solicitud rechazada.')) closeModal(); })}>Rechazar</button>
          <button className="btn sm pri" onClick={() => openVoidSale(s.id)}>Anular</button></Row>
      ))}
    </Section>
  );
}
