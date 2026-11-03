/**
 * Lowers a visualizer module, JavaScript with JSX, to the view HIR.
 *
 * The module shape is `export default Visualization(({ tokens, parameters })
 * => …)`. JSX, and the `?:`, `&&` and `.map(...)` that choose or repeat
 * elements, lower to view nodes here; every other expression is handed to
 * the expression HIR's lowering under the `visualizer` surface, which owns
 * scopes, bindings and the accepted expression subset. The element and
 * attribute names are judged here, before their values, so a diagnostic
 * names the element rather than whatever inside it fails to lower first.
 *
 * This module imports `typescript`, so it stays out of browser main bundles:
 * the editor lowers through the language worker (`sdcpn/lowerVisualizer`).
 */
import ts from "@typescript/typescript6";

import {
  lowerWithExpressions,
  parseErrorDiagnostics,
} from "../hir/lower-typescript";
import { rejectTypeScriptSyntax } from "./reject-typescript-syntax";
import { VIEW_ELEMENT_ATTRIBUTES, VIEW_ELEMENT_TAGS } from "./view-elements";
import { VIEW_FRAGMENT_TAG } from "./view-hir";

import type { HirDiagnostic, HirExpr } from "../hir/hir";
import type {
  HirExpressionLowering,
  HirLoweringScope,
  HirStatementBuilder,
} from "../hir/lower-typescript";
import type { ViewAttribute, ViewHir, ViewNode } from "./view-hir";

export type LowerViewResult =
  | { ok: true; view: ViewHir }
  | { ok: false; diagnostics: HirDiagnostic[] };

/** The visualizer module's constructor: `export default Visualization(...)`. */
const CONSTRUCTOR_NAME = "Visualization";

/** The local a destructured props parameter reads from. */
const PROPS_PARAMETER_NAME = "__props";

type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment;

const isJsxNode = (node: ts.Node): node is JsxNode =>
  ts.isJsxElement(node) ||
  ts.isJsxSelfClosingElement(node) ||
  ts.isJsxFragment(node);

/**
 * JSX text as React receives it: lines of only whitespace are dropped,
 * indentation and trailing whitespace of inner lines are trimmed, and the
 * remaining lines are joined with single spaces. Returns null when nothing
 * is left. The algorithm is the one every JSX compiler implements.
 */
function cleanJsxText(text: string): string | null {
  const lines = text.split(/\r\n|\n|\r/u);
  let lastNonEmptyLine = 0;
  for (const [index, line] of lines.entries()) {
    if (/[^ \t]/u.test(line)) {
      lastNonEmptyLine = index;
    }
  }
  let result = "";
  for (const [index, rawLine] of lines.entries()) {
    const isFirst = index === 0;
    const isLast = index === lines.length - 1;
    const isLastNonEmpty = index === lastNonEmptyLine;
    let line = rawLine.replace(/\t/gu, " ");
    if (!isFirst) {
      line = line.replace(/^ +/u, "");
    }
    if (!isLast) {
      line = line.replace(/ +$/u, "");
    }
    if (line) {
      if (!isLastNonEmpty) {
        line += " ";
      }
      result += line;
    }
  }
  return result === "" ? null : result;
}

class ViewLowering {
  /** How a block body's statements become a view node. */
  private readonly builder: HirStatementBuilder<ViewNode> = {
    tail: (expression, scope) => this.lowerChild(expression, scope),
    bindings: (bindings, body, anchor) => ({
      kind: "let",
      span: this.expressions.spanOf(anchor),
      bindings,
      body,
    }),
    branch: (condition, thenBranch, elseBranch, statement) => ({
      kind: "cond",
      span: this.expressions.spanOf(statement),
      condition,
      thenBranch,
      elseBranch,
    }),
  };

  constructor(
    private readonly sourceFile: ts.SourceFile,
    private readonly expressions: HirExpressionLowering,
  ) {}

  lowerModule(): ViewHir {
    let exportAssignment: ts.ExportAssignment | undefined;
    for (const statement of this.sourceFile.statements) {
      if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
        if (exportAssignment) {
          this.expressions.fail(
            statement,
            "hir:multiple-default-exports",
            "Only one default export is allowed.",
          );
        }
        exportAssignment = statement;
      } else if (ts.isImportDeclaration(statement)) {
        this.expressions.fail(
          statement,
          "hir:unsupported-statement",
          "Imports are not available: a visualizer is a pure function of its tokens and parameters, drawn with JSX elements.",
        );
      } else {
        this.expressions.fail(
          statement,
          "hir:unsupported-statement",
          `Only \`export default ${CONSTRUCTOR_NAME}(...)\` is supported at the top level.`,
        );
      }
    }
    if (!exportAssignment) {
      this.expressions.fail(
        this.sourceFile,
        "hir:missing-default-export",
        `Expected \`export default ${CONSTRUCTOR_NAME}(...)\`.`,
      );
    }

