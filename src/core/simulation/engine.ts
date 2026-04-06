// ─── Simulation engine ────────────────────────────────────────────────────────
import type { IRGraph, IRNode } from '../ir/types';

export type SignalMap = Map<string, boolean>;

export interface SimState {
  /** Current combinational values */
  signals: SignalMap;
  /** Latched state (SET/RST) */
  latches: SignalMap;
  /** Previous-step values (for edge detection) */
  prev: SignalMap;
  /** Timer elapsed ticks per timer node */
  timerTicks: Map<string, number>;
  step: number;
}

export function createSimState(graph: IRGraph): SimState {
  const signals: SignalMap = new Map();
  const latches: SignalMap = new Map();
  const prev: SignalMap = new Map();
  const timerTicks = new Map<string, number>();

  for (const [id, node] of graph.nodes) {
    signals.set(id, false);
    prev.set(id, false);
    if (node.kind === 'latch') latches.set(id, false);
    if (node.kind === 'timer') timerTicks.set(id, 0);
  }

  return { signals, latches, prev, timerTicks, step: 0 };
}

// ─── Topological sort (Kahn's) ────────────────────────────────────────────────

function topoSort(graph: IRGraph): string[] {
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const [id] of graph.nodes) { inDegree.set(id, 0); outgoing.set(id, []); }
  for (const edge of graph.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }
  const queue = [...inDegree.entries()].filter(([,d]) => d === 0).map(([id]) => id);
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
  const prev = new Map(state.signals);

  // Build incoming edges per node
  const incoming = new Map<string, Array<{ source: string; negated: boolean }>>();
  for (const [id] of graph.nodes) incoming.set(id, []);
  for (const edge of graph.edges) {
    incoming.get(edge.target)!.push({ source: edge.source, negated: !!edge.negated });
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
        // Inputs are set externally; keep their current value
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
        // Simplified: SET wins over RST
        const setInputs = inputs.slice(0, Math.ceil(inputs.length / 2));
        const rstInputs = inputs.slice(Math.ceil(inputs.length / 2));
        const setActive = setInputs.some(i => getInput(i.source, i.negated));
        const rstActive = rstInputs.some(i => getInput(i.source, i.negated));
        const current = newLatches.get(id) ?? false;
        const next = setActive ? true : rstActive ? false : current;
        newLatches.set(id, next);
        newSignals.set(id, next);
        break;
      }

      case 'timer': {
        const enableSrc = inputs[0];
        const enabled = enableSrc ? getInput(enableSrc.source, enableSrc.negated) : false;
        const currentTicks = newTimerTicks.get(id) ?? 0;
        const newTicks = enabled ? currentTicks + 1 : 0;
        newTimerTicks.set(id, newTicks);
        // Threshold = 3 steps as a default (would use actual delay in full impl)
        newSignals.set(id, enabled && newTicks >= 3);
        break;
      }

      case 'pulse': {
        const src = inputs[0];
        if (src) {
          const cur = getInput(src.source, false);
          const was = prev.get(src.source) ?? false;
          // Pulse: true for one step on rising edge
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
          // Default: OR of all inputs
          newSignals.set(id, inputs.some(i => getInput(i.source, i.negated)));
        }
        break;
      }

      case 'numeric':
        break;
    }
  }

  return {
    signals: newSignals,
    latches: newLatches,
    prev,
    timerTicks: newTimerTicks,
    step: state.step + 1,
  };
}

export function resetSimulation(graph: IRGraph): SimState {
  return createSimState(graph);
}

export function setInput(state: SimState, nodeId: string, value: boolean): SimState {
  const newSignals = new Map(state.signals);
  newSignals.set(nodeId, value);
  return { ...state, signals: newSignals };
}
