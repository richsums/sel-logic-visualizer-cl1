// ─── Test Plan Engine ─────────────────────────────────────────────────────────
// Analyzes the IR graph to generate test plan data for relay technicians.
// Works with Omicron CMC test modules (State Sequencer, Ramping, etc.).

import type { IRGraph, IRNode, IREdge, OutputClass } from '../ir/types';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single logic path from inputs to an output */
export interface LogicPath {
  id: string;
  outputId: string;
  outputClass: OutputClass;
  /** All node ids in this path (inputs → gates → output) */
  nodeIds: string[];
  /** All edge ids along this path */
  edgeIds: string[];
  description: string;
  requiredInputs: InputCondition[];
  /** Intermediate latch/timer nodes in this path */
  intermediateNodes: IntermediateDetail[];
  checked: boolean;
  /** Specific pass/fail criteria for this path */
  passCriteria: PassCriterion[];
  /** Recommended Omicron module type */
  omicronModule: OmicronModule;
}

export type OmicronModule =
  | 'StateSequencer'
  | 'Ramping'
  | 'PulseRamping'
  | 'OvercurrentModule'
  | 'DistanceModule';

/** An input condition needed for a test */
export interface InputCondition {
  nodeId: string;
  label: string;
  requiredState: boolean;
  injectionHint: string;
}

/** Detail about an intermediate latch or timer node */
export interface IntermediateDetail {
  nodeId: string;
  label: string;
  kind: 'timer' | 'latch' | 'rising' | 'falling';
  /** For timers: the setting value (e.g., "60 cycles" or "1.000 s") */
  delaySetting?: string;
  /** For timers: raw numeric value from settings */
  delayValue?: string;
  /** For timers: the setting name for PU or DO */
  delaySettingName?: string;
  /** For latches: the set/latch condition description */
  setCondition?: string;
  /** For latches: the reset/unlatch condition description */
  resetCondition?: string;
  /** For latches: set condition node ids */
  setInputIds?: string[];
  /** For latches: reset condition node ids */
  resetInputIds?: string[];
  /** For latches: associated timer (if any) */
  associatedTimerDelay?: string;
  associatedTimerSettingName?: string;
}

/** Pass/fail criterion */
export interface PassCriterion {
  /** What to measure */
  measurement: string;
  /** Expected value or condition */
  expected: string;
  /** Tolerance band */
  tolerance: string;
  /** How to assess in Omicron */
  assessment: string;
}

/** Specific fault injection values for Omicron State Sequencer */
export interface FaultInjectionValues {
  current?: string;
  voltage?: string;
  phaseAngle?: string;
  frequency?: string;
  description: string;
}

/** A complete test scenario for one output */
export interface TestScenario {
  outputId: string;
  outputLabel: string;
  outputClass: OutputClass;
  paths: LogicPath[];
  binaryIO: BinaryIOEntry[];
  stateSequence: StateSequenceStep[];
  /** Latch nodes in the path to this output */
  latchDetails: IntermediateDetail[];
  /** Timer nodes in the path to this output */
  timerDetails: IntermediateDetail[];
  /** LEDs expected to illuminate for this test */
  expectedLEDs: string[];
}

export interface BinaryIOEntry {
  relayTerminal: string;
  direction: 'relay-input' | 'relay-output';
  function: string;
  cmcSuggestion: string;
}

export interface StateSequenceStep {
  name: string;
  description: string;
  transition: string;
  analogHint: string;
  binaryOutputs: { label: string; state: boolean }[];
  expectedInputs: { label: string; state: boolean }[];
}

export interface CoverageSummary {
  totalOutputs: number;
  totalPaths: number;
  checkedPaths: number;
  outputCoverage: { outputId: string; label: string; outputClass: OutputClass; totalPaths: number; checkedPaths: number }[];
}

// ─── Adjacency builder ─────────────────────────────────────────────────────

function buildAdj(graph: IRGraph) {
  const incoming = new Map<string, { source: string; negated: boolean; edgeId: string }[]>();
  const outgoing = new Map<string, { target: string; edgeId: string }[]>();
  for (const [id] of graph.nodes) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const edge of graph.edges) {
    incoming.get(edge.target)?.push({ source: edge.source, negated: !!edge.negated, edgeId: edge.id });
    outgoing.get(edge.source)?.push({ target: edge.target, edgeId: edge.id });
  }
  return { incoming, outgoing };
}

// ─── Upstream tracing helper ──────────────────────────────────────────────

/** BFS backward from a node, collecting all upstream node IDs */
function traceUpstreamIds(graph: IRGraph, startId: string): Set<string> {
  const { incoming } = buildAdj(graph);
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const pred of incoming.get(cur) ?? []) {
      if (!visited.has(pred.source)) queue.push(pred.source);
    }
  }
  return visited;
}

// ─── LED cross-referencing ────────────────────────────────────────────────

/** Find LEDs that share upstream elements with a given output */
function findLEDsForOutput(graph: IRGraph, outputId: string): string[] {
  const outputUpstream = traceUpstreamIds(graph, outputId);
  const relatedLEDs: string[] = [];

  for (const [id, node] of graph.nodes) {
    if (node.kind === 'output' && /^LED\d+$/i.test(id) && id !== outputId) {
      const ledUpstream = traceUpstreamIds(graph, id);
      const overlap = [...ledUpstream].filter(n => outputUpstream.has(n));
      if (overlap.length > 0) {
        relatedLEDs.push(id);
      }
    }
  }
  return relatedLEDs;
}

// ─── Specific fault injection values ──────────────────────────────────────

/** Look up a pickup setting node value from the graph */
function lookupPickupValue(graph: IRGraph, settingName: string): number | null {
  const node = graph.nodes.get(settingName);
  if (node?.numericValue) {
    const val = parseFloat(node.numericValue);
    if (!isNaN(val)) return val;
  }
  return null;
}

