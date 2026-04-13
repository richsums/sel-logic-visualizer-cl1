// ─── Test Plan Engine ─────────────────────────────────────────────────────────
// Analyzes the IR graph to generate test plan data for relay technicians.
// Works with Omicron CMC State Sequencer / logic verification workflows.

import type { IRGraph, IRNode, IREdge, OutputClass } from '../ir/types';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single logic path from inputs to an output */
export interface LogicPath {
  /** Unique id for this path */
  id: string;
  /** Target output node id */
  outputId: string;
  /** Output classification (trip, close, alarm, etc.) */
  outputClass: OutputClass;
  /** Ordered node ids from input(s) → output */
  nodeIds: string[];
  /** Human-readable description of what conditions assert this path */
  description: string;
  /** Minimum set of input conditions needed to assert this output via this path */
  requiredInputs: InputCondition[];
  /** Intermediate nodes that must be satisfied */
  intermediateNodes: string[];
  /** Whether this path has been checked off */
  checked: boolean;
}

/** An input condition needed for a test */
export interface InputCondition {
  /** Node id of the input */
  nodeId: string;
  /** Display label */
  label: string;
  /** Required logical state (true = asserted, false = de-asserted) */
  requiredState: boolean;
  /** What type of fault/injection this maps to */
  injectionHint: string;
}

/** A complete test scenario for one output */
export interface TestScenario {
  /** Output node id */
  outputId: string;
  /** Output label */
  outputLabel: string;
  /** Output classification */
  outputClass: OutputClass;
  /** All logic paths that can assert this output */
  paths: LogicPath[];
  /** Binary I/O mapping for this output */
  binaryIO: BinaryIOEntry[];
  /** Suggested Omicron State Sequencer states */
  stateSequence: StateSequenceStep[];
}

/** Binary I/O mapping entry */
export interface BinaryIOEntry {
  /** Relay terminal label */
  relayTerminal: string;
  /** Direction: input to relay or output from relay */
  direction: 'relay-input' | 'relay-output';
  /** Function description */
  function: string;
  /** Suggested CMC connection */
  cmcSuggestion: string;
}

/** A step in a suggested state sequence */
export interface StateSequenceStep {
  /** State name */
  name: string;
  /** Description */
  description: string;
  /** Duration or trigger condition */
  transition: string;
  /** Analog injection hint */
  analogHint: string;
  /** Binary outputs to set (CMC → relay) */
  binaryOutputs: { label: string; state: boolean }[];
  /** Expected binary inputs (relay → CMC) */
  expectedInputs: { label: string; state: boolean }[];
}

/** Truth table row */
export interface TruthTableRow {
  inputs: Map<string, boolean>;
  output: boolean;
}

/** Coverage summary */
export interface CoverageSummary {
  totalOutputs: number;
  totalPaths: number;
  checkedPaths: number;
  outputCoverage: { outputId: string; label: string; outputClass: OutputClass; totalPaths: number; checkedPaths: number }[];
}

// ─── Adjacency builder ─────────────────────────────────────────────────────

function buildAdj(graph: IRGraph) {
  const incoming = new Map<string, { source: string; negated: boolean }[]>();
  const outgoing = new Map<string, string[]>();
  for (const [id] of graph.nodes) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const edge of graph.edges) {
    incoming.get(edge.target)?.push({ source: edge.source, negated: !!edge.negated });
    outgoing.get(edge.source)?.push(edge.target);
  }
  return { incoming, outgoing };
}

// ─── Injection hint mapping ─────────────────────────────────────────────────

