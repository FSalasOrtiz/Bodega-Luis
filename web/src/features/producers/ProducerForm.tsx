import { useState } from 'react';
import { closeModal, openModal } from '../../components/modal';
import { PR } from '../../domain/catalog';
import { saveProducerCmd } from '../../domain/operations';
import { exec } from '../../app/actions';

/** Alta o edición de productor/proveedor. El vendedor puede crear uno desde Recepción; editar es solo del administrador. */
export function openProducerForm(id: string, onSaved?: (id: string) => void): void {
  openModal(() => <ProducerForm id={id} onSaved={onSaved} />);
}
function ProducerForm({ id, onSaved }: { id: string; onSaved?: (id: string) => void }) {
  const p = id ? PR(id) : { nombre: '', rut: '', fono: '' };
  const [n, setN] = useState(p.nombre === '—' ? '' : p.nombre), [r, setR] = useState(p.rut || ''), [f, setF] = useState(p.fono || '');
  const save = async () => {
    const nid = await exec(() => saveProducerCmd(id, n, r, f));
    if (nid) { closeModal(); onSaved?.(nid); }
  };
  return (
    <>
      <h2>{id ? 'Editar' : 'Nuevo'} productor / proveedor</h2>
      <div className="f"><label htmlFor="p_n">Nombre</label><input id="p_n" className="in" value={n} onChange={(e) => setN(e.target.value)} autoFocus /></div>
      <div className="row"><div className="f"><label htmlFor="p_f">Teléfono</label><input id="p_f" className="in" type="tel" value={f} onChange={(e) => setF(e.target.value)} /></div>
        <div className="f"><label htmlFor="p_r">RUT (opcional)</label><input id="p_r" className="in" value={r} onChange={(e) => setR(e.target.value)} /></div></div>
      <div className="acts"><button className="btn ghost" onClick={closeModal}>Cancelar</button><button className="btn pri" onClick={() => void save()}>Guardar</button></div>
    </>
  );
}
