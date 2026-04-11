// ─── Intermediate representation ─────────────────────────────────────────────

export type IRNodeKind =
  | 'input'       // physical input / external bit
  | 'derived'     // defined by a logic equation
  | 'output'      // relay output / coil (TR, CL, BFI, etc.)
  | 'and'
  | 'or'
  | 'not'
  | 'rising'
  | 'falling'
  | 'timer'
  | 'latch'
  | 'pulse'
  | 'function'
  | 'numeric';    // numeric setting (pickups, delays)

export type OutputClass =
  | 'trip' | 'close' | 'alarm' | 'block' | 'reclose'
  | 'breaker_failure' | 'display' | 'led' | 'supervisory' | 'other';

export interface IRNode {
  id: string;           // e.g. "TR", "50P1", "and_3"
  kind: IRNodeKind;
  label: string;        // display label (= id for named points)
  sourceSettingName?: string;
  sourceRawValue?: string;
  // For timer/numeric nodes
  timerFn?: string;
  numericValue?: string;
  // For output nodes — classification
  outputClass?: OutputClass;
}

export interface IREdge {
  id: string;
  source: string;  // IRNode.id
  target: string;  // IRNode.id
  label?: string;
  negated?: boolean;  // edge carries inverted signal (NOT)
}

export interface IRGraph {
  nodes: Map<string, IRNode>;
  edges: IREdge[];
  /** Names of settings parsed as logic equations */
  logicSettingNames: string[];
  /** Names of settings classified as numeric */
  numericSettingNames: string[];
  /** Names of settings classified as element (protection parameters) */
  elementSettingNames: string[];
  /** Names of settings classified as global (system-wide parameters) */
  globalSettingNames: string[];
  /** Unresolved identifier references */
  undefinedIdents: string[];
}