function getInjectionHint(nodeId: string, label: string): string {
  const id = nodeId.toUpperCase();
  // Overcurrent elements
  if (/^50P/.test(id) || /^51P/.test(id)) return 'Inject phase overcurrent (I > pickup)';
  if (/^50N/.test(id) || /^50G/.test(id) || /^51N/.test(id) || /^51G/.test(id))
    return 'Inject ground/neutral overcurrent (3I0 > pickup)';
  if (/^50Q/.test(id) || /^51Q/.test(id)) return 'Inject negative-sequence overcurrent (I2 > pickup)';
  // Voltage elements
  if (/^27/.test(id)) return 'Depress voltage below pickup (V < setting)';
  if (/^59/.test(id)) return 'Raise voltage above pickup (V > setting)';
  if (/^47/.test(id)) return 'Apply negative-sequence voltage';
  // Frequency elements
  if (/^81[OU]/.test(id) || /^81D/.test(id)) return 'Adjust frequency (f deviation from nominal)';
  // Distance elements
  if (/^21/.test(id) || /^Z[1-4]/.test(id) || /^MHO/.test(id))
    return 'Inject V/I to place impedance in zone (Z = V/I)';
  // Differential
  if (/^87/.test(id)) return 'Inject differential current (Id > slope)';
  // Breaker/contact inputs
  if (/^52/.test(id) || /^IN\d/.test(id)) return 'CMC binary output → simulate contact state';
  if (/^CC/.test(id)) return 'CMC binary output → close command';
  // Power elements
  if (/^32/.test(id)) return 'Inject watts (P > pickup, correct direction)';
  // Reclose
  if (/^79/.test(id)) return 'Reclose cycle — verify sequence timing';
  // SEL logic variables
  if (/^SV/.test(id) || /^PSV/.test(id)) return 'SEL programmable variable — set via logic';
  if (/^PCT/.test(id)) return 'SEL programmable timer — check timing';
  if (/^PLT/.test(id)) return 'SEL programmable latch — check set/reset';
  // General
  if (/^TRIP/.test(id) || /^TR$/.test(id)) return 'Expected: relay asserts trip output';
  return 'Set input to required state';
}

// ─── Binary I/O classification ─────────────────────────────────────────────

function classifyBinaryIO(graph: IRGraph): BinaryIOEntry[] {
  const entries: BinaryIOEntry[] = [];
  const seen = new Set<string>();

  for (const [id, node] of graph.nodes) {
    if (seen.has(id)) continue;

    // Relay outputs (our graph "output" nodes map to physical relay outputs)
    if (node.kind === 'output') {
      seen.add(id);
      const oc = node.outputClass ?? 'other';
      let fn = id;
      if (oc === 'trip') fn = `Trip output (${id})`;
      else if (oc === 'close') fn = `Close output (${id})`;
      else if (oc === 'alarm') fn = `Alarm output (${id})`;
      else if (oc === 'breaker_failure') fn = `Breaker failure (${id})`;
      else if (oc === 'reclose') fn = `Reclose output (${id})`;
      else fn = `Output (${id})`;

      entries.push({
        relayTerminal: id,
        direction: 'relay-output',
        function: fn,
        cmcSuggestion: `CMC Binary Input → monitor ${id}`,
      });
    }

    // Relay inputs (physical contacts, breaker status, etc.)
    if (node.kind === 'input' && /^(IN\d|52[AB]|CC\d|OC\d)/.test(id.toUpperCase())) {
      seen.add(id);
      entries.push({
        relayTerminal: id,
        direction: 'relay-input',
        function: `Physical input (${id})`,
        cmcSuggestion: `CMC Binary Output → drive ${id}`,
      });
    }
  }

  return entries;
}

// ─── Path finder with negation tracking ────────────────────────────────────

function findInputPaths(
  graph: IRGraph,
  targetId: string,
  maxPaths = 100,
): { nodeIds: string[]; inputConditions: InputCondition[] }[] {
  const { incoming } = buildAdj(graph);
  const results: { nodeIds: string[]; inputConditions: InputCondition[] }[] = [];

  function dfs(
    current: string,
    path: string[],
    conditions: InputCondition[],
    visited: Set<string>,
    negated: boolean,
  ) {
    if (results.length >= maxPaths) return;
    const preds = incoming.get(current) ?? [];
    const node = graph.nodes.get(current);
    if (!node) return;

    // Reached a leaf input
    if (preds.length === 0 || node.kind === 'input' || node.kind === 'numeric') {
      const requiredState = !negated; // if path has odd negations, need false
      conditions.push({
        nodeId: current,
        label: node.label,
        requiredState,
        injectionHint: getInjectionHint(current, node.label),
      });
      results.push({
        nodeIds: [...path, current].reverse(),
        inputConditions: [...conditions],
      });
      conditions.pop();
      return;
    }

    if (visited.has(current)) return;
    visited.add(current);

    // For AND gates, we need ALL inputs — recurse into each
    if (node.kind === 'and') {
      // Collect all required inputs for this AND gate
      const allInputConditions: InputCondition[][] = [];
      let valid = true;

      for (const pred of preds) {
        const subResults: { nodeIds: string[]; inputConditions: InputCondition[] }[] = [];
        const subVisited = new Set(visited);
        // Temporarily use a sub-search
        const origLen = results.length;
        dfs(pred.source, [...path, current], [...conditions], subVisited, negated !== pred.negated ? !negated : negated);
        // This is complex — fall through to simple path enumeration
      }
    }

    // Simple path enumeration: follow each predecessor
    for (const pred of preds) {
      const nextNegated = pred.negated ? !negated : negated;
      dfs(pred.source, [...path, current], [...conditions], new Set(visited), nextNegated);
    }

    visited.delete(current);
  }

  dfs(targetId, [], [], new Set(), false);
  return results;
}

