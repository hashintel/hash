/**
 * Parses one expression written in the scenario vocabulary into HIR without
 * the TypeScript compiler.
 *
 * `lower-typescript.ts` is the compiler for every user-code surface, but it
 * needs the TypeScript compiler, which the browser runs only in the language
 * worker. Ad-hoc synthesis evaluates a handful of constant expressions
 * synchronously while the form renders (Optimize bounds, exposed Variables'
 * defaults, place totals), so it parses them here and evaluates the result
 * with `interpret.ts`. Nothing in this path runs source text as JavaScript.
 *
 * The grammar is the expression subset of the scenario surfaces, with
 * JavaScript's precedence: literals, `parameters.<name>`, `scenario.<name>`,
 * `Math.<fn>(...)`, `Math.PI`, `range(...)`, unary and binary arithmetic,
 * comparisons, `&&`, `||`, `?:`, `.length`, member and index access, and
 * parentheses. Any other bare name lowers to a `localRef`, which the
 * interpreter reports as unknown. Everything else is a parse error.
 */
import { HIR_MATH_FNS } from "./hir";

import type {
  HirBinaryOp,
  HirConstantName,
  HirDiagnostic,
  HirExpr,
  HirMathFn,
  HirUnaryOp,
  Span,
} from "./hir";

export type ParseHirExpressionResult =
  | { ok: true; expr: HirExpr }
  | { ok: false; diagnostic: HirDiagnostic };

type Punctuator =
  | "("
  | ")"
  | "["
  | "]"
  | "."
  | ","
  | "?"
  | ":"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "**"
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!="
  | "==="
  | "!=="
  | "&&"
  | "||"
  | "!";

/** Longest first, so `**` wins over `*` and `===` over `==`. */
const PUNCTUATORS: readonly Punctuator[] = [
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
  "[",
  "]",
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
];

type Token = { start: number; end: number } & (
  | { kind: "number"; value: number; raw: string }
  | { kind: "string"; value: string }
  | { kind: "identifier"; name: string }
  | { kind: "punctuator"; text: Punctuator }
  | { kind: "end" }
);

const punctuatorAt = (source: string, index: number): Punctuator | undefined =>
  PUNCTUATORS.find((candidate) => source.startsWith(candidate, index));

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
};

const MATH_CONSTANTS: ReadonlySet<string> = new Set(["PI", "E"]);
const MATH_FNS: ReadonlySet<string> = new Set(HIR_MATH_FNS);

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

function readString(source: string, start: number): Token {
  const quote = source[start]!;
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const char = source[index]!;
    if (char === quote) {
      return { kind: "string", value, start, end: index + 1 };
    }
    if (char === "\n") {
      break;
    }
    if (char !== "\\") {
      value += char;
      index += 1;
      continue;
    }
    const escaped = source[index + 1];
    if (escaped === undefined) {
      break;
    }
    if (escaped === "u" || escaped === "x") {
      const digits = escaped === "u" ? 4 : 2;
      const hex = source.slice(index + 2, index + 2 + digits);
      const wellFormed =
        digits === 4
          ? /^[0-9a-fA-F]{4}$/.test(hex)
          : /^[0-9a-fA-F]{2}$/.test(hex);
      if (!wellFormed) {
        return fail("Invalid escape sequence.", index, index + 2 + digits);
      }
      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 2 + digits;
      continue;
    }
    value += SIMPLE_ESCAPES[escaped] ?? escaped;
    index += 2;
  }
  return fail("Unterminated string.", start, source.length);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  // Sticky patterns match at `lastIndex` only. They are declared here, per
  // call, so no module-level regex carries scanning state between calls.
  const whitespacePattern = /\s+/y;
  const numberPattern =
    /0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  const identifierPattern = /[A-Za-z_$][A-Za-z0-9_$]*/y;
  let index = 0;
  while (index < source.length) {
    whitespacePattern.lastIndex = index;
    const whitespace = whitespacePattern.exec(source);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const close = source.indexOf("*/", index + 2);
      if (close === -1) {
        fail("Unterminated comment.", index, source.length);
      }
      index = close + 2;
      continue;
    }
    numberPattern.lastIndex = index;
    const number = numberPattern.exec(source);
    if (number) {
      const raw = number[0];
      // Strict-mode JavaScript, which the other surfaces are, has no legacy
      // octal literals; `00` and `08` are errors, not zero and eight.
      if (/^0\d/.test(raw)) {
        fail("Numbers may not start with `0`.", index, index + raw.length);
      }
      tokens.push({
        kind: "number",
        value: Number(raw),
        raw,
        start: index,
        end: index + raw.length,
      });
      index += raw.length;
      continue;
    }
    identifierPattern.lastIndex = index;
    const identifier = identifierPattern.exec(source);
    if (identifier) {
      tokens.push({
        kind: "identifier",
        name: identifier[0],
        start: index,
        end: index + identifier[0].length,
      });
      index += identifier[0].length;
      continue;
    }
    const char = source[index]!;
    if (char === '"' || char === "'") {
      const token = readString(source, index);
      tokens.push(token);
      index = token.end;
      continue;
    }
    const punctuator = punctuatorAt(source, index);
    if (punctuator) {
      tokens.push({
        kind: "punctuator",
        text: punctuator,
        start: index,
        end: index + punctuator.length,
      });
      index += punctuator.length;
      continue;
    }
    fail(`Unexpected character \`${char}\`.`, index, index + 1);
  }
  tokens.push({ kind: "end", start: source.length, end: source.length });
  return tokens;
}

