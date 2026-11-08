import type { Patch } from 'immer';
import { COLLECTIONS, type CollectionName, type State } from '../types/model';
import type { ChangeSet } from '../services/datastore';

const isCollection = (k: unknown): k is CollectionName => (COLLECTIONS as readonly string[]).includes(String(k));

/**
 * Traduce los patches de Immer a documentos modificados/eliminados.
 * Immer comparte la estructura: un documento cambió si su referencia es distinta a la anterior.
 */
export function changesFrom(prev: State, next: State, patches: Patch[]): ChangeSet {
  const touched = new Set<CollectionName>();
  let meta = false;
  for (const p of patches) {
    const k = p.path[0];
    if (isCollection(k)) touched.add(k);
    else meta = true; // cfg, families, workflowRevision, workflowSchema
  }
  const out: ChangeSet = { set: [], del: [] };
  for (const col of touched) {
    const before = new Map<string, unknown>();
    for (const d of (prev[col] || []) as { id?: string }[]) if (d.id) before.set(d.id, d);
    const seen = new Set<string>();
    for (const d of (next[col] || []) as { id?: string }[]) {
      if (!d.id) throw new Error(`Documento sin id en ${col}`);
      seen.add(d.id);
      if (before.get(d.id) !== d) out.set.push({ col, id: d.id, data: d as Record<string, unknown> });
    }
    for (const id of before.keys()) if (!seen.has(id)) out.del.push({ col, id });
  }
  if (meta) out.meta = { cfg: next.cfg, families: next.families || [], workflowRevision: next.workflowRevision, workflowSchema: next.workflowSchema };
  return out;
}
