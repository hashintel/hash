/**
 * Parses one constant expression into HIR without the TypeScript compiler.
 *
 * `lower-typescript.ts` is the compiler for every user-code surface, but it
 * needs the TypeScript compiler, which the browser runs only in the language
 * worker. Ad-hoc synthesis evaluates a handful of constant expressions
 * synchronously while the form renders (Optimize bounds, exposed Variables'
 * defaults, place totals), so it parses them here and evaluates the result
 * with `interpret.ts`. Nothing in this path runs source text as JavaScript.
 *
 * The grammar is arithmetic over ambient values, with JavaScript's
 * precedence: numbers, `true`, `false`, `parameters.<name>`,
 * `scenario.<name>`, `Math.<fn>(...)`, `Math.PI`, unary and binary
 * arithmetic, comparisons, `&&`, `||`, `?:` and parentheses. Any other bare
 * name lowers to a `localRef`, which the interpreter reports as unknown.
 * Everything else is a parse error: a constant is a number or a boolean, so
 * text, lists and records have no use here.
 */
import { HIR_MATH_FNS } from "./hir";

import type {
  HirBinaryOp,
  HirConstantName,
  HirDiagnostic,
  HirExpr,
  HirMathFn,
  Span,
} from "./hir";

export type ParseHirExpressionResult =
  | { ok: true; expr: HirExpr }
  | { ok: false; diagnostic: HirDiagnostic };

/** Longest first, so `**` wins over `*` and `===` over `==`. */
const PUNCTUATORS = [
  "===",
  "!==",
  "**",
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  "(",
  ")",
  ".",
  ",",
  "?",
  ":",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "!",
] as const;

type Punctuator = (typeof PUNCTUATORS)[number];

type Token = { start: number; end: number } & (
  | { kind: "number"; value: number }
  | { kind: "identifier"; name: string }
  | { kind: "punctuator"; text: Punctuator }
  | { kind: "end" }
);

type IdentifierToken = Token & { kind: "identifier" };

/** Left-associative binary levels, loosest first. `**` binds tighter. */
const BINARY_LEVELS: readonly (readonly Punctuator[])[] = [
  ["||"],
  ["&&"],
  ["==", "!=", "===", "!=="],
  ["<", "<=", ">", ">="],
  ["+", "-"],
  ["*", "/", "%"],
];

const MATH_CONSTANTS: ReadonlySet<string> = new Set(["PI", "E"]);

/** `Math.random` is left out: a constant has one value. */
const MATH_FNS: ReadonlySet<string> = new Set(
  HIR_MATH_FNS.filter((fn) => fn !== "random"),
);

/** Deeper nesting than this is refused before the parser's own stack is. */
const MAX_DEPTH = 100;

class ParseFailure extends Error {
  readonly span: Span;

  constructor(message: string, span: Span) {
    super(message);
    this.span = span;
  }
}

const fail = (message: string, start: number, end: number): never => {
  throw new ParseFailure(message, { start, length: end - start });
};

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  // Sticky patterns match at `lastIndex` only. They are declared here, per
  // call, so no module-level regex carries scanning state between calls.
  // Every quantifier sits behind a distinct prefix, so none backtracks.
  const whitespacePattern = /\s+/y;
  const numberPattern = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
  const identifierPattern = /[A-Za-z_$][A-Za-z0-9_$]*/y;
  let index = 0;
  while (index < source.length) {
    whitespacePattern.lastIndex = index;
    const whitespace = whitespacePattern.exec(source);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    const start = index;
    numberPattern.lastIndex = index;
    const number = numberPattern.exec(source)?.[0];
    if (number !== undefined) {
      index += number.length;
      // Strict-mode JavaScript, which the other surfaces are, has no legacy
      // octal literals; `00` and `08` are errors, not zero and eight.
      const second = number[1] ?? "";
      if (number.startsWith("0") && second >= "0" && second <= "9") {
        fail("Numbers may not start with `0`.", start, index);
      }
      tokens.push({ kind: "number", value: Number(number), start, end: index });
      continue;
    }
    identifierPattern.lastIndex = index;
    const name = identifierPattern.exec(source)?.[0];
    if (name !== undefined) {
      index += name.length;
      tokens.push({ kind: "identifier", name, start, end: index });
      continue;
    }
    const text = PUNCTUATORS.find((candidate) =>
      source.startsWith(candidate, start),
    );
    if (text === undefined) {
      return fail(
        `Unexpected character \`${source[start]!}\`.`,
        start,
        start + 1,
      );
    }
    index += text.length;
    tokens.push({ kind: "punctuator", text, start, end: index });
  }
  tokens.push({ kind: "end", start: source.length, end: source.length });
  return tokens;
}

