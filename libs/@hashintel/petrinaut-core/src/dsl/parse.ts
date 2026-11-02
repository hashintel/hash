/**
 * Reads Petrinaut DSL text into declarations: a hand-written recursive
 * descent over the grammar the printer writes. Declarations are read by
 * keyword, a code body is the text between its braces, and a line that fails
 * to parse is reported and skipped, so one mistake does not hide the next.
 */

import { emptyDslScope } from "./ast";
import { dedentLines } from "./code-bodies";

import type {
  ColorElementType,
  InputArcType,
  Parameter,
  PortDirection,
  ScenarioParameter,
} from "../types/sdcpn";
import type {
  DslArc,
  DslBinding,
  DslComponentDeclaration,
  DslDiagnostic,
  DslDocument,
  DslDynamicsDeclaration,
  DslFusionDeclaration,
  DslInitialState,
  DslInstanceDeclaration,
  DslMetricDeclaration,
  DslParameterDeclaration,
  DslPlaceDeclaration,
  DslPlaceReference,
  DslRange,
  DslScenarioDeclaration,
  DslScenarioParameter,
  DslScope,
  DslTransitionDeclaration,
  DslTypeDeclaration,
  DslWord,
} from "./ast";

export type DslParseResult = {
  document: DslDocument;
  diagnostics: DslDiagnostic[];
};

class DslSyntaxError extends Error {
  constructor(
    message: string,
    readonly range: DslRange,
  ) {
    super(message);
    this.name = "DslSyntaxError";
  }
}

const identifierPattern = /[A-Za-z_$][A-Za-z0-9_$]*/y;
/** A keyword may carry a hyphen (`components-only`); a name may not. */
const keywordPattern = /[A-Za-z_$][A-Za-z0-9_$-]*/y;
const stringPattern = /"(?:[^"\\\n]|\\.)*"/y;
const numberPattern = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

const colorElementTypes: ReadonlySet<string> = new Set<ColorElementType>([
  "real",
  "integer",
  "boolean",
  "uuid",
  "string",
]);
const parameterTypes: ReadonlySet<string> = new Set<Parameter["type"]>([
  "real",
  "integer",
  "boolean",
]);
const scenarioParameterTypes: ReadonlySet<string> = new Set<
  ScenarioParameter["type"]
>(["real", "integer", "boolean", "ratio"]);
const portDirections: ReadonlySet<string> = new Set<PortDirection>([
  "in",
  "out",
  "inout",
]);

const listOf = (words: ReadonlySet<string>): string => [...words].join(", ");

/** The index just past the quote that closes the one at `quoteIndex`, or the line's end. */
const skipQuoted = (text: string, quoteIndex: number): number => {
  const quote = text[quoteIndex]!;
  for (let index = quoteIndex + 1; index < text.length; index++) {
    const char = text[index]!;
    if (char === "\\") {
      index += 1;
    } else if (char === quote) {
      return index + 1;
    } else if (char === "\n") {
      return index;
    }
  }
  return text.length;
};

/**
 * The index just past the brace that closes the one at `openIndex`, counting
 * braces outside strings, template literals and comments, with the
 * expressions a template literal holds counted on their own. `null` when the
 * text ends first.
 */
export const skipCodeBlock = (
  text: string,
  openIndex: number,
): number | null => {
  const frames: Array<{ kind: "code"; depth: number } | { kind: "template" }> =
    [{ kind: "code", depth: 0 }];
  let index = openIndex + 1;
  while (index < text.length) {
    const frame = frames.at(-1)!;
    const char = text[index]!;
    if (frame.kind === "template") {
      if (char === "\\") {
        index += 2;
      } else if (char === "`") {
        frames.pop();
        index += 1;
      } else if (char === "$" && text[index + 1] === "{") {
        frames.push({ kind: "code", depth: 0 });
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (char === "/" && text[index + 1] === "/") {
      const end = text.indexOf("\n", index);
      if (end < 0) {
        return null;
      }
      index = end;
    } else if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      if (end < 0) {
        return null;
      }
      index = end + 2;
    } else if (char === '"' || char === "'") {
      index = skipQuoted(text, index);
    } else if (char === "`") {
      frames.push({ kind: "template" });
      index += 1;
    } else if (char === "{") {
      frame.depth += 1;
      index += 1;
    } else if (char === "}") {
      if (frame.depth > 0) {
        frame.depth -= 1;
      } else if (frames.length === 1) {
        return index + 1;
      } else {
        frames.pop();
      }
      index += 1;
    } else {
      index += 1;
    }
  }
  return null;
};

/** `raw` up to a `//` comment outside quotes. */
const stripTrailingComment = (raw: string): string => {
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index]!;
    if (char === '"' || char === "'" || char === "`") {
      index = skipQuoted(raw, index) - 1;
    } else if (char === "/" && raw[index + 1] === "/") {
      return raw.slice(0, index);
    }
  }
  return raw;
};

