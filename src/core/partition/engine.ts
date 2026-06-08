// ─── Partition engine ─────────────────────────────────────────────────────────
// Splits the master IR graph into labeled "logic areas", each holding the full
// upstream logic cone that drives one output contact (with closely-related
// signals merged). Partitioning is a DISPLAY-LAYER concern: the simulation /
// analysis engines keep operating on the single master IRGraph keyed by logical
// node id. The graph view clones each area's cone for rendering.

import type { IRGraph, IREdge, OutputClass } from '../ir/types';
import { traceUpstream } from '../analysis/engine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LogicArea {
  /** Stable area id, e.g. "area_TR" */
  id: string;
  /** Human label by logic purpose, e.g. "Trip Logic — OUT101 / TR / ULTR" */
  label: string;
  /** Short purpose name, e.g. "Trip Logic" */
  purpose: string;
  /** Output class used for ordering/coloring */
  outputClass: OutputClass;
  /** Logical output ids that anchor this area */
  rootIds: string[];
  /** All logical node ids in the area cone (inputs, gates, intermediates, roots) */
  nodeIds: string[];
  /** Induced edges among nodeIds (logical, from the master graph) */
  edges: IREdge[];
}

export interface PartitionResult {
  areas: LogicArea[];
  /** Every logical node id that appears in at least one area cone */
  usedLogicalIds: Set<string>;
}

// ─── Purpose labeling ─────────────────────────────────────────────────────────

const PURPOSE_NAME: Record<OutputClass, string> = {
  trip: 'Trip Logic',
  close: 'Close Logic',
  breaker_failure: 'Breaker Failure',
  reclose: 'Reclose Logic',
  alarm: 'Alarm Logic',
  block: 'Block Logic',
  supervisory: 'Supervisory Logic',
  display: 'Display Logic',
  led: 'LED Logic',
  other: 'Output Logic',
};

const CLASS_PRIORITY: Record<OutputClass, number> = {
  trip: 0, close: 1, breaker_failure: 2, reclose: 3,
  alarm: 4, block: 5, supervisory: 6, other: 7, display: 8, led: 9,
};

// Output classes that are indications rather than driven contacts — excluded
// from being area roots (they still appear inside cones if they drive logic).
const ROOT_EXCLUDE_CLASSES = new Set<OutputClass>(['led', 'display']);

// ─── Disjoint-set (union-find) over root ids ──────────────────────────────────

class DSU {
  private parent = new Map<string, string>();
  add(x: string) { if (!this.parent.has(x)) this.parent.set(x, x); }
  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p !== x) { p = this.find(p); this.parent.set(x, p); }
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

// ─── Adjacency helpers ────────────────────────────────────────────────────────

function incomingCounts(graph: IRGraph): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of graph.edges) counts.set(e.target, (counts.get(e.target) ?? 0) + 1);
  return counts;
}

/** If `outId` has exactly one incoming edge from an output/derived node, return
 *  that source id (the internal signal the contact routes). */
function soleRoutedSource(graph: IRGraph, outId: string): string | null {
  const ins = graph.edges.filter(e => e.target === outId);
  if (ins.length !== 1) return null;
  const src = graph.nodes.get(ins[0].source);
  if (src && (src.kind === 'output' || src.kind === 'derived')) return ins[0].source;
  return null;
}

// ─── Companion grouping rules ─────────────────────────────────────────────────
// Centralized here so the heuristics are easy to extend once real customer
// settings reveal their naming conventions.

const UL_PREFIXES = ['ULT', 'UL_', 'UL']; // ULTR→TR handled via 'UL'; keep order longest-first

