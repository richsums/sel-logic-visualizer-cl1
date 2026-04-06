// ─── SEL expression parser ───────────────────────────────────────────────────
import { tokenize } from '../lexer/lexer';
import type { Token } from '../lexer/types';
import type { AnyASTNode, ParseResult } from './types';

class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }
  private expect(type: Token['type']): Token {
    const t = this.advance();
    if (t.type !== type) throw new Error(`Expected ${type} but got ${t.type} ("${t.value}") at pos ${t.pos}`);
    return t;
  }
  private match(...types: Token['type'][]): boolean {
    return types.includes(this.peek().type);
  }

  parse(): AnyASTNode {
    const node = this.parseOr();
    if (this.peek().type !== 'EOF') {
      throw new Error(`Unexpected token "${this.peek().value}" at pos ${this.peek().pos}`);
    }
    return node;
  }

  private parseOr(): AnyASTNode {
    const operands: AnyASTNode[] = [this.parseAnd()];
    while (this.match('OR')) {
      this.advance();
      operands.push(this.parseAnd());
    }
    if (operands.length === 1) return operands[0];
    return { type: 'Or', operands };
  }

  private parseAnd(): AnyASTNode {
    const operands: AnyASTNode[] = [this.parseNot()];
    while (this.match('AND')) {
      this.advance();
      operands.push(this.parseNot());
    }
    if (operands.length === 1) return operands[0];
    return { type: 'And', operands };
  }

  private parseNot(): AnyASTNode {
    if (this.match('NOT')) {
      const t = this.advance();
      const operand = this.parseNot();
      return { type: 'Not', operand, pos: t.pos };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AnyASTNode {
    const t = this.peek();

    if (t.type === 'RISING') {
      this.advance();
      return { type: 'Rising', operand: t.value, pos: t.pos };
    }

    if (t.type === 'FALLING') {
      this.advance();
      return { type: 'Falling', operand: t.value, pos: t.pos };
    }

    if (t.type === 'LATCH_SET' || t.type === 'LATCH_RST') {
      this.advance();
      this.expect('LPAREN');
      const operands = this.parseArgList();
      this.expect('RPAREN');
      return { type: 'Latch', op: t.type === 'LATCH_SET' ? 'SET' : 'RST', operands, pos: t.pos };
    }

    if (t.type === 'PULSE') {
      this.advance();
      this.expect('LPAREN');
      const operands = this.parseArgList();
      this.expect('RPAREN');
      return { type: 'Pulse', operands, pos: t.pos };
    }

    if (t.type === 'TIMER') {
      this.advance();
      this.expect('LPAREN');
      const operands = this.parseArgList();
      this.expect('RPAREN');
      return { type: 'Timer', fn: t.value, operands, pos: t.pos };
    }

    if (t.type === 'IDENT') {
      this.advance();
      if (this.match('LPAREN')) {
        this.advance();
        const args = this.parseArgList();
        this.expect('RPAREN');
        return { type: 'FunctionCall', name: t.value, args, pos: t.pos };
      }
      return { type: 'Ident', name: t.value, pos: t.pos };
    }

    if (t.type === 'NUMBER') {
      this.advance();
      return { type: 'Ident', name: t.value, pos: t.pos };
    }

    if (t.type === 'LPAREN') {
      this.advance();
      const inner = this.parseOr();
      this.expect('RPAREN');
      return inner;
    }

    throw new Error(`Unexpected token "${t.value}" (${t.type}) at pos ${t.pos}`);
  }

  private parseArgList(): AnyASTNode[] {
    const args: AnyASTNode[] = [];
    if (!this.match('RPAREN', 'EOF')) {
      args.push(this.parseOr());
      while (this.match('COMMA')) {
        this.advance();
        if (this.match('RPAREN', 'EOF')) break;
        args.push(this.parseOr());
      }
    }
    return args;
  }
}

export function parseExpression(expr: string): ParseResult {
  try {
    const tokens = tokenize(expr.trim());
    if (tokens.length === 1 && tokens[0].type === 'EOF') {
      return { ast: null, error: 'Empty expression' };
    }
    const parser = new Parser(tokens);
    const ast = parser.parse();
    return { ast, error: null };
  } catch (e) {
    return { ast: null, error: (e as Error).message };
  }
}

export function collectIdents(node: AnyASTNode | null): Set<string> {
  const result = new Set<string>();
  function walk(n: AnyASTNode) {
    switch (n.type) {
      case 'Ident': result.add(n.name); break;
      case 'Not': walk(n.operand); break;
      case 'And': n.operands.forEach(walk); break;
      case 'Or':  n.operands.forEach(walk); break;
      case 'Rising': result.add(n.operand); break;
      case 'Falling': result.add(n.operand); break;
      case 'Latch': n.operands.forEach(walk); break;
      case 'Pulse': n.operands.forEach(walk); break;
      case 'Timer': n.operands.forEach(walk); break;
      case 'FunctionCall': n.args.forEach(walk); break;
    }
  }
  if (node) walk(node);
  return result;
}
