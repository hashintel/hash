/**
 * Lowers user-authored TypeScript modules into the HIR.
 *
 * The lowering accepts the analyzable subset of TypeScript that Petrinaut
 * user code is written in: a module of the form
 *
 *   export default <Ctor>((tokens, parameters) => <expression or block>)
 *
 * where the body is a pure expression tree — `const` bindings (with object
 * and array destructuring), guard-clause `if`/early returns, ternaries,
 * arithmetic/logic, `Math.*` calls, token/parameter access, `.map(...)`
 * comprehensions and `Distribution.*` constructors.
 *
 * Anything outside that subset short-circuits lowering and produces a single
 * `HirDiagnostic` whose span points at the offending syntax in the
 * user-visible source text. The HIR pipeline is the only compiler, so these
 * surface as errors in the LSP and the affected item cannot simulate until
 * fixed.
 */
import ts from "typescript";

import { HIR_MATH_FNS, HIR_STRING_FNS, walkHir } from "./hir";

import type {
  HirBinaryOp,
  HirDiagnostic,
  HirDistributionKind,
  HirExpr,
  HirFunction,
  HirLetBinding,
  HirMathFn,
  HirSurfaceKind,
  Span,
} from "./hir";

export type LowerTypeScriptResult =
  | { ok: true; fn: HirFunction; diagnostics: HirDiagnostic[] }
  | { ok: false; diagnostics: HirDiagnostic[] };

const CONSTRUCTOR_NAMES: Record<Exclude<HirSurfaceKind, "metric">, string> = {
  dynamics: "Dynamics",
  lambda: "Lambda",
  kernel: "TransitionKernel",
};

/**
 * Metric user code is a bare function *body* (with `state` in scope and net
 * `parameters` available ambiently), not an `export default` module. It is
 * wrapped in this prefix (plus a closing `\n}`) before parsing; all spans in
 * the lowering result are shifted back by the prefix length so they map onto
 * the raw user body.
 */
const METRIC_PREFIX = "(state) => {\n";
const METRIC_SUFFIX = "\n}";

const DISTRIBUTION_FACTORIES: Record<string, HirDistributionKind> = {
  Gaussian: "gaussian",
  Uniform: "uniform",
  Lognormal: "lognormal",
};

const MATH_CONSTANTS = new Set(["PI", "E"]);