/** Get specific fault injection values based on element type and graph settings */
function getSpecificFaultValues(nodeId: string, graph: IRGraph): FaultInjectionValues {
  const id = nodeId.toUpperCase();

  // ── 50/51 Phase Overcurrent ──
  const phaseOCMatch = id.match(/^(5[01]P\d*)/);
  if (phaseOCMatch) {
    const element = phaseOCMatch[1];
    const pickupName = element + 'P';
    const pickup = lookupPickupValue(graph, pickupName);
    if (pickup !== null) {
      const testCurrent = (pickup * 1.1).toFixed(1);
      const faultCurrent = (pickup * 3).toFixed(1);
      return {
        current: `I_A = ${faultCurrent}A∠-85° (3× pickup), I_B = 0A, I_C = 0A`,
        voltage: `V_A = 0V, V_B = 67V∠-120°, V_C = 67V∠120°`,
        phaseAngle: `-85° (typical SLG fault angle)`,
        description: `Inject A-phase fault: I_A = ${faultCurrent}A∠-85° (3.0 × ${pickupName}=${pickup}A), V_A = 0V, V_B = 67V∠-120°, V_C = 67V∠120°. Pickup test: I = ${testCurrent}A (1.1 × ${pickupName})`,
      };
    }
    return {
      current: `I_A = (3 × ${pickupName} setting)∠-85°, I_B = 0A, I_C = 0A`,
      voltage: `V_A = 0V, V_B = 67V∠-120°, V_C = 67V∠120°`,
      phaseAngle: `-85°`,
      description: `Inject A-phase fault: I_A = 3×${pickupName}∠-85°. Look up ${pickupName} in relay settings.`,
    };
  }

  // ── 50N/50G/51N/51G Ground Overcurrent ──
  const groundOCMatch = id.match(/^(5[01][NGQ]\d*)/);
  if (groundOCMatch) {
    const element = groundOCMatch[1];
    const pickupName = element + 'P';
    const pickup = lookupPickupValue(graph, pickupName);
    if (pickup !== null) {
      const testCurrent = (pickup * 1.1).toFixed(2);
      return {
        current: `3I0 = ${testCurrent}A (1.1 × ${pickupName}=${pickup}A). Inject I_A=I_B=I_C=${testCurrent}A∠-85°`,
        voltage: `V_A = 67V∠0°, V_B = 67V∠-120°, V_C = 67V∠120°`,
        phaseAngle: `-85°`,
        description: `Inject ground OC: 3I0 = ${testCurrent}A (1.1 × ${pickupName}=${pickup}A). Apply equal phase currents or direct 3I0 injection.`,
      };
    }
    return {
      current: `3I0 = 1.1 × ${pickupName} setting`,
      voltage: `V_A = 67V∠0°, V_B = 67V∠-120°, V_C = 67V∠120°`,
      phaseAngle: `-85°`,
      description: `Inject ground OC: 3I0 = 1.1×${pickupName}. Look up ${pickupName} in relay settings.`,
    };
  }

  // ── 27 Undervoltage ──
  if (/^27/.test(id)) {
    const pickupName = id.replace(/^(27[A-Z]*\d*).*/, '$1') + 'P';
    const pickup = lookupPickupValue(graph, pickupName);
    if (pickup !== null) {
      const testVoltage = (pickup * 0.95).toFixed(1);
      return {
        voltage: `V_A = ${testVoltage}V∠0°, V_B = ${testVoltage}V∠-120°, V_C = ${testVoltage}V∠120°`,
        current: `I = 1A (nominal load)`,
        description: `Depress voltage: V = ${testVoltage}V (0.95 × ${pickupName}=${pickup}V). Below pickup to operate.`,
      };
    }
    return {
      voltage: `V = 0.95 × ${pickupName} setting (below pickup)`,
      current: `I = 1A (nominal load)`,
      description: `Depress voltage below pickup. Look up ${pickupName} in relay settings.`,
    };
  }

  // ── 59 Overvoltage ──
  if (/^59/.test(id)) {
    const pickupName = id.replace(/^(59[A-Z]*\d*).*/, '$1') + 'P';
    const pickup = lookupPickupValue(graph, pickupName);
    if (pickup !== null) {
      const testVoltage = (pickup * 1.05).toFixed(1);
      return {
        voltage: `V_A = ${testVoltage}V∠0°, V_B = ${testVoltage}V∠-120°, V_C = ${testVoltage}V∠120°`,
        current: `I = 1A (nominal load)`,
        description: `Raise voltage: V = ${testVoltage}V (1.05 × ${pickupName}=${pickup}V). Above pickup to operate.`,
      };
    }
    return {
      voltage: `V = 1.05 × ${pickupName} setting (above pickup)`,
      current: `I = 1A (nominal load)`,
      description: `Raise voltage above pickup. Look up ${pickupName} in relay settings.`,
    };
  }

  // ── 21/Distance ──
  if (/^21|^Z[1-4]|^MHO/.test(id)) {
    const zoneMatch = id.match(/Z(\d)/);
    const zone = zoneMatch ? zoneMatch[1] : '1';
    const reachName = `Z${zone}MP`;
    const reachNameG = `Z${zone}MG`;
    const reach = lookupPickupValue(graph, reachName) ?? lookupPickupValue(graph, reachNameG);
    if (reach !== null) {
      const testZ = (reach * 0.8).toFixed(2);
      const testV = 28;
      const testI = (testV / parseFloat(testZ)).toFixed(2);
      return {
        voltage: `V = ${testV}V∠0°`,
        current: `I = ${testI}A∠-85° (V/Z_test = ${testV}/${testZ}Ω)`,
        phaseAngle: `-85°`,
        description: `Distance Zone ${zone}: Z_test = ${testZ}Ω (80% of ${reachName}=${reach}Ω). V = ${testV}V∠0°, I = ${testI}A∠-85°.`,
      };
    }
    return {
      voltage: `V = 28V∠0°`,
      current: `I = V/Z_test∠-85° (Z_test = 80% of reach)`,
      phaseAngle: `-85°`,
      description: `Distance Zone ${zone}: inject V/I for 80% of reach. Look up ${reachName} in relay settings.`,
    };
  }

  // ── 81 Frequency ──
  if (/^81[DOU]/.test(id)) {
    const pickupName = id.replace(/^(81[A-Z]*\d*).*/, '$1');
    const pickup = lookupPickupValue(graph, pickupName);
    if (pickup !== null) {
      return {
        voltage: `V = 67V L-N (nominal)`,
        frequency: `f = ${pickup} Hz (setting ${pickupName})`,
        description: `Frequency test: f = ${pickup}Hz (${pickupName} setting). V = 67V nominal.`,
      };
    }
    return {
      voltage: `V = 67V L-N (nominal)`,
      frequency: `Adjust f per ${pickupName} setting`,
      description: `Frequency deviation test. Look up ${pickupName} in relay settings.`,
    };
  }

  // ── Default: nominal pre-fault ──
  return {
    voltage: `V = 67V L-N (V_A=67∠0°, V_B=67∠-120°, V_C=67∠120°)`,
    current: `I = 0A (or 1A nominal load)`,
    frequency: `f = 60Hz`,
    description: `Pre-fault nominal: V = 67V L-N, I = 0A, f = 60Hz`,
  };
}

