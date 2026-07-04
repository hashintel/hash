/**
 * Compiles HIR functions to JavaScript source.
 *
 * Two emitters live here:
 *
 * - A generic expression emitter producing functions with the same signature
 *   as the legacy Babel-compiled user code (`(tokensByPlace, parameters) =>
 *   result`), with distributions constructed through an injected `__dist`
 *   runtime instead of source-string injection.
 *
 * - A buffer-native dynamics emitter that compiles `tokens.map((token) =>
 *   ({ ... }))` bodies straight to a `Float64Array` loop with no per-token
 *   object allocation — matching the engine's `DifferentialEquationFn`
 *   signature directly.
 *
 * Emission never throws on well-formed HIR; the buffer-native emitter returns
 * `null` when the function shape doesn't fit the fast path so callers can fall
 * back.
 */
import { foldHir } from "./analyze";

import type { HirExpr, HirFunction } from "./hir";
import type { HirTokenElementInfo } from "./surface-context";

/** Names the emitted code relies on; user locals are renamed away from them. */
const RESERVED_NAMES = [
  "__dist",
  "__params",
  "currentState",
  "dimensions",
  "numberOfTokens",
  "result",
  "Math",
  "Infinity",
  "NaN",
];

class NameAllocator {
  private readonly used: Set<string>;

  constructor(used: Iterable<string>) {
    this.used = new Set(used);
  }

  child(): NameAllocator {
    return new NameAllocator(this.used);
  }

  allocate(preferred: string): string {
    let name = preferred;
    let suffix = 2;
    while (this.used.has(name)) {
      name = `${preferred}_${suffix}`;
      suffix += 1;
    }
    this.used.add(name);
    return name;
  }
}

type EmitScope = {
  /** HIR local name → emitted JS name. */
  names: Map<string, string>;
  allocator: NameAllocator;
};

function childScope(scope: EmitScope): EmitScope {
  return { names: new Map(scope.names), allocator: scope.allocator.child() };
}

function quoteKey(key: string): string {
  return JSON.stringify(key);
}

function emitNumber(value: number, raw: string): string {
  // Preserve the exact source spelling when it still parses to the same
  // value; otherwise round-trip through String (lossless for doubles).
  if (
    Number(raw) === value ||
    (Number.isNaN(Number(raw)) && Number.isNaN(value))
  ) {
    return Number.isNaN(Number(raw)) ? String(value) : raw;
  }
  if (value === Infinity) {
    return "Infinity";
  }
  if (value === -Infinity) {
    return "-Infinity";
  }
  return String(value);
}