const BINARY_OPS: Partial<Record<ts.SyntaxKind, HirBinaryOp>> = {
  [ts.SyntaxKind.PlusToken]: "+",
  [ts.SyntaxKind.MinusToken]: "-",
  [ts.SyntaxKind.AsteriskToken]: "*",
  [ts.SyntaxKind.SlashToken]: "/",
  [ts.SyntaxKind.PercentToken]: "%",
  [ts.SyntaxKind.AsteriskAsteriskToken]: "**",
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

/** `Omit` distributed over a union, preserving each variant's shape. */
type DistributiveOmit<Type, Keys extends PropertyKey> = Type extends unknown
  ? Omit<Type, Keys>
  : never;

/** Internal signal used to short-circuit lowering with one diagnostic. */
class LowerError extends Error {
  diagnostic: HirDiagnostic;

  constructor(diagnostic: HirDiagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

type LowerScope = {
  /** In-scope local names: fn params, `const` bindings, map params. */
  locals: Set<string>;
  /** Locals whose bound value is distribution-valued (drives `.map`
   * disambiguation between arrays and distributions). */
  distributionLocals: Set<string>;
  /** Identifiers introduced by object-destructured map params, mapped to the
   * synthetic parameter they read from. */
  destructuredFields: Map<string, string>;
  /** Identifiers introduced by destructuring the top-level parameters
   * function parameter, mapped to the model parameter they read. */
  parameterAliases: Map<string, string>;
  /** Name of the `parameters` function parameter, if declared. */
  parametersName: string | null;
};

function childScope(scope: LowerScope): LowerScope {
  return {
    locals: new Set(scope.locals),
    distributionLocals: new Set(scope.distributionLocals),
    destructuredFields: new Map(scope.destructuredFields),
    parameterAliases: new Map(scope.parameterAliases),
    parametersName: scope.parametersName,
  };
}

class Lowering {
  private nextId = 0;

  constructor(
    private readonly sourceFile: ts.SourceFile,
    private readonly surface: HirSurfaceKind,
  ) {}

  spanOf(node: ts.Node): Span {
    const start = node.getStart(this.sourceFile);
    return { start, length: node.getWidth(this.sourceFile) };
  }

  fail(node: ts.Node, code: string, message: string): never {
    throw new LowerError({
      code,
      message,
      severity: "error",
      span: this.spanOf(node),
    });
  }

  private make<Init extends DistributiveOmit<HirExpr, "id" | "span">>(
    node: ts.Node,
    expr: Init,
  ): Extract<HirExpr, { kind: Init["kind"] }> {
    return {
      ...expr,
      id: this.nextId++,
      span: this.spanOf(node),
    } as unknown as Extract<HirExpr, { kind: Init["kind"] }>;
  }

  /**
   * Lowers a wrapped metric body (`(state) => { <user body> }`, see
   * `METRIC_PREFIX`). Spans are still relative to the wrapped text — the
   * caller shifts them back onto the raw user body.
   */
  lowerMetricModule(): HirFunction {
    const [statement, ...rest] = this.sourceFile.statements;
    if (rest.length > 0) {
      this.fail(
        rest[0]!,
        "hir:unsupported-statement",
        "Metric code must be a single function body ending in `return`.",
      );
    }
    const arrow =
      statement &&
      ts.isExpressionStatement(statement) &&
      ts.isArrowFunction(statement.expression)
        ? statement.expression
        : null;
    const arrowBody = arrow && ts.isBlock(arrow.body) ? arrow.body : null;
    if (!arrow || !arrowBody) {
      throw new LowerError({
        code: "hir:unsupported-syntax",
        message: "Metric code must be a function body ending in `return`.",
        severity: "error",
        span: { start: 0, length: Math.max(this.sourceFile.text.length, 1) },
      });
    }
    const stateParam = arrow.parameters[0]!;
    const scope: LowerScope = {
      locals: new Set(["state"]),
      distributionLocals: new Set(),
      destructuredFields: new Map(),
      parameterAliases: new Map(),
      // Net parameters are ambient in metric code: `parameters.<name>` (and
      // `const { <name> } = parameters`) lower to parameter reads even though
      // `parameters` is not a declared function argument. Scenario parameters
      // are not exposed.
      parametersName: "parameters",
    };
    const body = this.lowerBlock(arrowBody, scope);
    return {
      hirVersion: 1,
      surface: "metric",
      params: [{ name: "state", span: this.spanOf(stateParam.name) }],
      body,
      span: this.spanOf(arrow),
    };
  }

  lowerModule(): HirFunction {
    if (this.surface === "metric") {
      // Metric code has no module wrapper — see `lowerMetricModule`.
      return this.lowerMetricModule();
    }
    const constructorName = CONSTRUCTOR_NAMES[this.surface];
    let exportAssignment: ts.ExportAssignment | undefined;

    for (const statement of this.sourceFile.statements) {
      if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
        if (exportAssignment) {
          this.fail(
            statement,
            "hir:multiple-default-exports",
            "Only one default export is allowed.",
          );
        }
        exportAssignment = statement;
      } else if (
        ts.isImportDeclaration(statement) &&
        statement.importClause?.isTypeOnly
      ) {
        // Type-only imports are erased; ignore them.
      } else {
        this.fail(
          statement,
          "hir:unsupported-statement",
          `Only \`export default ${constructorName}(...)\` is supported at the top level.`,
        );
      }
    }

    if (!exportAssignment) {
      throw new LowerError({
        code: "hir:missing-default-export",
        message: `Expected \`export default ${constructorName}(...)\`.`,
        severity: "error",
        span: { start: 0, length: Math.max(this.sourceFile.text.length, 1) },
      });
    }

    const call = exportAssignment.expression;
    if (
      !ts.isCallExpression(call) ||
      !ts.isIdentifier(call.expression) ||
      call.expression.text !== constructorName
    ) {
      this.fail(
        call,
        "hir:missing-constructor",
        `The default export must be a \`${constructorName}(...)\` call.`,
      );
    }
    if (call.arguments.length !== 1) {
      this.fail(
        call,
        "hir:constructor-arity",
        `\`${constructorName}\` expects exactly one function argument.`,
      );
    }

    const fnArg = call.arguments[0]!;
    if (!ts.isArrowFunction(fnArg) && !ts.isFunctionExpression(fnArg)) {
      this.fail(
        fnArg,
        "hir:missing-function",
        `\`${constructorName}\` expects a function argument, e.g. \`(tokens, parameters) => ...\`.`,
      );
    }

    if (fnArg.parameters.length > 2) {
      this.fail(
        fnArg.parameters[2]!,
        "hir:too-many-parameters",
        "User functions take at most two parameters (tokens and parameters).",
      );
    }

    const params: HirFunction["params"] = [];
    const scope: LowerScope = {
      locals: new Set(),
      distributionLocals: new Set(),
      destructuredFields: new Map(),
      parameterAliases: new Map(),
      parametersName: null,
    };

    for (const [index, parameter] of fnArg.parameters.entries()) {
      if (ts.isIdentifier(parameter.name)) {
        const name = parameter.name.text;
        params.push({ name, span: this.spanOf(parameter.name) });
        if (index === 0) {
          scope.locals.add(name);
        } else {
          scope.parametersName = name;
        }
        continue;
      }
      if (ts.isObjectBindingPattern(parameter.name)) {
        // Destructured parameter: synthesize a name and route the bound
        // identifiers to the underlying tokens object / parameter reads.
        const syntheticName = index === 0 ? "__input" : "__parameters";
        params.push({
          name: syntheticName,
          span: this.spanOf(parameter.name),
        });
        for (const element of parameter.name.elements) {
          const bound = this.bindingElementParts(element);
          if (bound.name !== bound.sourceName) {
            this.fail(
              element,
              "hir:destructured-parameter",
              "Renames are not supported when destructuring function parameters.",
            );
          }
          if (index === 0) {
            scope.destructuredFields.set(bound.name, syntheticName);
          } else {
            scope.parameterAliases.set(bound.name, bound.sourceName);
          }
        }
        if (index === 0) {
          scope.locals.add(syntheticName);
        }
        continue;
      }
      this.fail(
        parameter.name,
        "hir:destructured-parameter",
        "Function parameters must be plain names or object destructuring like `({ Pool }, { rate })`.",
      );
    }

    const body = ts.isBlock(fnArg.body)
      ? this.lowerBlock(fnArg.body, scope)
      : this.lowerExpr(fnArg.body, scope);

    return {
      hirVersion: 1,
      surface: this.surface,
      params,
      body,
      span: this.spanOf(fnArg),
    };
  }

  /** Lowers a `{ const...; if guards...; return expr; }` block. */
  private lowerBlock(block: ts.Block, outerScope: LowerScope): HirExpr {
    return this.lowerStatements(
      block.statements,
      childScope(outerScope),
      block,
    );
  }

  /**
   * Lowers a statement list to an expression. Supported statements:
   * `const` bindings (with object/array destructuring), guard-clause
   * `if (cond) return a;` (the remaining statements become the else branch),
   * terminating `if/else` where both branches return, and a final `return`.
   */
  private lowerStatements(
    statements: readonly ts.Statement[],
    scope: LowerScope,
    anchor: ts.Node,
  ): HirExpr {
    const bindings: HirLetBinding[] = [];

    const wrapBindings = (body: HirExpr): HirExpr => {
      if (bindings.length === 0) {
        return body;
      }
      return {
        kind: "let",
        bindings,
        body,
        id: this.nextId++,
        span: this.spanOf(anchor),
      };
    };

    const failUnreachable = (statement: ts.Statement): never =>
      this.fail(
        statement,
        "hir:unreachable-code",
        "This code is unreachable — the function has already returned.",
      );

    for (const [index, statement] of statements.entries()) {
      if (ts.isVariableStatement(statement)) {
        // eslint-disable-next-line no-bitwise -- ts.NodeFlags is a bitfield
        if (!(statement.declarationList.flags & ts.NodeFlags.Const)) {
          this.fail(
            statement,
            "hir:mutable-binding",
            "`let` and `var` are not supported — use `const` (bindings are immutable).",
          );
        }
        for (const declaration of statement.declarationList.declarations) {
          bindings.push(...this.lowerDeclaration(declaration, scope));
        }
      } else if (ts.isReturnStatement(statement)) {
        if (index !== statements.length - 1) {
          failUnreachable(statements[index + 1]!);
        }
        if (!statement.expression) {
          this.fail(
            statement,
            "hir:empty-return",
            "The function must return a value.",
          );
        }
        return wrapBindings(this.lowerExpr(statement.expression, scope));
      } else if (ts.isIfStatement(statement)) {
        const condition = this.lowerExpr(statement.expression, scope);
        const thenBranch = this.lowerBranch(statement.thenStatement, scope);

        if (statement.elseStatement) {
          // Both branches terminate; nothing may follow.
          if (index !== statements.length - 1) {
            failUnreachable(statements[index + 1]!);
          }
          const elseBranch = this.lowerBranch(statement.elseStatement, scope);
          return wrapBindings({
            kind: "cond",
            condition,
            thenBranch,
            elseBranch,
            id: this.nextId++,
            span: this.spanOf(statement),
          });
        }

        // Guard clause: the remaining statements are the else branch.
        const rest = statements.slice(index + 1);
        if (rest.length === 0) {
          this.fail(
            statement,
            "hir:missing-return",
            "A guard `if` must be followed by more statements ending in `return`.",
          );
        }
        const elseBranch = this.lowerStatements(
          rest,
          childScope(scope),
          rest[0]!,
        );
        return wrapBindings({
          kind: "cond",
          condition,
          thenBranch,
          elseBranch,
          id: this.nextId++,
          span: this.spanOf(statement),
        });
      } else if (
        ts.isForStatement(statement) ||
        ts.isForOfStatement(statement) ||
        ts.isForInStatement(statement) ||
        ts.isWhileStatement(statement) ||
        ts.isDoStatement(statement)
      ) {
        this.fail(
          statement,
          "hir:loop-statement",
          "Loops are not supported — use `.map(...)` over token arrays.",
        );
      } else {
        this.fail(
          statement,
          "hir:unsupported-statement",
          `Unsupported statement (${ts.SyntaxKind[statement.kind]}) — only \`const\` bindings, guard \`if\`s and a final \`return\` are supported.`,
        );
      }
    }

    this.fail(
      anchor,
      "hir:missing-return",
      "The function body must end with a `return` statement.",
    );
  }

  /** Lowers an `if` branch, which must terminate with a `return`. */
  private lowerBranch(statement: ts.Statement, scope: LowerScope): HirExpr {
    if (ts.isReturnStatement(statement)) {
      if (!statement.expression) {
        this.fail(
          statement,
          "hir:empty-return",
          "The function must return a value.",
        );
      }
      return this.lowerExpr(statement.expression, scope);
    }
    if (ts.isBlock(statement)) {
      return this.lowerStatements(
        statement.statements,
        childScope(scope),
        statement,
      );
    }
    this.fail(
      statement,
      "hir:if-statement",
      "`if` branches must end with a `return` statement.",
    );
  }

  /**
   * Lowers one `const` declaration to bindings, expanding object and array
   * destructuring patterns. `const { a, b } = parameters` binds directly to
   * parameter reads.
   */
  private lowerDeclaration(
    declaration: ts.VariableDeclaration,
    scope: LowerScope,
  ): HirLetBinding[] {
    if (!declaration.initializer) {
      this.fail(
        declaration,
        "hir:missing-initializer",
        "`const` bindings must have an initializer.",
      );
    }
    const initializer = declaration.initializer;
    const pattern = declaration.name;

    const registerBinding = (name: string, value: HirExpr): void => {
      scope.locals.add(name);
      scope.destructuredFields.delete(name);
      scope.parameterAliases.delete(name);
      if (this.isDistributionValued(value, scope)) {
        scope.distributionLocals.add(name);
      } else {
        scope.distributionLocals.delete(name);
      }
    };

    // Simple binding: const name = expr
    if (ts.isIdentifier(pattern)) {
      const value = this.lowerExpr(initializer, scope);
      registerBinding(pattern.text, value);
      return [{ name: pattern.text, nameSpan: this.spanOf(pattern), value }];
    }

    // Destructuring from the parameters object binds parameter reads
    // directly: const { a, b: alias } = parameters
    if (
      ts.isObjectBindingPattern(pattern) &&
      ts.isIdentifier(initializer) &&
      initializer.text === scope.parametersName &&
      !scope.locals.has(initializer.text)
    ) {
      const bindings: HirLetBinding[] = [];
      for (const element of pattern.elements) {
        const bound = this.bindingElementParts(element);
        const value = this.make(element, {
          kind: "paramRef",
          name: bound.sourceName,
        });
        registerBinding(bound.name, value);
        bindings.push({
          name: bound.name,
          nameSpan: bound.nameSpan,
          value,
        });
      }
      return bindings;
    }

    // General destructuring: bind the source once, then one binding per
    // element reading from it.
    const source = this.lowerExpr(initializer, scope);
    const bindings: HirLetBinding[] = [];
    let sourceRefName: string;
    if (source.kind === "localRef") {
      sourceRefName = source.name;
    } else {
      sourceRefName = `__destructured_${this.nextId}`;
      scope.locals.add(sourceRefName);
      bindings.push({
        name: sourceRefName,
        nameSpan: this.spanOf(pattern),
        value: source,
      });
    }

    const sourceRef = (node: ts.Node): HirExpr =>
      this.make(node, { kind: "localRef", name: sourceRefName });

    if (ts.isObjectBindingPattern(pattern)) {
      for (const element of pattern.elements) {
        const bound = this.bindingElementParts(element);
        const value = this.make(element, {
          kind: "fieldAccess",
          target: sourceRef(element),
          field: bound.sourceName,
          fieldSpan: bound.sourceSpan,
        });
        registerBinding(bound.name, value);
        bindings.push({ name: bound.name, nameSpan: bound.nameSpan, value });
      }
      return bindings;
    }

    if (ts.isArrayBindingPattern(pattern)) {
      for (const [elementIndex, element] of pattern.elements.entries()) {
        if (ts.isOmittedExpression(element)) {
          continue;
        }
        if (
          element.dotDotDotToken ||
          element.initializer ||
          !ts.isIdentifier(element.name)
        ) {
          this.fail(
            element,
            "hir:destructured-binding",
            "Only simple array destructuring like `const [a, b] = ...` is supported.",
          );
        }
        const index = this.make(element, {
          kind: "numberLit",
          value: elementIndex,
          raw: String(elementIndex),
        });
        const value = this.make(element, {
          kind: "indexAccess",
          target: sourceRef(element),
          index,
        });
        registerBinding(element.name.text, value);
        bindings.push({
          name: element.name.text,
          nameSpan: this.spanOf(element.name),
          value,
        });
      }
      return bindings;
    }

    this.fail(
      pattern,
      "hir:destructured-binding",
      "Unsupported binding pattern.",
    );
  }

  /** Extracts (boundName, sourceProperty) from an object binding element,
   * supporting renames (`{ a: alias }`). */
  private bindingElementParts(element: ts.BindingElement): {
    name: string;
    nameSpan: Span;
    sourceName: string;
    sourceSpan: Span;
  } {
    if (
      element.dotDotDotToken ||
      element.initializer ||
      !ts.isIdentifier(element.name)
    ) {
      this.fail(
        element,
        "hir:destructured-binding",
        "Only simple destructuring like `{ a, b }` or `{ a: alias }` is supported (no defaults, rest or nesting).",
      );
    }
    if (element.propertyName !== undefined) {
      if (
        !ts.isIdentifier(element.propertyName) &&
        !ts.isStringLiteralLike(element.propertyName)
      ) {
        this.fail(
          element.propertyName,
          "hir:destructured-binding",
          "Computed keys are not supported in destructuring.",
        );
      }
      return {
        name: element.name.text,
        nameSpan: this.spanOf(element.name),
        sourceName: element.propertyName.text,
        sourceSpan: this.spanOf(element.propertyName),
      };
    }
    return {
      name: element.name.text,
      nameSpan: this.spanOf(element.name),
      sourceName: element.name.text,
      sourceSpan: this.spanOf(element.name),
    };
  }

  private lowerExpr(node: ts.Expression, scope: LowerScope): HirExpr {
    // Unwrap constructs that are transparent at runtime.
    if (ts.isParenthesizedExpression(node)) {
      return this.lowerExpr(node.expression, scope);
    }
    if (
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      return this.lowerExpr(node.expression, scope);
    }

    if (ts.isNumericLiteral(node)) {
      return this.make(node, {
        kind: "numberLit",
        value: Number(node.text),
        raw: node.getText(this.sourceFile),
      });
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) {
      return this.make(node, { kind: "boolLit", value: true });
    }
    if (node.kind === ts.SyntaxKind.FalseKeyword) {
      return this.make(node, { kind: "boolLit", value: false });
    }
    if (ts.isIdentifier(node)) {
      return this.lowerIdentifier(node, scope);
    }
    if (ts.isPrefixUnaryExpression(node)) {
      return this.lowerUnary(node, scope);
    }
    if (ts.isBinaryExpression(node)) {
      const op = BINARY_OPS[node.operatorToken.kind];
      if (!op) {
        this.fail(
          node.operatorToken,
          "hir:unsupported-operator",
          `Unsupported operator \`${node.operatorToken.getText(this.sourceFile)}\`.`,
        );
      }
      return this.make(node, {
        kind: "binary",
        op,
        left: this.lowerExpr(node.left, scope),
        right: this.lowerExpr(node.right, scope),
      });
    }
    if (ts.isConditionalExpression(node)) {
      return this.make(node, {
        kind: "cond",
        condition: this.lowerExpr(node.condition, scope),
        thenBranch: this.lowerExpr(node.whenTrue, scope),
        elseBranch: this.lowerExpr(node.whenFalse, scope),
      });
    }
    if (ts.isPropertyAccessExpression(node)) {
      return this.lowerPropertyAccess(node, scope);
    }
    if (ts.isElementAccessExpression(node)) {
      const argument = node.argumentExpression;
      if (ts.isStringLiteralLike(argument)) {
        return this.make(node, {
          kind: "fieldAccess",
          target: this.lowerExpr(node.expression, scope),
          field: argument.text,
          fieldSpan: this.spanOf(argument),
        });
      }
      return this.make(node, {
        kind: "indexAccess",
        target: this.lowerExpr(node.expression, scope),
        index: this.lowerExpr(argument, scope),
      });
    }
    if (ts.isCallExpression(node)) {
      return this.lowerCall(node, scope);
    }
    if (ts.isObjectLiteralExpression(node)) {
      return this.lowerObjectLiteral(node, scope);
    }
    if (ts.isArrayLiteralExpression(node)) {
      const elements: HirExpr[] = [];
      for (const element of node.elements) {
        if (ts.isSpreadElement(element)) {
          this.fail(
            element,
            "hir:spread",
            "Spread elements are not supported yet — list tokens explicitly.",
          );
        }
        elements.push(this.lowerExpr(element, scope));
      }
      return this.make(node, { kind: "arrayLit", elements });
    }
    if (ts.isStringLiteralLike(node)) {
      return this.make(node, { kind: "stringLit", value: node.text });
    }

    this.fail(
      node,
      "hir:unsupported-syntax",
      `Unsupported syntax (${ts.SyntaxKind[node.kind]}).`,
    );
  }

  private lowerIdentifier(node: ts.Identifier, scope: LowerScope): HirExpr {
    const name = node.text;
    if (name === "Infinity") {
      return this.make(node, { kind: "constant", name: "Infinity" });
    }
    if (name === "NaN") {
      return this.make(node, { kind: "constant", name: "NaN" });
    }
    const destructuredBase = scope.destructuredFields.get(name);
    if (destructuredBase !== undefined) {
      const target = this.make(node, {
        kind: "localRef",
        name: destructuredBase,
      });
      return this.make(node, {
        kind: "fieldAccess",
        target,
        field: name,
        fieldSpan: this.spanOf(node),
      });
    }
    const aliasedParameter = scope.parameterAliases.get(name);
    if (aliasedParameter !== undefined) {
      return this.make(node, { kind: "paramRef", name: aliasedParameter });
    }
    if (scope.locals.has(name)) {
      return this.make(node, { kind: "localRef", name });
    }
    if (name === scope.parametersName) {
      this.fail(
        node,
        "hir:bare-parameters-object",
        `The parameters object can only be used via property access, e.g. \`${name}.rate\`.`,
      );
    }
    this.fail(
      node,
      "hir:unknown-identifier",
      `Unknown identifier \`${name}\`.`,
    );
  }

  private lowerUnary(
    node: ts.PrefixUnaryExpression,
    scope: LowerScope,
  ): HirExpr {
    const op =
      node.operator === ts.SyntaxKind.MinusToken
        ? "-"
        : node.operator === ts.SyntaxKind.PlusToken
          ? "+"
          : node.operator === ts.SyntaxKind.ExclamationToken
            ? "!"
            : null;
    if (!op) {
      this.fail(
        node,
        "hir:unsupported-operator",
        "Unsupported unary operator.",
      );
    }
    // Fold `-1` style negated literals so raw text is preserved.
    if (op === "-" && ts.isNumericLiteral(node.operand)) {
      return this.make(node, {
        kind: "numberLit",
        value: -Number(node.operand.text),
        raw: node.getText(this.sourceFile),
      });
    }
    return this.make(node, {
      kind: "unary",
      op,
      operand: this.lowerExpr(node.operand, scope),
    });
  }

  private lowerPropertyAccess(
    node: ts.PropertyAccessExpression,
    scope: LowerScope,
  ): HirExpr {
    const property = node.name.text;

    if (ts.isIdentifier(node.expression)) {
      const objectName = node.expression.text;

      if (objectName === "Math") {
        if (MATH_CONSTANTS.has(property)) {
          return this.make(node, {
            kind: "constant",
            name: property as "PI" | "E",
          });
        }
        this.fail(
          node,
          "hir:math-reference",
          `\`Math.${property}\` can only be used as a function call.`,
        );
      }

      if (objectName === "Number") {
        if (property === "POSITIVE_INFINITY") {
          return this.make(node, { kind: "constant", name: "Infinity" });
        }
        if (property === "NaN") {
          return this.make(node, { kind: "constant", name: "NaN" });
        }
        this.fail(
          node,
          "hir:unsupported-syntax",
          `\`Number.${property}\` is not supported.`,
        );
      }

      if (
        objectName === scope.parametersName &&
        !scope.locals.has(objectName)
      ) {
        return this.make(node, { kind: "paramRef", name: property });
      }
    }

    if (property === "length") {
      return this.make(node, {
        kind: "length",
        target: this.lowerExpr(node.expression, scope),
      });
    }

    return this.make(node, {
      kind: "fieldAccess",
      target: this.lowerExpr(node.expression, scope),
      field: property,
      fieldSpan: this.spanOf(node.name),
    });
  }

  private lowerCall(node: ts.CallExpression, scope: LowerScope): HirExpr {
    const callee = node.expression;

    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;

      // Math.fn(...)
      if (
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "Math"
      ) {
        if (!(HIR_MATH_FNS as readonly string[]).includes(method)) {
          this.fail(
            callee.name,
            "hir:unknown-math-function",
            `\`Math.${method}\` is not supported.`,
          );
        }
        return this.make(node, {
          kind: "mathCall",
          fn: method as HirMathFn,
          args: node.arguments.map((argument) =>
            this.lowerExpr(argument, scope),
          ),
        });
      }

      // Uuid.generate() / Uuid.from(value)
      if (
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "Uuid"
      ) {
        if (method === "generate") {
          if (node.arguments.length !== 0) {
            this.fail(
              node,
              "hir:uuid-arity",
              "`Uuid.generate()` takes no arguments.",
            );
          }
          return this.make(node, { kind: "uuidGenerate" });
        }
        if (method === "from") {
          if (node.arguments.length !== 1) {
            this.fail(
              node,
              "hir:uuid-arity",
              "`Uuid.from(value)` takes exactly one argument.",
            );
          }
          return this.make(node, {
            kind: "uuidFrom",
            operand: this.lowerExpr(node.arguments[0]!, scope),
          });
        }
        this.fail(
          callee.name,
          "hir:unknown-uuid-helper",
          `Unknown helper \`Uuid.${method}\` — expected \`generate\` or \`from\`.`,
        );
      }

      // Distribution.Gaussian(...) / Uniform / Lognormal
      if (
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "Distribution"
      ) {
        const dist = DISTRIBUTION_FACTORIES[method];
        if (!dist) {
          this.fail(
            callee.name,
            "hir:unknown-distribution",
            `Unknown distribution \`Distribution.${method}\` — expected Gaussian, Uniform or Lognormal.`,
          );
        }
        return this.make(node, {
          kind: "distribution",
          dist,
          args: node.arguments.map((argument) =>
            this.lowerExpr(argument, scope),
          ),
        });
      }

      // <expr>.map(...)
      if (method === "map") {
        return this.lowerMapCall(node, callee, scope);
      }

      // <expr>.reduce((acc, element, index?) => ..., initial)
      if (method === "reduce") {
        return this.lowerReduceCall(node, callee, scope);
      }

      // <expr>.concat(other)
      if (method === "concat") {
        if (node.arguments.length !== 1) {
          this.fail(
            node,
            "hir:concat-arity",
            "`.concat(...)` takes exactly one array argument.",
          );
        }
        return this.make(node, {
          kind: "arrayConcat",
          left: this.lowerExpr(callee.expression, scope),
          right: this.lowerExpr(node.arguments[0]!, scope),
        });
      }

      // String predicates: <expr>.startsWith(arg) etc.
      if ((HIR_STRING_FNS as readonly string[]).includes(method)) {
        if (node.arguments.length !== 1) {
          this.fail(
            node,
            "hir:string-call-arity",
            `\`.${method}(...)\` takes exactly one argument.`,
          );
        }
        return this.make(node, {
          kind: "stringCall",
          fn: method as (typeof HIR_STRING_FNS)[number],
          target: this.lowerExpr(callee.expression, scope),
          argument: this.lowerExpr(node.arguments[0]!, scope),
        });
      }
    }

    this.fail(
      node,
      "hir:unsupported-call",
      "Only `Math.*`, `Distribution.*`, `.map(...)`, `.reduce(...)` and `.concat(...)` calls are supported.",
    );
  }

  private lowerReduceCall(
    node: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    scope: LowerScope,
  ): HirExpr {
    if (node.arguments.length !== 2) {
      this.fail(
        node,
        "hir:reduce-arity",
        "`.reduce(...)` expects exactly two arguments: a callback and an initial value.",
      );
    }
    const target = this.lowerExpr(callee.expression, scope);
    const callback = node.arguments[0]!;
    if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
      this.fail(
        callback,
        "hir:map-callback",
        "`.reduce(...)` expects an inline function, e.g. `.reduce((sum, token) => sum + token.x, 0)`.",
      );
    }
    if (callback.parameters.length < 2 || callback.parameters.length > 3) {
      this.fail(
        callback,
        "hir:reduce-arity",
        "`.reduce(...)` callbacks take (accumulator, element) or (accumulator, element, index).",
      );
    }

    const bodyScope = childScope(scope);
    const bindParam = (
      parameter: ts.ParameterDeclaration,
    ): { name: string; span: Span } => {
      if (!ts.isIdentifier(parameter.name)) {
        this.fail(
          parameter.name,
          "hir:destructured-binding",
          "`.reduce(...)` callback parameters must be plain names.",
        );
      }
      const bound = {
        name: parameter.name.text,
        span: this.spanOf(parameter.name),
      };
      bodyScope.locals.add(bound.name);
      bodyScope.distributionLocals.delete(bound.name);
      bodyScope.destructuredFields.delete(bound.name);
      bodyScope.parameterAliases.delete(bound.name);
      return bound;
    };

    const accParam = bindParam(callback.parameters[0]!);
    const param = bindParam(callback.parameters[1]!);
    const indexParam = callback.parameters[2]
      ? bindParam(callback.parameters[2])
      : undefined;

    // The initial value is evaluated in the outer scope.
    const initial = this.lowerExpr(node.arguments[1]!, scope);

    const body = ts.isBlock(callback.body)
      ? this.lowerBlock(callback.body, bodyScope)
      : this.lowerExpr(callback.body, bodyScope);

    return this.make(node, {
      kind: "arrayReduce",
      target,
      accParam,
      param,
      indexParam,
      body,
      initial,
    });
  }

  private lowerMapCall(
    node: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    scope: LowerScope,
  ): HirExpr {
    if (node.arguments.length !== 1) {
      this.fail(
        node,
        "hir:map-arity",
        "`.map(...)` expects exactly one callback argument.",
      );
    }
    const target = this.lowerExpr(callee.expression, scope);
    const callback = node.arguments[0]!;

    if (this.isDistributionValued(target, scope)) {
      return this.lowerDistributionMap(node, target, callback, scope);
    }

    if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
      this.fail(
        callback,
        "hir:map-callback",
        "`.map(...)` expects an inline function, e.g. `.map((token) => ...)`.",
      );
    }
    if (callback.parameters.length > 2) {
      this.fail(
        callback.parameters[2]!,
        "hir:map-arity",
        "`.map(...)` callbacks take at most (element, index).",
      );
    }

    const bodyScope = childScope(scope);
    let param: { name: string; span: Span };

    const firstParam = callback.parameters[0];
    if (!firstParam) {
      param = { name: "__element", span: this.spanOf(callback) };
    } else if (ts.isIdentifier(firstParam.name)) {
      param = {
        name: firstParam.name.text,
        span: this.spanOf(firstParam.name),
      };
      bodyScope.locals.add(param.name);
      bodyScope.distributionLocals.delete(param.name);
      bodyScope.destructuredFields.delete(param.name);
      bodyScope.parameterAliases.delete(param.name);
    } else if (ts.isObjectBindingPattern(firstParam.name)) {
      param = { name: "__element", span: this.spanOf(firstParam.name) };
      for (const element of firstParam.name.elements) {
        if (
          element.dotDotDotToken ||
          element.propertyName !== undefined ||
          !ts.isIdentifier(element.name)
        ) {
          this.fail(
            element,
            "hir:destructured-binding",
            "Only simple destructuring like `({ x, y })` is supported in `.map(...)` callbacks.",
          );
        }
        bodyScope.destructuredFields.set(element.name.text, param.name);
        bodyScope.locals.delete(element.name.text);
        bodyScope.distributionLocals.delete(element.name.text);
      }
      bodyScope.locals.add(param.name);
    } else {
      this.fail(
        firstParam.name,
        "hir:destructured-binding",
        "Array destructuring is not supported in `.map(...)` callbacks.",
      );
    }

    let indexParam: { name: string; span: Span } | undefined;
    const secondParam = callback.parameters[1];
    if (secondParam) {
      if (!ts.isIdentifier(secondParam.name)) {
        this.fail(
          secondParam.name,
          "hir:destructured-binding",
          "The `.map(...)` index parameter must be a plain name.",
        );
      }
      indexParam = {
        name: secondParam.name.text,
        span: this.spanOf(secondParam.name),
      };
      bodyScope.locals.add(indexParam.name);
      bodyScope.distributionLocals.delete(indexParam.name);
      bodyScope.destructuredFields.delete(indexParam.name);
      bodyScope.parameterAliases.delete(indexParam.name);
    }

    const body = ts.isBlock(callback.body)
      ? this.lowerBlock(callback.body, bodyScope)
      : this.lowerExpr(callback.body, bodyScope);

    return this.make(node, {
      kind: "arrayMap",
      target,
      param,
      indexParam,
      body,
    });
  }

  private lowerDistributionMap(
    node: ts.CallExpression,
    base: HirExpr,
    callback: ts.Expression,
    scope: LowerScope,
  ): HirExpr {
    // `dist.map(Math.cos)` — expand the function reference to a callback.
    if (
      ts.isPropertyAccessExpression(callback) &&
      ts.isIdentifier(callback.expression) &&
      callback.expression.text === "Math"
    ) {
      const method = callback.name.text;
      if (!(HIR_MATH_FNS as readonly string[]).includes(method)) {
        this.fail(
          callback.name,
          "hir:unknown-math-function",
          `\`Math.${method}\` is not supported.`,
        );
      }
      const paramName = "__sample";
      const argRef = this.make(callback, {
        kind: "localRef",
        name: paramName,
      });
      const body = this.make(callback, {
        kind: "mathCall",
        fn: method as HirMathFn,
        args: [argRef],
      });
      return this.make(node, {
        kind: "distributionMap",
        base,
        param: { name: paramName, span: this.spanOf(callback) },
        body,
      });
    }

    if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
      this.fail(
        callback,
        "hir:map-callback",
        "Distribution `.map(...)` expects an inline function or a `Math.*` reference.",
      );
    }
    if (callback.parameters.length !== 1) {
      this.fail(
        callback,
        "hir:map-arity",
        "Distribution `.map(...)` callbacks take exactly one parameter (the sampled value).",
      );
    }
    const parameter = callback.parameters[0]!;
    if (!ts.isIdentifier(parameter.name)) {
      this.fail(
        parameter.name,
        "hir:destructured-binding",
        "Distribution `.map(...)` parameters must be plain names.",
      );
    }

    const bodyScope = childScope(scope);
    const paramName = parameter.name.text;
    bodyScope.locals.add(paramName);
    bodyScope.distributionLocals.delete(paramName);
    bodyScope.destructuredFields.delete(paramName);
    bodyScope.parameterAliases.delete(paramName);

    const body = ts.isBlock(callback.body)
      ? this.lowerBlock(callback.body, bodyScope)
      : this.lowerExpr(callback.body, bodyScope);

    return this.make(node, {
      kind: "distributionMap",
      base,
      param: { name: paramName, span: this.spanOf(parameter.name) },
      body,
    });
  }

  private lowerObjectLiteral(
    node: ts.ObjectLiteralExpression,
    scope: LowerScope,
  ): HirExpr {
    const entries: { key: string; keySpan: Span; value: HirExpr }[] = [];
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = property.name;
        if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
          entries.push({
            key: name.text,
            keySpan: this.spanOf(name),
            value: this.lowerExpr(property.initializer, scope),
          });
        } else {
          this.fail(
            name,
            "hir:computed-key",
            "Computed object keys are not supported.",
          );
        }
      } else if (ts.isShorthandPropertyAssignment(property)) {
        entries.push({
          key: property.name.text,
          keySpan: this.spanOf(property.name),
          value: this.lowerIdentifier(property.name, scope),
        });
      } else if (ts.isSpreadAssignment(property)) {
        this.fail(
          property,
          "hir:spread",
          "Object spread is not supported yet — list attributes explicitly.",
        );
      } else {
        this.fail(
          property,
          "hir:unsupported-syntax",
          "Only `key: value` entries are supported in object literals.",
        );
      }
    }
    return this.make(node, { kind: "recordLit", entries });
  }

  /**
   * Conservative distribution-ness test, used to disambiguate `.map(...)`
   * between array comprehensions and derived distributions.
   */
  private isDistributionValued(expr: HirExpr, scope: LowerScope): boolean {
    switch (expr.kind) {
      case "distribution":
      case "distributionMap":
        return true;
      case "localRef":
        return scope.distributionLocals.has(expr.name);
      case "cond":
        return (
          this.isDistributionValued(expr.thenBranch, scope) ||
          this.isDistributionValued(expr.elseBranch, scope)
        );
      case "let":
        return this.isDistributionValued(expr.body, scope);
      default:
        return false;
    }
  }
}