/** Group two roots into the same area when closely related. */
function applyCompanionRules(roots: string[], graph: IRGraph, dsu: DSU): void {
  const rootSet = new Set(roots);

  for (const r of roots) {
    // Rule A — unlatch pairs: "UL" + X grouped with X (e.g. ULTR↔TR, ULCL↔CL/CC)
    for (const prefix of UL_PREFIXES) {
      if (r.toUpperCase().startsWith(prefix) && r.length > prefix.length) {
        const base = r.slice(prefix.length);
        if (rootSet.has(base)) { dsu.union(r, base); break; }
        // also try common close alias CC when base is CL and vice-versa
        if (base === 'CL' && rootSet.has('CC')) { dsu.union(r, 'CC'); break; }
        if (base === 'CC' && rootSet.has('CL')) { dsu.union(r, 'CL'); break; }
      }
    }

    // Rule B — latch SET/RST equation pairs: SETnn ↔ RSTnn (and LTnn if present)
    const setM = r.toUpperCase().match(/^SET_?(\d+)$/);
    if (setM) {
      const n = setM[1];
      for (const partner of [`RST${n}`, `RST_${n}`, `LT${n}`, `PLT${n}`]) {
        if (rootSet.has(partner)) dsu.union(r, partner);
      }
    }

    // Rule C — physical contact with the single internal signal it routes
    if (/^OUT\d/i.test(r)) {
      const routed = soleRoutedSource(graph, r);
      if (routed && rootSet.has(routed)) dsu.union(r, routed);
    }
  }
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export function partitionGraph(graph: IRGraph): PartitionResult {
  const counts = incomingCounts(graph);

  // 1. Candidate roots: driven output-kind nodes that are real contacts/coils.
  const roots: string[] = [];
  for (const [id, node] of graph.nodes) {
    if (node.kind !== 'output') continue;
    if ((counts.get(id) ?? 0) === 0) continue; // not driven (e.g. OUT104 = 0)
    if (ROOT_EXCLUDE_CLASSES.has(node.outputClass ?? 'other')) continue;
    roots.push(id);
  }

  // 2. Merge companions into groups.
  const dsu = new DSU();
  for (const r of roots) dsu.add(r);
  applyCompanionRules(roots, graph, dsu);

  const groups = new Map<string, string[]>();
  for (const r of roots) {
    const key = dsu.find(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  // 3. Build an area per group.
  const usedLogicalIds = new Set<string>();
  const areas: LogicArea[] = [];

  for (const [, groupRoots] of groups) {
    // Representative root = best (lowest) output-class priority.
    const rep = [...groupRoots].sort((a, b) => {
      const ca = graph.nodes.get(a)?.outputClass ?? 'other';
      const cb = graph.nodes.get(b)?.outputClass ?? 'other';
      return (CLASS_PRIORITY[ca] ?? 9) - (CLASS_PRIORITY[cb] ?? 9);
    })[0];
    const repClass = graph.nodes.get(rep)?.outputClass ?? 'other';

    // Cone = union of upstream cones of every root + the roots themselves.
    const nodeIdSet = new Set<string>();
    for (const root of groupRoots) {
      nodeIdSet.add(root);
      for (const up of traceUpstream(graph, root)) nodeIdSet.add(up);
    }

    const edges = graph.edges.filter(
      e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target),
    );

    for (const id of nodeIdSet) usedLogicalIds.add(id);

    const purpose = PURPOSE_NAME[repClass] ?? 'Output Logic';
    // Order the root ids in the label by priority for readability.
    const sortedRoots = [...groupRoots].sort((a, b) => {
      const ca = graph.nodes.get(a)?.outputClass ?? 'other';
      const cb = graph.nodes.get(b)?.outputClass ?? 'other';
      return (CLASS_PRIORITY[ca] ?? 9) - (CLASS_PRIORITY[cb] ?? 9) || a.localeCompare(b);
    });
    const isGeneric = repClass === 'other';
    const label = isGeneric
      ? `${sortedRoots.join(' / ')} Logic`
      : `${purpose} — ${sortedRoots.join(' / ')}`;

    areas.push({
      id: `area_${rep}`,
      label,
      purpose,
      outputClass: repClass,
      rootIds: sortedRoots,
      nodeIds: [...nodeIdSet],
      edges,
    });
  }

  // 4. Order areas by purpose priority, then by representative id.
  areas.sort((a, b) =>
    (CLASS_PRIORITY[a.outputClass] ?? 9) - (CLASS_PRIORITY[b.outputClass] ?? 9) ||
    a.rootIds[0].localeCompare(b.rootIds[0]),
  );

  return { areas, usedLogicalIds };
}
