// ─── IR → React Flow nodes/edges, partitioned into labeled logic areas ───────
// Each output contact's full upstream cone is cloned into its own bordered area.
// Clones carry their logical id in node data so the simulation (which runs on the
// single master IRGraph) keeps every duplicate in sync. No edges cross areas.
import type { Node, Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { IRGraph, IRNodeKind, IREdge, OutputClass } from '../../core/ir/types';
import type { SimState, ActivePathRecord, TimerInfo } from '../../core/simulation/engine';
import { partitionGraph, type LogicArea } from '../../core/partition/engine';

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
  // Partition fields
  logicalId: string;
  areaId: string;
  duplicated: boolean;
  unused: boolean;
}>;

export type AreaFrameNode = Node<{
  label: string;
  outputClass: OutputClass;
  width: number;
  height: number;
  variant: 'normal' | 'unused';
}>;

export type GraphNode = FlowNode | AreaFrameNode;

export type FlowEdge = Edge<{ negated?: boolean; active?: boolean }>;

/** An item to show in the optional greyed "unused" overlay area. */
export interface UnusedDisplayItem {
  id: string;
  label: string;
  kind: IRNodeKind;
  outputClass?: OutputClass;
}

// Node dimensions must match the SVG/div sizes in SelNode.tsx
const NODE_SIZE: Record<IRNodeKind, { w: number; h: number }> = {
  and:      { w: 76,  h: 46 },
  or:       { w: 76,  h: 46 },
  not:      { w: 10,  h: 10 },
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

// Layout constants for area framing/packing.
const HEADER_H = 34;
const FRAME_PAD = 28;
const AREA_GAP_X = 90;
const AREA_GAP_Y = 90;
const MAX_ROW_WIDTH = 3200;

// Kinds that are meaningful to flag as "duplicated across areas".
const NAMED_KINDS = new Set<IRNodeKind>([
  'input', 'output', 'derived', 'timer', 'latch', 'rising', 'falling', 'pulse', 'function',
]);

// ─── Reachability filter: keep only nodes connected to at least one output ───

function computeReachableNodes(
  nodes: Map<string, { kind: IRNodeKind }>,
  edges: IREdge[],
): Set<string> {
  const reachable = new Set<string>();
  const reverseAdj = new Map<string, string[]>();
  for (const e of edges) {
    if (!reverseAdj.has(e.target)) reverseAdj.set(e.target, []);
    reverseAdj.get(e.target)!.push(e.source);
  }
  const queue: string[] = [];
  for (const [id, node] of nodes) {
    if (node.kind === 'output') { queue.push(id); reachable.add(id); }
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const src of reverseAdj.get(current) ?? []) {
      if (!reachable.has(src)) { reachable.add(src); queue.push(src); }
    }
  }
  return reachable;
}

// ─── Collapse NOT nodes into negated edges ──────────────────────────────────

interface CollapsedGraph {
  edges: IREdge[];
  collapsedNotIds: Set<string>;
}

function collapseNotNodes(
  nodes: Map<string, { kind: IRNodeKind }>,
  edges: IREdge[],
): CollapsedGraph {
  const collapsedNotIds = new Set<string>();
  const notNodes = new Set<string>();
  for (const [id, n] of nodes) if (n.kind === 'not') notNodes.add(id);
  if (notNodes.size === 0) return { edges, collapsedNotIds };

  const incomingToNot = new Map<string, string[]>();
  const outgoingFromNot = new Map<string, string[]>();
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

  const replacementEdges: IREdge[] = [];
  for (const notId of notNodes) {
    const sources = incomingToNot.get(notId) ?? [];
    const targets = outgoingFromNot.get(notId) ?? [];
    if (sources.length === 1 && targets.length >= 1) {
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
      for (const src of sources) otherEdges.push({ id: `${src}->${notId}`, source: src, target: notId, negated: false });
      for (const tgt of targets) otherEdges.push({ id: `${notId}->${tgt}`, source: notId, target: tgt, negated: false });
    }
  }

  return { edges: [...otherEdges, ...replacementEdges], collapsedNotIds };
}