/**
 * Shifts a span from wrapped-metric-source coordinates back onto the raw
 * user body: subtracts the prefix length and clamps the result into
 * `[0, codeLength]` (spans covering the synthetic prefix/suffix collapse to
 * the nearest edge of the user text).
 */
function shiftMetricSpan(span: Span, codeLength: number): void {
  const start = Math.min(
    Math.max(0, span.start - METRIC_PREFIX.length),
    codeLength,
  );
  const end = Math.min(
    Math.max(start, span.start + span.length - METRIC_PREFIX.length),
    codeLength,
  );
  // eslint-disable-next-line no-param-reassign -- in-place span rebasing over freshly-built nodes is the point of this helper
  span.start = start;
  // eslint-disable-next-line no-param-reassign -- see above
  span.length = end - start;
}

/** Shifts every span in a lowered metric function (nodes, binding names,
 * record keys, callback params, fn/params spans) onto the raw user body. */
function shiftMetricFunctionSpans(fn: HirFunction, codeLength: number): void {
  shiftMetricSpan(fn.span, codeLength);
  for (const param of fn.params) {
    shiftMetricSpan(param.span, codeLength);
  }
  walkHir(fn.body, (node) => {
    shiftMetricSpan(node.span, codeLength);
    switch (node.kind) {
      case "fieldAccess":
        shiftMetricSpan(node.fieldSpan, codeLength);
        break;
      case "let":
        for (const binding of node.bindings) {
          shiftMetricSpan(binding.nameSpan, codeLength);
        }
        break;
      case "recordLit":
        for (const entry of node.entries) {
          shiftMetricSpan(entry.keySpan, codeLength);
        }
        break;
      case "arrayMap":
        shiftMetricSpan(node.param.span, codeLength);
        if (node.indexParam) {
          shiftMetricSpan(node.indexParam.span, codeLength);
        }
        break;
      case "arrayReduce":
        shiftMetricSpan(node.accParam.span, codeLength);
        shiftMetricSpan(node.param.span, codeLength);
        if (node.indexParam) {
          shiftMetricSpan(node.indexParam.span, codeLength);
        }
        break;
      case "distributionMap":
        shiftMetricSpan(node.param.span, codeLength);
        break;
      default:
        break;
    }
  });
}

