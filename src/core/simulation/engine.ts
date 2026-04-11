// ─── Simulation engine ────────────────────────────────────────────────────────
import type { IRGraph, IRNode } from '../ir/types';

export type SignalMap = Map<string, boolean>;

// ─── Timer state ─────────────────────────────────────────────────────────────

export type TimerStateEnum = 'idle' | 'timing' | 'qualified' | 'reset';

export interface TimerInfo {
  state: TimerStateEnum;
  currentTicks: number;
  thresholdTicks: number;
}

// ─── Active path record ──────────────────────────────────────────────────────

export interface ActivePathRecord {
  outputId: string;
  causalNodeIds: Set<string>;
  causalEdgeIds: Set<string>;
}

// ─── Simulation state ────────────────────────────────────────────────────────

export interface SimState {
  signals: SignalMap;
  latches: SignalMap;
  prev: SignalMap;
  timerTicks: Map<string, number>;
  step: number;
  forcedInputs: Map<string, boolean>;
  timerInfo: Map<string, TimerInfo>;
  activePaths: ActivePathRecord[];
  changedOutputs: Set<string>;
}

// ─── Initialization ──────────────────────────────────────────────────────────

export function createSimState(graph: IRGraph): SimState {
  const signals: SignalMap = new Map();
  const latches: SignalMap = new Map();
  const prev: SignalMap = new Map();
  const timerTicks = new Map<string, number>();
  const timerInfo = new Map<string, TimerInfo>();

  for (const [id, node] of graph.nodes) {
    signals.set(id, false);
    prev.set(id, false);
    if (node.kind === 'latch') latches.set(id, false);
    if (node.kind === 'timer') {
      timerTicks.set(id, 0);
      const threshold = resolveTimerThreshold(graph, node);
      timerInfo.set(id, { state: 'idle', currentTicks: 0, thresholdTicks: threshold });
    }
  }

  return {
    signals, latches, prev, timerTicks, step: 0,
    forcedInputs: new Map(),
    timerInfo,
    activePaths: [],
    changedOutputs: new Set(),
  };
}

// ─── Timer threshold resolution ──────────────────────────────────────────────
// Looks up PU/DO settings associated with a timer node.
// E.g., for SV01, looks for SV01PU numeric node.

function resolveTimerThreshold(graph: IRGraph, timerNode: IRNode): number {
  const DEFAULT_THRESHOLD = 3;

  // Timer nodes created from SV settings have sourceSettingName like "SV01"
  const baseName = timerNode.sourceSettingName;
  if (baseName) {
    // Look for PU setting: SV01PU, PCT01PU, etc.
    const puNode = graph.nodes.get(baseName + 'PU');
    if (puNode?.numericValue) {
      const val = parseFloat(puNode.numericValue);
      if (!isNaN(val) && val > 0) {
        // Convert cycles to ticks (1 tick = 1 sim step, treat value as cycle count)
        return Math.max(1, Math.ceil(val));
      }
    }
  }

  // For PCT timers, look at the second operand (delay value)
  if (timerNode.timerFn === 'PCT' || timerNode.timerFn === 'TON' || timerNode.timerFn === 'TOF') {
    // Check if any incoming numeric node provides the delay
    for (const edge of graph.edges) {
      if (edge.target === timerNode.id) {
        const srcNode = graph.nodes.get(edge.source);
        if (srcNode?.kind === 'numeric' && srcNode.numericValue) {
          const val = parseFloat(srcNode.numericValue);
          if (!isNaN(val) && val > 0) return Math.max(1, Math.ceil(val));
        }
      }
    }
  }

  return DEFAULT_THRESHOLD;
}

// ─── Topological sort (Kahn's) ────────────────────────────────────────────────

function topoSort(graph: IRGraph): string[] {
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const [id] of graph.nodes) { inDegree.set(id, 0); outgoing.set(id, []); }
  for (const edge of graph.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const d = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order;
}

// ─── Single evaluation step ───────────────────────────────────────────────────