/** The body between braces as the model stores it: one line trimmed, several dedented. */
const bodyText = (inner: string): string =>
  inner.includes("\n") ? dedentLines(inner).join("\n") : inner.trim();

class Source {
  index = 0;
  private readonly lineStarts: number[] = [0];

  constructor(readonly text: string) {
    for (let index = 0; index < text.length; index++) {
      if (text[index] === "\n") {
        this.lineStarts.push(index + 1);
      }
    }
  }

  get eof(): boolean {
    return this.index >= this.text.length;
  }

  peek(): string {
    return this.text[this.index] ?? "";
  }

  startsWith(prefix: string): boolean {
    return this.text.startsWith(prefix, this.index);
  }

  position(index: number): { line: number; column: number } {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.lineStarts[middle]! <= index) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return { line: low + 1, column: index - this.lineStarts[low]! + 1 };
  }

  range(start: number, end: number = this.index): DslRange {
    const from = this.position(start);
    const to = this.position(Math.max(start, end));
    return {
      startLine: from.line,
      startColumn: from.column,
      endLine: to.line,
      endColumn: to.column,
    };
  }

  /** The rest of the current line, at least one column wide: where an error is. */
  hereRange(): DslRange {
    return this.range(
      this.index,
      Math.max(this.lineEndIndex(), this.index + 1),
    );
  }

  lineEndIndex(): number {
    const newline = this.text.indexOf("\n", this.index);
    return newline < 0 ? this.text.length : newline;
  }

  match(pattern: RegExp): string | null {
    const sticky = pattern;
    sticky.lastIndex = this.index;
    const hit = sticky.exec(this.text);
    if (hit === null) {
      return null;
    }
    this.index = sticky.lastIndex;
    return hit[0];
  }

  seek(index: number): void {
    this.index = index;
  }

  advance(count: number): void {
    this.index += count;
  }

  skipInline(): void {
    while (
      this.peek() === " " ||
      this.peek() === "\t" ||
      this.peek() === "\r"
    ) {
      this.index += 1;
    }
  }

  /** Skips blank lines and `//` comments; a `///` line stops it unless `docs`. */
  skipBlank(docs = false): void {
    for (;;) {
      this.skipInline();
      if (this.peek() === "\n") {
        this.index += 1;
      } else if (this.startsWith("//") && (docs || !this.startsWith("///"))) {
        this.index = this.lineEndIndex();
      } else {
        return;
      }
    }
  }

  /** The `///` lines before a declaration, as its description. */
  readDocs(): string | undefined {
    const lines: string[] = [];
    for (;;) {
      this.skipBlank();
      if (!this.startsWith("///")) {
        break;
      }
      const end = this.lineEndIndex();
      const raw = this.text.slice(this.index + 3, end).replace(/\r$/u, "");
      lines.push(raw.startsWith(" ") ? raw.slice(1) : raw);
      this.index = end;
    }
    return lines.length === 0 ? undefined : lines.join("\n");
  }

  atLineEnd(): boolean {
    this.skipInline();
    return this.eof || this.peek() === "\n" || this.startsWith("//");
  }

  /** Moves to the end of the line, past a trailing comment; anything else is an error. */
  endLine(): void {
    if (!this.atLineEnd()) {
      throw new DslSyntaxError(
        `Unexpected ${this.describeHere()}`,
        this.hereRange(),
      );
    }
    this.index = this.lineEndIndex();
  }

  /** Like `endLine`, and the `}` that closes the enclosing block may follow instead. */
  endStatement(): void {
    this.skipInline();
    if (this.peek() !== "}") {
      this.endLine();
    }
  }

  describeHere(): string {
    const word = this.peekKeyword();
    if (word !== null) {
      return `"${word}"`;
    }
    return this.eof ? "end of text" : `"${this.peek()}"`;
  }

  expect(punctuation: string): void {
    this.skipInline();
    if (!this.startsWith(punctuation)) {
      throw new DslSyntaxError(
        `Expected "${punctuation}", found ${this.describeHere()}`,
        this.hereRange(),
      );
    }
    this.index += punctuation.length;
  }

  tryPunctuation(punctuation: string): boolean {
    this.skipInline();
    if (!this.startsWith(punctuation)) {
      return false;
    }
    this.index += punctuation.length;
    return true;
  }

  peekKeyword(): string | null {
    this.skipInline();
    keywordPattern.lastIndex = this.index;
    return keywordPattern.exec(this.text)?.[0] ?? null;
  }

  readKeyword(): DslWord {
    this.skipInline();
    const start = this.index;
    const text = this.match(keywordPattern);
    if (text === null) {
      throw new DslSyntaxError(
        `Expected a declaration, found ${this.describeHere()}`,
        this.hereRange(),
      );
    }
    return { text, range: this.range(start) };
  }

  readIdentifier(what: string): DslWord {
    this.skipInline();
    const start = this.index;
    const text = this.match(identifierPattern);
    if (text === null) {
      throw new DslSyntaxError(
        `Expected ${what}, found ${this.describeHere()}`,
        this.hereRange(),
      );
    }
    return { text, range: this.range(start) };
  }

  readString(): string {
    this.skipInline();
    const start = this.index;
    const raw = this.match(stringPattern);
    if (raw === null) {
      throw new DslSyntaxError(
        `Expected a quoted string, found ${this.describeHere()}`,
        this.hereRange(),
      );
    }
    try {
      return JSON.parse(raw) as string;
    } catch {
      throw new DslSyntaxError("Invalid string escape", this.range(start));
    }
  }

  /** A name: an identifier, or a quoted string when it is not one. */
  readName(what: string): DslWord {
    this.skipInline();
    if (this.peek() === '"') {
      const start = this.index;
      const text = this.readString();
      return { text, range: this.range(start) };
    }
    return this.readIdentifier(what);
  }

  readNumber(what: string): number {
    this.skipInline();
    const start = this.index;
    const raw = this.match(numberPattern);
    if (raw === null) {
      throw new DslSyntaxError(
        `Expected ${what}, found ${this.describeHere()}`,
        this.hereRange(),
      );
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new DslSyntaxError(`Expected ${what}`, this.range(start));
    }
    return value;
  }

  /** The rest of the line, without its trailing comment, trimmed. */
  readRestOfLine(): string {
    const end = this.lineEndIndex();
    const raw = this.text.slice(this.index, end);
    this.index = end;
    return stripTrailingComment(raw).trim();
  }

  /**
   * The text up to one of `stops` at bracket depth zero, strings skipped; the
   * stop is left in place. The line must hold it.
   */
  readUntil(stops: readonly string[]): string {
    const start = this.index;
    let depth = 0;
    while (!this.eof) {
      const char = this.peek();
      if (char === "\n") {
        break;
      }
      if (depth === 0 && stops.includes(char)) {
        return this.text.slice(start, this.index);
      }
      if (char === '"' || char === "'" || char === "`") {
        this.index = skipQuoted(this.text, this.index);
        continue;
      }
      if (char === "(" || char === "[" || char === "{") {
        depth += 1;
      } else if (char === ")" || char === "]" || char === "}") {
        depth -= 1;
      }
      this.index += 1;
    }
    throw new DslSyntaxError(
      `Expected ${stops.map((stop) => `"${stop}"`).join(" or ")} on this line`,
      this.range(start, Math.max(this.index, start + 1)),
    );
  }

  readCodeBody(): string {
    this.skipInline();
    if (this.peek() !== "{") {
      throw new DslSyntaxError(
        `Expected "{" to open the code body, found ${this.describeHere()}`,
        this.hereRange(),
      );
    }
    const open = this.index;
    const close = skipCodeBlock(this.text, open);
    if (close === null) {
      throw new DslSyntaxError(
        'The code body\'s "{" has no matching "}"',
        this.range(open, open + 1),
      );
    }
    this.index = close;
    return bodyText(this.text.slice(open + 1, close - 1));
  }

  /** Whether `keyword` at the cursor is followed by `{` on the same line: a code block, not a name. */
  keywordOpensBlock(keyword: string): boolean {
    this.skipInline();
    let index = this.index + keyword.length;
    while (this.text[index] === " " || this.text[index] === "\t") {
      index += 1;
    }
    return this.text[index] === "{";
  }

  /** Whether `keyword` at the cursor is followed by a name: an arc kind, not a place called `read`. */
  keywordPrecedesName(keyword: string): boolean {
    this.skipInline();
    let index = this.index + keyword.length;
    if (!/[ \t]/u.test(this.text[index] ?? "")) {
      return false;
    }
    while (this.text[index] === " " || this.text[index] === "\t") {
      index += 1;
    }
    return /[A-Za-z_$"]/u.test(this.text[index] ?? "");
  }

  /**
   * After a failed declaration that began at `start`: past the end of the
   * current line, and past the block a brace on the way opened.
   */
  recover(start: number): void {
    const lineEnd = this.lineEndIndex();
    for (let index = start; index < lineEnd; index++) {
      const char = this.text[index]!;
      if (char === '"') {
        index = skipQuoted(this.text, index) - 1;
      } else if (char === "/" && this.text[index + 1] === "/") {
        break;
      } else if (char === "{") {
        const close = skipCodeBlock(this.text, index);
        this.index =
          close === null ? this.text.length : Math.max(close, lineEnd);
        return;
      }
    }
    this.index = lineEnd;
  }
}

