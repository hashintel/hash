import ts from "typescript";

import type { SDCPN, Transition } from "../../core/types/sdcpn";

/**
 * Context for SymPy compilation, derived from the SDCPN model.
 * Tells the compiler which identifiers are parameters vs. token fields.
 */
export type SymPyCompilationContext = {
  parameterNames: Set<string>;
  /** Maps place name to its token field names */
  placeTokenFields: Map<string, string[]>;
  constructorFnName: string;
};

/**
 * Builds a SymPyCompilationContext from an SDCPN model for a given transition.
 */
export function buildContextForTransition(
  sdcpn: SDCPN,
  transition: Transition,
  constructorFnName: string,
): SymPyCompilationContext {
  const parameterNames = new Set(
    sdcpn.parameters.map((param) => param.variableName),
  );
  const placeTokenFields = new Map<string, string[]>();

  const placeById = new Map(sdcpn.places.map((pl) => [pl.id, pl]));
  const colorById = new Map(sdcpn.types.map((ct) => [ct.id, ct]));

  for (const arc of transition.inputArcs) {
    const place = placeById.get(arc.placeId);
    if (!place?.colorId) {
      continue;
    }
    const color = colorById.get(place.colorId);
    if (!color) {
      continue;
    }
    placeTokenFields.set(
      place.name,
      color.elements.map((el) => el.name),
    );
  }

  return { parameterNames, placeTokenFields, constructorFnName };
}

/**
 * Builds a SymPyCompilationContext from an SDCPN model for a differential equation.
 */
export function buildContextForDifferentialEquation(
  sdcpn: SDCPN,
  colorId: string,
): SymPyCompilationContext {
  const parameterNames = new Set(
    sdcpn.parameters.map((param) => param.variableName),
  );
  const placeTokenFields = new Map<string, string[]>();

  const color = sdcpn.types.find((ct) => ct.id === colorId);
  if (color) {
    // DE operates on tokens of its color type
    placeTokenFields.set(
      color.name,
      color.elements.map((el) => el.name),
    );
  }

  return { parameterNames, placeTokenFields, constructorFnName: "Dynamics" };
}

export type SymPyResult =
  | { ok: true; sympyCode: string }
  | { ok: false; error: string; start: number; length: number };

/** Shorthand for building an error result with position from a TS AST node. */
function err(
  error: string,
  node: ts.Node,
  sourceFile: ts.SourceFile,
): SymPyResult & { ok: false } {
  return {
    ok: false,
    error,
    start: node.getStart(sourceFile),
    length: node.getWidth(sourceFile),
  };
}

/** Error result for cases where no specific node is available. */
function errNoPos(error: string): SymPyResult & { ok: false } {
  return { ok: false, error, start: 0, length: 0 };
}

/**
 * Compiles a Petrinaut TypeScript expression to SymPy Python code.
 *
 * Expects code following the pattern:
 *   `export default ConstructorFn((params...) => expression)`
 *
 * Only a restricted subset of TypeScript is supported — pure expressions
 * with arithmetic, Math functions, parameter/token access, and distributions.
 * Anything outside this subset is rejected with a diagnostic.
 *
 * @param code - The TypeScript expression code string
 * @param context - Compilation context with parameter names and token fields
 * @returns Either `{ ok: true, sympyCode }` or `{ ok: false, error }`
 */
