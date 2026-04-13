// ─── IR → React Flow nodes/edges with dagre layout ───────────────────────────
import type { Node, Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { IRGraph, IRNodeKind, IREdge, OutputClass } from '../../core/ir/types';
import type { SimState, ActivePathRecord, TimerInfo } from '../../core/simulation/engine';

export type FlowNode = Node<{
  label: string;
  kind: IRNodeKind;
  active: boolean;
  selected: boolean;
  highlighted: boolean;
  sourceValue?: string;
  // Simulation-enhanced fields
  causal: boolean;
  dimmed: boolean;
  latched: boolean;
  forced: boolean;
  timerInfo?: TimerInfo;
  outputClass?: OutputClass;
  changedThisStep: boolean;
}>;

export type FlowEdge = Edge<{ negated?: boolean; active?: boolean }>;

// Node dimensions must match the SVG/div sizes in SelNode.tsx
const NODE_SIZE: Record<IRNodeKind, { w: number; h: number }> = {
  and:      { w: 76,  h: 46 },
  or:       { w: 76,  h: 46 },
  not:      { w: 10,  h: 10 }, // NOT nodes are collapsed; tiny placeholder
  rising:   { w: 80,  h: 42 },
  falling:  { w: 80,  h: 42 },
  timer:    { w: 100, h: 52 },
  latch:    { w: 90,  h: 56 },
  pulse:    { w: 80,  h: 42 },
  input:    { w: 104, h: 46 },
  output:   { w: 104, h: 46 },
  derived:  { w: 104, h: 46 },
  function: { w: 96,  h: 46 },
  numeric:  { w: 80,  h: 36 },
};

function getSize(kind: IRNodeKind) {
  return NODE_SIZE[kind] ?? { w: 100, h: 46 };
}

// ─── Reachability filter: keep only nodes connected to at least one output ───

function computeReachableNodes(
  nodes: Map<string, { kind: IRNodeKind }>,
  edges: IREdge[],
): Set<string> {
  const reachable = new Set<string>();

  // Build reverse adjacency (target → sources)
  const reverseAdj = new Map<string, string[]>();
  for (const e of edges) {
    if (!reverseAdj.has(e.target)) reverseAdj.set(e.target, []);
    reverseAdj.get(e.target)!.push(e.source);
  }

  // BFS backward from all output nodes
  const queue: string[] = [];
  for (const [id, node] of nodes) {
    if (node.kind === 'output') {
      queue.push(id);
      reachable.add(id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const sources = reverseAdj.get(current) ?? [];
    for (const src of sources) {
      if (!reachable.has(src)) {
        reachable.add(src);
        queue.push(src);
      }
    }
  }

  // Also keep derived nodes that feed into reachable nodes (forward pass)
  const forwardAdj = new Map<string, string[]>();
  for (const e of edges) {
    if (!forwardAdj.has(e.source)) forwardAdj.set(e.source, []);
    forwardAdj.get(e.source)!.push(e.target);
  }

  return reachable;
}

// ─── Collapse NOT nodes into negated edges ──────────────────────────────────

interface CollapsedGraph {
  /** Edges with NOT nodes removed, replaced by negated direct edges */
  edges: IREdge[];
  /** IDs of NOT nodes that were collapsed */
  collapsedNotIds: Set<string>;
}

function collapseNotNodes(
  nodes: Map<string, { kind: IRNodeKind }>,
  edges: IREdge[],
): CollapsedGraph {
  const collapsedNotIds = new Set<string>();
  const notNodes = new Set<string>();
  for (const [id, n] of nodes) {
    if (n.kind === 'not') notNodes.add(id);
  }

  if (notNodes.size === 0) return { edges, collapsedNotIds };

  // Build adjacency for NOT nodes
  const incomingToNot = new Map<string, string[]>(); // NOT_id → [source_ids]
  const outgoingFromNot = new Map<string, string[]>(); // NOT_id → [target_ids]
  const otherEdges: IREdge[] = [];

  for (const e of edges) {
    if (notNodes.has(e.target)) {
      if (!incomingToNot.has(e.target)) incomingToNot.set(e.target, []);
      incomingToNot.get(e.target)!.push(e.source);
    } else if (notNodes.has(e.source)) {
      if (!outgoingFromNot.has(e.source)) outgoingFromNot.set(e.source, []);
      outgoingFromNot.get(e.source)!.push(e.target);
    } else {
      otherEdges.push(e);
    }
  }

  // Create replacement negated edges
  const replacementEdges: IREdge[] = [];
  for (const notId of notNodes) {
    const sources = incomingToNot.get(notId) ?? [];
    const targets = outgoingFromNot.get(notId) ?? [];
    if (sources.length === 1 && targets.length >= 1) {
      // Standard collapse: single input NOT → multiple outputs
      collapsedNotIds.add(notId);
      for (const tgt of targets) {
        replacementEdges.push({
          id: `${sources[0]}->!${tgt}`,
          source: sources[0],
          target: tgt,
          negated: true,
        });
      }
    } else {
      // Unusual NOT (multiple inputs?) — keep as-is, don't collapse
      for (const src of sources) {
        otherEdges.push({ id: `${src}->${notId}`, source: src, target: notId, negated: false });
      }
      for (const tgt of targets) {
        otherEdges.push({ id: `${notId}->${tgt}`, source: notId, target: tgt, negated: false });
      }
    }
  }

  return {
    edges: [...otherEdges, ...replacementEdges],
    collapsedNotIds,
  };
}

// ─── Dagre layout ───────────────────────────────────────────────────────────

function runDagreLayout(
  nodes: Array<{ id: string; kind: IRNodeKind }>,
  edges: Array<{ source: string; target: string }>
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    ranksep: 160,
    nodesep: 40,
    edgesep: 24,
    marginx: 40,
    marginy: 40,
  });

  for (const n of nodes) {
    const { w, h } = getSize(n.kind);
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const node = g.node(n.id);
    const { w, h } = getSize(n.kind);
    if (node) {
      positions.set(n.id, { x: node.x - w / 2, y: node.y - h / 2 });
    }
  }

  // Post-process: align inputs to leftmost x, outputs to rightmost x
  let minX = Infinity;
  let maxX = -Infinity;
  for (const n of nodes) {
    const pos = positions.get(n.id);
    if (!pos) continue;
    if (n.kind === 'input') minX = Math.min(minX, pos.x);
    if (n.kind === 'output') maxX = Math.max(maxX, pos.x);
  }
  if (minX !== Infinity) {
    for (const n of nodes) {
      if (n.kind === 'input') {
        const pos = positions.get(n.id)!;
        positions.set(n.id, { x: minX, y: pos.y });
      }
    }
  }
  if (maxX !== -Infinity) {
    for (const n of nodes) {
      if (n.kind === 'output') {
        const pos = positions.get(n.id)!;
        positions.set(n.id, { x: maxX, y: pos.y });
      }
    }
  }

  return positions;
}

// ─── Build flow graph ───────────────────────────────────────────────────────

export function buildFlowGraph(
  graph: IRGraph,
  simState: SimState | null,
  selectedId: string | null,
  highlightedIds: Set<string>,
  activePaths?: ActivePathRecord[],
  focusedOutputId?: string | null,
  hiddenNodeIds?: Set<string>,
): { nodes: FlowNode[]; edges: FlowEdge[] } {

  // 1. Collapse NOT nodes into negated edges
  const { edges: collapsedEdges, collapsedNotIds } = collapseNotNodes(graph.nodes, graph.edges);

  // 2. Filter visible nodes (exclude numeric, collapsed NOTs, hidden)
  const hidden = hiddenNodeIds ?? new Set<string>();
  let visibleNodes = [...graph.nodes.values()].filter(n =>
    n.kind !== 'numeric' &&
    !collapsedNotIds.has(n.id) &&
    !hidden.has(n.id)
  );
  let visibleIds = new Set(visibleNodes.map(n => n.id));
  let visibleEdges = collapsedEdges.filter(
    e => visibleIds.has(e.source) && visibleIds.has(e.target)
  );

  // 3. Reachability filter: only keep nodes that connect to an output
  const reachable = computeReachableNodes(
    new Map(visibleNodes.map(n => [n.id, n])),
    visibleEdges,
  );
  visibleNodes = visibleNodes.filter(n => reachable.has(n.id));
  visibleIds = new Set(visibleNodes.map(n => n.id));
  visibleEdges = visibleEdges.filter(
    e => visibleIds.has(e.source) && visibleIds.has(e.target)
  );

  // 4. Layout
  const positions = runDagreLayout(
    visibleNodes.map(n => ({ id: n.id, kind: n.kind })),
    visibleEdges.map(e => ({ source: e.source, target: e.target }))
  );

  // 5. Build causal sets when an output is focused
  let causalNodeSet: Set<string> | null = null;
  let causalEdgeSet: Set<string> | null = null;
  if (focusedOutputId && activePaths) {
    const focused = activePaths.find(p => p.outputId === focusedOutputId);
    if (focused) {
      causalNodeSet = focused.causalNodeIds;
      causalEdgeSet = focused.causalEdgeIds;
    }
  }

  // 6. Build FlowNode array
  const nodes: FlowNode[] = visibleNodes.map(node => {
    const pos = positions.get(node.id) ?? { x: 0, y: 0 };
    const active = simState?.signals.get(node.id) ?? false;
    const isCausal = causalNodeSet ? causalNodeSet.has(node.id) : false;
    const isDimmed = causalNodeSet ? !causalNodeSet.has(node.id) : false;
    const isLatched = node.kind === 'latch' && (simState?.latches.get(node.id) ?? false);
    const isForced = simState?.forcedInputs.has(node.id) ?? false;
    const timerInfo = node.kind === 'timer' ? simState?.timerInfo.get(node.id) : undefined;
    const changedThisStep = simState?.changedOutputs.has(node.id) ?? false;

    return {
      id: node.id,
      type: 'selNode',
      position: pos,
      data: {
        label: node.label,
        kind: node.kind,
        active,
        selected: selectedId === node.id,
        highlighted: highlightedIds.has(node.id),
        sourceValue: node.sourceRawValue,
        causal: isCausal,
        dimmed: isDimmed,
        latched: isLatched,
        forced: isForced,
        timerInfo,
        outputClass: node.outputClass,
        changedThisStep,
      },
    };
  });

  // 7. Build FlowEdge array
  const edges: FlowEdge[] = visibleEdges.map(e => {
    const srcActive = simState?.signals.get(e.source) ?? false;
    const isCausalEdge = causalEdgeSet ? causalEdgeSet.has(e.id) : false;

    let color: string;
    let strokeWidth: number;
    let animated: boolean;
    let opacity = 1;

    if (causalEdgeSet) {
      if (isCausalEdge) {
        color = e.negated ? '#ef4444' : '#4ade80';
        strokeWidth = 2.5;
        animated = true;
        opacity = 1;
      } else {
        color = '#2a3040';
        strokeWidth = 1;
        animated = false;
        opacity = 0.25;
      }
    } else {
      // For negated edges, show red when source active (signal is inverted)
      if (e.negated) {
        color = srcActive ? '#ef4444' : '#c05050';
      } else {
        color = srcActive ? '#4ade80' : '#3d4f6a';
      }
      strokeWidth = srcActive ? 2.5 : 1.5;
      animated = srcActive;
    }

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.negated ? 'negatedEdge' : 'default',
      animated,
      data: { negated: e.negated, active: srcActive },
      style: {
        stroke: color,
        strokeWidth,
        opacity,
      },
      markerEnd: e.negated ? undefined : {
        type: 'arrowclosed' as const,
        color,
        width: 14,
        height: 14,
      },
    };
  });

  return { nodes, edges };
}
