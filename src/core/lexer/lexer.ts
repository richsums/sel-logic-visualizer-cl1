// ─── SEL expression lexer ─────────────────────────────────────────────────────
import type { Token, TokenType } from './types';

const KEYWORDS: Record<string, TokenType> = {
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  SET: 'LATCH_SET',
  RST: 'LATCH_RST',
  PUL: 'PULSE',
  PCT: 'TIMER',
  TON: 'TIMER',
  TOF: 'TIMER',
};

export class LexerError extends Error {
  pos: number;
  constructor(pos: number, message: string) {
    super(message);
    this.pos = pos;
    this.name = 'LexerError';
  }
}

export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[pos])) { pos++; continue; }

    const start = pos;
    const ch = expr[pos];

    // Rising edge prefix: R_IDENT
    if (ch === 'R' && expr[pos + 1] === '_') {
      pos += 2;
      const identStart = pos;
      while (pos < expr.length && /[A-Z0-9_]/i.test(expr[pos])) pos++;
      const identVal = expr.slice(identStart, pos);
      tokens.push({ type: 'RISING', value: identVal, pos: start });
      continue;
    }

    // Falling edge prefix: F_IDENT
    if (ch === 'F' && expr[pos + 1] === '_') {
      pos += 2;
      const identStart = pos;
      while (pos < expr.length && /[A-Z0-9_]/i.test(expr[pos])) pos++;
      const identVal = expr.slice(identStart, pos);
      tokens.push({ type: 'FALLING', value: identVal, pos: start });
      continue;
    }

    // Identifier / keyword: starts with letter or digit (SEL allows digit-leading like 52A)
    if (/[A-Z0-9_]/i.test(ch)) {
      while (pos < expr.length && /[A-Z0-9_]/i.test(expr[pos])) pos++;
      const raw = expr.slice(start, pos).toUpperCase();
      const kwType = KEYWORDS[raw];
      if (kwType) {
        tokens.push({ type: kwType, value: raw, pos: start });
      } else {
        tokens.push({ type: 'IDENT', value: raw, pos: start });
      }
      continue;
    }

    // Number (pure numeric, e.g. timer values)
    if (/[0-9.]/.test(ch)) {
      while (pos < expr.length && /[0-9.]/.test(expr[pos])) pos++;
      tokens.push({ type: 'NUMBER', value: expr.slice(start, pos), pos: start });
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(', pos }); pos++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')', pos }); pos++; continue; }
    if (ch === ',') { tokens.push({ type: 'COMMA',  value: ',', pos }); pos++; continue; }

    // Symbolic operators: +→OR, *→AND, !→NOT, /→NOT
    // These are used in relay settings exported as text files (name,"value" format)
    if (ch === '+') { tokens.push({ type: 'OR',  value: '+', pos }); pos++; continue; }
    if (ch === '*') { tokens.push({ type: 'AND', value: '*', pos }); pos++; continue; }
    if (ch === '!') { tokens.push({ type: 'NOT', value: '!', pos }); pos++; continue; }
    if (ch === '/') { tokens.push({ type: 'NOT', value: '/', pos }); pos++; continue; }

    // Skip unknown chars
    pos++;
  }

  tokens.push({ type: 'EOF', value: '', pos: expr.length });
  return tokens;
}