type NodeInit = Omit<HirExpr, "id" | "span">;

class Parser {
  private position = 0;
  /** End offset of the last consumed token: where the node being built ends. */
  private lastEnd = 0;
  private nextId = 0;
  private depth = 0;

  constructor(
    private readonly source: string,
    private readonly tokens: Token[],
  ) {}

  parse(): HirExpr {
    const expr = this.parseConditional();
    const token = this.peek();
    if (token.kind !== "end") {
      fail(`Unexpected ${this.describe(token)}.`, token.start, token.end);
    }
    return expr;
  }

  private peek(): Token {
    return this.tokens[this.position]!;
  }

  private advance(): Token {
    const token = this.peek();
    this.position = Math.min(this.position + 1, this.tokens.length - 1);
    this.lastEnd = token.end;
    return token;
  }

  private isPunctuator(text: Punctuator): boolean {
    const token = this.peek();
    return token.kind === "punctuator" && token.text === text;
  }

  private expectPunctuator(text: Punctuator): Token {
    const token = this.peek();
    if (token.kind !== "punctuator" || token.text !== text) {
      fail(
        `Expected \`${text}\` but found ${this.describe(token)}.`,
        token.start,
        token.end,
      );
    }
    return this.advance();
  }

  /** A token as written, for messages. */
  private describe(token: Token): string {
    return token.kind === "end"
      ? "the end of the expression"
      : `\`${this.source.slice(token.start, token.end)}\``;
  }

  private make<Init extends NodeInit>(
    init: Init,
    start: number,
    end: number,
  ): Extract<HirExpr, { kind: Init["kind"] }> {
    return {
      ...init,
      id: this.nextId++,
      span: { start, length: end - start },
    } as unknown as Extract<HirExpr, { kind: Init["kind"] }>;
  }

  private nested<T>(token: Token, parse: () => T): T {
    this.depth += 1;
    if (this.depth > MAX_DEPTH) {
      fail("The expression is nested too deeply.", token.start, token.end);
    }
    try {
      return parse();
    } finally {
      this.depth -= 1;
    }
  }

  private parseConditional(): HirExpr {
    const start = this.peek().start;
    const condition = this.parseBinary(0);
    if (!this.isPunctuator("?")) {
      return condition;
    }
    const token = this.advance();
    return this.nested(token, () => {
      const thenBranch = this.parseConditional();
      this.expectPunctuator(":");
      const elseBranch = this.parseConditional();
      return this.make(
        { kind: "cond", condition, thenBranch, elseBranch },
        start,
        this.lastEnd,
      );
    });
  }

  private parseBinary(level: number): HirExpr {
    const operators = BINARY_LEVELS[level];
    if (!operators) {
      return this.parseExponent();
    }
    const start = this.peek().start;
    let left = this.parseBinary(level + 1);
    for (;;) {
      const token = this.peek();
      if (token.kind !== "punctuator" || !operators.includes(token.text)) {
        return left;
      }
      this.advance();
      const right = this.parseBinary(level + 1);
      const op: HirBinaryOp =
        token.text === "==="
          ? "=="
          : token.text === "!=="
            ? "!="
            : (token.text as HirBinaryOp);
      left = this.make(
        { kind: "binary", op, left, right },
        start,
        this.lastEnd,
      );
    }
  }

  /** A JavaScript ExponentiationExpression: a unary operand, optionally raised. */
  private parseExponent(): HirExpr {
    const start = this.peek().start;
    const base = this.parseUnary();
    if (!this.isPunctuator("**")) {
      return base;
    }
    const power = this.advance();
    const exponent = this.nested(power, () => this.parseExponent());
    return this.make(
      { kind: "binary", op: "**", left: base, right: exponent },
      start,
      this.lastEnd,
    );
  }

