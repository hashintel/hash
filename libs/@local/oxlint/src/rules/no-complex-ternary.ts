/**
 * Explains conditional work hidden inside ternary branches.
 *
 * Ternaries keep value selection beside its consumer. Calls and statement bodies make the reader follow a second operation inside that expression. Use explicit branching for conditional work, and select named callbacks instead of embedding functions. Moving a condition into a callback can change when it runs, so this rule offers no autofix.
 *
 * The rule inspects both branches, leaving the condition unrestricted. It accepts literals, references, object and array construction, member access, constructors and templates. Computed keys, spreads, constructor arguments and template interpolations undergo the same inspection. JSX remains opaque. Constructors, tags and getters can execute code: this policy does not establish purity. Binary, logical and unary operations remain outside the accepted forms, regardless of length.
 *
 * Each diagnostic identifies the rejected expression and explains its alternative. Inspection continues through siblings and the other branch, but stops inside a rejected expression to avoid overlapping reports. Nested ternaries inside otherwise accepted JSX receive their own inspection.
 *
 * @example Accepted
 * ```tsx
 * const options = enabled ? { [key]: value } : {};
 * const formatter = detailed ? new DetailedFormatter(locale) : new BriefFormatter(locale);
 * const label = enabled ? text`Enabled: ${name}` : text`Disabled`;
 * const view = enabled ? <Active /> : <Inactive />;
 * const callback = enabled ? refresh : fallback;
 * ```
 *
 * @example Rejected
 * ```ts
 * const options = enabled ? { value: compute() } : {};
 * const formatter = detailed ? new Formatter(loadLocale()) : fallback;
 * const callback = enabled ? () => refresh() : fallback;
 * ```
 *
 * @module
 */

import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const messages = {
  call: "This call hides conditional work inside a ternary branch. Use an if/else to make that work explicit.",
  inlineFunction:
    "An inline function embeds another body inside a ternary branch. Name the callback separately and select its reference instead.",
  assignment:
    "This assignment hides a state change inside a ternary branch. Put the assignment in an explicit if/else branch.",
  update:
    "This increment or decrement hides a state change inside a ternary branch. Put the update in an explicit if/else branch.",
  await:
    "This await hides conditional suspension inside a ternary branch. Put the await in an explicit if/else branch.",
  yield:
    "This yield hides a conditional transfer to the caller inside a ternary branch. Put the yield in an explicit if/else branch.",
  nestedConditional:
    "This branch introduces another ternary decision. Use explicit if/else branches so the decisions remain visible.",
  logical:
    "This logical operation introduces short-circuit branching inside a ternary branch. Use explicit if/else branches for the additional decision.",
  optionalChain:
    "This optional chain introduces a nullish check inside a ternary branch. Use explicit branching to expose both decisions.",
  binary:
    "This binary operation computes a result inside a ternary branch. Keep ternaries for selecting or constructing values, and put this computation in an if/else branch.",
  unary:
    "This unary operation transforms a value inside a ternary branch. Keep ternaries for selecting or constructing values, and put this operation in an if/else branch.",
  sequence:
    "This comma expression combines several evaluations inside a ternary branch. Write those evaluations as statements in an if/else branch.",
  import:
    "This import starts module loading inside a ternary branch. Use an if/else to make conditional loading explicit.",
  class:
    "An inline class embeds declarations and possible initialization work inside a ternary branch. Use an if/else to make conditional class creation explicit.",
  intrinsic:
    "This engine intrinsic hides runtime work inside a ternary branch. Put it in an explicit if/else branch.",
};

type ViolationReason = keyof typeof messages;
interface Finding {
  readonly node: ESTree.Node;
  readonly reason: ViolationReason;
}

type Expression = ESTree.Expression | ESTree.SpreadElement;
type Expressions = { [Node in Expression as Node["type"]]: Node };

// Keep each discriminant paired with its node when indexing the visitor.
type ExpressionOf<Kind extends keyof Expressions> = {
  [Type in Kind]: Expressions[Type] & { type: Type };
}[Kind];

type Inspect = (node: Expression | null) => Iterable<Finding>;
type Visitors = {
  [Kind in keyof Expressions]:
    | ViolationReason
    | null
    | ((node: Expressions[Kind], inspect: Inspect) => Iterable<Finding>);
};