const describeToken = (token: Token): string => {
  switch (token.kind) {
    case "number":
      return `number \`${token.raw}\``;
    case "string":
      return "string";
    case "identifier":
      return `\`${token.name}\``;
    case "punctuator":
      return `\`${token.text}\``;
    case "end":
      return "the end of the expression";
  }
};

type NodeInit = Omit<HirExpr, "id" | "span">;

class Parser {
  private position = 0;
  /** End offset of the last consumed token: where the node being built ends. */
  private lastEnd = 0;
  private nextId = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): HirExpr {
    const expr = this.parseConditional();
    const token = this.peek();
    if (token.kind !== "end") {
      fail(`Unexpected ${describeToken(token)}.`, token.start, token.end);
    }
    return expr;
  }

  private peek(offset = 0): Token {
    return this.tokens[
      Math.min(this.position + offset, this.tokens.length - 1)
    ]!;
  }

  private advance(): Token {
    const token = this.peek();
    this.position = Math.min(this.position + 1, this.tokens.length - 1);
    this.lastEnd = token.end;
    return token;
  }

  private isPunctuator(text: Punctuator, offset = 0): boolean {
    const token = this.peek(offset);
    return token.kind === "punctuator" && token.text === text;
  }

  private expectPunctuator(text: Punctuator): Token {
    const token = this.peek();
    if (token.kind !== "punctuator" || token.text !== text) {
      fail(
        `Expected \`${text}\` but found ${describeToken(token)}.`,
        token.start,
        token.end,
      );
    }
    return this.advance();
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

  /** Left-associative binary levels, loosest first. */
  private static readonly BINARY_LEVELS: readonly (readonly Punctuator[])[] = [
    ["||"],
    ["&&"],
    ["==", "!=", "===", "!=="],
    ["<", "<=", ">", ">="],
    ["+", "-"],
    ["*", "/", "%"],
  ];

  private parseBinary(level: number): HirExpr {
    const operators = Parser.BINARY_LEVELS[level];
    if (!operators) {
      return this.parseUnary();
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
  private parseUnary(): HirExpr {
    const start = this.peek().start;
    const base = this.parseUnaryOperand();
    if (!this.isPunctuator("**")) {
      return base;
    }
    const power = this.advance();
    const exponent = this.nested(power, () => this.parseUnary());
    return this.make(
      { kind: "binary", op: "**", left: base, right: exponent },
      start,
      this.lastEnd,
    );
  }

  /** A JavaScript UnaryExpression, which `**` may not raise unparenthesised. */
  private parseUnaryOperand(): HirExpr {
    const token = this.peek();
    if (
      token.kind !== "punctuator" ||
      (token.text !== "-" && token.text !== "+" && token.text !== "!")
    ) {
      return this.parsePostfix();
    }
    this.advance();
    const op: HirUnaryOp = token.text;
    const operandToken = this.peek();
    const operand = this.nested(token, () => this.parseUnaryOperand());
    if (this.isPunctuator("**")) {
      fail(
        "Put parentheses around a negated or inverted operand before `**`.",
        token.start,
        this.peek().end,
      );
    }
    // Fold `-1` style negated literals so the raw text is preserved, as the
    // TypeScript lowering does.
    if (
      op === "-" &&
      operand.kind === "numberLit" &&
      operandToken.kind === "number" &&
      operand.span.start === operandToken.start
    ) {
      return this.make(
        { kind: "numberLit", value: -operand.value, raw: `-${operand.raw}` },
        token.start,
        this.lastEnd,
      );
    }
    return this.make({ kind: "unary", op, operand }, token.start, this.lastEnd);
  }

  private parseArguments(): { args: HirExpr[]; end: number } {
    const open = this.expectPunctuator("(");
    return this.nested(open, () => {
      const args: HirExpr[] = [];
      if (!this.isPunctuator(")")) {
        for (;;) {
          args.push(this.parseConditional());
          if (!this.isPunctuator(",")) {
            break;
          }
          this.advance();
        }
      }
      const close = this.expectPunctuator(")");
      return { args, end: close.end };
    });
  }

  /** The name after `.` or the string inside `[...]`, with its span. */
  private parseMemberName(): { name: string; start: number; end: number } {
    if (this.isPunctuator(".")) {
      this.advance();
      const token = this.peek();
      if (token.kind !== "identifier") {
        return fail("Expected a name after `.`.", token.start, token.end);
      }
      this.advance();
      return { name: token.name, start: token.start, end: token.end };
    }
    this.expectPunctuator("[");
    const token = this.peek();
    if (token.kind !== "string") {
      return fail(
        "Expected a quoted name inside `[...]`.",
        token.start,
        token.end,
      );
    }
    this.advance();
    const close = this.expectPunctuator("]");
    return { name: token.value, start: token.start, end: close.end };
  }

  /** `parameters.<name>` / `scenario.<name>`, also in `["name"]` form. */
  private parseAmbientRef(
    token: Token & { kind: "identifier" },
    kind: "paramRef" | "scenarioRef",
  ): HirExpr {
    if (!this.isPunctuator(".") && !this.isPunctuator("[")) {
      fail(
        `\`${token.name}\` can only be read as \`${token.name}.<name>\`.`,
        token.start,
        token.end,
      );
    }
    const member = this.parseMemberName();
    return this.make({ kind, name: member.name }, token.start, member.end);
  }

  private parseMathMember(token: Token & { kind: "identifier" }): HirExpr {
    if (!this.isPunctuator(".")) {
      fail("`Math` can only be used as `Math.<name>`.", token.start, token.end);
    }
    const member = this.parseMemberName();
    if (MATH_CONSTANTS.has(member.name)) {
      if (this.isPunctuator("(")) {
        fail(
          `\`Math.${member.name}\` is a value, not a function.`,
          token.start,
          member.end,
        );
      }
      return this.make(
        { kind: "constant", name: member.name as HirConstantName },
        token.start,
        member.end,
      );
    }
    if (!MATH_FNS.has(member.name)) {
      fail(
        `\`Math.${member.name}\` is not supported.`,
        token.start,
        member.end,
      );
    }
    if (!this.isPunctuator("(")) {
      fail(
        `\`Math.${member.name}\` can only be used as a function call.`,
        token.start,
        member.end,
      );
    }
    const { args, end } = this.parseArguments();
    return this.make(
      { kind: "mathCall", fn: member.name as HirMathFn, args },
      token.start,
      end,
    );
  }

  private parseIdentifier(token: Token & { kind: "identifier" }): HirExpr {
    switch (token.name) {
      case "true":
      case "false":
        return this.make(
          { kind: "boolLit", value: token.name === "true" },
          token.start,
          token.end,
        );
      case "null":
      case "undefined":
        return this.make({ kind: "nullLit" }, token.start, token.end);
      case "Infinity":
      case "NaN":
        return this.make(
          { kind: "constant", name: token.name },
          token.start,
          token.end,
        );
      case "parameters":
        return this.parseAmbientRef(token, "paramRef");
      case "scenario":
        return this.parseAmbientRef(token, "scenarioRef");
      case "Math":
        return this.parseMathMember(token);
      case "range": {
        if (!this.isPunctuator("(")) {
          fail(
            "`range` can only be used as a function call.",
            token.start,
            token.end,
          );
        }
        const { args, end } = this.parseArguments();
        if (args.length < 1 || args.length > 3) {
          fail("`range(...)` takes 1 to 3 arguments.", token.start, end);
        }
        return this.make({ kind: "rangeCall", args }, token.start, end);
      }
      default:
        return this.make(
          { kind: "localRef", name: token.name },
          token.start,
          token.end,
        );
    }
  }

  private parsePrimary(): HirExpr {
    const token = this.advance();
    switch (token.kind) {
      case "number":
        return this.make(
          { kind: "numberLit", value: token.value, raw: token.raw },
          token.start,
          token.end,
        );
      case "string":
        return this.make(
          { kind: "stringLit", value: token.value },
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
          `Unexpected ${describeToken(token)}.`,
          token.start,
          token.end,
        );
      case "end":
        return fail("Expected an expression.", token.start, token.end);
    }
  }

  private parsePostfix(): HirExpr {
    const start = this.peek().start;
    let expr = this.parsePrimary();
    for (;;) {
      if (this.isPunctuator(".")) {
        const member = this.parseMemberName();
        expr =
          member.name === "length"
            ? this.make({ kind: "length", target: expr }, start, member.end)
            : this.make(
                {
                  kind: "fieldAccess",
                  target: expr,
                  field: member.name,
                  fieldSpan: {
                    start: member.start,
                    length: member.end - member.start,
                  },
                },
                start,
                member.end,
              );
        continue;
      }
      if (this.isPunctuator("[")) {
        const open = this.advance();
        const target = expr;
        expr = this.nested(open, () => {
          const index = this.parseConditional();
          const close = this.expectPunctuator("]");
          return this.make(
            { kind: "indexAccess", target, index },
            start,
            close.end,
          );
        });
        continue;
      }
      if (this.isPunctuator("(")) {
        const open = this.peek();
        fail(
          "Only `Math.<fn>(...)` and `range(...)` can be called.",
          start,
          open.end,
        );
      }
      return expr;
    }
  }
}

/**
 * Parses `source` into an HIR expression. Ids are unique within the result
 * and spans index `source`. A failure carries the first problem found, as a
 * diagnostic positioned in `source`.
 */
export function parseHirExpression(source: string): ParseHirExpressionResult {
  try {
    return { ok: true, expr: new Parser(tokenize(source)).parse() };
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
