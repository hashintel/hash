/**
 * Compiles HIR functions to JavaScript source.
 *
 * This object-convention emitter is kept as a reference/test backend. Runtime
 * simulation uses `emit-buffer-js.ts` artifacts only; unsupported buffer shapes
 * are compile errors rather than fallback calls into this module.
 */
import { foldHir } from "./analyze";

import type { HirExpr, HirFunction } from "./hir";

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
    case "stringLit":
      return JSON.stringify(expr.value);
    case "stringCall":
      return `${emitExpr(expr.target, scope)}.${expr.fn}(${emitExpr(expr.argument, scope)})`;
    case "uuidGenerate":
      // The engine's kernel-output encoder resolves this sentinel by drawing
      // from the seeded RNG in element order.
      return `({ __petrinautUuid: "generate" })`;
    case "uuidFrom":
      return `({ __petrinautUuid: "from", value: ${emitExpr(expr.operand, scope)} })`;
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
    case "arrayReduce": {
      const bodyScope = childScope(scope);
      const accName = bodyScope.allocator.allocate(expr.accParam.name);
      bodyScope.names.set(expr.accParam.name, accName);
      const paramName = bodyScope.allocator.allocate(expr.param.name);
      bodyScope.names.set(expr.param.name, paramName);
      let params = `${accName}, ${paramName}`;
      if (expr.indexParam) {
        const indexName = bodyScope.allocator.allocate(expr.indexParam.name);
        bodyScope.names.set(expr.indexParam.name, indexName);
        params = `${params}, ${indexName}`;
      }
      // eslint-disable-next-line no-use-before-define -- mutual recursion
      return `${emitExpr(expr.target, scope)}.reduce((${params}) => ${emitBody(expr.body, bodyScope)}, ${emitExpr(expr.initial, scope)})`;
    }
    case "arrayConcat":
      return `${emitExpr(expr.left, scope)}.concat(${emitExpr(expr.right, scope)})`;
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