// ─── Injection hint mapping ─────────────────────────────────────────────────

function getInjectionHint(nodeId: string, _label: string, graph?: IRGraph): string {
  const id = nodeId.toUpperCase();

  // ── SVxT timer-qualified variable bits ──
  if (/^SV\d+T$/i.test(id)) return 'Timer-qualified SEL variable — asserts when SV pickup timer expires (PU=0 → immediate)';
  if (/^SV\d+$/i.test(id)) return 'CMC Binary Output → assert SV variable (or set via SELOGIC logic equation)';
  if (/^PSV\d+$/i.test(id)) return 'CMC Binary Output → assert PSV variable (or set via SELOGIC logic equation)';

  // ── Timer-delayed element pickup bits (51P1T, 67P1T, 50P1T, etc.) ──
  if (/^\d{2}[A-Z]\d+T$/i.test(id)) return 'Timer-delayed element pickup — asserts when element PU timer expires';

  // ── Phase overcurrent with specific values ──
  if (/^50P/.test(id) || /^51P/.test(id)) {
    if (graph) {
      const fv = getSpecificFaultValues(nodeId, graph);
      if (fv.current) return fv.description;
    }
    return 'Inject phase overcurrent (I > pickup)';
  }

  // ── Ground/neutral overcurrent with specific values ──
  if (/^50N|^50G|^51N|^51G/.test(id)) {
    if (graph) {
      const fv = getSpecificFaultValues(nodeId, graph);
      if (fv.current) return fv.description;
    }
    return 'Inject ground/neutral overcurrent (3I0 > pickup)';
  }

  if (/^50Q|^51Q/.test(id)) return 'Inject negative-sequence overcurrent (I2 > pickup)';

  // ── Voltage elements with specific values ──
  if (/^27/.test(id)) {
    if (graph) {
      const fv = getSpecificFaultValues(nodeId, graph);
      if (fv.voltage) return fv.description;
    }
    return 'Depress voltage below pickup (V < setting)';
  }
  if (/^59/.test(id)) {
    if (graph) {
      const fv = getSpecificFaultValues(nodeId, graph);
      if (fv.voltage) return fv.description;
    }
    return 'Raise voltage above pickup (V > setting)';
  }

  if (/^47/.test(id)) return 'Apply negative-sequence voltage';

  // ── Frequency elements with specific values ──
  if (/^81[OU]|^81D/.test(id)) {
    if (graph) {
      const fv = getSpecificFaultValues(nodeId, graph);
      if (fv.frequency) return fv.description;
    }
    return 'Adjust frequency (f deviation from nominal)';
  }

  // ── Distance elements with specific values ──
  if (/^21|^Z[1-4]|^MHO/.test(id)) {
    if (graph) {
      const fv = getSpecificFaultValues(nodeId, graph);
      if (fv.current) return fv.description;
    }
    return 'Inject V/I to place impedance in zone (Z = V/I)';
  }

  if (/^87/.test(id)) return 'Inject differential current (Id > slope)';

  // ── Physical inputs: explicit CMC binary output instructions ──
  if (/^IN\d{3}$/.test(id) || /^IN\d{2}$/.test(id) || /^IN\d$/.test(id)) {
    return `CMC Binary Output → assert ${id} (relay input terminal)`;
  }
  if (/^52/.test(id)) return `CMC Binary Output → assert ${id} (breaker status contact simulation)`;
  if (/^CC/.test(id)) return `CMC Binary Output → assert ${id} (close command contact)`;

  if (/^32/.test(id)) return 'Inject watts (P > pickup, correct direction)';
  if (/^79/.test(id)) return 'Reclose cycle — verify sequence timing';

  // ── Latch bits: explicit CMC instructions ──
  if (/^PLT/.test(id)) return 'CMC Binary Output → simulate latch SET condition via relay input (or set via SELOGIC logic)';
  if (/^PCT/.test(id)) return 'SEL programmable timer — verify timing (set via SELOGIC logic)';

  if (/^TRIP|^TR$/.test(id)) return 'Expected: relay asserts trip output';
  return 'Set input to required state';
}

// ─── Omicron module recommendation ──────────────────────────────────────────

function recommendModule(path: LogicPath, graph: IRGraph): OmicronModule {
  const inputIds = path.requiredInputs.map(c => c.nodeId.toUpperCase());
  // Distance elements → Distance module or Pulse Ramping
  if (inputIds.some(id => /^21|^Z[1-4]|^MHO/.test(id))) return 'PulseRamping';
  // Overcurrent with timing → Overcurrent module
  if (inputIds.some(id => /^51[PNQ]/.test(id))) return 'OvercurrentModule';
  // Instantaneous overcurrent → Ramping for pickup
  if (inputIds.some(id => /^50[PNQG]/.test(id)) && path.intermediateNodes.length === 0) return 'Ramping';
  // Anything with latches, timers, or complex logic → State Sequencer
  if (path.intermediateNodes.length > 0) return 'StateSequencer';
  // Default
  return 'StateSequencer';
}