// ─── Minimum input set computation (simplified) ────────────────────────────
// For each output, compute all unique input combinations that can assert it.

function computeMinInputSets(
  graph: IRGraph,
  outputId: string,
): InputCondition[][] {
  const { incoming } = buildAdj(graph);
  const cache = new Map<string, InputCondition[][]>();

  function solve(nodeId: string, visited: Set<string>, negationDepth: number): InputCondition[][] {
    if (visited.has(nodeId)) return []; // cycle
    const cached = cache.get(`${nodeId}:${negationDepth % 2}`);
    if (cached) return cached;

    const node = graph.nodes.get(nodeId);
    if (!node) return [];
    const preds = incoming.get(nodeId) ?? [];

    // Leaf: input or no predecessors
    if (preds.length === 0 || node.kind === 'input' || node.kind === 'numeric') {
      const result: InputCondition[][] = [[{
        nodeId,
        label: node.label,
        requiredState: negationDepth % 2 === 0,
        injectionHint: getInjectionHint(nodeId, node.label),
      }]];
      cache.set(`${nodeId}:${negationDepth % 2}`, result);
      return result;
    }

    visited.add(nodeId);

    if (node.kind === 'and') {
      // AND: need ALL inputs satisfied — cross-product
      let combos: InputCondition[][] = [[]];
      for (const pred of preds) {
        const nd = pred.negated ? negationDepth + 1 : negationDepth;
        const subSets = solve(pred.source, new Set(visited), nd);
        if (subSets.length === 0) { combos = []; break; }
        const newCombos: InputCondition[][] = [];
        for (const existing of combos) {
          for (const sub of subSets) {
            if (newCombos.length > 50) break; // limit explosion
            newCombos.push([...existing, ...sub]);
          }
        }
        combos = newCombos;
      }
      visited.delete(nodeId);
      cache.set(`${nodeId}:${negationDepth % 2}`, combos);
      return combos;
    }

    if (node.kind === 'or') {
      // OR: ANY input path works — union
      const allSets: InputCondition[][] = [];
      for (const pred of preds) {
        const nd = pred.negated ? negationDepth + 1 : negationDepth;
        const subSets = solve(pred.source, new Set(visited), nd);
        for (const s of subSets) {
          if (allSets.length > 50) break;
          allSets.push(s);
        }
      }
      visited.delete(nodeId);
      cache.set(`${nodeId}:${negationDepth % 2}`, allSets);
      return allSets;
    }

    // Derived, timer, latch, rising, falling, pulse, function — pass through
    const allSets: InputCondition[][] = [];
    for (const pred of preds) {
      const nd = pred.negated ? negationDepth + 1 : negationDepth;
      const subSets = solve(pred.source, new Set(visited), nd);
      for (const s of subSets) {
        if (allSets.length > 50) break;
        allSets.push(s);
      }
    }
    visited.delete(nodeId);
    cache.set(`${nodeId}:${negationDepth % 2}`, allSets);
    return allSets;
  }

  return solve(outputId, new Set(), 0);
}

// ─── Build state sequence suggestion ───────────────────────────────────────

