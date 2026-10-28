/**
 * Checks a lowered visualizer against its place: the elements, attributes
 * and style properties it draws are in the allowlists, their values are
 * text-like, literal values reference no remote URL, and the picture itself
 * is an element. Every expression is typed by the expression HIR's checker
 * under the `visualizer` surface, with the props and callback parameters
 * bound as the view tree introduces them.
 */
import { formatHirType, HIR_TYPE_INT, HIR_TYPE_UNKNOWN } from "../hir/hir";
import {
  createHirExpressionChecker,
  hirTokenRecordType,
  hirTypeOfAttribute,
  isTextualHirType,
} from "../hir/typecheck";
import {
  isSafeViewValue,
  VIEW_ELEMENT_ATTRIBUTES,
  VIEW_ELEMENT_TAGS,
  VIEW_STYLE_PROPERTIES,
} from "./view-elements";
import { VIEW_FRAGMENT_TAG } from "./view-hir";

import type { HirDiagnostic, HirExpr, HirType } from "../hir/hir";
import type { HirVisualizerContext } from "../hir/surface-context";
import type { HirExpressionChecker } from "../hir/typecheck";
import type { ViewElement, ViewHir, ViewNode } from "./view-hir";

type Env = ReadonlyMap<string, HirType>;

/**
 * The component's props: `{ tokens, parameters }`. An uncoloured place
 * carries black tokens with no attributes; its visualizer is never drawn,
 * so its tokens stay unknown.
 */
function propsType(context: HirVisualizerContext): HirType {
  return {
    kind: "record",
    fields: [
      {
        name: "tokens",
        type: {
          kind: "array",
          element: context.elements
            ? hirTokenRecordType(context.elements)
            : HIR_TYPE_UNKNOWN,
        },
      },
      {
        name: "parameters",
        type: {
          kind: "record",
          fields: context.parameters.map((parameter) => ({
            name: parameter.name,
            type: hirTypeOfAttribute(parameter),
          })),
        },
      },
    ],
  };
}

/** What `{…}` may write: text-like scalars, nothing, and arrays of those
 * (`tokens.map((token) => token.name)`). Records are not drawable. */
function isWritable(type: HirType): boolean {
  if (type.kind === "array") {
    return isWritable(type.element);
  }
  return type.kind === "null" || isTextualHirType(type);
}

class ViewChecker {
  constructor(private readonly expressions: HirExpressionChecker) {}

  check(node: ViewNode, env: Env): void {
    switch (node.kind) {
      case "element":
        this.checkElement(node, env);
        return;
      case "text":
      case "empty":
        return;
      case "expr": {
        const type = this.expressions.infer(node.expr, env);
        if (!isWritable(type)) {
          this.expressions.report(
            node.span,
            "hir:element-child",
            `An element can contain text, numbers and elements, not ${formatHirType(type)}.`,
          );
        }
        this.checkLiteralValue(node.expr);
        return;
      }
      case "cond":
        // Conditions are judged by truthiness, as JavaScript does: the
        // expression checker admits any type on the visualizer surface.
        this.expressions.infer(node.condition, env);
        this.check(node.thenBranch, env);
        this.check(node.elseBranch, env);
        return;
      case "and":
        this.expressions.infer(node.condition, env);
        this.check(node.body, env);
        return;
      case "map": {
        const targetType = this.expressions.infer(node.target, env);
        let itemType: HirType = HIR_TYPE_UNKNOWN;
        if (targetType.kind === "array") {
          itemType = targetType.element;
        } else if (targetType.kind !== "unknown") {
          this.expressions.report(
            node.target.span,
            "hir:invalid-map",
            `\`.map(...)\` is only available on arrays, not ${formatHirType(targetType)}.`,
          );
        }
        const scoped = new Map(env);
        scoped.set(node.param.name, itemType);
        if (node.indexParam) {
          scoped.set(node.indexParam.name, HIR_TYPE_INT);
        }
        this.check(node.body, scoped);
        return;
      }
      case "let": {
        const scoped = new Map(env);
        for (const binding of node.bindings) {
          scoped.set(
            binding.name,
            this.expressions.infer(binding.value, scoped),
          );
        }
        this.check(node.body, scoped);
      }
    }
  }