const MODULE_LABELS: Record<OmicronModule, string> = {
  StateSequencer: 'State Sequencer',
  Ramping: 'Ramping',
  PulseRamping: 'Pulse Ramping',
  OvercurrentModule: 'Overcurrent (OCT)',
  DistanceModule: 'Distance',
};

// ─── Timer/latch detail extraction ──────────────────────────────────────────

function extractTimerDetail(graph: IRGraph, node: IRNode): IntermediateDetail {
  const { incoming } = buildAdj(graph);
  const preds = incoming.get(node.id) ?? [];

  // Find the PU/DO settings
  let delaySetting: string | undefined;
  let delayValue: string | undefined;
  let delaySettingName: string | undefined;

  const baseName = node.sourceSettingName ?? node.id;

  // Look for PU (pickup delay) numeric node
  const puNames = [baseName + 'PU', baseName + 'D', baseName + 'T'];
  for (const name of puNames) {
    const puNode = graph.nodes.get(name);
    if (puNode?.numericValue) {
      delaySettingName = name;
      delayValue = puNode.numericValue;
      const val = parseFloat(puNode.numericValue);
      if (!isNaN(val)) {
        delaySetting = val >= 1 ? `${val} cycles` : `${val} s`;
        // If value looks like seconds (has decimal), keep as seconds
        if (puNode.numericValue.includes('.')) delaySetting = `${val} s`;
      }
      break;
    }
  }

  // Also check incoming numeric edges
  if (!delaySetting) {
    for (const pred of preds) {
      const srcNode = graph.nodes.get(pred.source);
      if (srcNode?.kind === 'numeric' && srcNode.numericValue) {
        delaySettingName = srcNode.sourceSettingName ?? srcNode.id;
        delayValue = srcNode.numericValue;
        const val = parseFloat(srcNode.numericValue);
        if (!isNaN(val)) {
          delaySetting = srcNode.numericValue.includes('.') ? `${val} s` : `${val} cycles`;
        }
        break;
      }
    }
  }

  return {
    nodeId: node.id,
    label: node.label,
    kind: 'timer',
    delaySetting: delaySetting ?? 'See relay settings',
    delayValue,
    delaySettingName,
  };
}

function extractLatchDetail(graph: IRGraph, node: IRNode): IntermediateDetail {
  const { incoming, outgoing } = buildAdj(graph);
  const preds = incoming.get(node.id) ?? [];

  // SEL convention: first half of inputs are SET, second half are RESET
  const setInputs = preds.slice(0, Math.ceil(preds.length / 2));
  const rstInputs = preds.slice(Math.ceil(preds.length / 2));

  const setCondition = setInputs
    .map(p => {
      const n = graph.nodes.get(p.source);
      return (p.negated ? '!' : '') + (n?.label ?? p.source);
    })
    .join(' + ') || 'Unknown';

  const resetCondition = rstInputs
    .map(p => {
      const n = graph.nodes.get(p.source);
      return (p.negated ? '!' : '') + (n?.label ?? p.source);
    })
    .join(' + ') || 'Unknown';

  // Look for associated timer — check if any downstream node is a timer
  let associatedTimerDelay: string | undefined;
  let associatedTimerSettingName: string | undefined;
  const downstream = outgoing.get(node.id) ?? [];
  for (const d of downstream) {
    const dNode = graph.nodes.get(d.target);
    if (dNode?.kind === 'timer') {
      const td = extractTimerDetail(graph, dNode);
      associatedTimerDelay = td.delaySetting;
      associatedTimerSettingName = td.delaySettingName;
      break;
    }
  }
  // Also check if any set input comes through a timer
  for (const s of setInputs) {
    const sNode = graph.nodes.get(s.source);
    if (sNode?.kind === 'timer') {
      const td = extractTimerDetail(graph, sNode);
      associatedTimerDelay = td.delaySetting;
      associatedTimerSettingName = td.delaySettingName;
      break;
    }
  }

  return {
    nodeId: node.id,
    label: node.label,
    kind: 'latch',
    setCondition,
    resetCondition,
    setInputIds: setInputs.map(p => p.source),
    resetInputIds: rstInputs.map(p => p.source),
    associatedTimerDelay,
    associatedTimerSettingName,
  };
}

// ─── Pass criteria generation ──────────────────────────────────────────────