function emitExpr(expr: HirExpr, scope: EmitScope): string {
  switch (expr.kind) {
    case "numberLit":
      return emitNumber(expr.value, expr.raw);
    case "boolLit":
      return expr.value ? "true" : "false";
    case "constant":
      switch (expr.name) {
        case "PI":
          return "Math.PI";
        case "E":
          return "Math.E";
        case "Infinity":
          return "Infinity";
        case "NaN":
          return "NaN";
      }
      break;
    case "localRef":
      return scope.names.get(expr.name) ?? expr.name;
    case "paramRef":
      return `__params[${quoteKey(expr.name)}]`;
    case "fieldAccess":
      return `${emitExpr(expr.target, scope)}[${quoteKey(expr.field)}]`;
    case "indexAccess":
      return `${emitExpr(expr.target, scope)}[${emitExpr(expr.index, scope)}]`;
    case "length":
      return `${emitExpr(expr.target, scope)}.length`;
    case "unary":
      return `(${expr.op}${emitExpr(expr.operand, scope)})`;
    case "binary": {
      const op = expr.op === "==" ? "===" : expr.op === "!=" ? "!==" : expr.op;
      return `(${emitExpr(expr.left, scope)} ${op} ${emitExpr(expr.right, scope)})`;
    }
    case "cond":
      return `(${emitExpr(expr.condition, scope)} ? ${emitExpr(expr.thenBranch, scope)} : ${emitExpr(expr.elseBranch, scope)})`;
    case "let":
      // `let` only appears as a function/callback body; those emit blocks.
      // eslint-disable-next-line no-use-before-define -- mutual recursion
      return `(() => ${emitBody(expr, scope)})()`;
    case "mathCall":
      return `Math.${expr.fn}(${expr.args
        .map((argument) => emitExpr(argument, scope))
        .join(", ")})`;
    case "recordLit":
      return `{ ${expr.entries
        .map(
          (entry) => `${quoteKey(entry.key)}: ${emitExpr(entry.value, scope)}`,
        )
        .join(", ")} }`;
    case "arrayLit":
      return `[${expr.elements
        .map((element) => emitExpr(element, scope))
        .join(", ")}]`;
    case "arrayMap": {
      const bodyScope = childScope(scope);
      const paramName = bodyScope.allocator.allocate(expr.param.name);
      bodyScope.names.set(expr.param.name, paramName);
      let params = paramName;
      if (expr.indexParam) {
        const indexName = bodyScope.allocator.allocate(expr.indexParam.name);
        bodyScope.names.set(expr.indexParam.name, indexName);
        params = `${paramName}, ${indexName}`;
      }
      // eslint-disable-next-line no-use-before-define -- mutual recursion
      return `${emitExpr(expr.target, scope)}.map((${params}) => ${emitBody(expr.body, bodyScope)})`;
    }
    case "distribution":
      return `__dist.${expr.dist}(${expr.args
        .map((argument) => emitExpr(argument, scope))
        .join(", ")})`;
    case "distributionMap": {
      const bodyScope = childScope(scope);
      const paramName = bodyScope.allocator.allocate(expr.param.name);
      bodyScope.names.set(expr.param.name, paramName);
      // eslint-disable-next-line no-use-before-define -- mutual recursion
      return `__dist.map(${emitExpr(expr.base, scope)}, (${paramName}) => ${emitBody(expr.body, bodyScope)})`;
    }
  }
  throw new Error("Unreachable HIR node in emitExpr");
}

/** Emits a callback/function body: a block for `let`, an expression otherwise. */
function emitBody(expr: HirExpr, scope: EmitScope): string {
  if (expr.kind !== "let") {
    // Parenthesize object literals so they aren't parsed as blocks.
    const emitted = emitExpr(expr, scope);
    return expr.kind === "recordLit" ? `(${emitted})` : emitted;
  }
  const bodyScope = childScope(scope);
  const statements: string[] = [];
  for (const binding of expr.bindings) {
    const value = emitExpr(binding.value, bodyScope);
    const name = bodyScope.allocator.allocate(binding.name);
    bodyScope.names.set(binding.name, name);
    statements.push(`const ${name} = ${value};`);
  }
  statements.push(`return ${emitExpr(expr.body, bodyScope)};`);
  return `{ ${statements.join(" ")} }`;
}

/**
 * Emits a user-function-shaped JavaScript expression:
 * `(tokens, parameters) => result`.
 *
 * The emitted code may reference `__dist` (distribution runtime) and
 * `__params` (the parameters object); callers bind both when instantiating.
 * The declared `parameters` parameter is accepted for signature compatibility
 * but reads go through `__params` — instantiators alias them.
 */
export function emitUserFunctionJs(fn: HirFunction): string {
  const folded = foldHir(fn.body);
  const allocator = new NameAllocator(RESERVED_NAMES);
  const scope: EmitScope = { names: new Map(), allocator };

  const paramNames = fn.params.map((parameter) =>
    allocator.allocate(parameter.name),
  );
  for (const [index, parameter] of fn.params.entries()) {
    scope.names.set(parameter.name, paramNames[index]!);
  }

  // The second user parameter *is* the parameters object: alias __params to
  // it so emitted `__params[...]` reads resolve to the call argument.
  const signature = paramNames.join(", ");
  const statements: string[] = [];
  if (fn.params.length > 1) {
    statements.push(`  const __params = ${paramNames[1]!};`);
  }

  if (folded.kind === "let") {
    const bodyScope = childScope(scope);
    for (const binding of folded.bindings) {
      const value = emitExpr(binding.value, bodyScope);
      const name = bodyScope.allocator.allocate(binding.name);
      bodyScope.names.set(binding.name, name);
      statements.push(`  const ${name} = ${value};`);
    }
    statements.push(`  return ${emitExpr(folded.body, bodyScope)};`);
    return [`(${signature}) => {`, ...statements, `}`].join("\n");
  }

  statements.push(`  return ${emitExpr(folded, scope)};`);
  return [`(${signature}) => {`, ...statements, `}`].join("\n");
}