function parseErrorDiagnostics(
  sourceFile: ts.SourceFile,
): HirDiagnostic[] | null {
  // `parseDiagnostics` is not part of the public API but has been stable
  // across TypeScript versions.
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & {
      parseDiagnostics?: ts.DiagnosticWithLocation[];
    }
  ).parseDiagnostics;
  if (!parseDiagnostics || parseDiagnostics.length === 0) {
    return null;
  }
  return parseDiagnostics.slice(0, 3).map((diagnostic) => ({
    code: "hir:parse-error",
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    severity: "error" as const,
    span: {
      start: diagnostic.start,
      length: Math.max(diagnostic.length, 1),
    },
  }));
}

/**
 * Lowers a metric function body (`state` in scope, statements ending in
 * `return`). The body is wrapped as `(state) => { ... }` for parsing; all
 * spans in the result (including diagnostics) are shifted back so they are
 * relative to the raw user body.
 */
function lowerMetricBodyToHir(code: string): LowerTypeScriptResult {
  const wrapped = METRIC_PREFIX + code + METRIC_SUFFIX;
  const sourceFile = ts.createSourceFile(
    "user-metric.ts",
    wrapped,
    ts.ScriptTarget.ES2020,
    /* setParentNodes */ true,
  );

  const shiftDiagnostic = (diagnostic: HirDiagnostic): HirDiagnostic => {
    const span = { ...diagnostic.span };
    shiftMetricSpan(span, code.length);
    return { ...diagnostic, span };
  };

  const parseErrors = parseErrorDiagnostics(sourceFile);
  if (parseErrors) {
    return { ok: false, diagnostics: parseErrors.map(shiftDiagnostic) };
  }

  try {
    const fn = new Lowering(sourceFile, "metric").lowerMetricModule();
    shiftMetricFunctionSpans(fn, code.length);
    return { ok: true, fn, diagnostics: [] };
  } catch (error) {
    if (error instanceof LowerError) {
      return { ok: false, diagnostics: [shiftDiagnostic(error.diagnostic)] };
    }
    throw error;
  }
}

