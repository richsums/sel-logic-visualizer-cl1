// ─── AST → IR builder ────────────────────────────────────────────────────────
import type { ImportedSettingsDocument, ImportedSetting } from '../importer/types';
import { parseExpression } from '../parser/parser';
import type { AnyASTNode } from '../parser/types';
import type { IRGraph, IRNode, IREdge, IRNodeKind, OutputClass } from './types';
import { computeDisabledNodes, isDisabledByPatterns } from '../importer/enableMap';

// Well-known SEL output coil names — both QuickSet and .txt export naming
const OUTPUT_NAMES = new Set([
  'TR','CL','TRIP','CLOSE','BFI','BFT','BF','86','86BF',
  'ALARM','ALM','ALRMOUT',
  'OUT101','OUT102','OUT103','OUT104','OUT105','OUT106','OUT107','OUT108',
  'OUT109','OUT110','OUT111','OUT112','OUT113','OUT114','OUT115','OUT116',
  'OUT201','OUT202','OUT203','OUT204','OUT205','OUT206','OUT207','OUT208',
  'OUT209','OUT210','OUT211','OUT212',
  'OUT301','OUT302','OUT303','OUT304','OUT305','OUT306','OUT307','OUT308',
  'TRIP_BUS','TRIP_A','TRIP_B','TRIP_C',
  'DP1','DP2','DP3','DP4','DP5','DP6','DP7','DP8',
  'DP9','DP10','DP11','DP12','DP13','DP14','DP15','DP16',
  'LED1','LED2','LED3','LED4','LED5','LED6','LED7','LED8',
  'LED9','LED10','LED11','LED12','LED13','LED14','LED15','LED16',
  'LED17','LED18','LED19','LED20','LED21','LED22','LED23','LED24','LED25','LED26',
  'SS1','SS2','SS3','SS4','SS5','SS6',
]);

// Check if value contains a logic expression (Boolean operators, references)
function isLogicExpression(value: string): boolean {
  const v = value.trim();
  if (/^\s*[\d.]+\s*$/.test(v)) return false;
  if (/^[YN]$/i.test(v)) return false;
  if (/^[UCILR][0-9]$/i.test(v)) return false;
  // Contains symbolic logic operators or keywords
  if (/[+*!()/]|AND|OR|NOT|R_|F_/i.test(v)) return true;
  // Single identifier reference (alias: NAME = OTHER)
  if (/^[A-Z0-9_]+$/i.test(v)) return true;
  return false;
}

function nodeKindForName(name: string): IRNodeKind {
  if (OUTPUT_NAMES.has(name)) return 'output';
  return 'derived';
}

function classifyOutput(name: string): OutputClass | undefined {
  const n = name.toUpperCase();
  if (/^(TR|TRIP|TRIP_[ABC]|TRIP_BUS)$/.test(n)) return 'trip';
  if (/^(CL|CLOSE)$/.test(n)) return 'close';
  if (/^(ALARM|ALM|ALRMOUT|SALARM)$/.test(n)) return 'alarm';
  if (/^(BFI|BFT|BF|86|86BF)$/.test(n)) return 'breaker_failure';
  if (/^79/.test(n)) return 'reclose';
  if (/^(BLOCK_|BLK_)/.test(n)) return 'block';
  if (/^DP[0-9]/.test(n)) return 'display';
  if (/^LED[0-9]/.test(n)) return 'led';
  if (/^SS[1-6]$/.test(n)) return 'supervisory';
  if (/^OUT[0-9]/.test(n)) return 'other';
  return undefined;
}

let _counter = 0;
function freshId(prefix: string): string {
  return `${prefix}_${++_counter}`;
}