// ---------------------------------------------------------------------------
// Buffer-native dynamics
// ---------------------------------------------------------------------------

/** Internal bail signal: the function doesn't fit the fast path. */
class BailError extends Error {}

type BufferEmitContext = {
  tokensName: string;
  mapParamName: string;
  indexParamName: string | null;
  elementIndex: Map<string, number>;
  elementType: Map<string, HirTokenElementInfo["type"]>;
  scope: EmitScope;
};

function emitBufferExpr(expr: HirExpr, context: BufferEmitContext): string {
  switch (expr.kind) {
    case "numberLit":
      return emitNumber(expr.value, expr.raw);
    case "boolLit":
      return expr.value ? "true" : "false";
    case "constant":
      return emitExpr(expr, context.scope);
    case "localRef": {
      if (expr.name === context.indexParamName) {
        return "__i";
      }
      if (
        expr.name === context.mapParamName ||
        expr.name === context.tokensName
      ) {
        // A token record / the token array escaping as a value (e.g. being
        // returned or stored) cannot be scalarized.
        throw new BailError();
      }
      return context.scope.names.get(expr.name) ?? expr.name;
    }
    case "paramRef":
      return `__params[${quoteKey(expr.name)}]`;
    case "fieldAccess": {
      // eslint-disable-next-line no-use-before-define -- mutual recursion
      const read = emitBufferTokenRead(expr, context);
      if (read !== null) {
        return read;
      }
      throw new BailError();
    }
    case "indexAccess":
      throw new BailError();
    case "length": {
      if (
        expr.target.kind === "localRef" &&
        expr.target.name === context.tokensName
      ) {
        return "numberOfTokens";
      }
      throw new BailError();
    }
    case "unary":
      return `(${expr.op}${emitBufferExpr(expr.operand, context)})`;
    case "binary": {
      const op = expr.op === "==" ? "===" : expr.op === "!=" ? "!==" : expr.op;
      return `(${emitBufferExpr(expr.left, context)} ${op} ${emitBufferExpr(expr.right, context)})`;
    }
    case "cond":
      return `(${emitBufferExpr(expr.condition, context)} ? ${emitBufferExpr(expr.thenBranch, context)} : ${emitBufferExpr(expr.elseBranch, context)})`;
    case "mathCall":
      return `Math.${expr.fn}(${expr.args
        .map((argument) => emitBufferExpr(argument, context))
        .join(", ")})`;
    case "let":
    case "recordLit":
    case "arrayLit":
    case "arrayMap":
    case "distribution":
    case "distributionMap":
      throw new BailError();
  }
}

/**
 * Emits a read of `token.field` / `tokens[j].field` against the packed
 * buffer, or `null` when the access is not a token read.
 */
function emitBufferTokenRead(
  expr: Extract<HirExpr, { kind: "fieldAccess" }>,
  context: BufferEmitContext,
): string | null {
  const emitRead = (base: string, field: string): string => {
    const index = context.elementIndex.get(field);
    if (index === undefined) {
      throw new BailError();
    }
    const read = `currentState[${base} + ${index}]`;
    return context.elementType.get(field) === "boolean"
      ? `(${read} !== 0)`
      : read;
  };

  // token.field — the map parameter.
  if (
    expr.target.kind === "localRef" &&
    expr.target.name === context.mapParamName
  ) {
    return emitRead("__base", expr.field);
  }
  // tokens[j].field — cross-token access.
  if (
    expr.target.kind === "indexAccess" &&
    expr.target.target.kind === "localRef" &&
    expr.target.target.name === context.tokensName
  ) {
    const index = emitBufferExpr(expr.target.index, context);
    return emitRead(`(${index}) * dimensions`, expr.field);
  }
  return null;
}

