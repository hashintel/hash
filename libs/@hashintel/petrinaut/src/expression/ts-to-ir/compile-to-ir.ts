import ts from "typescript";

import type { SDCPN, Transition } from "../../core/types/sdcpn";
import type { BinaryOp, ExpressionIR, UnaryOp } from "../expression-ir";

/**
 * Context for compilation, derived from the SDCPN model.
 * Tells the compiler which identifiers are parameters vs. token fields.
 */
export type CompilationContext = {
  parameterNames: Set<string>;
  /** Maps place name to its token field names */
  placeTokenFields: Map<string, string[]>;
  constructorFnName: string;
};

/**
 * Builds a CompilationContext from an SDCPN model for a given transition.
 */
export function buildContextForTransition(
  sdcpn: SDCPN,
  transition: Transition,
  constructorFnName: string,
): CompilationContext {
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
 * Builds a CompilationContext from an SDCPN model for a differential equation.
 */
export function buildContextForDifferentialEquation(
  sdcpn: SDCPN,
  colorId: string,
): CompilationContext {
  const parameterNames = new Set(
    sdcpn.parameters.map((param) => param.variableName),
  );
  const placeTokenFields = new Map<string, string[]>();

  const color = sdcpn.types.find((ct) => ct.id === colorId);
  if (color) {
    placeTokenFields.set(
      color.name,
      color.elements.map((el) => el.name),
    );
  }

  return { parameterNames, placeTokenFields, constructorFnName: "Dynamics" };
}

export type IRResult =
  | { ok: true; ir: ExpressionIR }
  | { ok: false; error: string; start: number; length: number };

/** Shorthand for building an error result with position from a TS AST node. */
function err(
  error: string,
  node: ts.Node,
  sourceFile: ts.SourceFile,
): IRResult & { ok: false } {
  return {
    ok: false,
    error,
    start: node.getStart(sourceFile),
    length: node.getWidth(sourceFile),
  };
}

/** Error result for cases where no specific node is available. */
function errNoPos(error: string): IRResult & { ok: false } {
  return { ok: false, error, start: 0, length: 0 };
}

/**
 * Scope tracking for the IR compiler.
 * Tracks local binding names and symbol overrides (from .map() destructuring).
 */
type Scope = {
  /** Names defined by `const` in the current scope */
  localBindingNames: Set<string>;
  /** Rewritten names for .map() destructured parameters (e.g., x → _iter_x) */
  symbolOverrides: Map<string, string>;
  /** Names bound to distribution expressions (for .map() detection) */
  distributionBindings: Set<string>;
};

function emptyScope(): Scope {
  return {
    localBindingNames: new Set(),
    symbolOverrides: new Map(),
    distributionBindings: new Set(),
  };
}

/**
 * Compiles a Petrinaut TypeScript expression to the expression IR.
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
 * @returns Either `{ ok: true, ir }` or `{ ok: false, error }`
 */
export function compileToIR(
  code: string,
  context: CompilationContext,
): IRResult {
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
    return errNoPos("No default export found");
  }

  const exportExpr = exportAssignment.expression;

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

  const scope = emptyScope();

  // Compile the body
  const body = arg.body;

  if (ts.isBlock(body)) {
    return compileBlockToIR(body, context, scope, sourceFile);
  }

  // Expression body — emit directly
  return emitIR(body, context, scope, sourceFile);
}