type Context = {
  source: Source;
  diagnostics: DslDiagnostic[];
};

const report = (context: Context, error: unknown): void => {
  if (!(error instanceof DslSyntaxError)) {
    throw error;
  }
  context.diagnostics.push({
    severity: "error",
    message: error.message,
    range: error.range,
  });
};

type Declared<Node> = Omit<Node, "range" | "description">;

const declared = <Node>(
  source: Source,
  start: number,
  description: string | undefined,
  node: Declared<Node>,
): Node =>
  ({
    ...node,
    range: source.range(start),
    ...(description === undefined ? {} : { description }),
  }) as Node;

const readPlaceReference = (source: Source): DslPlaceReference => {
  source.skipInline();
  const start = source.index;
  const first = source.readName("a place or a port");
  if (source.peek() === ".") {
    source.advance(1);
    const port = source.readName("a port name");
    return { instance: first, place: port, range: source.range(start) };
  }
  return { instance: null, place: first, range: source.range(start) };
};

const parseType = (
  source: Source,
  start: number,
  description: string | undefined,
): DslTypeDeclaration => {
  const name = source.readName("a type name");
  source.expect("{");
  const elements: DslTypeDeclaration["elements"] = [];
  for (;;) {
    source.skipBlank(true);
    if (source.tryPunctuation("}")) {
      break;
    }
    const elementName = source.readName("an element name");
    source.expect(":");
    const type = source.readIdentifier("an element type");
    if (!colorElementTypes.has(type.text)) {
      throw new DslSyntaxError(
        `Unknown element type "${type.text}"; expected one of ${listOf(colorElementTypes)}`,
        type.range,
      );
    }
    elements.push({ name: elementName, type: type.text as ColorElementType });
    if (!source.tryPunctuation(",")) {
      source.skipBlank(true);
      if (source.peek() !== "}") {
        throw new DslSyntaxError(
          `Expected "," or "}", found ${source.describeHere()}`,
          source.hereRange(),
        );
      }
    }
  }
  source.endLine();
  return declared(source, start, description, { name, elements });
};