function generatePassCriteria(
  path: LogicPath,
  outputId: string,
  graph: IRGraph,
): PassCriterion[] {
  const criteria: PassCriterion[] = [];

  // Basic: output must assert
  criteria.push({
    measurement: `${outputId} output contact`,
    expected: 'Change of state (ASSERT)',
    tolerance: 'Binary — must operate',
    assessment: 'CMC Binary Input trigger on rising edge',
  });

  // Timer-based criteria
  for (const inter of path.intermediateNodes) {
    if (inter.kind === 'timer' && inter.delaySetting) {
      const val = parseFloat(inter.delayValue ?? '0');
      const isSeconds = inter.delaySetting.includes('s');
      let toleranceStr: string;
      if (isSeconds) {
        const tolMs = Math.max(20, val * 50); // ±5% or ±20ms minimum
        toleranceStr = `±${tolMs.toFixed(0)} ms (±5% or 20ms, whichever is greater)`;
      } else {
        // Cycles: ±1 cycle
        toleranceStr = `±1 cycle (±16.67 ms at 60 Hz)`;
      }
      criteria.push({
        measurement: `Time delay: ${inter.label} (${inter.delaySettingName ?? inter.nodeId})`,
        expected: `${inter.delaySetting}`,
        tolerance: toleranceStr,
        assessment: `Start timer on fault injection, stop on ${outputId} assertion. Compare measured vs setting.`,
      });
    }
  }

  // Latch-based criteria
  for (const inter of path.intermediateNodes) {
    if (inter.kind === 'latch') {
      criteria.push({
        measurement: `Latch ${inter.label} — SET condition`,
        expected: `Latches ON when: ${inter.setCondition}`,
        tolerance: 'Binary — must latch',
        assessment: 'Assert set condition → verify latch bit asserts via relay front-panel or SER',
      });
      criteria.push({
        measurement: `Latch ${inter.label} — RESET condition`,
        expected: `Unlatches when: ${inter.resetCondition}`,
        tolerance: 'Binary — must unlatch',
        assessment: 'Assert reset condition → verify latch bit de-asserts',
      });
      if (inter.associatedTimerDelay) {
        criteria.push({
          measurement: `Latch ${inter.label} — associated timer delay`,
          expected: inter.associatedTimerDelay,
          tolerance: `±5% or ±20 ms (whichever is greater)`,
          assessment: `Measure time from latch assertion to downstream output. Setting: ${inter.associatedTimerSettingName ?? 'see settings'}`,
        });
      }
    }
  }

  // Element-specific pickup criteria with specific values from graph
  for (const input of path.requiredInputs) {
    const id = input.nodeId.toUpperCase();
    if (/^50P/.test(id)) {
      const fv = getSpecificFaultValues(input.nodeId, graph);
      const element = id.match(/^(50P\d*)/)?.[1] ?? '50P1';
      const pickupName = element + 'P';
      const pickup = lookupPickupValue(graph, pickupName);
      const pickupStr = pickup !== null
        ? `Expected pickup: ${pickup}A (${pickupName} setting). Test at ${(pickup * 1.1).toFixed(1)}A (1.1× pickup). Tolerance: ±${(pickup * 0.03).toFixed(2)}A (±3%)`
        : 'Relay operates at set pickup current';
      criteria.push({
        measurement: `${input.label} instantaneous OC pickup`,
        expected: pickupStr,
        tolerance: pickup !== null ? `±${(pickup * 0.03).toFixed(2)}A (±3% of ${pickup}A) or ±0.02A (whichever is greater)` : '±3% of setting or ±0.02A (whichever is greater)',
        assessment: fv.current ? `Ramping module: ramp phase current. ${fv.description}` : 'Ramping module: ramp phase current, trigger on relay output',
      });
    } else if (/^51P/.test(id)) {
      const element = id.match(/^(51P\d*)/)?.[1] ?? '51P1';
      const pickupName = element + 'P';
      const pickup = lookupPickupValue(graph, pickupName);
      const pickupStr = pickup !== null
        ? `Expected pickup: ${pickup}A (${pickupName} setting). Test at ${(pickup * 1.1).toFixed(1)}A (1.1× pickup)`
        : 'Relay operates at set pickup current';
      criteria.push({
        measurement: `${input.label} time-overcurrent pickup`,
        expected: pickupStr,
        tolerance: pickup !== null ? `±${(pickup * 0.03).toFixed(2)}A (±3% of ${pickup}A)` : '±3% of setting',
        assessment: 'Ramping module: ramp phase current until pickup',
      });
      criteria.push({
        measurement: `${input.label} time-overcurrent timing`,
        expected: pickup !== null
          ? `Trip time matches curve at test current. Test at ${(pickup * 2).toFixed(1)}A (2×), ${(pickup * 5).toFixed(1)}A (5×), ${(pickup * 10).toFixed(1)}A (10×)`
          : 'Trip time matches curve at test current',
        tolerance: '±5% or ±30 ms (whichever is greater)',
        assessment: 'OCT module: test at 2x, 5x, 10x pickup; compare to curve',
      });
    } else if (/^27/.test(id)) {
      const pickupName = id.replace(/^(27[A-Z]*\d*).*/, '$1') + 'P';
      const pickup = lookupPickupValue(graph, pickupName);
      const pickupStr = pickup !== null
        ? `Expected pickup: ${pickup}V (${pickupName} setting). Test at ${(pickup * 0.95).toFixed(1)}V (0.95× pickup). Tolerance: ±${(pickup * 0.01).toFixed(2)}V (±1%)`
        : 'Relay operates when voltage drops below setting';
      criteria.push({
        measurement: `${input.label} undervoltage pickup`,
        expected: pickupStr,
        tolerance: pickup !== null ? `±${(pickup * 0.01).toFixed(2)}V (±1% of ${pickup}V)` : '±1% of setting',
        assessment: 'Ramping module: ramp voltage down, trigger on output',
      });
    } else if (/^59/.test(id)) {
      const pickupName = id.replace(/^(59[A-Z]*\d*).*/, '$1') + 'P';
      const pickup = lookupPickupValue(graph, pickupName);
      const pickupStr = pickup !== null
        ? `Expected pickup: ${pickup}V (${pickupName} setting). Test at ${(pickup * 1.05).toFixed(1)}V (1.05× pickup). Tolerance: ±${(pickup * 0.01).toFixed(2)}V (±1%)`
        : 'Relay operates when voltage exceeds setting';
      criteria.push({
        measurement: `${input.label} overvoltage pickup`,
        expected: pickupStr,
        tolerance: pickup !== null ? `±${(pickup * 0.01).toFixed(2)}V (±1% of ${pickup}V)` : '±1% of setting',
        assessment: 'Ramping module: ramp voltage up, trigger on output',
      });
    }
  }

  return criteria;
}

// ─── Binary I/O classification ─────────────────────────────────────────────