export function buildIR(doc: ImportedSettingsDocument): IRGraph {
  _counter = 0;
  const nodes = new Map<string, IRNode>();
  const edges: IREdge[] = [];
  const logicSettingNames: string[] = [];
  const numericSettingNames: string[] = [];
  const elementSettingNames: string[] = [];
  const globalSettingNames: string[] = [];

  // Compute disabled nodes from enable flags and dead equations
  const { disabled: disabledNodes, disabledPatterns } = computeDisabledNodes(doc.settings);

  function ensureNode(id: string, kind?: IRNodeKind): IRNode {
    if (!nodes.has(id)) {
      nodes.set(id, { id, kind: kind ?? 'input', label: id });
    } else if (kind && nodes.get(id)!.kind === 'input') {
      nodes.get(id)!.kind = kind;
    }
    return nodes.get(id)!;
  }

  function addEdge(source: string, target: string, negated = false): void {
    edges.push({ id: `${source}->${target}`, source, target, negated });
  }

  // Build a sub-graph for an AST node, returning the node id that represents it
  function buildNode(ast: AnyASTNode): string {
    switch (ast.type) {
      case 'Ident': {
        ensureNode(ast.name);
        return ast.name;
      }
      case 'Not': {
        const childId = buildNode(ast.operand);
        const notId = freshId('NOT');
        nodes.set(notId, { id: notId, kind: 'not', label: 'NOT' });
        addEdge(childId, notId);
        return notId;
      }
      case 'And': {
        const andId = freshId('AND');
        nodes.set(andId, { id: andId, kind: 'and', label: 'AND' });
        for (const op of ast.operands) {
          const childId = buildNode(op);
          addEdge(childId, andId);
        }
        return andId;
      }
      case 'Or': {
        const orId = freshId('OR');
        nodes.set(orId, { id: orId, kind: 'or', label: 'OR' });
        for (const op of ast.operands) {
          const childId = buildNode(op);
          addEdge(childId, orId);
        }
        return orId;
      }
      case 'Rising': {
        const srcId = ast.operand;
        ensureNode(srcId);
        const rId = freshId('RISE');
        nodes.set(rId, { id: rId, kind: 'rising', label: `R_${srcId}` });
        addEdge(srcId, rId);
        return rId;
      }
      case 'Falling': {
        const srcId = ast.operand;
        ensureNode(srcId);
        const fId = freshId('FALL');
        nodes.set(fId, { id: fId, kind: 'falling', label: `F_${srcId}` });
        addEdge(srcId, fId);
        return fId;
      }
      case 'Latch': {
        const lId = freshId('LATCH');
        nodes.set(lId, { id: lId, kind: 'latch', label: ast.op });
        for (const op of ast.operands) {
          const childId = buildNode(op);
          addEdge(childId, lId);
        }
        return lId;
      }
      case 'Pulse': {
        const pId = freshId('PUL');
        nodes.set(pId, { id: pId, kind: 'pulse', label: 'PUL' });
        for (const op of ast.operands) {
          const childId = buildNode(op);
          addEdge(childId, pId);
        }
        return pId;
      }
      case 'Timer': {
        const tId = freshId('TMR');
        nodes.set(tId, { id: tId, kind: 'timer', label: ast.fn, timerFn: ast.fn });
        for (const op of ast.operands) {
          const childId = buildNode(op);
          addEdge(childId, tId);
        }
        return tId;
      }
      case 'FunctionCall': {
        const fnId = freshId('FN');
        nodes.set(fnId, { id: fnId, kind: 'function', label: ast.name });
        for (const op of ast.args) {
          const childId = buildNode(op);
          addEdge(childId, fnId);
        }
        return fnId;
      }
    }
  }

  // Process each setting using the importer's category classification
  for (const setting of doc.settings) {
    const { name, value, category } = setting;

    // Skip disabled settings entirely — don't create nodes for them
    if (disabledNodes.has(name)) continue;

    // Track by category
    if (category === 'element') {
      elementSettingNames.push(name);
      // Element settings are numeric parameters — create numeric nodes
      if (/^\s*[\d.]+\s*$/.test(value)) {
        numericSettingNames.push(name);
        const n = ensureNode(name, 'numeric');
        n.numericValue = value;
        n.sourceSettingName = name;
        n.sourceRawValue = value;
      } else {
        // Non-numeric element settings (curve names, Y/N enables, etc.)
        const n = ensureNode(name, 'input');
        n.sourceSettingName = name;
        n.sourceRawValue = value;
      }
      continue;
    }

    if (category === 'global') {
      globalSettingNames.push(name);
      if (/^\s*[\d.]+\s*$/.test(value)) {
        numericSettingNames.push(name);
        const n = ensureNode(name, 'numeric');
        n.numericValue = value;
        n.sourceSettingName = name;
        n.sourceRawValue = value;
      } else {
        const n = ensureNode(name, 'input');
        n.sourceSettingName = name;
        n.sourceRawValue = value;
      }
      continue;
    }

    // Category === 'logic' — attempt to parse as logic expression
    if (!isLogicExpression(value)) {
      // Logic setting with non-expression value (e.g., SV01PU = 60)
      logicSettingNames.push(name);
      if (/^\s*[\d.]+\s*$/.test(value)) {
        numericSettingNames.push(name);
        const n = ensureNode(name, 'numeric');
        n.numericValue = value;
        n.sourceSettingName = name;
        n.sourceRawValue = value;
      } else {
        const n = ensureNode(name, 'input');
        n.sourceSettingName = name;
        n.sourceRawValue = value;
      }
      continue;
    }

    // Try to parse as logic expression
    const result = parseExpression(value);
    if (result.error || !result.ast) {
      // Not parseable — check if simple alias
      const trimmed = value.trim();
      if (/^[A-Z0-9_]+$/i.test(trimmed)) {
        logicSettingNames.push(name);
        const targetNode = ensureNode(name, nodeKindForName(name));
        targetNode.sourceSettingName = name;
        targetNode.sourceRawValue = value;
        if (targetNode.kind === 'output') targetNode.outputClass = classifyOutput(name);
        ensureNode(trimmed.toUpperCase());
        addEdge(trimmed.toUpperCase(), name);
      }
      continue;
    }

    logicSettingNames.push(name);
    const kind = nodeKindForName(name);
    const targetNode = ensureNode(name, kind);
    targetNode.sourceSettingName = name;
    targetNode.sourceRawValue = value;
    if (kind === 'output') targetNode.outputClass = classifyOutput(name);

    const rootId = buildNode(result.ast);
    if (rootId !== name) {
      addEdge(rootId, name);
    }
  }

  // Post-build: prune disabled input nodes and their connected edges/gate nodes.
  // A disabled input might have been created by ensureNode() when referenced in
  // another equation. Check both the explicit disabled set AND pattern-match
  // against disabled enable rules (covers word bits like 51Q1T that aren't
  // settings themselves but are referenced as identifiers in logic equations).
  for (const [id, node] of nodes) {
    if (node.kind === 'input' || node.kind === 'numeric') {
      if (disabledNodes.has(id) || isDisabledByPatterns(id, disabledPatterns)) {
        nodes.delete(id);
      }
    }
  }

  // Remove edges referencing deleted nodes
  const prunedEdges = edges.filter(e => nodes.has(e.source) && nodes.has(e.target));

  // Cascade-prune gate nodes (AND, OR, NOT, etc.) that have zero remaining inputs
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, node] of nodes) {
      if (['and', 'or', 'not', 'rising', 'falling', 'timer', 'latch', 'pulse', 'function'].includes(node.kind)) {
        const hasInputs = prunedEdges.some(e => e.target === id);
        if (!hasInputs) {
          // Remove this gate and its outgoing edges
          nodes.delete(id);
          // Remove outgoing edges
          for (let i = prunedEdges.length - 1; i >= 0; i--) {
            if (prunedEdges[i].source === id || prunedEdges[i].target === id) {
              prunedEdges.splice(i, 1);
            }
          }
          changed = true;
        }
      }
    }
  }

  // Also prune output/derived nodes that now have zero input edges and
  // whose only definition was a logic equation referencing disabled nodes
  for (const [id, node] of nodes) {
    if ((node.kind === 'output' || node.kind === 'derived') && disabledNodes.has(id)) {
      const hasInputs = prunedEdges.some(e => e.target === id);
      if (!hasInputs) {
        nodes.delete(id);
        for (let i = prunedEdges.length - 1; i >= 0; i--) {
          if (prunedEdges[i].source === id || prunedEdges[i].target === id) {
            prunedEdges.splice(i, 1);
          }
        }
      }
    }
  }

  // Find undefined idents
  const undefinedIdents: string[] = [];

  return {
    nodes, edges: prunedEdges,
    logicSettingNames, numericSettingNames,
    elementSettingNames, globalSettingNames,
    undefinedIdents,
  };
}