export function stepSimulation(graph: IRGraph, state: SimState): SimState {
  const newSignals: SignalMap = new Map(state.signals);
  const newLatches: SignalMap = new Map(state.latches);
  const newTimerTicks = new Map(state.timerTicks);
  const newTimerInfo = new Map(state.timerInfo);
  const prev = new Map(state.signals);

  // Build incoming edges per node
  const incoming = new Map<string, Array<{ source: string; negated: boolean }>>();
  for (const [id] of graph.nodes) incoming.set(id, []);
  for (const edge of graph.edges) {
    incoming.get(edge.target)?.push({ source: edge.source, negated: !!edge.negated });
  }

  const order = topoSort(graph);

  for (const id of order) {
    const node = graph.nodes.get(id)!;
    const inputs = incoming.get(id) ?? [];
    const getInput = (src: string, neg: boolean): boolean => {
      const v = newSignals.get(src) ?? false;
      return neg ? !v : v;
    };

    switch (node.kind) {
      case 'input':
        // Inputs are set externally (forced by user); keep their current value
        break;

      case 'and': {
        const val = inputs.length === 0
          ? false
          : inputs.every(i => getInput(i.source, i.negated));
        newSignals.set(id, val);
        break;
      }

      case 'or': {
        const val = inputs.some(i => getInput(i.source, i.negated));
        newSignals.set(id, val);
        break;
      }

      case 'not': {
        const src = inputs[0];
        newSignals.set(id, src ? !getInput(src.source, src.negated) : true);
        break;
      }

      case 'rising': {
        const src = inputs[0];
        if (src) {
          const cur = getInput(src.source, false);
          const was = prev.get(src.source) ?? false;
          newSignals.set(id, cur && !was);
        }
        break;
      }

      case 'falling': {
        const src = inputs[0];
        if (src) {
          const cur = getInput(src.source, false);
          const was = prev.get(src.source) ?? false;
          newSignals.set(id, !cur && was);
        }
        break;
      }

      case 'latch': {
        // SEL convention: RST has priority over SET
        const setInputs = inputs.slice(0, Math.ceil(inputs.length / 2));
        const rstInputs = inputs.slice(Math.ceil(inputs.length / 2));
        const setActive = setInputs.some(i => getInput(i.source, i.negated));
        const rstActive = rstInputs.some(i => getInput(i.source, i.negated));
        const current = newLatches.get(id) ?? false;
        // RST wins if both asserted simultaneously
        const next = rstActive ? false : setActive ? true : current;
        newLatches.set(id, next);
        newSignals.set(id, next);
        break;
      }

      case 'timer': {
        const enableSrc = inputs[0];
        const enabled = enableSrc ? getInput(enableSrc.source, enableSrc.negated) : false;
        const currentTicks = newTimerTicks.get(id) ?? 0;
        const info = newTimerInfo.get(id);
        const threshold = info?.thresholdTicks ?? 3;

        let newTicks: number;
        let timerState: TimerStateEnum;

        if (enabled) {
          newTicks = currentTicks + 1;
          timerState = newTicks >= threshold ? 'qualified' : 'timing';
        } else {
          // If was timing/qualified, briefly show 'reset' then go idle
          const wasActive = currentTicks > 0;
          newTicks = 0;
          timerState = wasActive ? 'reset' : 'idle';
        }

        newTimerTicks.set(id, newTicks);
        newTimerInfo.set(id, {
          state: timerState,
          currentTicks: newTicks,
          thresholdTicks: threshold,
        });
        newSignals.set(id, enabled && newTicks >= threshold);
        break;
      }

      case 'pulse': {
        const src = inputs[0];
        if (src) {
          const cur = getInput(src.source, false);
          const was = prev.get(src.source) ?? false;
          newSignals.set(id, cur && !was);
        }
        break;
      }

      case 'derived':
      case 'output':
      case 'function': {
        if (inputs.length === 1) {
          newSignals.set(id, getInput(inputs[0].source, inputs[0].negated));
        } else if (inputs.length > 1) {
          newSignals.set(id, inputs.some(i => getInput(i.source, i.negated)));
        }
        break;
      }

      case 'numeric':
        break;
    }
  }

  // Detect changed outputs
  const changedOutputs = new Set<string>();
  for (const [id, node] of graph.nodes) {
    if (node.kind === 'output') {
      const oldVal = state.signals.get(id) ?? false;
      const newVal = newSignals.get(id) ?? false;
      if (oldVal !== newVal) changedOutputs.add(id);
    }
  }

  // Compute active paths
  const activePaths = computeActivePaths(graph, newSignals);

  return {
    signals: newSignals,
    latches: newLatches,
    prev,
    timerTicks: newTimerTicks,
    step: state.step + 1,
    forcedInputs: new Map(state.forcedInputs),
    timerInfo: newTimerInfo,
    activePaths,
    changedOutputs,
  };
}