function classifyBinaryIO(graph: IRGraph): BinaryIOEntry[] {
  const entries: BinaryIOEntry[] = [];
  const seen = new Set<string>();

  for (const [id, node] of graph.nodes) {
    if (seen.has(id)) continue;

    if (node.kind === 'output') {
      seen.add(id);
      const oc = node.outputClass ?? 'other';
      let fn = `Output (${id})`;
      if (oc === 'trip') fn = `Trip output (${id})`;
      else if (oc === 'close') fn = `Close output (${id})`;
      else if (oc === 'alarm') fn = `Alarm output (${id})`;
      else if (oc === 'breaker_failure') fn = `Breaker failure (${id})`;
      else if (oc === 'reclose') fn = `Reclose output (${id})`;

      entries.push({
        relayTerminal: id,
        direction: 'relay-output',
        function: fn,
        cmcSuggestion: `CMC Binary Input → monitor ${id}`,
      });
    }

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

// ─── Collect all node/edge ids on path from inputs to output ─────────────

function collectPathNodeAndEdgeIds(
  graph: IRGraph,
  outputId: string,
  inputIds: Set<string>,
): { nodeIds: string[]; edgeIds: string[] } {
  const { incoming } = buildAdj(graph);
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  // BFS backward from output, constrained to nodes that are upstream of output
  // and downstream of the required inputs
  const queue: string[] = [outputId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    nodeIds.add(cur);

    for (const pred of incoming.get(cur) ?? []) {
      edgeIds.add(pred.edgeId);
      if (!visited.has(pred.source)) {
        queue.push(pred.source);
      }
    }
  }

  return { nodeIds: [...nodeIds], edgeIds: [...edgeIds] };
}

// ─── Minimum input set computation ─────────────────────────────────────────

function computeMinInputSets(
  graph: IRGraph,
  outputId: string,
): InputCondition[][] {
  const { incoming } = buildAdj(graph);
  const cache = new Map<string, InputCondition[][]>();

  function solve(nodeId: string, visited: Set<string>, negationDepth: number): InputCondition[][] {
    if (visited.has(nodeId)) return [];
    const cached = cache.get(`${nodeId}:${negationDepth % 2}`);
    if (cached) return cached;

    const node = graph.nodes.get(nodeId);
    if (!node) return [];
    const preds = incoming.get(nodeId) ?? [];

    if (preds.length === 0 || node.kind === 'input' || node.kind === 'numeric') {
      const result: InputCondition[][] = [[{
        nodeId,
        label: node.label,
        requiredState: negationDepth % 2 === 0,
        injectionHint: getInjectionHint(nodeId, node.label, graph),
      }]];
      cache.set(`${nodeId}:${negationDepth % 2}`, result);
      return result;
    }

    visited.add(nodeId);

    if (node.kind === 'and') {
      let combos: InputCondition[][] = [[]];
      for (const pred of preds) {
        const nd = pred.negated ? negationDepth + 1 : negationDepth;
        const subSets = solve(pred.source, new Set(visited), nd);
        if (subSets.length === 0) { combos = []; break; }
        const newCombos: InputCondition[][] = [];
        for (const existing of combos) {
          for (const sub of subSets) {
            if (newCombos.length > 50) break;
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

// ─── Collect intermediate latch/timer nodes between inputs and output ────

function collectIntermediates(
  graph: IRGraph,
  outputId: string,
): IntermediateDetail[] {
  const { incoming } = buildAdj(graph);
  const details: IntermediateDetail[] = [];
  const visited = new Set<string>();
  const queue = [outputId];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);

    const node = graph.nodes.get(cur);
    if (!node) continue;

    if (node.kind === 'timer') {
      details.push(extractTimerDetail(graph, node));
    } else if (node.kind === 'latch') {
      details.push(extractLatchDetail(graph, node));
    } else if (node.kind === 'rising') {
      details.push({ nodeId: node.id, label: node.label, kind: 'rising' });
    } else if (node.kind === 'falling') {
      details.push({ nodeId: node.id, label: node.label, kind: 'falling' });
    }

    for (const pred of incoming.get(cur) ?? []) {
      if (!visited.has(pred.source)) queue.push(pred.source);
    }
  }

  return details;
}

// ─── Build state sequence ──────────────────────────────────────────────────

function buildStateSequence(
  outputId: string,
  outputLabel: string,
  conditions: InputCondition[],
  intermediates: IntermediateDetail[],
  graph: IRGraph,
  expectedLEDs: string[],
): StateSequenceStep[] {
  const steps: StateSequenceStep[] = [];

  // Collect ALL inputs needing CMC binary outputs (IN, 52, CC, SV, PSV, PLT)
  const binaryOutputPattern = /^(IN\d|52|CC|SV\d|PSV\d|PLT)/;
  const prefaultBinOutputs = conditions
    .filter(c => binaryOutputPattern.test(c.nodeId.toUpperCase()))
    .map(c => ({ label: c.nodeId, state: !c.requiredState }));

  // Build specific pre-fault analog hint using fault values
  const analogElements = conditions.filter(c => !binaryOutputPattern.test(c.nodeId.toUpperCase()));
  const prefaultAnalog = 'Inject nominal pre-fault: V_A = 67V∠0°, V_B = 67V∠-120°, V_C = 67V∠120°, I = 0A, f = 60Hz';

  // State 1: Pre-fault
  steps.push({
    name: 'Pre-Fault',
    description: 'Nominal/quiescent state — relay should not operate. All latches reset, timers idle.',
    transition: 'Time-based: 2 seconds (verify stable)',
    analogHint: prefaultAnalog,
    binaryOutputs: prefaultBinOutputs,
    expectedInputs: [{ label: outputLabel, state: false }],
  });

  // Check if there are latches that need to be set first
  const latches = intermediates.filter(i => i.kind === 'latch');
  if (latches.length > 0) {
    for (const latch of latches) {
      // State: Assert latch set condition
      const setAnalog = latch.setInputIds?.map(sid => {
        const n = graph.nodes.get(sid);
        return n ? getInjectionHint(sid, n.label, graph) : sid;
      }).filter((v, i, a) => a.indexOf(v) === i).join('; ') ?? '';

      // Include binary outputs for latch set inputs that need CMC
      const latchSetBinOutputs = (latch.setInputIds ?? [])
        .filter(sid => binaryOutputPattern.test(sid.toUpperCase()))
        .map(sid => ({ label: sid, state: true }));

      steps.push({
        name: `Latch ${latch.label} — SET`,
        description: `Assert SET condition: ${latch.setCondition}`,
        transition: latch.associatedTimerDelay
          ? `Time-based: ${latch.associatedTimerDelay} + margin (allow timer to qualify)`
          : `Trigger: verify ${latch.label} latches (SER event) — Timeout: 3s (fail)`,
        analogHint: setAnalog || 'Apply conditions per SET inputs',
        binaryOutputs: latchSetBinOutputs,
        expectedInputs: [{ label: `${latch.label} (latched)`, state: true }],
      });
    }
  }

  // State: Fault injection — build specific analog hints from fault values
  const faultValueDescs: string[] = [];
  for (const c of analogElements) {
    const fv = getSpecificFaultValues(c.nodeId, graph);
    if (fv.description !== `Pre-fault nominal: V = 67V L-N, I = 0A, f = 60Hz`) {
      faultValueDescs.push(fv.description);
    } else {
      faultValueDescs.push(c.injectionHint);
    }
  }
  const faultAnalog = faultValueDescs.length > 0
    ? faultValueDescs.filter((v, i, a) => a.indexOf(v) === i).join('; ')
    : 'Adjust analog signals per element requirements';

  // ALL binary outputs for fault state (including SV, PLT, etc.)
  const faultBinOutputs = conditions
    .filter(c => binaryOutputPattern.test(c.nodeId.toUpperCase()))
    .map(c => ({ label: c.nodeId, state: c.requiredState }));

  // Compute expected delay from timers
  const timers = intermediates.filter(i => i.kind === 'timer' && i.delaySetting);
  const timerNote = timers.length > 0
    ? ` (expected delay: ${timers.map(t => `${t.label}=${t.delaySetting}`).join(', ')})`
    : '';

  // LED note
  const ledNote = expectedLEDs.length > 0
    ? `. Expected LEDs: ${expectedLEDs.join(', ')}`
    : '';

  steps.push({
    name: 'Fault / Assert',
    description: `Apply conditions to assert ${outputLabel}${timerNote}${ledNote}`,
    transition: `Trigger: ${outputLabel} asserts (CMC BI) — Timeout: 10 seconds (fail)`,
    analogHint: faultAnalog,
    binaryOutputs: faultBinOutputs,
    expectedInputs: [
      { label: outputLabel, state: true },
      ...expectedLEDs.map(led => ({ label: `${led} (illuminated)`, state: true })),
    ],
  });

  // If latches were set, add a reset verification state
  if (latches.length > 0) {
    for (const latch of latches) {
      // Include binary outputs for latch reset inputs that need CMC
      const latchResetBinOutputs = (latch.resetInputIds ?? [])
        .filter(sid => binaryOutputPattern.test(sid.toUpperCase()))
        .map(sid => ({ label: sid, state: true }));

      steps.push({
        name: `Latch ${latch.label} — RESET`,
        description: `Assert RESET condition: ${latch.resetCondition}. Verify latch unlatches.`,
        transition: `Trigger: verify ${latch.label} de-asserts — Timeout: 3s (fail)`,
        analogHint: 'Restore nominal conditions or apply reset inputs',
        binaryOutputs: latchResetBinOutputs,
        expectedInputs: [{ label: `${latch.label} (unlatched)`, state: false }],
      });
    }
  }

  // State: Post-fault / reset
  steps.push({
    name: 'Reset / Post-Fault',
    description: 'Return to nominal — verify relay resets and output de-asserts.',
    transition: 'Time-based: 3 seconds',
    analogHint: 'Restore nominal: V_A = 67V∠0°, V_B = 67V∠-120°, V_C = 67V∠120°, I = 0A, f = 60Hz',
    binaryOutputs: prefaultBinOutputs,
    expectedInputs: [{ label: outputLabel, state: false }],
  });

  return steps;
}

// (graph is now passed directly to buildStateSequence — no module-scoped ref needed)

// ─── Path description ──────────────────────────────────────────────────────

function describeConditions(conditions: InputCondition[]): string {
  if (conditions.length === 0) return 'No input conditions required';
  return conditions
    .map(c => `${c.label} = ${c.requiredState ? '1' : '0'}`)
    .join(' AND ');
}

// ─── Public API ────────────────────────────────────────────────────────────

export function generateTestScenarios(graph: IRGraph): TestScenario[] {
  const scenarios: TestScenario[] = [];
  const binaryIO = classifyBinaryIO(graph);

  const outputs: IRNode[] = [];
  for (const [_id, node] of graph.nodes) {
    if (node.kind === 'output') outputs.push(node);
  }

  const classPriority: Record<OutputClass, number> = {
    trip: 0, close: 1, breaker_failure: 2, reclose: 3,
    alarm: 4, block: 5, supervisory: 6, display: 7, led: 8, other: 9,
  };
  outputs.sort((a, b) =>
    (classPriority[a.outputClass ?? 'other'] ?? 9) - (classPriority[b.outputClass ?? 'other'] ?? 9)
  );

  for (const output of outputs) {
    const inputSets = computeMinInputSets(graph, output.id);
    const allIntermediates = collectIntermediates(graph, output.id);
    const timerDetails = allIntermediates.filter(d => d.kind === 'timer');
    const latchDetails = allIntermediates.filter(d => d.kind === 'latch');

    const paths: LogicPath[] = inputSets.map((conditions, i) => {
      const deduped = new Map<string, InputCondition>();
      for (const c of conditions) {
        if (!deduped.has(c.nodeId)) deduped.set(c.nodeId, c);
      }
      const uniqueConditions = [...deduped.values()];

      // Collect path graph IDs
      const inputNodeIds = new Set(uniqueConditions.map(c => c.nodeId));
      const pathGraph = collectPathNodeAndEdgeIds(graph, output.id, inputNodeIds);

      // Determine which intermediates are on this specific path
      const pathIntermediates = allIntermediates.filter(d =>
        pathGraph.nodeIds.includes(d.nodeId)
      );

      const path: LogicPath = {
        id: `${output.id}_path_${i + 1}`,
        outputId: output.id,
        outputClass: output.outputClass ?? 'other',
        nodeIds: pathGraph.nodeIds,
        edgeIds: pathGraph.edgeIds,
        description: describeConditions(uniqueConditions),
        requiredInputs: uniqueConditions,
        intermediateNodes: pathIntermediates,
        checked: false,
        passCriteria: [],
        omicronModule: 'StateSequencer',
      };

      path.passCriteria = generatePassCriteria(path, output.id, graph);
      path.omicronModule = recommendModule(path, graph);

      return path;
    });

    const simplest = paths.length > 0
      ? paths.reduce((a, b) => a.requiredInputs.length <= b.requiredInputs.length ? a : b)
      : null;

    // Find related LEDs for this output
    const expectedLEDs = findLEDsForOutput(graph, output.id);

    const stateSequence = simplest
      ? buildStateSequence(output.id, output.label, simplest.requiredInputs, allIntermediates, graph, expectedLEDs)
      : [];

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
      latchDetails,
      timerDetails,
      expectedLEDs,
    });
  }

  return scenarios;
}

export { MODULE_LABELS };

export function generateBinaryIOMap(graph: IRGraph): BinaryIOEntry[] {
  return classifyBinaryIO(graph);
}

export function generateTruthTable(
  graph: IRGraph,
  outputId: string,
): { inputLabels: string[]; rows: { inputs: boolean[]; output: boolean }[] } {
  const inputSets = computeMinInputSets(graph, outputId);

  const allInputIds = new Set<string>();
  for (const set of inputSets) {
    for (const c of set) allInputIds.add(c.nodeId);
  }
  const inputLabels = [...allInputIds].sort();

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

  if (inputLabels.length > 0 && inputLabels.length <= 20) {
    const allFalse = inputLabels.map(() => false);
    const key = allFalse.map(v => v ? '1' : '0').join('');
    if (!seen.has(key)) rows.push({ inputs: allFalse, output: false });
  }

  return { inputLabels, rows };
}

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
    if (s.timerDetails.length > 0) {
      lines.push(`│ Timers: ${s.timerDetails.map(t => `${t.label} = ${t.delaySetting ?? '?'} (${t.delaySettingName ?? t.nodeId})`).join(', ')}`);
    }
    if (s.latchDetails.length > 0) {
      lines.push(`│ Latches: ${s.latchDetails.map(l => l.label).join(', ')}`);
    }
    if (s.expectedLEDs.length > 0) {
      lines.push(`│ Expected LEDs: ${s.expectedLEDs.join(', ')}`);
    }
    lines.push(`└─────────────────────────────────────────────────────────────`);
    lines.push('');

    // Latch details
    for (const l of s.latchDetails) {
      lines.push(`  LATCH: ${l.label}`);
      lines.push(`    SET condition:   ${l.setCondition}`);
      lines.push(`    RESET condition: ${l.resetCondition}`);
      if (l.associatedTimerDelay) {
        lines.push(`    Associated timer: ${l.associatedTimerDelay} (${l.associatedTimerSettingName ?? '?'})`);
      }
      lines.push('');
    }

    for (let i = 0; i < s.paths.length; i++) {
      const p = s.paths[i];
      lines.push(`  Path ${i + 1}: ${p.description}`);
      lines.push(`    Recommended Omicron module: ${MODULE_LABELS[p.omicronModule]}`);
      lines.push('');

      lines.push(`    Required inputs:`);
      for (const c of p.requiredInputs) {
        lines.push(`      • ${c.label} = ${c.requiredState ? 'ASSERT (1)' : 'DE-ASSERT (0)'}`);
        lines.push(`        Injection: ${c.injectionHint}`);
      }
      lines.push('');

      if (p.intermediateNodes.length > 0) {
        lines.push(`    Intermediate elements:`);
        for (const inter of p.intermediateNodes) {
          if (inter.kind === 'timer') {
            lines.push(`      TIMER: ${inter.label} — delay: ${inter.delaySetting} (${inter.delaySettingName ?? inter.nodeId})`);
          } else if (inter.kind === 'latch') {
            lines.push(`      LATCH: ${inter.label} — SET: ${inter.setCondition} | RESET: ${inter.resetCondition}`);
          } else {
            lines.push(`      ${inter.kind.toUpperCase()}: ${inter.label}`);
          }
        }
        lines.push('');
      }

      lines.push(`    Pass/Fail criteria:`);
      for (const pc of p.passCriteria) {
        lines.push(`      [${pc.measurement}]`);
        lines.push(`        Expected: ${pc.expected}`);
        lines.push(`        Tolerance: ${pc.tolerance}`);
        lines.push(`        Assessment: ${pc.assessment}`);
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
          lines.push(`      CMC Binary Outputs:`);
          for (let bo = 0; bo < step.binaryOutputs.length; bo++) {
            const b = step.binaryOutputs[bo];
            lines.push(`        CMC BO ${bo + 1} → ${b.label} = ${b.state ? 'ON (assert)' : 'OFF (de-assert)'}`);
          }
        }
        lines.push(`      Expected: ${step.expectedInputs.map(b => `${b.label}=${b.state ? 'ASSERT' : 'IDLE'}`).join(', ')}`);
      }
      lines.push('');

      // LED expectations summary
      if (s.expectedLEDs.length > 0) {
        lines.push(`  Expected LED indications: ${s.expectedLEDs.join(', ')}`);
        lines.push('');
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

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

  return { totalOutputs: scenarios.length, totalPaths, checkedPaths, outputCoverage };
}