const parseParameter = (
  source: Source,
  start: number,
  description: string | undefined,
): DslParameterDeclaration => {
  const variableName = source.readIdentifier("a parameter variable name");
  source.skipInline();
  const label = source.peek() === '"' ? source.readString() : null;
  source.expect(":");
  const type = source.readIdentifier("a parameter type");
  if (!parameterTypes.has(type.text)) {
    throw new DslSyntaxError(
      `Unknown parameter type "${type.text}"; expected one of ${listOf(parameterTypes)}`,
      type.range,
    );
  }
  source.expect("=");
  source.skipInline();
  const valueStart = source.index;
  const defaultValue = source.readRestOfLine();
  if (defaultValue === "") {
    throw new DslSyntaxError(
      'Expected a default value after "="',
      source.range(valueStart, valueStart + 1),
    );
  }
  return declared(source, start, description, {
    variableName,
    label,
    type: type.text as Parameter["type"],
    defaultValue,
  });
};

const parseDynamics = (
  source: Source,
  start: number,
  description: string | undefined,
): DslDynamicsDeclaration => {
  const name = source.readName("an equation name");
  let type: DslWord | null = null;
  if (source.tryPunctuation("(")) {
    type = source.readName("a type name");
    source.expect(")");
  }
  const code = source.readCodeBody();
  source.endLine();
  return declared(source, start, description, { name, type, code });
};

