// ─── Analysis engine ─────────────────────────────────────────────────────────
import type { IRGraph, IRNode, IREdge } from '../ir/types';

export interface TraceResult {
  /** All node IDs in the upstream cone (inputs → selected node) */
  upstream: Set<string>;
  /** All node IDs in the downstream cone (selected node → outputs) */
  downstream: Set<string>;
  /** All edges involved */
  edges: IREdge[];
}

export interface PathResult {
  /** All paths from any input to the target output */
  paths: string[][];
  /** Conditions that, if false, block the output */
  blockConditions: string[];
}

export interface AnalysisReport {
  undefinedIdents: string[];
  unusedNodes: string[];
  cycles: string[][];
}

// ─── Adjacency helpers ───────────────────────────────────────────────────────

function buildAdjacency(graph: IRGraph): {
  incoming: Map<string, string[]>;
  outgoing: Map<string, string[]>;
} {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const [id] of graph.nodes) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const edge of graph.edges) {
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
  }
  return { incoming, outgoing };
}

// BFS/DFS upstream from a node
export function traceUpstream(graph: IRGraph, nodeId: string): Set<string> {
  const { incoming } = buildAdjacency(graph);
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const src of incoming.get(id) ?? []) {
      if (!visited.has(src)) queue.push(src);
    }
  }
  visited.delete(nodeId);
  return visited;
}

// BFS downstream from a node
export function traceDownstream(graph: IRGraph, nodeId: string): Set<string> {
  const { outgoing } = buildAdjacency(graph);
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const dst of outgoing.get(id) ?? []) {
      if (!visited.has(dst)) queue.push(dst);
    }
  }
  visited.delete(nodeId);
  return visited;
}

export function traceNode(graph: IRGraph, nodeId: string): TraceResult {
  const upstream = traceUpstream(graph, nodeId);
  const downstream = traceDownstream(graph, nodeId);
  const relevantIds = new Set([...upstream, nodeId, ...downstream]);
  const edges = graph.edges.filter(
    e => relevantIds.has(e.source) && relevantIds.has(e.target)
  );
  return { upstream, downstream, edges };
}

// Find all simple paths from input nodes to a target
export function findPaths(graph: IRGraph, targetId: string, maxPaths = 50): string[][] {
  const { incoming } = buildAdjacency(graph);
  const paths: string[][] = [];

  function dfs(current: string, path: string[], visited: Set<string>) {
    if (paths.length >= maxPaths) return;
    const preds = incoming.get(current) ?? [];
    if (preds.length === 0) {
      // Reached an input
      paths.push([...path, current].reverse());
      return;
    }
    if (visited.has(current)) return; // cycle guard
    visited.add(current);
    for (const pred of preds) {
      dfs(pred, [...path, current], new Set(visited));
    }
    visited.delete(current);
  }

  dfs(targetId, [], new Set());
  return paths;
}

// ─── Cycle detection (DFS coloring) ─────────────────────────────────────────

export function detectCycles(graph: IRGraph): string[][] {
  const { outgoing } = buildAdjacency(graph);
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const [id] of graph.nodes) color.set(id, WHITE);

  const cycles: string[][] = [];

  function dfs(id: string, stack: string[]) {
    color.set(id, GREY);
    stack.push(id);
    for (const next of outgoing.get(id) ?? []) {
      if (color.get(next) === GREY) {
        const cycleStart = stack.indexOf(next);
        cycles.push(stack.slice(cycleStart));
      } else if (color.get(next) === WHITE) {
        dfs(next, stack);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }

  for (const [id] of graph.nodes) {
    if (color.get(id) === WHITE) dfs(id, []);
  }
  return cycles;
}

// ─── Unused node detection ────────────────────────────────────────────────────

export function detectUnused(graph: IRGraph): string[] {
  const { incoming, outgoing } = buildAdjacency(graph);
  const unused: string[] = [];
  for (const [id, node] of graph.nodes) {
    if (node.kind === 'output') continue;
    if ((outgoing.get(id)?.length ?? 0) === 0 && node.sourceSettingName) {
      unused.push(id);
    }
  }
  return unused;
}

// ─── Undefined identifier detection ─────────────────────────────────────────

export function detectUndefined(
  graph: IRGraph,
  doc: { settings: { name: string }[] }
): string[] {
  const defined = new Set(doc.settings.map(s => s.name));
  const undefined_: string[] = [];
  for (const [id, node] of graph.nodes) {
    if (node.kind === 'input' && !defined.has(id) && !/^(AND|OR|NOT)_\d+$/.test(id)) {
      // External / hardware input — not truly undefined unless it looks like a
      // software variable (SV, PSV, OC, PCT etc.)
      if (/^(SV|PSV|OC|MET|OC)\d/i.test(id)) {
        undefined_.push(id);
      }
    }
  }
  return undefined_;
}

// ─── Full analysis report ────────────────────────────────────────────────────

export function analyzeGraph(
  graph: IRGraph,
  doc: { settings: { name: string }[] }
): AnalysisReport {
  return {
    undefinedIdents: detectUndefined(graph, doc),
    unusedNodes: detectUnused(graph),
    cycles: detectCycles(graph),
  };
}
