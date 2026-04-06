// ─── SEL lexer types ──────────────────────────────────────────────────────────

export type TokenType =
  | 'IDENT'       // SEL identifiers: 52A, 50P1T, SV01, TR, CL, 86 …
  | 'NUMBER'      // numeric literal
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'RISING'      // R_ prefix operator
  | 'FALLING'     // F_ prefix operator
  | 'LATCH_SET'   // SET( construct
  | 'LATCH_RST'   // RST( construct  
  | 'PULSE'       // PUL( construct
  | 'TIMER'       // PCT / TON / TOF style function names
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;   // char offset in source expression
}