function compileBlockToIR(
  block: ts.Block,
  context: CompilationContext,
  outerScope: Scope,
  sourceFile: ts.SourceFile,
): IRResult {
  const bindings: { name: string; value: ExpressionIR }[] = [];
  const scope: Scope = {
    localBindingNames: new Set(outerScope.localBindingNames),
    symbolOverrides: new Map(outerScope.symbolOverrides),
    distributionBindings: new Set(outerScope.distributionBindings),
  };
  let bodyIR: ExpressionIR | undefined;

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
        if (!(stmt.declarationList.flags & ts.NodeFlags.Const)) {
          return err(
            "'let' and 'var' declarations are not supported, use 'const'",
            stmt,
            sourceFile,
          );
        }
        const name = decl.name.getText(sourceFile);
        const valueResult = emitIR(
          decl.initializer,
          context,
          scope,
          sourceFile,
        );
        if (!valueResult.ok) return valueResult;
        bindings.push({ name, value: valueResult.ir });
        scope.localBindingNames.add(name);
        if (
          valueResult.ir.type === "distribution" ||
          valueResult.ir.type === "derivedDistribution"
        ) {
          scope.distributionBindings.add(name);
        }
      }
    } else if (ts.isReturnStatement(stmt)) {
      if (!stmt.expression) {
        return err("Empty return statement", stmt, sourceFile);
      }
      const result = emitIR(stmt.expression, context, scope, sourceFile);
      if (!result.ok) return result;
      bodyIR = result.ir;
    } else if (ts.isExpressionStatement(stmt)) {
      return err(
        "Standalone expression has no effect — assign to a const or return it",
        stmt,
        sourceFile,
      );
    } else {
      return err(
        `Unsupported statement: ${ts.SyntaxKind[stmt.kind]}`,
        stmt,
        sourceFile,
      );
    }
  }

  if (!bodyIR) {
    return err("Empty function body", block, sourceFile);
  }

  if (bindings.length > 0) {
    return { ok: true, ir: { type: "let", bindings, body: bodyIR } };
  }
  return { ok: true, ir: bodyIR };
}

/**
 * Compiles `collection.map(callback)` to a list comprehension IR node.
 */
function compileMapCallToIR(
  collection: ts.Expression,
  callback: ts.ArrowFunction | ts.FunctionExpression,
  context: CompilationContext,
  outerScope: Scope,
  sourceFile: ts.SourceFile,
): IRResult {
  const iterVar = "_iter";
  const mapScope: Scope = {
    localBindingNames: new Set(outerScope.localBindingNames),
    symbolOverrides: new Map(outerScope.symbolOverrides),
    distributionBindings: new Set(outerScope.distributionBindings),
  };

  const param = callback.parameters[0];
  if (param) {
    const paramName = param.name;
    if (ts.isObjectBindingPattern(paramName)) {
      for (const element of paramName.elements) {
        const fieldName = element.name.getText(sourceFile);
        mapScope.symbolOverrides.set(fieldName, `${iterVar}_${fieldName}`);
      }
    } else {
      mapScope.symbolOverrides.set(paramName.getText(sourceFile), iterVar);
    }
  }

  // Compile the body
  const body = callback.body;
  let bodyResult: IRResult;
  if (ts.isBlock(body)) {
    bodyResult = compileBlockToIR(body, context, mapScope, sourceFile);
  } else {
    bodyResult = emitIR(body, context, mapScope, sourceFile);
  }
  if (!bodyResult.ok) return bodyResult;

  // Compile the collection expression
  const collectionResult = emitIR(collection, context, outerScope, sourceFile);
  if (!collectionResult.ok) return collectionResult;

  return {
    ok: true,
    ir: {
      type: "listComprehension",
      body: bodyResult.ir,
      variable: iterVar,
      collection: collectionResult.ir,
    },
  };
}

/**
 * Checks whether a TS expression will produce a distribution IR node.
 *
 * Handles two cases:
 * - Direct: `Distribution.Gaussian(...)` call expressions
 * - Via binding: identifiers bound to a distribution in a const declaration
 */
function isDistributionExpression(node: ts.Expression, scope: Scope): boolean {
  // Direct: Distribution.Fn(...)
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "Distribution"
  ) {
    return true;
  }

  // Via binding: const angle = Distribution.Gaussian(0, 10); angle.map(...)
  if (ts.isIdentifier(node) && scope.distributionBindings.has(node.text)) {
    return true;
  }

  return false;
}

/**
 * Compiles `distribution.map(transform)` to a derived distribution IR node.
 *
 * Handles two callback forms:
 * - Arrow/function expression: `dist.map((x) => Math.cos(x))`
 * - Function reference: `dist.map(Math.cos)` — expanded to `(_x) => Math.cos(_x)`
 */