export function compileToSymPy(
  code: string,
  context: SymPyCompilationContext,
): SymPyResult {
  const sourceFile = ts.createSourceFile(
    "input.ts",
    code,
    ts.ScriptTarget.ES2015,
    true,
  );

  // Find the default export
  const exportAssignment = sourceFile.statements.find(
    (stmt): stmt is ts.ExportAssignment =>
      ts.isExportAssignment(stmt) && !stmt.isExportEquals,
  );

  if (!exportAssignment) {
    // Try export default as ExpressionStatement pattern
    const exportDefault = sourceFile.statements.find((stmt) => {
      if (ts.isExportAssignment(stmt)) {
        return true;
      }
      // Handle "export default X(...)" which parses as ExportAssignment
      return false;
    });
    if (!exportDefault) {
      return errNoPos("No default export found");
    }
  }

  const exportExpr = exportAssignment!.expression;

  // Expect ConstructorFn(...)
  if (!ts.isCallExpression(exportExpr)) {
    return err(
      `Expected ${context.constructorFnName}(...), got ${ts.SyntaxKind[exportExpr.kind]}`,
      exportExpr,
      sourceFile,
    );
  }

  const callee = exportExpr.expression;
  if (!ts.isIdentifier(callee) || callee.text !== context.constructorFnName) {
    return err(
      `Expected ${context.constructorFnName}(...), got ${callee.getText(sourceFile)}(...)`,
      callee,
      sourceFile,
    );
  }

  if (exportExpr.arguments.length !== 1) {
    return err(
      `${context.constructorFnName} expects exactly one argument`,
      exportExpr,
      sourceFile,
    );
  }

  const arg = exportExpr.arguments[0]!;

  // The argument should be an arrow function or function expression
  if (!ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg)) {
    return err(
      `Expected a function argument, got ${ts.SyntaxKind[arg.kind]}`,
      arg,
      sourceFile,
    );
  }

  // Extract parameter names for the inner function
  const localBindings = new Map<string, string>();
  const innerParams = extractFunctionParams(arg, sourceFile);

  // Compile the body
  const body = arg.body;

  if (ts.isBlock(body)) {
    return compileBlock(body, context, localBindings, sourceFile);
  }

  // Expression body — emit directly
  const result = emitSymPy(
    body,
    context,
    localBindings,
    innerParams,
    sourceFile,
  );
  if (!result.ok) return result;
  return { ok: true, sympyCode: result.sympyCode };
}

function extractFunctionParams(
  fn: ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
): string[] {
  return fn.parameters.map((p) => p.name.getText(sourceFile));
}

function compileBlock(
  block: ts.Block,
  context: SymPyCompilationContext,
  localBindings: Map<string, string>,
  sourceFile: ts.SourceFile,
): SymPyResult {
  const lines: string[] = [];

  for (const stmt of block.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!decl.initializer) {
          return err(
            "Variable declaration without initializer",
            decl,
            sourceFile,
          );
        }
        if (stmt.declarationList.flags & ts.NodeFlags.Let) {
          return err(
            "'let' declarations are not supported, use 'const'",
            stmt,
            sourceFile,
          );
        }
        const name = decl.name.getText(sourceFile);
        const valueResult = emitSymPy(
          decl.initializer,
          context,
          localBindings,
          [],
          sourceFile,
        );
        if (!valueResult.ok) return valueResult;
        localBindings.set(name, valueResult.sympyCode);
        lines.push(`${name} = ${valueResult.sympyCode}`);
      }
    } else if (ts.isReturnStatement(stmt)) {
      if (!stmt.expression) {
        return err("Empty return statement", stmt, sourceFile);
      }
      const result = emitSymPy(
        stmt.expression,
        context,
        localBindings,
        [],
        sourceFile,
      );
      if (!result.ok) return result;
      lines.push(result.sympyCode);
    } else if (ts.isExpressionStatement(stmt)) {
      // Allow comments parsed as expression statements, skip them
      continue;
    } else {
      return err(
        `Unsupported statement: ${ts.SyntaxKind[stmt.kind]}`,
        stmt,
        sourceFile,
      );
    }
  }

  if (lines.length === 0) {
    return err("Empty function body", block, sourceFile);
  }

  return { ok: true, sympyCode: lines[lines.length - 1]! };
}

/**
 * Compiles `collection.map(callback)` to a Python list comprehension.
 *
 * Handles two callback parameter styles:
 * - Destructured: `({ x, y }) => ...` → binds each field as `_iter_x`, `_iter_y`
 * - Simple identifier: `(token) => ...` → binds as-is
 *
 * Emits: `[<body> for _iter in <collection>]`
 */
