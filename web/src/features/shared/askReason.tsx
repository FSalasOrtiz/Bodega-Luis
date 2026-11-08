import { useState } from 'react';
import { closeModal, openModal } from '../../components/modal';
import { toast } from '../../components/toast';

/** Pide un motivo obligatorio y llama a `cb` con el texto. */
export function askReason(title: string, txt: string, cb: (motivo: string) => void | Promise<void>): void {
  openModal(() => <AskReason title={title} txt={txt} cb={cb} />);
}
function AskReason({ title, txt, cb }: { title: string; txt: string; cb: (m: string) => void | Promise<void> }) {
  const [m, setM] = useState('');
  const ok = () => { const v = m.trim(); if (!v) { toast('Escribe el motivo'); return; } void cb(v); };
  return (
    <>
      <h2>{title}</h2><p className="muted">{txt}</p>
      <div className="f"><label htmlFor="rz">Motivo (obligatorio)</label><input id="rz" className="in" value={m} onChange={(e) => setM(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} /></div>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" id="rzok" onClick={ok}>Confirmar</button></div>
    </>
  );
}