/**
 * Lowers user-authored TypeScript to an `HirFunction`.
 *
 * For module surfaces (dynamics/lambda/kernel), `code` must be the
 * user-visible `export default Ctor(...)` module; for the `metric` surface it
 * is a bare function body with `state` in scope. All spans in the result are
 * relative to `code`. Returns `ok: false` with a positioned diagnostic when
 * the code is syntactically invalid or falls outside the analyzable subset.
 */
export function lowerTypeScriptToHir(
  code: string,
  surface: HirSurfaceKind,
): LowerTypeScriptResult {
  if (surface === "metric") {
    return lowerMetricBodyToHir(code);
  }

  const sourceFile = ts.createSourceFile(
    "user-code.ts",
    code,
    ts.ScriptTarget.ES2020,
    /* setParentNodes */ true,
  );

  // Short-circuit on parse errors so downstream diagnostics don't pile on top
  // of syntactically broken code.
  const parseErrors = parseErrorDiagnostics(sourceFile);
  if (parseErrors) {
    return { ok: false, diagnostics: parseErrors };
  }

  try {
    const fn = new Lowering(sourceFile, surface).lowerModule();
    return { ok: true, fn, diagnostics: [] };
  } catch (error) {
    if (error instanceof LowerError) {
      return { ok: false, diagnostics: [error.diagnostic] };
    }
    throw error;
  }
}