function compileDerivedDistribution(
  collection: ts.Expression,
  callback: ts.Expression,
  context: CompilationContext,
  scope: Scope,
  sourceFile: ts.SourceFile,
): IRResult {
  const variable = "_x";

  // Compile the base distribution
  const distResult = emitIR(collection, context, scope, sourceFile);
  if (!distResult.ok) return distResult;

  let bodyIR: ExpressionIR;

  if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
    // Arrow function: (x) => expr
    // Bind the parameter name to our variable
    const mapScope: Scope = {
      localBindingNames: new Set(scope.localBindingNames),
      symbolOverrides: new Map(scope.symbolOverrides),
      distributionBindings: new Set(scope.distributionBindings),
    };

    const param = callback.parameters[0];
    if (param) {
      mapScope.symbolOverrides.set(param.name.getText(sourceFile), variable);
    }

    const body = callback.body;
    let bodyResult: IRResult;
    if (ts.isBlock(body)) {
      bodyResult = compileBlockToIR(body, context, mapScope, sourceFile);
    } else {
      bodyResult = emitIR(body, context, mapScope, sourceFile);
    }
    if (!bodyResult.ok) return bodyResult;
    bodyIR = bodyResult.ir;
  } else {
    // Function reference: Math.cos, Math.sin, etc.
    // Expand to: (_x) => fn(_x)
    const fnResult = emitIR(callback, context, scope, sourceFile);
    if (!fnResult.ok) return fnResult;

    // The fn should be a call-like reference (e.g. Math.cos).
    // We synthesize a call node: fn(_x)
    if (fnResult.ir.type === "symbol" && fnResult.ir.name.startsWith("Math.")) {
      // Math.cos → { type: "call", fn: "cos", args: [symbol("_x")] }
      const fnName = fnResult.ir.name.slice("Math.".length);
      bodyIR = {
        type: "call",
        fn: fnName,
        args: [{ type: "symbol", name: variable }],
      };
    } else {
      return err(
        "Distribution .map() callback must be a function expression or a Math function reference",
        callback,
        sourceFile,
      );
    }
  }

  return {
    ok: true,
    ir: {
      type: "derivedDistribution",
      distribution: distResult.ir,
      variable,
      body: bodyIR,
    },
  };
}

const SUPPORTED_MATH_FUNCTIONS = new Set([
  "cos",
  "sin",
  "tan",
  "acos",
  "asin",
  "atan",
  "atan2",
  "sqrt",
  "log",
  "exp",
  "abs",
  "floor",
  "ceil",
  "pow",
  "min",
  "max",
  "hypot",
]);

const MATH_CONSTANTS: Record<string, ExpressionIR> = {
  PI: { type: "symbol", name: "PI" },
  E: { type: "symbol", name: "E" },
};

const TS_BINARY_OP_MAP: Partial<Record<ts.SyntaxKind, BinaryOp>> = {
  [ts.SyntaxKind.PlusToken]: "+",
  [ts.SyntaxKind.MinusToken]: "-",
  [ts.SyntaxKind.AsteriskToken]: "*",
  [ts.SyntaxKind.SlashToken]: "/",
  [ts.SyntaxKind.AsteriskAsteriskToken]: "**",
  [ts.SyntaxKind.PercentToken]: "%",
  [ts.SyntaxKind.LessThanToken]: "<",
  [ts.SyntaxKind.LessThanEqualsToken]: "<=",
  [ts.SyntaxKind.GreaterThanToken]: ">",
  [ts.SyntaxKind.GreaterThanEqualsToken]: ">=",
  [ts.SyntaxKind.EqualsEqualsToken]: "==",
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: "==",
  [ts.SyntaxKind.ExclamationEqualsToken]: "!=",
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: "!=",
  [ts.SyntaxKind.AmpersandAmpersandToken]: "&&",
  [ts.SyntaxKind.BarBarToken]: "||",
};

const TS_UNARY_OP_MAP: Partial<Record<ts.SyntaxKind, UnaryOp>> = {
  [ts.SyntaxKind.MinusToken]: "-",
  [ts.SyntaxKind.ExclamationToken]: "!",
  [ts.SyntaxKind.PlusToken]: "+",
};