// ─── Dagre layout (local coords, origin near 0,0) ───────────────────────────

function runDagreLayout(
  nodes: Array<{ id: string; kind: IRNodeKind }>,
  edges: Array<{ source: string; target: string }>,
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 36, edgesep: 20, marginx: 10, marginy: 10 });

  for (const n of nodes) {
    const { w, h } = getSize(n.kind);
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const node = g.node(n.id);
    const { w, h } = getSize(n.kind);
    if (node) positions.set(n.id, { x: node.x - w / 2, y: node.y - h / 2 });
  }
  return positions;
}

// ─── Per-area laid-out structures (sim-independent) ─────────────────────────

interface LaidOutNode {
  flowId: string;
  logicalId: string;
  areaId: string;
  kind: IRNodeKind;
  label: string;
  sourceRawValue?: string;
  outputClass?: OutputClass;
  position: { x: number; y: number };
  duplicated: boolean;
  unused: boolean;
}

interface LaidOutEdge {
  flowId: string;
  edgeLogicalId: string;
  source: string; // flowId
  target: string; // flowId
  sourceLogicalId: string;
  negated: boolean;
}

interface FrameSpec {
  id: string;
  label: string;
  outputClass: OutputClass;
  x: number;
  y: number;
  w: number;
  h: number;
  variant: 'normal' | 'unused';
}

interface CachedLayout {
  graphRef: IRGraph;
  hiddenRef: Set<string> | undefined;
  showUnusedRef: boolean;
  unusedRef: UnusedDisplayItem[] | undefined;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  frames: FrameSpec[];
}

let _layoutCache: CachedLayout | null = null;

/** Lay out a single area into local coords; returns nodes/edges and bbox. */
function layoutArea(
  graph: IRGraph,
  area: LogicArea,
  hidden: Set<string>,
) {
  // Restrict node kinds to this area's cone.
  const kindMap = new Map<string, { kind: IRNodeKind }>();
  for (const id of area.nodeIds) {
    const n = graph.nodes.get(id);
    if (n) kindMap.set(id, { kind: n.kind });
  }

  // 1. Collapse NOT nodes within the area.
  const { edges: collapsedEdges, collapsedNotIds } = collapseNotNodes(kindMap, area.edges);

  // 2. Filter visible nodes (drop numeric, collapsed NOTs, hidden).
  let visibleIds = new Set(
    [...kindMap.keys()].filter(
      id => kindMap.get(id)!.kind !== 'numeric' && !collapsedNotIds.has(id) && !hidden.has(id),
    ),
  );
  let visibleEdges = collapsedEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));

  // 3. Reachability: keep only nodes that connect to an output root.
  const reachable = computeReachableNodes(
    new Map([...visibleIds].map(id => [id, kindMap.get(id)!])),
    visibleEdges,
  );
  visibleIds = new Set([...visibleIds].filter(id => reachable.has(id)));
  visibleEdges = visibleEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));

  // 4. Layout.
  const positions = runDagreLayout(
    [...visibleIds].map(id => ({ id, kind: kindMap.get(id)!.kind })),
    visibleEdges.map(e => ({ source: e.source, target: e.target })),
  );

  // 5. Bounding box.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of visibleIds) {
    const pos = positions.get(id);
    if (!pos) continue;
    const { w, h } = getSize(kindMap.get(id)!.kind);
    minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + w); maxY = Math.max(maxY, pos.y + h);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 120; maxY = 60; }

  return { kindMap, visibleIds, visibleEdges, positions, bbox: { minX, minY, maxX, maxY } };
}