    const call = exportAssignment.expression;
    if (
      !ts.isCallExpression(call) ||
      !ts.isIdentifier(call.expression) ||
      call.expression.text !== CONSTRUCTOR_NAME
    ) {
      this.expressions.fail(
        call,
        "hir:missing-constructor",
        `The default export must be a \`${CONSTRUCTOR_NAME}(...)\` call.`,
      );
    }
    if (call.arguments.length !== 1) {
      this.expressions.fail(
        call,
        "hir:constructor-arity",
        `\`${CONSTRUCTOR_NAME}\` expects exactly one function argument.`,
      );
    }
    const component = call.arguments[0]!;
    if (!ts.isArrowFunction(component) && !ts.isFunctionExpression(component)) {
      this.expressions.fail(
        component,
        "hir:missing-function",
        `\`${CONSTRUCTOR_NAME}\` expects a function argument, e.g. \`({ tokens, parameters }) => <svg>…</svg>\`.`,
      );
    }
    if (component.parameters.length > 1) {
      this.expressions.fail(
        component.parameters[1]!,
        "hir:too-many-parameters",
        "A visualizer takes one props argument: `({ tokens, parameters }) => ...`.",
      );
    }

    const scope = this.expressions.newScope();
    const propsParameter = component.parameters[0];
    const props = propsParameter
      ? this.expressions.bindInputParameter(
          propsParameter,
          PROPS_PARAMETER_NAME,
          scope,
        )
      : null;

    const body = ts.isBlock(component.body)
      ? this.expressions.lowerBlockAs(component.body, scope, this.builder)
      : this.lowerChild(component.body, scope);