  /** A JavaScript UnaryExpression, which `**` may not raise unparenthesised. */
  private parseUnary(): HirExpr {
    const token = this.peek();
    if (
      token.kind !== "punctuator" ||
      (token.text !== "-" && token.text !== "+" && token.text !== "!")
    ) {
      return this.parsePrimary();
    }
    this.advance();
    const operand = this.nested(token, () => this.parseUnary());
    if (this.isPunctuator("**")) {
      fail(
        "Put parentheses around a negated or inverted operand before `**`.",
        token.start,
        this.peek().end,
      );
    }
    return this.make(
      { kind: "unary", op: token.text, operand },
      token.start,
      this.lastEnd,
    );
  }

  private parsePrimary(): HirExpr {
    const start = this.peek().start;
    const expr = this.parseAtom();
    if (this.isPunctuator("(")) {
      fail("Only `Math.<fn>(...)` can be called.", start, this.peek().end);
    }
    return expr;
  }

  private parseAtom(): HirExpr {
    const token = this.advance();
    switch (token.kind) {
      case "number":
        return this.make(
          {
            kind: "numberLit",
            value: token.value,
            raw: this.source.slice(token.start, token.end),
          },
          token.start,
          token.end,
        );
      case "identifier":
        return this.parseIdentifier(token);
      case "punctuator":
        if (token.text === "(") {
          return this.nested(token, () => {
            const inner = this.parseConditional();
            this.expectPunctuator(")");
            return inner;
          });
        }
        return fail(
          `Unexpected ${this.describe(token)}.`,
          token.start,
          token.end,
        );
      case "end":
        return fail("Expected an expression.", token.start, token.end);
    }
  }

  private parseIdentifier(token: IdentifierToken): HirExpr {
    switch (token.name) {
      case "true":
      case "false":
        return this.make(
          { kind: "boolLit", value: token.name === "true" },
          token.start,
          token.end,
        );
      case "Infinity":
      case "NaN":
        return this.make(
          { kind: "constant", name: token.name },
          token.start,
          token.end,
        );
      case "parameters":
      case "scenario":
        return this.make(
          {
            kind: token.name === "parameters" ? "paramRef" : "scenarioRef",
            name: this.parseMember(token).name,
          },
          token.start,
          this.lastEnd,
        );
      case "Math":
        return this.parseMath(token);
      default:
        return this.make(
          { kind: "localRef", name: token.name },
          token.start,
          token.end,
        );
    }
  }

  /** The `<name>` of `owner.<name>`. */
  private parseMember(owner: IdentifierToken): IdentifierToken {
    if (this.isPunctuator(".")) {
      this.advance();
      const member = this.advance();
      if (member.kind === "identifier") {
        return member;
      }
    }
    return fail(
      `\`${owner.name}\` can only be read as \`${owner.name}.<name>\`.`,
      owner.start,
      this.lastEnd,
    );
  }

  private parseMath(token: IdentifierToken): HirExpr {
    const { name } = this.parseMember(token);
    const end = this.lastEnd;
    if (MATH_CONSTANTS.has(name)) {
      return this.make(
        { kind: "constant", name: name as HirConstantName },
        token.start,
        end,
      );
    }
    if (!MATH_FNS.has(name)) {
      fail(`\`Math.${name}\` is not supported.`, token.start, end);
    }
    if (!this.isPunctuator("(")) {
      fail(
        `\`Math.${name}\` can only be used as a function call.`,
        token.start,
        end,
      );
    }
    const open = this.advance();
    const args = this.nested(open, () => {
      const list: HirExpr[] = [];
      while (!this.isPunctuator(")")) {
        list.push(this.parseConditional());
        // A comma separates arguments. One may also trail the last, as the
        // formatter writes a wrapped call.
        if (!this.isPunctuator(",")) {
          break;
        }
        this.advance();
      }
      this.expectPunctuator(")");
      return list;
    });
    return this.make(
      { kind: "mathCall", fn: name as HirMathFn, args },
      token.start,
      this.lastEnd,
    );
  }
}

/**
 * Parses `source` into an HIR expression. Ids are unique within the result
 * and spans index `source`. A failure carries the first problem found, as a
 * diagnostic positioned in `source`.
 */
export function parseHirExpression(source: string): ParseHirExpressionResult {
  try {
    return { ok: true, expr: new Parser(source, tokenize(source)).parse() };
  } catch (error) {
    if (error instanceof ParseFailure) {
      return {
        ok: false,
        diagnostic: {
          code: "hir:parse",
          message: error.message,
          severity: "error",
          span: error.span,
        },
      };
    }
    throw error;
  }
}