function getCachedLayout(
  graph: IRGraph,
  hiddenNodeIds: Set<string> | undefined,
  showUnused: boolean,
  unusedItems: UnusedDisplayItem[] | undefined,
): CachedLayout {
  if (
    _layoutCache &&
    _layoutCache.graphRef === graph &&
    _layoutCache.hiddenRef === hiddenNodeIds &&
    _layoutCache.showUnusedRef === showUnused &&
    _layoutCache.unusedRef === unusedItems
  ) {
    return _layoutCache;
  }

  const hidden = hiddenNodeIds ?? new Set<string>();
  const { areas } = partitionGraph(graph);

  // First pass: lay out each area locally to learn its size.
  const laid = areas.map(area => ({ area, ...layoutArea(graph, area, hidden) }));

  // Count how many areas each logical id appears in (for the duplicate marker).
  const occurrence = new Map<string, number>();
  for (const a of laid) {
    for (const id of a.visibleIds) occurrence.set(id, (occurrence.get(id) ?? 0) + 1);
  }

  // Pack areas left→right, wrapping rows.
  const outNodes: LaidOutNode[] = [];
  const outEdges: LaidOutEdge[] = [];
  const frames: FrameSpec[] = [];

  let cursorX = 0, cursorY = 0, rowMaxH = 0;

  for (const a of laid) {
    const bw = a.bbox.maxX - a.bbox.minX;
    const bh = a.bbox.maxY - a.bbox.minY;
    const w = bw + FRAME_PAD * 2;
    const h = bh + FRAME_PAD * 2 + HEADER_H;

    if (cursorX > 0 && cursorX + w > MAX_ROW_WIDTH) {
      cursorX = 0;
      cursorY += rowMaxH + AREA_GAP_Y;
      rowMaxH = 0;
    }

    const originX = cursorX;
    const originY = cursorY;
    const offX = originX + FRAME_PAD - a.bbox.minX;
    const offY = originY + HEADER_H + FRAME_PAD - a.bbox.minY;

    frames.push({
      id: a.area.id,
      label: a.area.label,
      outputClass: a.area.outputClass,
      x: originX, y: originY, w, h,
      variant: 'normal',
    });

    for (const id of a.visibleIds) {
      const pos = a.positions.get(id);
      if (!pos) continue;
      const node = graph.nodes.get(id)!;
      const dup = NAMED_KINDS.has(node.kind) && (occurrence.get(id) ?? 0) > 1;
      outNodes.push({
        flowId: `${a.area.id}::${id}`,
        logicalId: id,
        areaId: a.area.id,
        kind: node.kind,
        label: node.label,
        sourceRawValue: node.sourceRawValue,
        outputClass: node.outputClass,
        position: { x: pos.x + offX, y: pos.y + offY },
        duplicated: dup,
        unused: false,
      });
    }

    for (const e of a.visibleEdges) {
      outEdges.push({
        flowId: `${a.area.id}::${e.id}`,
        edgeLogicalId: e.id,
        source: `${a.area.id}::${e.source}`,
        target: `${a.area.id}::${e.target}`,
        sourceLogicalId: e.source,
        negated: !!e.negated,
      });
    }

    cursorX += w + AREA_GAP_X;
    rowMaxH = Math.max(rowMaxH, h);
  }

  // Optional "unused" overlay area appended below everything.
  if (showUnused && unusedItems && unusedItems.length > 0) {
    const startY = cursorY + rowMaxH + AREA_GAP_Y * 1.5;
    const COLS = 6;
    const CW = 120, CH = 56;
    const rows = Math.ceil(unusedItems.length / COLS);
    const innerW = COLS * CW;
    const innerH = rows * CH;
    frames.push({
      id: 'area_unused',
      label: `Unused in logic (${unusedItems.length})`,
      outputClass: 'other',
      x: 0, y: startY,
      w: innerW + FRAME_PAD * 2,
      h: innerH + FRAME_PAD * 2 + HEADER_H,
      variant: 'unused',
    });
    unusedItems.forEach((item, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      outNodes.push({
        flowId: `area_unused::${item.id}`,
        logicalId: item.id,
        areaId: 'area_unused',
        kind: item.kind,
        label: item.label,
        outputClass: item.outputClass,
        position: {
          x: FRAME_PAD + col * CW,
          y: startY + HEADER_H + FRAME_PAD + row * CH,
        },
        duplicated: false,
        unused: true,
      });
    });
  }

  _layoutCache = {
    graphRef: graph,
    hiddenRef: hiddenNodeIds,
    showUnusedRef: showUnused,
    unusedRef: unusedItems,
    nodes: outNodes,
    edges: outEdges,
    frames,
  };
  return _layoutCache;
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
  showUnused = false,
  unusedItems?: UnusedDisplayItem[],
): { nodes: GraphNode[]; edges: FlowEdge[] } {

  const layout = getCachedLayout(graph, hiddenNodeIds, showUnused, unusedItems);

  // Causal sets (logical ids) when an output is focused.
  let causalNodeSet: Set<string> | null = null;
  let causalEdgeSet: Set<string> | null = null;
  if (focusedOutputId && activePaths) {
    const focused = activePaths.find(p => p.outputId === focusedOutputId);
    if (focused) {
      causalNodeSet = focused.causalNodeIds;
      causalEdgeSet = focused.causalEdgeIds;
    }
  }

  // Frame nodes first (render behind real nodes).
  const frameNodes: AreaFrameNode[] = layout.frames.map(f => ({
    id: f.id,
    type: 'areaFrame',
    position: { x: f.x, y: f.y },
    draggable: false,
    selectable: false,
    connectable: false,
    zIndex: 0,
    data: { label: f.label, outputClass: f.outputClass, width: f.w, height: f.h, variant: f.variant },
    style: { width: f.w, height: f.h },
  }));

  const selNodes: FlowNode[] = layout.nodes.map(n => {
    const active = n.unused ? false : (simState?.signals.get(n.logicalId) ?? false);
    const isCausal = causalNodeSet ? causalNodeSet.has(n.logicalId) : false;
    const isDimmed = n.unused
      ? true
      : (causalNodeSet ? !causalNodeSet.has(n.logicalId) : false);
    const isLatched = n.kind === 'latch' && (simState?.latches.get(n.logicalId) ?? false);
    const isForced = simState?.forcedInputs.has(n.logicalId) ?? false;
    const timerInfo = n.kind === 'timer' ? simState?.timerInfo.get(n.logicalId) : undefined;
    const changedThisStep = !n.unused && (simState?.changedOutputs.has(n.logicalId) ?? false);

    return {
      id: n.flowId,
      type: 'selNode',
      position: n.position,
      zIndex: 1,
      data: {
        label: n.label,
        kind: n.kind,
        active,
        selected: selectedId === n.logicalId && !n.unused,
        highlighted: highlightedIds.has(n.logicalId) && !n.unused,
        sourceValue: n.sourceRawValue,
        causal: isCausal,
        dimmed: isDimmed,
        latched: isLatched,
        forced: isForced && !n.unused,
        timerInfo,
        outputClass: n.outputClass,
        changedThisStep,
        logicalId: n.logicalId,
        areaId: n.areaId,
        duplicated: n.duplicated,
        unused: n.unused,
      },
    };
  });

  const nodes: GraphNode[] = [...frameNodes, ...selNodes];

  const edges: FlowEdge[] = layout.edges.map(e => {
    const srcActive = simState?.signals.get(e.sourceLogicalId) ?? false;
    const isCausalEdge = causalEdgeSet ? causalEdgeSet.has(e.edgeLogicalId) : false;

    let color: string;
    let strokeWidth: number;
    let animated: boolean;
    let opacity = 1;

    if (causalEdgeSet) {
      if (isCausalEdge) {
        color = e.negated ? '#ef4444' : '#4ade80';
        strokeWidth = 2.5; animated = true; opacity = 1;
      } else {
        color = '#2a3040'; strokeWidth = 1; animated = false; opacity = 0.25;
      }
    } else {
      if (e.negated) color = srcActive ? '#ef4444' : '#c05050';
      else color = srcActive ? '#4ade80' : '#3d4f6a';
      strokeWidth = srcActive ? 2.5 : 1.5;
      animated = srcActive;
    }

    return {
      id: e.flowId,
      source: e.source,
      target: e.target,
      type: e.negated ? 'negatedEdge' : 'default',
      animated,
      zIndex: 1,
      data: { negated: e.negated, active: srcActive },
      style: { stroke: color, strokeWidth, opacity },
      markerEnd: e.negated ? undefined : {
        type: 'arrowclosed' as const, color, width: 14, height: 14,
      },
    };
  });

  return { nodes, edges };
}