    return {
      viewVersion: 1,
      props,
      body,
      span: this.expressions.spanOf(component),
    };
  }

  /**
   * Lowers an expression in child position: the picture itself, a `{…}`
   * child, a branch of `?:` or `&&`, or a `.map(...)` callback's result.
   * Elements and the operators that choose or repeat them become view
   * nodes; anything else is an expression written as text.
   */
  private lowerChild(node: ts.Expression, scope: HirLoweringScope): ViewNode {
    if (ts.isParenthesizedExpression(node)) {
      return this.lowerChild(node.expression, scope);
    }
    if (isJsxNode(node)) {
      return this.lowerElement(node, scope);
    }
    if (
      node.kind === ts.SyntaxKind.NullKeyword ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword
    ) {
      return { kind: "empty", span: this.expressions.spanOf(node) };
    }
    if (ts.isConditionalExpression(node)) {
      return {
        kind: "cond",
        span: this.expressions.spanOf(node),
        condition: this.expressions.lowerExpr(node.condition, scope),
        thenBranch: this.lowerChild(node.whenTrue, scope),
        elseBranch: this.lowerChild(node.whenFalse, scope),
      };
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      return {
        kind: "and",
        span: this.expressions.spanOf(node),
        condition: this.expressions.lowerExpr(node.left, scope),
        body: this.lowerChild(node.right, scope),
      };
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "map" &&
      node.arguments.length === 1 &&
      (ts.isArrowFunction(node.arguments[0]!) ||
        ts.isFunctionExpression(node.arguments[0]!))
    ) {
      return this.lowerMap(node, node.expression, node.arguments[0]!, scope);
    }
    return {
      kind: "expr",
      span: this.expressions.spanOf(node),
      expr: this.expressions.lowerExpr(node, scope),
    };
  }

  /** `target.map((item, index?) => body)` whose body draws. */
  private lowerMap(
    node: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    callback: ts.ArrowFunction | ts.FunctionExpression,
    scope: HirLoweringScope,
  ): ViewNode {
    const target = this.expressions.lowerExpr(callee.expression, scope);
    const { param, indexParam, bodyScope } =
      this.expressions.lowerCallbackParameters(callback, scope);
    const body = ts.isBlock(callback.body)
      ? this.expressions.lowerBlockAs(callback.body, bodyScope, this.builder)
      : this.lowerChild(callback.body, bodyScope);
    return {
      kind: "map",
      span: this.expressions.spanOf(node),
      target,
      param,
      indexParam,
      body,
    };
  }

  /**
   * Lowers a JSX element, self-closing element or fragment. Attribute values
   * follow JSX: a bare attribute is `true`, a string is a literal, `{...}`
   * is an expression. `key` becomes the element's key.
   */
  private lowerElement(node: JsxNode, scope: HirLoweringScope): ViewNode {
    if (ts.isJsxFragment(node)) {
      return {
        kind: "element",
        span: this.expressions.spanOf(node),
        tag: VIEW_FRAGMENT_TAG,
        tagSpan: this.expressions.spanOf(node.openingFragment),
        attributes: [],
        children: this.lowerChildren(node.children, scope),
      };
    }
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const { tagName } = opening;
    if (!ts.isIdentifier(tagName)) {
      this.expressions.fail(
        tagName,
        "hir:unknown-element",
        "Only plain element names like `svg` or `circle` can be drawn.",
      );
    }
    const tag = tagName.text;
    if (/^[A-Z]/u.test(tag)) {
      this.expressions.fail(
        tagName,
        "hir:unknown-element",
        `\`<${tag}>\` is a component; a visualizer draws elements such as \`<svg>\`, \`<g>\` and \`<circle>\` only.`,
      );
    }
    if (!VIEW_ELEMENT_TAGS.has(tag)) {
      this.expressions.fail(
        tagName,
        "hir:unknown-element",
        `\`<${tag}>\` cannot be drawn by a visualizer. Images, links, scripts and embedded content are not available.`,
      );
    }

    const attributes: ViewAttribute[] = [];
    let key: HirExpr | undefined;
    for (const property of opening.attributes.properties) {
      if (ts.isJsxSpreadAttribute(property)) {
        this.expressions.fail(
          property,
          "hir:spread",
          "Spread attributes are not supported — list attributes explicitly.",
        );
      }
      if (!ts.isIdentifier(property.name)) {
        this.expressions.fail(
          property.name,
          "hir:unknown-element-attribute",
          "Namespaced attributes such as `xlink:href` are not available.",
        );
      }
      const name = property.name.text;
      if (name !== "key" && !VIEW_ELEMENT_ATTRIBUTES.has(name)) {
        this.expressions.fail(
          property.name,
          "hir:unknown-element-attribute",
          /^on[A-Z]/u.test(name)
            ? `\`${name}\` is an event handler; a visualizer cannot react to events.`
            : `\`${name}\` is not an attribute a visualizer can set.`,
        );
      }
      const value = this.lowerAttributeValue(name, property, scope);
      if (name === "key") {
        if (key) {
          this.expressions.fail(
            property,
            "hir:duplicate-key",
            "Duplicate `key`.",
          );
        }
        key = value;
      } else {
        attributes.push({
          name,
          nameSpan: this.expressions.spanOf(property.name),
          value,
        });
      }
    }

    return {
      kind: "element",
      span: this.expressions.spanOf(node),
      tag,
      tagSpan: this.expressions.spanOf(tagName),
      attributes,
      key,
      children: ts.isJsxElement(node)
        ? this.lowerChildren(node.children, scope)
        : [],
    };
  }

  private lowerAttributeValue(
    name: string,
    property: ts.JsxAttribute,
    scope: HirLoweringScope,
  ): HirExpr {
    const { initializer } = property;
    if (initializer === undefined) {
      return this.expressions.makeBoolLit(property, true);
    }
    if (ts.isStringLiteralLike(initializer)) {
      return this.expressions.makeStringLit(initializer, initializer.text);
    }
    if (ts.isJsxExpression(initializer)) {
      if (initializer.dotDotDotToken || !initializer.expression) {
        this.expressions.fail(
          initializer,
          "hir:element-attribute-value",
          `\`${name}\` needs a value, e.g. \`${name}={value}\`.`,
        );
      }
      if (!isJsxNode(initializer.expression)) {
        return this.expressions.lowerExpr(initializer.expression, scope);
      }
    }
    return this.expressions.fail(
      initializer,
      "hir:element-attribute-value",
      `\`${name}\` takes a value, not an element.`,
    );
  }

  /** Lowers JSX children: text (whitespace-cleaned as JSX does), `{...}`
   * expressions and nested elements. `{/* comment *\/}` yields nothing. */
  private lowerChildren(
    children: ts.NodeArray<ts.JsxChild>,
    scope: HirLoweringScope,
  ): ViewNode[] {
    const lowered: ViewNode[] = [];
    for (const child of children) {
      if (ts.isJsxText(child)) {
        const text = cleanJsxText(child.text);
        if (text !== null) {
          lowered.push({
            kind: "text",
            span: this.expressions.spanOf(child),
            value: text,
          });
        }
      } else if (ts.isJsxExpression(child)) {
        if (child.dotDotDotToken) {
          this.expressions.fail(
            child,
            "hir:spread",
            "Spread children are not supported — list children explicitly.",
          );
        }
        if (child.expression) {
          lowered.push(this.lowerChild(child.expression, scope));
        }
      } else {
        lowered.push(this.lowerElement(child, scope));
      }
    }
    return lowered;
  }
}

/**
 * Lowers a visualizer module to the view HIR. The source is parsed as TSX
 * for the JSX grammar, and every TypeScript-only construct is rejected
 * before lowering: a visualizer is JavaScript. Returns the first diagnostic
 * that stops the lowering, positioned in the source.
 */
export function lowerViewHir(code: string): LowerViewResult {
  const sourceFile = ts.createSourceFile(
    "visualizer.jsx",
    code,
    ts.ScriptTarget.ES2020,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
  const parseErrors = parseErrorDiagnostics(sourceFile);
  if (parseErrors) {
    return { ok: false, diagnostics: parseErrors };
  }
  const lowered = lowerWithExpressions(sourceFile, "visualizer", (lowering) => {
    rejectTypeScriptSyntax(sourceFile, (node, diagnosticCode, message) =>
      lowering.fail(node, diagnosticCode, message),
    );
    return new ViewLowering(sourceFile, lowering).lowerModule();
  });
  return lowered.ok
    ? { ok: true, view: lowered.value }
    : { ok: false, diagnostics: lowered.diagnostics };
}