function buildStateSequence(
  outputId: string,
  outputLabel: string,
  conditions: InputCondition[],
): StateSequenceStep[] {
  const steps: StateSequenceStep[] = [];

  // Pre-fault state
  const prefaultBinOutputs = conditions
    .filter(c => /^(IN\d|52|CC)/.test(c.nodeId.toUpperCase()))
    .map(c => ({ label: c.nodeId, state: !c.requiredState }));

  steps.push({
    name: 'Pre-Fault',
    description: 'Nominal/quiescent state — relay should not operate',
    transition: 'Time-based: 2 seconds (verify stable)',
    analogHint: 'Inject nominal: V = 67V L-N, I = 1A, 60Hz',
    binaryOutputs: prefaultBinOutputs,
    expectedInputs: [{ label: outputLabel, state: false }],
  });

  // Fault state
  const faultAnalog = conditions
    .filter(c => !/^(IN\d|52|CC|SV|PSV|PLT)/.test(c.nodeId.toUpperCase()))
    .map(c => c.injectionHint)
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .join('; ');

  const faultBinOutputs = conditions
    .filter(c => /^(IN\d|52|CC)/.test(c.nodeId.toUpperCase()))
    .map(c => ({ label: c.nodeId, state: c.requiredState }));

  steps.push({
    name: 'Fault / Assert',
    description: `Apply conditions to assert ${outputLabel}`,
    transition: `Trigger: ${outputLabel} asserts (CMC BI) — Timeout: 5 seconds (fail)`,
    analogHint: faultAnalog || 'Adjust analog signals per element requirements',
    binaryOutputs: faultBinOutputs,
    expectedInputs: [{ label: outputLabel, state: true }],
  });

  // Post-fault / reset state
  steps.push({
    name: 'Reset / Post-Fault',
    description: 'Return to nominal — verify relay resets',
    transition: 'Time-based: 3 seconds',
    analogHint: 'Restore nominal: V = 67V L-N, I = 1A, 60Hz',
    binaryOutputs: prefaultBinOutputs,
    expectedInputs: [{ label: outputLabel, state: false }],
  });

  return steps;
}

// ─── Path description generator ────────────────────────────────────────────

function describeConditions(conditions: InputCondition[]): string {
  if (conditions.length === 0) return 'No input conditions required';
  return conditions
    .map(c => `${c.label} = ${c.requiredState ? '1' : '0'}`)
    .join(' AND ');
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Generate test scenarios for all outputs in the graph */
export function generateTestScenarios(graph: IRGraph): TestScenario[] {
  const scenarios: TestScenario[] = [];
  const binaryIO = classifyBinaryIO(graph);

  // Get all output nodes
  const outputs: IRNode[] = [];
  for (const [_id, node] of graph.nodes) {
    if (node.kind === 'output') outputs.push(node);
  }

  // Sort by output class priority
  const classPriority: Record<OutputClass, number> = {
    trip: 0, close: 1, breaker_failure: 2, reclose: 3,
    alarm: 4, block: 5, supervisory: 6, display: 7, led: 8, other: 9,
  };
  outputs.sort((a, b) =>
    (classPriority[a.outputClass ?? 'other'] ?? 9) - (classPriority[b.outputClass ?? 'other'] ?? 9)
  );

  for (const output of outputs) {
    const inputSets = computeMinInputSets(graph, output.id);
    const paths: LogicPath[] = inputSets.map((conditions, i) => {
      // Deduplicate conditions by nodeId
      const deduped = new Map<string, InputCondition>();
      for (const c of conditions) {
        if (!deduped.has(c.nodeId)) deduped.set(c.nodeId, c);
      }
      const uniqueConditions = [...deduped.values()];

      return {
        id: `${output.id}_path_${i + 1}`,
        outputId: output.id,
        outputClass: output.outputClass ?? 'other',
        nodeIds: uniqueConditions.map(c => c.nodeId),
        description: describeConditions(uniqueConditions),
        requiredInputs: uniqueConditions,
        intermediateNodes: [],
        checked: false,
      };
    });

    // Get the best (simplest) path for state sequence suggestion
    const simplest = paths.length > 0
      ? paths.reduce((a, b) => a.requiredInputs.length <= b.requiredInputs.length ? a : b)
      : null;

    const stateSequence = simplest
      ? buildStateSequence(output.id, output.label, simplest.requiredInputs)
      : [];

    // Filter binary I/O relevant to this output
    const relevantIO = binaryIO.filter(bio =>
      bio.relayTerminal === output.id ||
      paths.some(p => p.requiredInputs.some(c => c.nodeId === bio.relayTerminal))
    );

    scenarios.push({
      outputId: output.id,
      outputLabel: output.label,
      outputClass: output.outputClass ?? 'other',
      paths,
      binaryIO: relevantIO.length > 0 ? relevantIO : binaryIO.filter(b => b.relayTerminal === output.id),
      stateSequence,
    });
  }

  return scenarios;
}

/** Generate binary I/O mapping for the entire graph */
export function generateBinaryIOMap(graph: IRGraph): BinaryIOEntry[] {
  return classifyBinaryIO(graph);
}

/** Generate truth table for a specific output */
export function generateTruthTable(
  graph: IRGraph,
  outputId: string,
): { inputLabels: string[]; rows: { inputs: boolean[]; output: boolean }[] } {
  const inputSets = computeMinInputSets(graph, outputId);

  // Collect all unique input node ids across all paths
  const allInputIds = new Set<string>();
  for (const set of inputSets) {
    for (const c of set) allInputIds.add(c.nodeId);
  }
  const inputLabels = [...allInputIds].sort();

  // Build rows: each input set becomes a row where output = true
  const rows: { inputs: boolean[]; output: boolean }[] = [];
  const seen = new Set<string>();

  for (const set of inputSets) {
    const condMap = new Map<string, boolean>();
    for (const c of set) condMap.set(c.nodeId, c.requiredState);

    const inputValues = inputLabels.map(id => condMap.get(id) ?? false);
    const key = inputValues.map(v => v ? '1' : '0').join('');
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ inputs: inputValues, output: true });
  }

  // Add the all-false row (output = false)
  if (inputLabels.length > 0 && inputLabels.length <= 20) {
    const allFalse = inputLabels.map(() => false);
    const key = allFalse.map(v => v ? '1' : '0').join('');
    if (!seen.has(key)) {
      rows.push({ inputs: allFalse, output: false });
    }
  }

  return { inputLabels, rows };
}