function emitIR(
  node: ts.Node,
  context: CompilationContext,
  scope: Scope,
  sourceFile: ts.SourceFile,
): IRResult {
  // Numeric literal
  if (ts.isNumericLiteral(node)) {
    return { ok: true, ir: { type: "number", value: node.text } };
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
    return { ok: true, ir: { type: "boolean", value: true } };
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return { ok: true, ir: { type: "boolean", value: false } };
  }

  // Identifier
  if (ts.isIdentifier(node)) {
    const name = node.text;
    if (name === "Infinity") {
      return { ok: true, ir: { type: "infinity" } };
    }
    if (scope.symbolOverrides.has(name)) {
      return {
        ok: true,
        ir: { type: "symbol", name: scope.symbolOverrides.get(name)! },
      };
    }
    if (scope.localBindingNames.has(name)) {
      return { ok: true, ir: { type: "symbol", name } };
    }
    if (context.parameterNames.has(name)) {
      return { ok: true, ir: { type: "parameter", name } };
    }
    // Could be a destructured token field or function param
    return { ok: true, ir: { type: "symbol", name } };
  }

  // Parenthesized expression
  if (ts.isParenthesizedExpression(node)) {
    return emitIR(node.expression, context, scope, sourceFile);
  }

  // Prefix unary expression (-x, !x)
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = emitIR(node.operand, context, scope, sourceFile);
    if (!operand.ok) return operand;

    const op = TS_UNARY_OP_MAP[node.operator];
    if (!op) {
      return err(
        `Unsupported prefix operator: ${ts.SyntaxKind[node.operator]}`,
        node,
        sourceFile,
      );
    }

    if (op === "+") {
      return operand;
    }

    return { ok: true, ir: { type: "unary", op, operand: operand.ir } };
  }

  // Binary expression
  if (ts.isBinaryExpression(node)) {
    const left = emitIR(node.left, context, scope, sourceFile);
    if (!left.ok) return left;
    const right = emitIR(node.right, context, scope, sourceFile);
    if (!right.ok) return right;

    const op = TS_BINARY_OP_MAP[node.operatorToken.kind];
    if (!op) {
      return err(
        `Unsupported binary operator: ${node.operatorToken.getText(sourceFile)}`,
        node.operatorToken,
        sourceFile,
      );
    }

    return {
      ok: true,
      ir: { type: "binary", op, left: left.ir, right: right.ir },
    };
  }

  // Conditional (ternary) expression
  if (ts.isConditionalExpression(node)) {
    const condition = emitIR(node.condition, context, scope, sourceFile);
    if (!condition.ok) return condition;
    const whenTrue = emitIR(node.whenTrue, context, scope, sourceFile);
    if (!whenTrue.ok) return whenTrue;
    const whenFalse = emitIR(node.whenFalse, context, scope, sourceFile);
    if (!whenFalse.ok) return whenFalse;
    return {
      ok: true,
      ir: {
        type: "piecewise",
        condition: condition.ir,
        whenTrue: whenTrue.ir,
        whenFalse: whenFalse.ir,
      },
    };
  }

  // Property access: parameters.x, tokens.Place[0].field, Math.PI
  if (ts.isPropertyAccessExpression(node)) {
    const propName = node.name.text;

    // Math constants: Math.PI, Math.E
    if (ts.isIdentifier(node.expression) && node.expression.text === "Math") {
      const constant = MATH_CONSTANTS[propName];
      if (constant) return { ok: true, ir: constant };
      // Math.method — return a placeholder for the call expression handler
      return { ok: true, ir: { type: "symbol", name: `Math.${propName}` } };
    }

    // parameters.x
    if (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "parameters"
    ) {
      return { ok: true, ir: { type: "parameter", name: propName } };
    }

    // tokens.Place[0].field — handle the chain
    if (ts.isElementAccessExpression(node.expression)) {
      const elemAccess = node.expression;
      if (ts.isPropertyAccessExpression(elemAccess.expression)) {
        const placePropAccess = elemAccess.expression;
        if (
          ts.isIdentifier(placePropAccess.expression) &&
          placePropAccess.expression.text === "tokens"
        ) {
          const placeName = placePropAccess.name.text;
          const indexResult = emitIR(
            elemAccess.argumentExpression,
            context,
            scope,
            sourceFile,
          );
          if (!indexResult.ok) return indexResult;
          return {
            ok: true,
            ir: {
              type: "tokenAccess",
              place: placeName,
              index: indexResult.ir,
              field: propName,
            },
          };
        }
      }
    }

    // Generic property access
    const obj = emitIR(node.expression, context, scope, sourceFile);
    if (!obj.ok) return obj;
    return {
      ok: true,
      ir: { type: "propertyAccess", object: obj.ir, property: propName },
    };
  }

  // Element access: tokens.Place[0], arr[i]
  if (ts.isElementAccessExpression(node)) {
    const obj = emitIR(node.expression, context, scope, sourceFile);
    if (!obj.ok) return obj;
    const index = emitIR(node.argumentExpression, context, scope, sourceFile);
    if (!index.ok) return index;
    return {
      ok: true,
      ir: { type: "elementAccess", object: obj.ir, index: index.ir },
    };
  }

  // Call expression
  if (ts.isCallExpression(node)) {
    const callee = node.expression;

    // Math.fn(...)
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "Math"
    ) {
      const fnName = callee.name.text;

      if (!SUPPORTED_MATH_FUNCTIONS.has(fnName)) {
        return err(
          `Unsupported Math function: Math.${fnName}`,
          callee,
          sourceFile,
        );
      }

      const args: ExpressionIR[] = [];
      for (const a of node.arguments) {
        const r = emitIR(a, context, scope, sourceFile);
        if (!r.ok) return r;
        args.push(r.ir);
      }
      return { ok: true, ir: { type: "call", fn: fnName, args } };
    }

    // Distribution.Gaussian(m, s), etc.
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "Distribution"
    ) {
      const distName = callee.name.text;
      const supportedDistributions = ["Gaussian", "Uniform", "Lognormal"];
      if (!supportedDistributions.includes(distName)) {
        return err(
          `Unsupported distribution: Distribution.${distName}`,
          callee,
          sourceFile,
        );
      }

      const args: ExpressionIR[] = [];
      for (const a of node.arguments) {
        const r = emitIR(a, context, scope, sourceFile);
        if (!r.ok) return r;
        args.push(r.ir);
      }
      return {
        ok: true,
        ir: { type: "distribution", distribution: distName, args },
      };
    }

    // Global built-in functions: Boolean(expr), Number(expr)
    if (ts.isIdentifier(callee)) {
      if (callee.text === "Boolean" && node.arguments.length === 1) {
        const argResult = emitIR(
          node.arguments[0]!,
          context,
          scope,
          sourceFile,
        );
        if (!argResult.ok) return argResult;
        // Boolean(expr) → expr != 0
        return {
          ok: true,
          ir: {
            type: "binary",
            op: "!=",
            left: argResult.ir,
            right: { type: "number", value: "0" },
          },
        };
      }

      if (callee.text === "Number" && node.arguments.length === 1) {
        return emitIR(node.arguments[0]!, context, scope, sourceFile);
      }
    }

    // .map(callback)
    if (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === "map" &&
      node.arguments.length === 1
    ) {
      const callback = node.arguments[0]!;

      // Check if the target is a distribution (for derived distributions)
      if (isDistributionExpression(callee.expression, scope)) {
        return compileDerivedDistribution(
          callee.expression,
          callback,
          context,
          scope,
          sourceFile,
        );
      }

      if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
        return compileMapCallToIR(
          callee.expression,
          callback,
          context,
          scope,
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
    const elements: ExpressionIR[] = [];
    for (const elem of node.elements) {
      const result = emitIR(elem, context, scope, sourceFile);
      if (!result.ok) return result;
      elements.push(result.ir);
    }
    return { ok: true, ir: { type: "array", elements } };
  }

  // Object literal expression { field: expr, ... }
  if (ts.isObjectLiteralExpression(node)) {
    const entries: { key: string; value: ExpressionIR }[] = [];
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) {
        return err(
          `Unsupported object property kind: ${ts.SyntaxKind[prop.kind]}`,
          prop,
          sourceFile,
        );
      }
      const key = prop.name.getText(sourceFile);
      const val = emitIR(prop.initializer, context, scope, sourceFile);
      if (!val.ok) return val;
      entries.push({ key, value: val.ir });
    }
    return { ok: true, ir: { type: "object", entries } };
  }

  // Non-null assertion (x!) — just unwrap
  if (ts.isNonNullExpression(node)) {
    return emitIR(node.expression, context, scope, sourceFile);
  }

  // Type assertion (x as T) — just unwrap
  if (ts.isAsExpression(node)) {
    return emitIR(node.expression, context, scope, sourceFile);
  }

  return err(
    `Unsupported syntax: ${ts.SyntaxKind[node.kind]}`,
    node,
    sourceFile,
  );
}
