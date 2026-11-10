/**
 * Tablas en celular: las tablas con clase `m-cards` se muestran como tarjetas apiladas (ver app.css).
 * Para eso cada celda necesita el nombre de su columna: se copia del encabezado a `data-label`.
 * Una columna con encabezado `m-hide` se oculta en celular (información secundaria).
 * Se hace aquí, una sola vez para toda la app, en vez de repetir la etiqueta en cada <td>.
 */
function label(table: HTMLTableElement): void {
  const ths = [...table.querySelectorAll<HTMLTableCellElement>(':scope > thead > tr > th')];
  if (!ths.length) return;
  const heads = ths.map((th) => ({ t: (th.textContent || '').trim(), hide: th.classList.contains('m-hide') }));
  table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr').forEach((tr) => {
    const cells = [...tr.cells];
    if (cells.some((td) => td.colSpan > 1)) return; // filas de detalle o vacías
    cells.forEach((td, i) => {
      const h = heads[i];
      if (!h) return;
      if (td.dataset.label !== h.t) td.dataset.label = h.t;
      td.classList.toggle('m-hide', h.hide);
    });
  });
}

export function installTableLabels(root: HTMLElement = document.body): void {
  let queued = false;
  const run = () => { queued = false; root.querySelectorAll<HTMLTableElement>('table.m-cards').forEach(label); };
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true, characterData: true });
  schedule();
}