// ─── Active path computation ─────────────────────────────────────────────────
// BFS backward from asserted outputs, only following contributing edges.

export function computeActivePaths(
  graph: IRGraph,
  signals: SignalMap,
): ActivePathRecord[] {
  // Build incoming edges map
  const incoming = new Map<string, Array<{ source: string; edgeId: string; negated: boolean }>>();
  for (const [id] of graph.nodes) incoming.set(id, []);
  for (const edge of graph.edges) {
    incoming.get(edge.target)?.push({
      source: edge.source,
      edgeId: edge.id,
      negated: !!edge.negated,
    });
  }

  const paths: ActivePathRecord[] = [];

  // Find all asserted output nodes
  for (const [id, node] of graph.nodes) {
    if (node.kind !== 'output') continue;
    if (!(signals.get(id) ?? false)) continue;

    const causalNodeIds = new Set<string>();
    const causalEdgeIds = new Set<string>();

    // BFS backward tracking expected signal values
    const queue: Array<{ nodeId: string; expectedTrue: boolean }> = [
      { nodeId: id, expectedTrue: true },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { nodeId, expectedTrue } = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      causalNodeIds.add(nodeId);

      const nodeObj = graph.nodes.get(nodeId);
      if (!nodeObj) continue;

      const nodeInputs = incoming.get(nodeId) ?? [];

      switch (nodeObj.kind) {
        case 'and': {
          // For AND to be true, ALL inputs must be true (after negation)
          if (expectedTrue) {
            for (const inp of nodeInputs) {
              const srcVal = signals.get(inp.source) ?? false;
              const effectiveVal = inp.negated ? !srcVal : srcVal;
              if (effectiveVal) {
                causalEdgeIds.add(inp.edgeId);
                queue.push({ nodeId: inp.source, expectedTrue: !inp.negated });
              }
            }
          }
          break;
        }

        case 'or': {
          // For OR to be true, at least one input is true — include all true inputs
          if (expectedTrue) {
            for (const inp of nodeInputs) {
              const srcVal = signals.get(inp.source) ?? false;
              const effectiveVal = inp.negated ? !srcVal : srcVal;
              if (effectiveVal) {
                causalEdgeIds.add(inp.edgeId);
                queue.push({ nodeId: inp.source, expectedTrue: !inp.negated });
              }
            }
          }
          break;
        }

        case 'not': {
          // NOT inverts: if output is true, input must be false
          const inp = nodeInputs[0];
          if (inp) {
            causalEdgeIds.add(inp.edgeId);
            queue.push({ nodeId: inp.source, expectedTrue: false });
          }
          break;
        }

        case 'latch':
        case 'timer':
        case 'rising':
        case 'falling':
        case 'pulse': {
          // For these, trace all inputs that are contributing
          for (const inp of nodeInputs) {
            const srcVal = signals.get(inp.source) ?? false;
            const effectiveVal = inp.negated ? !srcVal : srcVal;
            if (effectiveVal) {
              causalEdgeIds.add(inp.edgeId);
              queue.push({ nodeId: inp.source, expectedTrue: !inp.negated });
            }
          }
          break;
        }

        default: {
          // derived, output, function — trace all contributing inputs
          for (const inp of nodeInputs) {
            const srcVal = signals.get(inp.source) ?? false;
            const effectiveVal = inp.negated ? !srcVal : srcVal;
            if (effectiveVal) {
              causalEdgeIds.add(inp.edgeId);
              queue.push({ nodeId: inp.source, expectedTrue: !inp.negated });
            }
          }
          break;
        }
      }
    }

    paths.push({ outputId: id, causalNodeIds, causalEdgeIds });
  }

  return paths;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function resetSimulation(graph: IRGraph): SimState {
  return createSimState(graph);
}

export function setInput(state: SimState, nodeId: string, value: boolean): SimState {
  const newSignals = new Map(state.signals);
  newSignals.set(nodeId, value);
  const newForced = new Map(state.forcedInputs);
  newForced.set(nodeId, value);
  return { ...state, signals: newSignals, forcedInputs: newForced };
}