/** Generate CSV string for truth table export */
export function truthTableToCSV(
  outputLabel: string,
  table: { inputLabels: string[]; rows: { inputs: boolean[]; output: boolean }[] },
): string {
  const header = [...table.inputLabels, outputLabel].join(',');
  const dataRows = table.rows.map(row =>
    [...row.inputs.map(v => v ? '1' : '0'), row.output ? '1' : '0'].join(',')
  );
  return [header, ...dataRows].join('\n');
}

/** Export all test scenarios as a text report */
export function scenariosToText(scenarios: TestScenario[], docLabel: string): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    `  SEL LOGIC VISUALIZER — TEST PLAN REPORT`,
    `  Document: ${docLabel}`,
    `  Generated: ${new Date().toLocaleString()}`,
    '═══════════════════════════════════════════════════════════════',
    '',
  ];

  for (const s of scenarios) {
    lines.push(`┌─────────────────────────────────────────────────────────────`);
    lines.push(`│ OUTPUT: ${s.outputLabel}  [${s.outputClass.toUpperCase()}]`);
    lines.push(`│ Paths: ${s.paths.length}`);
    lines.push(`└─────────────────────────────────────────────────────────────`);
    lines.push('');

    for (let i = 0; i < s.paths.length; i++) {
      const p = s.paths[i];
      lines.push(`  Path ${i + 1}: ${p.description}`);
      for (const c of p.requiredInputs) {
        lines.push(`    • ${c.label} = ${c.requiredState ? 'ASSERT (1)' : 'DE-ASSERT (0)'}`);
        lines.push(`      Injection: ${c.injectionHint}`);
      }
      lines.push('');
    }

    if (s.stateSequence.length > 0) {
      lines.push('  Suggested State Sequence (Omicron StateSequencer):');
      for (const step of s.stateSequence) {
        lines.push(`    [${step.name}]`);
        lines.push(`      ${step.description}`);
        lines.push(`      Transition: ${step.transition}`);
        lines.push(`      Analog: ${step.analogHint}`);
        if (step.binaryOutputs.length > 0) {
          lines.push(`      CMC Binary Outputs: ${step.binaryOutputs.map(b => `${b.label}=${b.state ? 'ON' : 'OFF'}`).join(', ')}`);
        }
        lines.push(`      Expected: ${step.expectedInputs.map(b => `${b.label}=${b.state ? 'ASSERT' : 'IDLE'}`).join(', ')}`);
      }
      lines.push('');
    }

    lines.push('');
  }

  return lines.join('\n');
}

/** Coverage summary */
export function computeCoverage(scenarios: TestScenario[]): CoverageSummary {
  let totalPaths = 0;
  let checkedPaths = 0;
  const outputCoverage = scenarios.map(s => {
    const checked = s.paths.filter(p => p.checked).length;
    totalPaths += s.paths.length;
    checkedPaths += checked;
    return {
      outputId: s.outputId,
      label: s.outputLabel,
      outputClass: s.outputClass,
      totalPaths: s.paths.length,
      checkedPaths: checked,
    };
  });

  return {
    totalOutputs: scenarios.length,
    totalPaths,
    checkedPaths,
    outputCoverage,
  };
}
