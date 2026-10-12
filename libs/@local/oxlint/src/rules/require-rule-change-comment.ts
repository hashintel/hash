/**
 * Requires explanations beside literal severity settings in Oxlint configuration.
 *
 * Checks `rules` objects and `defineRules` arguments in files that import Oxlint or use its configuration filename. Tuple settings put the explanation beside the first element. Computed settings and inherited presets are not resolved.
 *
 * @module
 */

import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

const severities: ReadonlySet<string> = new Set([
  "allow",
  "off",
  "warn",
  "deny",
  "error",
]);

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

const severityOf = (value: ESTree.Node): ESTree.Node | null => {
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

  if (typeof candidate.value === "string" && severities.has(candidate.value)) {
    return candidate;
  }

  if (candidate.value === 0 || candidate.value === 1 || candidate.value === 2) {
    return candidate;
  }

  return null;
};

const hasExplanation = (
  sourceCode: SourceCode,
  severity: ESTree.Node,
  end: number,
): boolean =>
  sourceCode.getAllComments().some((comment) => {
    if (
      comment.loc.start.line !== severity.loc.end.line ||
      comment.range[0] < severity.range[1] ||
      comment.range[0] >= end
    ) {
      return false;
    }

    const [firstLine] = comment.value.split("\n");
    return firstLine !== undefined && firstLine.trim().length > 0;
  });

export const requireRuleChangeComment = defineRule({
  createOnce: (context) => {
    let configuration = false;

    return {
      Program: (program): void => {
        configuration =
          /(?:^|[/\\])(?:oxlint\.config|\.oxlintrc)\.[cm]?[jt]s$/u.test(
            context.filename,
          ) ||
          program.body.some(
            (statement) =>
              statement.type === "ImportDeclaration" &&
              (statement.source.value === "oxlint" ||
                statement.source.value === "@local/oxlint"),
          );
      },
      ObjectExpression: (node): void => {
        if (!configuration || !isRuleMap(node)) {
          return;
        }

        for (const [index, property] of node.properties.entries()) {
          if (property.type === "Property") {
            const severity = severityOf(property.value);
            const end = node.properties[index + 1]?.range[0] ?? node.range[1];

            if (
              severity !== null &&
              !hasExplanation(context.sourceCode, severity, end)
            ) {
              context.report({ messageId: "explanation", node: severity });
            }
          }
        }
      },
    };
  },
  meta: {
    messages: {
      explanation:
        "Explain this rule setting in a trailing comment on the severity's line. For an array setting, put the comment beside its first element.",
    },
    schema: [],
    type: "problem",
  },
});
