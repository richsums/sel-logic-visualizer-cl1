// ─── IR → React Flow nodes/edges with dagre layout ───────────────────────────
import type { Node, Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { IRGraph, IRNodeKind, OutputClass } from '../../core/ir/types';
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
  not:      { w: 64,  h: 42 },
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

function runDagreLayout(
  nodes: Array<{ id: string; kind: IRNodeKind }>,
  edges: Array<{ source: string; target: string }>
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 70, nodesep: 18, edgesep: 8, marginx: 20, marginy: 20 });

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
  return positions;
}

export function buildFlowGraph(
  graph: IRGraph,
  simState: SimState | null,
  selectedId: string | null,
  highlightedIds: Set<string>,
  activePaths?: ActivePathRecord[],
  focusedOutputId?: string | null,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const visibleNodes = [...graph.nodes.values()].filter(n => n.kind !== 'numeric');
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = graph.edges.filter(
    e => visibleIds.has(e.source) && visibleIds.has(e.target)
  );

  const positions = runDagreLayout(
    visibleNodes.map(n => ({ id: n.id, kind: n.kind })),
    visibleEdges.map(e => ({ source: e.source, target: e.target }))
  );

  // Build causal sets when an output is focused
  let causalNodeSet: Set<string> | null = null;
  let causalEdgeSet: Set<string> | null = null;
  if (focusedOutputId && activePaths) {
    const focused = activePaths.find(p => p.outputId === focusedOutputId);
    if (focused) {
      causalNodeSet = focused.causalNodeIds;
      causalEdgeSet = focused.causalEdgeIds;
    }
  }

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

  const edges: FlowEdge[] = visibleEdges.map(e => {
    const srcActive = simState?.signals.get(e.source) ?? false;
    const isCausalEdge = causalEdgeSet ? causalEdgeSet.has(e.id) : false;

    let color: string;
    let strokeWidth: number;
    let animated: boolean;
    let opacity = 1;

    if (causalEdgeSet) {
      // Focused mode: causal edges are bright, rest are dimmed
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
      // Normal mode
      color = e.negated
        ? '#c05050'
        : srcActive
        ? '#4ade80'
        : '#3d4f6a';
      strokeWidth = srcActive ? 2.5 : 1.5;
      animated = srcActive;
    }

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'step',
      animated,
      data: { negated: e.negated, active: srcActive },
      style: {
        stroke: color,
        strokeWidth,
        opacity,
      },
      markerEnd: {
        type: 'arrowclosed' as const,
        color,
        width: 14,
        height: 14,
      },
    };
  });

  return { nodes, edges };
}