const inspectProperty = function* (
  property: ESTree.ObjectPropertyKind,
  inspect: Inspect,
): Generator<Finding> {
  if (property.type === "SpreadElement") {
    yield* inspect(property.argument);
    return;
  }

  if (property.computed && property.key.type !== "PrivateIdentifier") {
    yield* inspect(property.key);
  }

  yield* inspect(property.value);
};

const visitors: Visitors = {
  *ArrayExpression(node, inspect) {
    for (const element of node.elements) {
      yield* inspect(element);
    }
  },
  ArrowFunctionExpression: "inlineFunction",
  AssignmentExpression: "assignment",
  AwaitExpression: "await",
  BinaryExpression: "binary",
  CallExpression: "call",
  ChainExpression: "optionalChain",
  ClassDeclaration: "class",
  ClassExpression: "class",
  ConditionalExpression: "nestedConditional",
  FunctionDeclaration: "inlineFunction",
  FunctionExpression: "inlineFunction",
  Identifier: null,
  ImportExpression: "import",
  JSXElement: null,
  JSXFragment: null,
  Literal: null,
  LogicalExpression: "logical",
  *MemberExpression(node, inspect) {
    yield* inspect(node.object);
    if (node.computed) {
      yield* inspect(node.property);
    }
  },
  MetaProperty: null,
  *NewExpression(node, inspect) {
    yield* inspect(node.callee);
    for (const argument of node.arguments) {
      yield* inspect(argument);
    }
  },
  *ObjectExpression(node, inspect) {
    for (const property of node.properties) {
      yield* inspectProperty(property, inspect);
    }
  },
  ParenthesizedExpression: (node, inspect) => inspect(node.expression),
  SequenceExpression: "sequence",
  SpreadElement: (node, inspect) => inspect(node.argument),
  Super: null,
  TSAsExpression: (node, inspect) => inspect(node.expression),
  TSDeclareFunction: "inlineFunction",
  TSEmptyBodyFunctionExpression: "inlineFunction",
  TSInstantiationExpression: (node, inspect) => inspect(node.expression),
  TSNonNullExpression: (node, inspect) => inspect(node.expression),
  TSSatisfiesExpression: (node, inspect) => inspect(node.expression),
  TSTypeAssertion: (node, inspect) => inspect(node.expression),
  *TaggedTemplateExpression(node, inspect) {
    yield* inspect(node.tag);
    yield* inspect(node.quasi);
  },
  *TemplateLiteral(node, inspect) {
    for (const expression of node.expressions) {
      yield* inspect(expression);
    }
  },
  ThisExpression: null,
  UnaryExpression: "unary",
  UpdateExpression: "update",
  V8IntrinsicExpression: "intrinsic",
  YieldExpression: "yield",
};

const findViolations = function* <Kind extends keyof Expressions>(
  node: ExpressionOf<Kind> | null,
): Generator<Finding> {
  if (node === null) {
    return;
  }

  const visitor = visitors[node.type];
  if (visitor === null) {
    return;
  }
  if (typeof visitor === "string") {
    yield { node, reason: visitor };
    return;
  }

  yield* visitor(node, findViolations);
};

const isAlreadyRejected = (
  node: ESTree.Node,
  rejected: ReadonlySet<ESTree.Node>,
): boolean => {
  for (
    let current: ESTree.Node | null = node;
    current !== null;
    current = current.parent
  ) {
    if (rejected.has(current)) {
      return true;
    }
  }

  return false;
};

export const noComplexTernary = defineRule({
  createOnce: (context) => {
    // Oxlint visits nested ternaries separately. Remember rejected nodes to suppress overlapping descendant reports.
    const rejected = new Set<ESTree.Node>();
    return {
      before: (): void => {
        rejected.clear();
      },
      after: (): void => {
        rejected.clear();
      },
      ConditionalExpression: (node): void => {
        if (isAlreadyRejected(node, rejected)) {
          return;
        }

        for (const branch of [node.consequent, node.alternate]) {
          for (const finding of findViolations(branch)) {
            rejected.add(finding.node);
            context.report({ messageId: finding.reason, node: finding.node });
          }
        }
      },
    };
  },
  meta: { messages, schema: [], type: "suggestion" },
});