/**
 * Compiles a dynamics function to a buffer-native derivative kernel:
 *
 *   (__params) => (currentState, dimensions, numberOfTokens) => Float64Array
 *
 * Returns `null` when the body doesn't fit the
 * `tokens.map((token, index?) => ({ ...derivatives }))` shape (callers fall
 * back to the object-API path). Discrete attributes always get derivative 0,
 * matching the engine's behaviour.
 */
export function emitBufferDynamicsJs(
  fn: HirFunction,
  elements: readonly HirTokenElementInfo[],
): string | null {
  const tokensParam = fn.params[0];
  if (!tokensParam) {
    return null;
  }

  let folded = foldHir(fn.body);
  // Top-level bindings before the map (e.g. `const mu = parameters.g;`) are
  // token-independent — hoist them before the loop.
  let outerBindings: Extract<HirExpr, { kind: "let" }>["bindings"] = [];
  if (folded.kind === "let") {
    outerBindings = folded.bindings;
    folded = folded.body;
  }
  if (
    folded.kind !== "arrayMap" ||
    folded.target.kind !== "localRef" ||
    folded.target.name !== tokensParam.name
  ) {
    return null;
  }

  const mapBody = folded.body;
  const bindings = mapBody.kind === "let" ? mapBody.bindings : [];
  const record = mapBody.kind === "let" ? mapBody.body : mapBody;
  if (record.kind !== "recordLit") {
    return null;
  }

  const context: BufferEmitContext = {
    tokensName: tokensParam.name,
    mapParamName: folded.param.name,
    indexParamName: folded.indexParam?.name ?? null,
    elementIndex: new Map(
      elements.map((element, index) => [element.name, index]),
    ),
    elementType: new Map(
      elements.map((element) => [element.name, element.type]),
    ),
    scope: {
      names: new Map(),
      allocator: new NameAllocator([...RESERVED_NAMES, "__base", "__i"]),
    },
  };

  try {
    const statements: string[] = [];
    // Hoisted before the loop: may read parameters/constants/token counts
    // but never token attributes (there is no current token yet).
    const hoisted: string[] = [];
    const outerContext: BufferEmitContext = {
      ...context,
      mapParamName: " ",
      indexParamName: null,
    };
    for (const binding of outerBindings) {
      const value = emitBufferExpr(binding.value, outerContext);
      const name = context.scope.allocator.allocate(binding.name);
      context.scope.names.set(binding.name, name);
      hoisted.push(`  const ${name} = ${value};`);
    }

    for (const binding of bindings) {
      const value = emitBufferExpr(binding.value, context);
      const name = context.scope.allocator.allocate(binding.name);
      context.scope.names.set(binding.name, name);
      statements.push(`    const ${name} = ${value};`);
    }

    for (const entry of record.entries) {
      const index = context.elementIndex.get(entry.key);
      const type = context.elementType.get(entry.key);
      // Unknown keys are ignored and discrete attributes are forced to a zero
      // derivative by the engine — skipping them reproduces that exactly
      // (expressions are pure, so skipping loses no effects).
      if (index === undefined || type !== "real") {
        continue;
      }
      statements.push(
        `    result[__base + ${index}] = ${emitBufferExpr(entry.value, context)};`,
      );
    }

    return [
      `(__params) => (currentState, dimensions, numberOfTokens) => {`,
      `  "use strict";`,
      `  if (dimensions !== ${elements.length}) {`,
      `    throw new Error("Expected ${elements.length} dimensions, got " + dimensions);`,
      `  }`,
      ...hoisted,
      `  const result = new Float64Array(numberOfTokens * dimensions);`,
      `  for (let __i = 0; __i < numberOfTokens; __i++) {`,
      `    const __base = __i * dimensions;`,
      ...statements,
      `  }`,
      `  return result;`,
      `}`,
    ].join("\n");
  } catch (error) {
    if (error instanceof BailError) {
      return null;
    }
    throw error;
  }
}