function compileMapCall(
  collection: ts.Expression,
  callback: ts.ArrowFunction | ts.FunctionExpression,
  context: SymPyCompilationContext,
  outerBindings: Map<string, string>,
  innerParams: string[],
  sourceFile: ts.SourceFile,
): SymPyResult {
  const iterVar = "_iter";
  const mapBindings = new Map(outerBindings);

  const param = callback.parameters[0];
  if (param) {
    const paramName = param.name;
    if (ts.isObjectBindingPattern(paramName)) {
      // Destructured: ({ x, y, ... }) => ...
      // Each field becomes a symbol like _iter_x, _iter_y
      for (const element of paramName.elements) {
        const fieldName = element.name.getText(sourceFile);
        mapBindings.set(fieldName, `${iterVar}_${fieldName}`);
      }
    } else {
      // Simple identifier: (token) => ...
      mapBindings.set(paramName.getText(sourceFile), iterVar);
    }
  }

  // Compile the body
  const body = callback.body;
  let bodyResult: SymPyResult;
  if (ts.isBlock(body)) {
    bodyResult = compileBlock(body, context, mapBindings, sourceFile);
  } else {
    bodyResult = emitSymPy(body, context, mapBindings, innerParams, sourceFile);
  }
  if (!bodyResult.ok) return bodyResult;

  // Compile the collection expression
  const collectionResult = emitSymPy(
    collection,
    context,
    outerBindings,
    innerParams,
    sourceFile,
  );
  if (!collectionResult.ok) return collectionResult;

  return {
    ok: true,
    sympyCode: `[${bodyResult.sympyCode} for ${iterVar} in ${collectionResult.sympyCode}]`,
  };
}

const MATH_FUNCTION_MAP: Record<string, string> = {
  cos: "sp.cos",
  sin: "sp.sin",
  tan: "sp.tan",
  acos: "sp.acos",
  asin: "sp.asin",
  atan: "sp.atan",
  atan2: "sp.atan2",
  sqrt: "sp.sqrt",
  log: "sp.log",
  exp: "sp.exp",
  abs: "sp.Abs",
  floor: "sp.floor",
  ceil: "sp.ceiling",
  pow: "sp.Pow",
  min: "sp.Min",
  max: "sp.Max",
};

const MATH_CONSTANT_MAP: Record<string, string> = {
  PI: "sp.pi",
  E: "sp.E",
  Infinity: "sp.oo",
};

