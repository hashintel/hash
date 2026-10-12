import type { ESTree } from "@oxlint/plugins";

const propertyName = (
  property: Pick<ESTree.ObjectProperty, "computed" | "key">,
): string | null => {
  if (!property.computed && property.key.type === "Identifier") {
    return property.key.name;
  }

  if (
    property.key.type === "Literal" &&
    typeof property.key.value === "string"
  ) {
    return property.key.value;
  }

  return null;
};

type TransparentExpression =
  | ESTree.ParenthesizedExpression
  | ESTree.TSAsExpression
  | ESTree.TSSatisfiesExpression
  | ESTree.TSTypeAssertion
  | ESTree.TSNonNullExpression;

const isTransparentExpression = (
  node: ESTree.Node,
): node is TransparentExpression =>
  node.type === "ParenthesizedExpression" ||
  node.type === "TSAsExpression" ||
  node.type === "TSSatisfiesExpression" ||
  node.type === "TSTypeAssertion" ||
  node.type === "TSNonNullExpression";

const unwrapExpression = (node: ESTree.Node): ESTree.Node => {
  let expression = node;

  while (isTransparentExpression(expression)) {
    expression = expression.expression;
  }

  return expression;
};

const isRuleMap = (node: ESTree.ObjectExpression): boolean => {
  let expression: ESTree.Node = node;
  while (isTransparentExpression(expression.parent)) {
    expression = expression.parent;
  }

  const { parent } = expression;
  if (parent.type === "Property") {
    return parent.value === expression && propertyName(parent) === "rules";
  }

  if (parent.type === "CallExpression") {
    return (
      parent.callee.type === "Identifier" &&
      parent.callee.name === "defineRules" &&
      parent.arguments[0] === expression
    );
  }

  return (
    parent.type === "VariableDeclarator" &&
    parent.id.type === "Identifier" &&
    parent.id.name === "rules"
  );
};

type SeverityLiteral = Extract<ESTree.Node, { type: "Literal" }>;

const severityOf = (value: ESTree.Node): SeverityLiteral | null => {
  let candidate = unwrapExpression(value);
  if (candidate.type === "ArrayExpression") {
    const [first] = candidate.elements;
    if (first === null || first === undefined) {
      return null;
    }

    candidate = unwrapExpression(first);
  }

  if (candidate.type !== "Literal") {
    return null;
  }

  if (
    typeof candidate.value === "string" ||
    typeof candidate.value === "number"
  ) {
    return candidate;
  }

  return null;
};

export const isOxlintConfiguration = (
  program: ESTree.Program,
  filename: string,
): boolean =>
  /(?:^|[/\\])(?:oxlint\.config|\.oxlintrc)\.[cm]?[jt]s$/u.test(filename) ||
  program.body.some(
    (statement) =>
      statement.type === "ImportDeclaration" &&
      (statement.source.value === "oxlint" ||
        statement.source.value === "@local/oxlint"),
  );

interface RuleSetting {
  readonly severity: SeverityLiteral;
  readonly end: number;
}

export const ruleSettings = function* (
  node: ESTree.ObjectExpression,
): Generator<RuleSetting> {
  if (!isRuleMap(node)) {
    return;
  }

  for (const [index, property] of node.properties.entries()) {
    if (property.type === "Property") {
      const severity = severityOf(property.value);
      if (severity !== null) {
        yield {
          severity,
          end: node.properties[index + 1]?.range[0] ?? node.range[1],
        };
      }
    }
  }
};