const parsePlace = (
  source: Source,
  keyword: "place" | "port",
  start: number,
  description: string | undefined,
): DslPlaceDeclaration => {
  let port: PortDirection | null = null;
  if (keyword === "port") {
    const direction = source.readIdentifier("a port direction");
    if (!portDirections.has(direction.text)) {
      throw new DslSyntaxError(
        `Expected a port direction (${listOf(portDirections)}), found "${direction.text}"`,
        direction.range,
      );
    }
    port = direction.text as PortDirection;
  }
  const name = source.readName(
    keyword === "port" ? "a port name" : "a place name",
  );
  const type = source.tryPunctuation(":")
    ? source.readName("a type name")
    : null;
  let capacity: number | null = null;
  let dynamics: DslWord | null = null;
  let isStart = false;
  for (;;) {
    const word = source.peekKeyword();
    if (word === "capacity") {
      source.readKeyword();
      capacity = source.readNumber("a capacity");
      if (!Number.isInteger(capacity) || capacity < 0) {
        throw new DslSyntaxError(
          "A capacity is a whole number of tokens",
          source.hereRange(),
        );
      }
    } else if (word === "dynamics") {
      source.readKeyword();
      dynamics = source.readName("an equation name");
    } else if (word === "start") {
      source.readKeyword();
      isStart = true;
    } else {
      break;
    }
  }
  let visualizer: string | null = null;
  if (source.tryPunctuation("{")) {
    for (;;) {
      source.skipBlank(true);
      if (source.eof) {
        throw new DslSyntaxError(
          `The block of ${keyword} "${name.text}" has no closing "}"`,
          name.range,
        );
      }
      if (source.tryPunctuation("}")) {
        break;
      }
      const word = source.readKeyword();
      if (word.text !== "visualizer") {
        throw new DslSyntaxError(
          `Expected "visualizer" or "}" in the ${keyword}'s block, found "${word.text}"`,
          word.range,
        );
      }
      visualizer = source.readCodeBody();
      source.endStatement();
    }
  }
  source.endLine();
  return declared(source, start, description, {
    name,
    port,
    type,
    capacity,
    dynamics,
    start: isStart,
    visualizer,
  });
};

const readBinding = (
  source: Source,
  what: string,
  separator: string,
  stops: readonly string[],
): DslBinding => {
  source.skipInline();
  const start = source.index;
  const name = source.readIdentifier(what);
  source.expect(separator);
  source.skipInline();
  const value = (
    stops.length === 0 ? source.readRestOfLine() : source.readUntil(stops)
  ).trim();
  if (value === "") {
    throw new DslSyntaxError(
      `Expected a value after "${separator}"`,
      source.range(start),
    );
  }
  return { name, value, range: source.range(start) };
};

const parseInstance = (
  source: Source,
  start: number,
  description: string | undefined,
): DslInstanceDeclaration => {
  const name = source.readName("an instance name");
  source.expect("=");
  const component = source.readName("a component name");
  const bindings: DslBinding[] = [];
  if (source.tryPunctuation("(")) {
    for (;;) {
      if (source.tryPunctuation(")")) {
        break;
      }
      bindings.push(readBinding(source, "a parameter name", "=", [",", ")"]));
      if (!source.tryPunctuation(",")) {
        source.expect(")");
        break;
      }
    }
  }
  source.endLine();
  return declared(source, start, description, { name, component, bindings });
};