  /**
   * An element may only use the allowlisted tags, attributes and style
   * properties, and a literal value may not reference a remote URL. The
   * lowering already refused names outside the sets; this check guards
   * trees built elsewhere, and types the values. Dynamic values are checked
   * again by the renderer.
   */
  private checkElement(node: ViewElement, env: Env): void {
    if (node.tag !== VIEW_FRAGMENT_TAG && !VIEW_ELEMENT_TAGS.has(node.tag)) {
      this.expressions.report(
        node.tagSpan,
        "hir:unknown-element",
        `\`<${node.tag}>\` cannot be drawn by a visualizer. Images, links, scripts and embedded content are not available.`,
      );
    }
    for (const attribute of node.attributes) {
      if (!VIEW_ELEMENT_ATTRIBUTES.has(attribute.name)) {
        this.expressions.report(
          attribute.nameSpan,
          "hir:unknown-element-attribute",
          /^on[A-Z]/u.test(attribute.name)
            ? `\`${attribute.name}\` is an event handler; a visualizer cannot react to events.`
            : `\`${attribute.name}\` is not an attribute a visualizer can set.`,
        );
      }
      const valueType = this.expressions.infer(attribute.value, env);
      if (attribute.name === "style") {
        this.checkStyle(attribute.value, valueType);
      } else if (valueType.kind !== "null" && !isTextualHirType(valueType)) {
        this.expressions.report(
          attribute.value.span,
          "hir:element-attribute-value",
          `\`${attribute.name}\` takes a number, string or boolean, got ${formatHirType(valueType)}.`,
        );
      } else {
        this.checkLiteralValue(attribute.value);
      }
    }
    if (node.key) {
      const keyType = this.expressions.infer(node.key, env);
      if (!isTextualHirType(keyType)) {
        this.expressions.report(
          node.key.span,
          "hir:element-attribute-value",
          `\`key\` takes a number or string, got ${formatHirType(keyType)}.`,
        );
      }
    }
    for (const child of node.children) {
      this.check(child, env);
    }
  }

  /** `style={{ ... }}`: a record of allowlisted properties with text values. */
  private checkStyle(value: HirExpr, valueType: HirType): void {
    if (valueType.kind === "unknown") {
      return;
    }
    if (valueType.kind !== "record") {
      this.expressions.report(
        value.span,
        "hir:element-attribute-value",
        `\`style\` takes an object like \`{{ width: "100%" }}\`, got ${formatHirType(valueType)}.`,
      );
      return;
    }
    const entries = value.kind === "recordLit" ? value.entries : [];
    for (const field of valueType.fields) {
      const entry = entries.find((candidate) => candidate.key === field.name);
      if (!VIEW_STYLE_PROPERTIES.has(field.name)) {
        this.expressions.report(
          entry?.keySpan ?? value.span,
          "hir:unknown-style-property",
          `\`${field.name}\` is not a style property a visualizer can set.`,
        );
      }
      if (!isTextualHirType(field.type)) {
        this.expressions.report(
          entry?.value.span ?? value.span,
          "hir:element-attribute-value",
          `Style values are numbers or strings, got ${formatHirType(field.type)}.`,
        );
      }
      if (entry) {
        this.checkLiteralValue(entry.value);
      }
    }
  }

  /** A literal string with a remote `url(...)` is reported where it is
   * written; computed strings are checked when rendered. */
  private checkLiteralValue(value: HirExpr): void {
    if (value.kind === "stringLit" && !isSafeViewValue(value.value)) {
      this.expressions.report(
        value.span,
        "hir:unsafe-value",
        "`url(...)` may only reference an element of this picture, like `url(#marker)`.",
      );
    }
  }

  /** The picture must be an element (or nothing), whichever branch draws. */
  checkRoot(node: ViewNode): void {
    switch (node.kind) {
      case "element":
      case "empty":
        return;
      case "let":
      case "and":
        this.checkRoot(node.body);
        return;
      case "cond":
        this.checkRoot(node.thenBranch);
        this.checkRoot(node.elseBranch);
        return;
      case "text":
      case "expr":
      case "map":
        this.expressions.report(
          node.span,
          "hir:visualizer-return",
          "A visualizer must return an element such as `<svg>…</svg>`.",
        );
    }
  }
}

/** Checks a lowered visualizer against its place's colour and the net's
 * parameters, returning every diagnostic found. */
export function checkViewHir(
  view: ViewHir,
  context: HirVisualizerContext,
): HirDiagnostic[] {
  const expressions = createHirExpressionChecker(context);
  const checker = new ViewChecker(expressions);
  const env = new Map<string, HirType>();
  if (view.props) {
    env.set(view.props.name, propsType(context));
  }
  checker.check(view.body, env);
  checker.checkRoot(view.body);
  return [...expressions.diagnostics];
}
