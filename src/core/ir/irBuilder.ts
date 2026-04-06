// ─── AST → IR builder ────────────────────────────────────────────────────────
import type { ImportedSettingsDocument, ImportedSetting } from '../importer/types';
import { parseExpression } from '../parser/parser';
import type { AnyASTNode } from '../parser/types';
import type { IRGraph, IRNode, IREdge, IRNodeKind } from './types';

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

    const rootId = buildNode(result.ast);
    if (rootId !== name) {
      addEdge(rootId, name);
    }
  }

  // Find undefined idents
  const undefinedIdents: string[] = [];

  return {
    nodes, edges,
    logicSettingNames, numericSettingNames,
    elementSettingNames, globalSettingNames,
    undefinedIdents,
  };
}