const parseFusion = (
  source: Source,
  start: number,
  description: string | undefined,
): DslFusionDeclaration => {
  let name: DslWord | null = null;
  source.skipInline();
  const checkpoint = source.index;
  if (source.peek() === '"' || /[A-Za-z_$]/u.test(source.peek())) {
    const candidate = source.readName("a fusion name");
    if (source.tryPunctuation("=")) {
      name = candidate;
    } else {
      source.seek(checkpoint);
    }
  }
  const members: DslPlaceReference[] = [];
  for (;;) {
    members.push(readPlaceReference(source));
    if (!source.tryPunctuation(",")) {
      break;
    }
  }
  source.endLine();
  return declared(source, start, description, { name, members });
};

const readArc = (source: Source, side: "input" | "output"): DslArc => {
  source.skipInline();
  const start = source.index;
  let weight = 1;
  const number = source.match(numberPattern);
  if (number !== null) {
    weight = Number(number);
    if (!Number.isInteger(weight) || weight < 1) {
      throw new DslSyntaxError(
        "An arc weight is a whole number of tokens, 1 or more",
        source.range(start),
      );
    }
  }
  let type: InputArcType = "standard";
  const word = source.peekKeyword();
  if (
    (word === "read" || word === "inhibit") &&
    source.keywordPrecedesName(word)
  ) {
    const kind = source.readKeyword();
    if (side === "output") {
      throw new DslSyntaxError(
        `An output arc has no "${kind.text}" kind`,
        kind.range,
      );
    }
    type = word === "read" ? "read" : "inhibitor";
  }
  const target = readPlaceReference(source);
  return { weight, type, target, range: source.range(start) };
};

const parseArcs = (
  source: Source,
  transition: Pick<DslTransitionDeclaration, "inputs" | "outputs">,
): void => {
  source.skipInline();
  if (!source.startsWith("->")) {
    for (;;) {
      transition.inputs.push(readArc(source, "input"));
      if (!source.tryPunctuation(",")) {
        break;
      }
    }
  }
  source.skipInline();
  if (!source.startsWith("->")) {
    throw new DslSyntaxError(
      `Expected "->" between the inputs and the outputs, found ${source.describeHere()}`,
      source.hereRange(),
    );
  }
  source.advance(2);
  if (!source.atLineEnd()) {
    for (;;) {
      transition.outputs.push(readArc(source, "output"));
      if (!source.tryPunctuation(",")) {
        break;
      }
    }
  }
  source.endStatement();
};

const parseTransition = (
  context: Context,
  start: number,
  description: string | undefined,
): DslTransitionDeclaration => {
  const { source } = context;
  const name = source.readName("a transition name");
  source.expect("{");
  const transition: Declared<DslTransitionDeclaration> = {
    name,
    inputs: [],
    outputs: [],
    lambda: null,
    kernel: null,
  };
  let arcsSeen = false;
  for (;;) {
    source.skipBlank(true);
    if (source.eof) {
      throw new DslSyntaxError(
        `Transition "${name.text}" has no closing "}"`,
        name.range,
      );
    }
    if (source.tryPunctuation("}")) {
      break;
    }
    const statementStart = source.index;
    try {
      const word = source.peekKeyword();
      if (
        (word === "rate" || word === "guard" || word === "kernel") &&
        source.keywordOpensBlock(word)
      ) {
        const keyword = source.readKeyword();
        const code = source.readCodeBody();
        source.endStatement();
        if (word === "kernel") {
          if (transition.kernel !== null) {
            throw new DslSyntaxError(
              "A transition has one kernel",
              keyword.range,
            );
          }
          transition.kernel = code;
        } else {
          if (transition.lambda !== null) {
            throw new DslSyntaxError(
              "A transition has one rate or one guard",
              keyword.range,
            );
          }
          transition.lambda = {
            type: word === "rate" ? "stochastic" : "predicate",
            code,
          };
        }
      } else {
        if (arcsSeen) {
          throw new DslSyntaxError(
            "A transition has one arcs line: inputs -> outputs",
            source.hereRange(),
          );
        }
        arcsSeen = true;
        parseArcs(source, transition);
      }
    } catch (error) {
      report(context, error);
      source.recover(statementStart);
    }
  }
  source.endLine();
  return declared(source, start, description, transition);
};