function emitSymPy(
  node: ts.Node,
  context: SymPyCompilationContext,
  localBindings: Map<string, string>,
  innerParams: string[],
  sourceFile: ts.SourceFile,
): SymPyResult {
  // Numeric literal
  if (ts.isNumericLiteral(node)) {
    return { ok: true, sympyCode: node.text };
  }

  // String literal — not supported in symbolic math
  if (ts.isStringLiteral(node)) {
    return err(
      "String literals are not supported in symbolic expressions",
      node,
      sourceFile,
    );
  }

  // Boolean literals
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return { ok: true, sympyCode: "True" };
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return { ok: true, sympyCode: "False" };
  }

  // Identifier
  if (ts.isIdentifier(node)) {
    const name = node.text;
    if (name === "Infinity") return { ok: true, sympyCode: "sp.oo" };
    if (localBindings.has(name)) {
      return { ok: true, sympyCode: localBindings.get(name)! };
    }
    if (context.parameterNames.has(name)) {
      return { ok: true, sympyCode: name };
    }
    // Could be a destructured token field or function param
    return { ok: true, sympyCode: name };
  }

  // Parenthesized expression
  if (ts.isParenthesizedExpression(node)) {
    const inner = emitSymPy(
      node.expression,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
    if (!inner.ok) return inner;
    return { ok: true, sympyCode: `(${inner.sympyCode})` };
  }

  // Prefix unary expression (-x, !x)
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = emitSymPy(
      node.operand,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
    if (!operand.ok) return operand;

    switch (node.operator) {
      case ts.SyntaxKind.MinusToken:
        return { ok: true, sympyCode: `-(${operand.sympyCode})` };
      case ts.SyntaxKind.ExclamationToken:
        return { ok: true, sympyCode: `sp.Not(${operand.sympyCode})` };
      case ts.SyntaxKind.PlusToken:
        return operand;
      default:
        return err(
          `Unsupported prefix operator: ${ts.SyntaxKind[node.operator]}`,
          node,
          sourceFile,
        );
    }
  }

  // Binary expression
  if (ts.isBinaryExpression(node)) {
    const left = emitSymPy(
      node.left,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
    if (!left.ok) return left;
    const right = emitSymPy(
      node.right,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
    if (!right.ok) return right;

    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken:
        return {
          ok: true,
          sympyCode: `${left.sympyCode} + ${right.sympyCode}`,
        };
      case ts.SyntaxKind.MinusToken:
        return {
          ok: true,
          sympyCode: `${left.sympyCode} - ${right.sympyCode}`,
        };
      case ts.SyntaxKind.AsteriskToken:
        return {
          ok: true,
          sympyCode: `${left.sympyCode} * ${right.sympyCode}`,
        };
      case ts.SyntaxKind.SlashToken:
        return {
          ok: true,
          sympyCode: `${left.sympyCode} / ${right.sympyCode}`,
        };
      case ts.SyntaxKind.AsteriskAsteriskToken:
        return {
          ok: true,
          sympyCode: `${left.sympyCode}**${right.sympyCode}`,
        };
      case ts.SyntaxKind.PercentToken:
        return {
          ok: true,
          sympyCode: `sp.Mod(${left.sympyCode}, ${right.sympyCode})`,
        };
      case ts.SyntaxKind.LessThanToken:
        return {
          ok: true,
          sympyCode: `${left.sympyCode} < ${right.sympyCode}`,
        };
      case ts.SyntaxKind.LessThanEqualsToken:
        return {
          ok: true,
          sympyCode: `${left.sympyCode} <= ${right.sympyCode}`,
        };
      case ts.SyntaxKind.GreaterThanToken:
        return {
          ok: true,
          sympyCode: `${left.sympyCode} > ${right.sympyCode}`,
        };
      case ts.SyntaxKind.GreaterThanEqualsToken:
        return {
          ok: true,
          sympyCode: `${left.sympyCode} >= ${right.sympyCode}`,
        };
      case ts.SyntaxKind.EqualsEqualsToken:
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
        return {
          ok: true,
          sympyCode: `sp.Eq(${left.sympyCode}, ${right.sympyCode})`,
        };
      case ts.SyntaxKind.ExclamationEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
        return {
          ok: true,
          sympyCode: `sp.Ne(${left.sympyCode}, ${right.sympyCode})`,
        };
      case ts.SyntaxKind.AmpersandAmpersandToken:
        return {
          ok: true,
          sympyCode: `sp.And(${left.sympyCode}, ${right.sympyCode})`,
        };
      case ts.SyntaxKind.BarBarToken:
        return {
          ok: true,
          sympyCode: `sp.Or(${left.sympyCode}, ${right.sympyCode})`,
        };
      default:
        return err(
          `Unsupported binary operator: ${node.operatorToken.getText(sourceFile)}`,
          node.operatorToken,
          sourceFile,
        );
    }
  }

  // Conditional (ternary) expression
  if (ts.isConditionalExpression(node)) {
    const condition = emitSymPy(
      node.condition,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
    if (!condition.ok) return condition;
    const whenTrue = emitSymPy(
      node.whenTrue,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
    if (!whenTrue.ok) return whenTrue;
    const whenFalse = emitSymPy(
      node.whenFalse,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
    if (!whenFalse.ok) return whenFalse;
    return {
      ok: true,
      sympyCode: `sp.Piecewise((${whenTrue.sympyCode}, ${condition.sympyCode}), (${whenFalse.sympyCode}, True))`,
    };
  }

  // Property access: parameters.x, tokens.Place[0].field, Math.PI
  if (ts.isPropertyAccessExpression(node)) {
    const propName = node.name.text;

    // Math constants: Math.PI, Math.E
    if (ts.isIdentifier(node.expression) && node.expression.text === "Math") {
      const constant = MATH_CONSTANT_MAP[propName];
      if (constant) return { ok: true, sympyCode: constant };
      // Math.method will be handled as part of a CallExpression
      // Return a placeholder that the call expression handler will use
      return { ok: true, sympyCode: `Math.${propName}` };
    }

    // parameters.x
    if (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "parameters"
    ) {
      return { ok: true, sympyCode: propName };
    }

    // tokens.Place[0].field — handle the chain
    // First check: something.field where something is an element access
    if (ts.isElementAccessExpression(node.expression)) {
      // e.g., tokens.Space[0].x
      const elemAccess = node.expression;
      if (ts.isPropertyAccessExpression(elemAccess.expression)) {
        const placePropAccess = elemAccess.expression;
        if (
          ts.isIdentifier(placePropAccess.expression) &&
          placePropAccess.expression.text === "tokens"
        ) {
          const placeName = placePropAccess.name.text;
          const indexExpr = elemAccess.argumentExpression;
          const indexText = indexExpr.getText(sourceFile);
          return {
            ok: true,
            sympyCode: `${placeName}_${indexText}_${propName}`,
          };
        }
      }
    }

    // Generic property access — emit as dot access
    const obj = emitSymPy(
      node.expression,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
    if (!obj.ok) return obj;
    return { ok: true, sympyCode: `${obj.sympyCode}_${propName}` };
  }

  // Element access: tokens.Place[0], arr[i]
  if (ts.isElementAccessExpression(node)) {
    const obj = emitSymPy(
      node.expression,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
    if (!obj.ok) return obj;
    const index = emitSymPy(
      node.argumentExpression,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
    if (!index.ok) return index;
    return { ok: true, sympyCode: `${obj.sympyCode}_${index.sympyCode}` };
  }

  // Call expression: Math.cos(x), Math.hypot(a, b), Distribution.Gaussian(m, s)
  if (ts.isCallExpression(node)) {
    const callee = node.expression;

    // Math.fn(...)
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "Math"
    ) {
      const fnName = callee.name.text;

      // Special case: Math.hypot(a, b) -> sp.sqrt(a**2 + b**2)
      if (fnName === "hypot") {
        const args: string[] = [];
        for (const a of node.arguments) {
          const r = emitSymPy(
            a,
            context,
            localBindings,
            innerParams,
            sourceFile,
          );
          if (!r.ok) return r;
          args.push(r.sympyCode);
        }
        const sumOfSquares = args.map((a) => `(${a})**2`).join(" + ");
        return { ok: true, sympyCode: `sp.sqrt(${sumOfSquares})` };
      }

      // Special case: Math.pow(a, b) -> a**b
      if (fnName === "pow" && node.arguments.length === 2) {
        const base = emitSymPy(
          node.arguments[0]!,
          context,
          localBindings,
          innerParams,
          sourceFile,
        );
        if (!base.ok) return base;
        const exp = emitSymPy(
          node.arguments[1]!,
          context,
          localBindings,
          innerParams,
          sourceFile,
        );
        if (!exp.ok) return exp;
        return {
          ok: true,
          sympyCode: `(${base.sympyCode})**(${exp.sympyCode})`,
        };
      }

      const sympyFn = MATH_FUNCTION_MAP[fnName];
      if (!sympyFn) {
        return err(
          `Unsupported Math function: Math.${fnName}`,
          callee,
          sourceFile,
        );
      }

      const args: string[] = [];
      for (const a of node.arguments) {
        const r = emitSymPy(a, context, localBindings, innerParams, sourceFile);
        if (!r.ok) return r;
        args.push(r.sympyCode);
      }
      return { ok: true, sympyCode: `${sympyFn}(${args.join(", ")})` };
    }

    // Distribution.Gaussian(m, s), Distribution.Uniform(a, b), Distribution.Lognormal(mu, sigma)
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "Distribution"
    ) {
      const distName = callee.name.text;
      const args: string[] = [];
      for (const a of node.arguments) {
        const r = emitSymPy(a, context, localBindings, innerParams, sourceFile);
        if (!r.ok) return r;
        args.push(r.sympyCode);
      }

      switch (distName) {
        case "Gaussian":
          return {
            ok: true,
            sympyCode: `sp.stats.Normal('X', ${args.join(", ")})`,
          };
        case "Uniform":
          return {
            ok: true,
            sympyCode: `sp.stats.Uniform('X', ${args.join(", ")})`,
          };
        case "Lognormal":
          return {
            ok: true,
            sympyCode: `sp.stats.LogNormal('X', ${args.join(", ")})`,
          };
        default:
          return err(
            `Unsupported distribution: Distribution.${distName}`,
            callee,
            sourceFile,
          );
      }
    }

    // Global built-in functions: Boolean(expr), Number(expr)
    if (ts.isIdentifier(callee)) {
      if (callee.text === "Boolean" && node.arguments.length === 1) {
        const arg = emitSymPy(
          node.arguments[0]!,
          context,
          localBindings,
          innerParams,
          sourceFile,
        );
        if (!arg.ok) return arg;
        return { ok: true, sympyCode: `sp.Ne(${arg.sympyCode}, 0)` };
      }

      if (callee.text === "Number" && node.arguments.length === 1) {
        return emitSymPy(
          node.arguments[0]!,
          context,
          localBindings,
          innerParams,
          sourceFile,
        );
      }
    }

    // .map(callback) on arrays/tokens — emit as Python list comprehension
    if (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === "map" &&
      node.arguments.length === 1
    ) {
      const callback = node.arguments[0]!;
      if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
        return compileMapCall(
          callee.expression,
          callback,
          context,
          localBindings,
          innerParams,
          sourceFile,
        );
      }
    }

    return err(
      `Unsupported function call: ${callee.getText(sourceFile)}`,
      node,
      sourceFile,
    );
  }

  // Array literal expression [a, b, c]
  if (ts.isArrayLiteralExpression(node)) {
    const elements: string[] = [];
    for (const elem of node.elements) {
      const result = emitSymPy(
        elem,
        context,
        localBindings,
        innerParams,
        sourceFile,
      );
      if (!result.ok) return result;
      elements.push(result.sympyCode);
    }
    return { ok: true, sympyCode: `[${elements.join(", ")}]` };
  }

  // Object literal expression { field: expr, ... }
  if (ts.isObjectLiteralExpression(node)) {
    const entries: string[] = [];
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) {
        return err(
          `Unsupported object property kind: ${ts.SyntaxKind[prop.kind]}`,
          prop,
          sourceFile,
        );
      }
      const key = prop.name.getText(sourceFile);
      const val = emitSymPy(
        prop.initializer,
        context,
        localBindings,
        innerParams,
        sourceFile,
      );
      if (!val.ok) return val;
      entries.push(`'${key}': ${val.sympyCode}`);
    }
    return { ok: true, sympyCode: `{${entries.join(", ")}}` };
  }

  // Non-null assertion (x!) — just unwrap
  if (ts.isNonNullExpression(node)) {
    return emitSymPy(
      node.expression,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
  }

  // Type assertion (x as T) — just unwrap
  if (ts.isAsExpression(node)) {
    return emitSymPy(
      node.expression,
      context,
      localBindings,
      innerParams,
      sourceFile,
    );
  }

  return err(
    `Unsupported syntax: ${ts.SyntaxKind[node.kind]}`,
    node,
    sourceFile,
  );
}
