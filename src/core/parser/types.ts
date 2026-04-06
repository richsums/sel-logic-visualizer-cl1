// ─── SEL AST types ────────────────────────────────────────────────────────────

export type ASTNodeType =
  | 'Ident'
  | 'Not'
  | 'And'
  | 'Or'
  | 'Rising'
  | 'Falling'
  | 'Latch'
  | 'Pulse'
  | 'Timer'
  | 'FunctionCall';

// Use a unified discriminated union to avoid circular reference issues
export type AnyASTNode =
  | { type: 'Ident';        name: string;                          pos?: number }
  | { type: 'Not';          operand: AnyASTNode;                   pos?: number }
  | { type: 'And';          operands: AnyASTNode[];                pos?: number }
  | { type: 'Or';           operands: AnyASTNode[];                pos?: number }
  | { type: 'Rising';       operand: string;                       pos?: number }
  | { type: 'Falling';      operand: string;                       pos?: number }
  | { type: 'Latch';        op: 'SET' | 'RST'; operands: AnyASTNode[]; pos?: number }
  | { type: 'Pulse';        operands: AnyASTNode[];                pos?: number }
  | { type: 'Timer';        fn: string; operands: AnyASTNode[];    pos?: number }
  | { type: 'FunctionCall'; name: string; args: AnyASTNode[];      pos?: number };

export interface ParseResult {
  ast: AnyASTNode | null;
  error: string | null;
}