const parseMetric = (
  source: Source,
  start: number,
  description: string | undefined,
): DslMetricDeclaration => {
  const name = source.readName("a metric name");
  const code = source.readCodeBody();
  source.endLine();
  return declared(source, start, description, { name, code });
};

const parseScenarioParameter = (source: Source): DslScenarioParameter => {
  const start = source.index;
  const identifier = source.readIdentifier("a parameter identifier");
  source.expect(":");
  const type = source.readIdentifier("a parameter type");
  if (!scenarioParameterTypes.has(type.text)) {
    throw new DslSyntaxError(
      `Unknown parameter type "${type.text}"; expected one of ${listOf(scenarioParameterTypes)}`,
      type.range,
    );
  }
  source.expect("=");
  const defaultValue = source.readNumber("a default value");
  source.endStatement();
  return {
    identifier,
    type: type.text as ScenarioParameter["type"],
    default: defaultValue,
    range: source.range(start),
  };
};

const parseMarking = (source: Source): DslInitialState => {
  source.expect("{");
  const entries: DslBinding[] = [];
  for (;;) {
    source.skipBlank(true);
    if (source.eof) {
      throw new DslSyntaxError(
        'The marking has no closing "}"',
        source.hereRange(),
      );
    }
    if (source.tryPunctuation("}")) {
      break;
    }
    entries.push(readBinding(source, "a place name", ":", []));
  }
  return { kind: "marking", entries };
};

const parseScenario = (
  context: Context,
  start: number,
  description: string | undefined,
): DslScenarioDeclaration => {
  const { source } = context;
  const name = source.readName("a scenario name");
  source.expect("{");
  const scenario: Declared<DslScenarioDeclaration> = {
    name,
    parameters: [],
    overrides: [],
    initial: null,
  };
  for (;;) {
    source.skipBlank(true);
    if (source.eof) {
      throw new DslSyntaxError(
        `Scenario "${name.text}" has no closing "}"`,
        name.range,
      );
    }
    if (source.tryPunctuation("}")) {
      break;
    }
    const statementStart = source.index;
    try {
      const keyword = source.readKeyword();
      switch (keyword.text) {
        case "param":
          scenario.parameters.push(parseScenarioParameter(source));
          break;
        case "override":
          scenario.overrides.push(
            readBinding(source, "a parameter variable name", "=", []),
          );
          break;
        case "initial":
        case "marking": {
          if (scenario.initial !== null) {
            throw new DslSyntaxError(
              "A scenario has one initial state: one `initial` body or one `marking`",
              keyword.range,
            );
          }
          scenario.initial =
            keyword.text === "initial"
              ? { kind: "code", code: source.readCodeBody() }
              : parseMarking(source);
          source.endStatement();
          break;
        }
        default:
          throw new DslSyntaxError(
            `Expected "param", "override", "initial" or "marking" in the scenario, found "${keyword.text}"`,
            keyword.range,
          );
      }
    } catch (error) {
      report(context, error);
      source.recover(statementStart);
    }
  }
  source.endLine();
  return declared(source, start, description, scenario);
};

/**
 * The declarations up to a `}` or the end of the text, into `scope`;
 * components, metrics and scenarios into `document`, which only the root
 * passes.
 */
