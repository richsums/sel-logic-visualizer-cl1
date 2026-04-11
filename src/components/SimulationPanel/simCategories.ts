// ─── Input grouping logic for simulation panel ─────────────────────────────
import type { IRNode } from '../../core/ir/types';

export type InputGroup =
  | 'breaker'
  | 'protection'
  | 'selogic'
  | 'virtual'
  | 'contact'
  | 'other';

export const INPUT_GROUP_LABELS: Record<InputGroup, string> = {
  breaker: 'Breaker Status',
  protection: 'Protection Elements',
  selogic: 'SELOGIC Variables',
  virtual: 'Virtual Bits',
  contact: 'Contact Inputs',
  other: 'Other Inputs',
};

export const INPUT_GROUP_ORDER: InputGroup[] = [
  'breaker', 'protection', 'contact', 'selogic', 'virtual', 'other',
];

export function classifyInput(node: IRNode): InputGroup {
  const id = node.id.toUpperCase();

  // Breaker status bits
  if (/^(52[AB]?|52AA|52BB|BKR|CB_)/.test(id)) return 'breaker';

  // Protection element pickups/trips
  if (/^(5[01][A-Z]|67|21|25|27|32|46|47|49|50|51|59|60|62|63|64|78|79|81|85|86|87)/.test(id)) return 'protection';

  // Contact/physical inputs
  if (/^(IN[0-9]|CC[0-9]|DI[0-9])/.test(id)) return 'contact';

  // SELOGIC variables (SV, PSV, PMV, PLT, PCT)
  if (/^(SV|PSV|PMV|PLT|PCT)[0-9]/.test(id)) return 'selogic';

  // Virtual bits
  if (/^(VB[0-9]|RB[0-9])/.test(id)) return 'virtual';

  return 'other';
}

export function groupInputs(nodes: IRNode[]): Map<InputGroup, IRNode[]> {
  const groups = new Map<InputGroup, IRNode[]>();
  for (const group of INPUT_GROUP_ORDER) {
    groups.set(group, []);
  }
  for (const node of nodes) {
    const group = classifyInput(node);
    groups.get(group)!.push(node);
  }
  // Remove empty groups
  for (const [key, val] of groups) {
    if (val.length === 0) groups.delete(key);
  }
  return groups;
}