function parseScopeBody(
  context: Context,
  scope: DslScope,
  document: DslDocument | null,
): void {
  const { source } = context;
  const parseComponent = (
    start: number,
    description: string | undefined,
  ): DslComponentDeclaration => {
    const name = source.readName("a component name");
    let componentSource: DslComponentDeclaration["source"] = null;
    if (source.peekKeyword() === "from") {
      source.readKeyword();
      const specStart = source.index;
      const spec = source.readString();
      const slash = spec.indexOf("/");
      if (slash <= 0 || slash === spec.length - 1) {
        throw new DslSyntaxError(
          'A component source reads "library/component"',
          source.range(specStart),
        );
      }
      componentSource = {
        library: spec.slice(0, slash),
        component: spec.slice(slash + 1),
      };
    }
    source.expect("{");
    const componentScope = emptyDslScope();
    parseScopeBody(context, componentScope, null);
    source.skipBlank(true);
    if (!source.tryPunctuation("}")) {
      throw new DslSyntaxError(
        `Component "${name.text}" has no closing "}"`,
        name.range,
      );
    }
    source.endLine();
    return declared(source, start, description, {
      ...componentScope,
      name,
      source: componentSource,
    });
  };

  for (;;) {
    source.skipBlank();
    const start = source.index;
    const description = source.readDocs();
    if (source.eof || source.peek() === "}") {
      return;
    }
    try {
      const keyword = source.readKeyword();
      switch (keyword.text) {
        case "type":
          scope.types.push(parseType(source, start, description));
          break;
        case "param":
          scope.parameters.push(parseParameter(source, start, description));
          break;
        case "dynamics":
          scope.dynamics.push(parseDynamics(source, start, description));
          break;
        case "place":
        case "port":
          scope.places.push(
            parsePlace(source, keyword.text, start, description),
          );
          break;
        case "instance":
          scope.instances.push(parseInstance(source, start, description));
          break;
        case "fuse":
          scope.fusions.push(parseFusion(source, start, description));
          break;
        case "transition":
          scope.transitions.push(parseTransition(context, start, description));
          break;
        case "component":
          if (document === null) {
            throw new DslSyntaxError(
              "A component declares no components; declare it beside this one, at the net's level",
              keyword.range,
            );
          }
          document.components.push(parseComponent(start, description));
          break;
        case "metric":
          if (document === null) {
            throw new DslSyntaxError(
              "Metrics belong to the net, after its components",
              keyword.range,
            );
          }
          document.metrics.push(parseMetric(source, start, description));
          break;
        case "scenario":
          if (document === null) {
            throw new DslSyntaxError(
              "Scenarios belong to the net, after its components",
              keyword.range,
            );
          }
          document.scenarios.push(parseScenario(context, start, description));
          break;
        case "net":
          throw new DslSyntaxError(
            '"net" opens the text and appears once',
            keyword.range,
          );
        default:
          throw new DslSyntaxError(
            `Unknown declaration "${keyword.text}"`,
            keyword.range,
          );
      }
    } catch (error) {
      report(context, error);
      source.recover(start);
    }
  }
}

type Header = Pick<DslDocument, "title" | "componentsOnly" | "description">;

/** The `net` line, when the text opens with one. */
const parseHeader = (context: Context): Header => {
  const { source } = context;
  const header: Header = { title: null, componentsOnly: false };
  source.skipBlank();
  const start = source.index;
  const description = source.readDocs();
  if (source.peekKeyword() !== "net") {
    // No header: the lines read belong to the first declaration.
    source.seek(start);
    return header;
  }
  if (description !== undefined) {
    header.description = description;
  }
  try {
    source.readKeyword();
    source.skipInline();
    if (source.peek() === '"') {
      header.title = source.readString();
    }
    if (source.peekKeyword() === "components-only") {
      source.readKeyword();
      header.componentsOnly = true;
    }
    source.endLine();
  } catch (error) {
    report(context, error);
    source.recover(start);
  }
  return header;
};

/**
 * Parses DSL text. The document holds every declaration that parsed; the
 * diagnostics, every line that did not, each with its range.
 */
export const parsePetrinautDsl = (text: string): DslParseResult => {
  const source = new Source(text);
  const context: Context = { source, diagnostics: [] };
  const document: DslDocument = {
    ...emptyDslScope(),
    ...parseHeader(context),
    range: source.range(0, text.length),
    components: [],
    metrics: [],
    scenarios: [],
  };
  for (;;) {
    parseScopeBody(context, document, document);
    if (source.eof) {
      break;
    }
    // A `}` with nothing open.
    context.diagnostics.push({
      severity: "error",
      message: 'Unexpected "}"',
      range: source.range(source.index, source.index + 1),
    });
    source.index += 1;
  }
  return { document, diagnostics: context.diagnostics };
};
