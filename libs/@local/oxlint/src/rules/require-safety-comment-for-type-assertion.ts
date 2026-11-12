/**
 * Requires a nonempty SAFETY: justification before every non-const type assertion.
 *
 * A preceding comment can justify an individual assertion or its containing statement. The rule checks for an explanation, not whether that explanation is true. Provides no autofix because the author must supply the reasoning.
 *
 * @example Incorrect
 * ```ts
 * const payload = value as Payload;
 * ```
 *
 * @example Correct
 * ```ts
 * // SAFETY: validatePayload(value) succeeded before this statement.
 * const payload = value as Payload;
 * ```
 *
 * @module
 */

import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

type TypeAssertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

const isConstAssertion = (assertion: TypeAssertion): boolean =>
  assertion.typeAnnotation.type === "TSTypeReference" &&
  assertion.typeAnnotation.typeName.type === "Identifier" &&
  assertion.typeAnnotation.typeName.name === "const";

const isCommentOwner = (node: ESTree.Node): boolean =>
  node.type.endsWith("Statement") ||
  node.type === "VariableDeclaration" ||
  node.type === "PropertyDefinition" ||
  node.type === "AccessorProperty";

const commentOwner = (assertion: TypeAssertion): ESTree.Node => {
  let owner: ESTree.Node = assertion;
  while (!isCommentOwner(owner) && owner.parent.type !== "Program") {
    owner = owner.parent;
  }

  if (
    owner.parent.type === "ExportNamedDeclaration" ||
    owner.parent.type === "ExportDefaultDeclaration"
  ) {
    return owner.parent;
  }

  return owner;
};

const isJustification = (comment: ESTree.Comment): boolean =>
  /^\s*SAFETY:\s*\S/mu.test(comment.value.replaceAll(/^\s*\* ?/gmu, ""));

const hasJustificationBefore = (
  sourceCode: SourceCode,
  owner: ESTree.Node,
  node: ESTree.Node,
): boolean => {
  let current: ESTree.Node | ESTree.Token = node;
  for (;;) {
    const justified = sourceCode.getCommentsBefore(current).some((comment) => {
      if (!isJustification(comment)) {
        return false;
      }

      // A trailing comment on the preceding statement does not justify this statement.
      return (
        comment.range[0] >= owner.range[0] ||
        sourceCode.lines[comment.loc.start.line - 1]
          ?.slice(0, comment.loc.start.column)
          .trim() === ""
      );
    });

    if (justified) {
      return true;
    }

    const previous: ESTree.Token | null = sourceCode.getTokenBefore(current);
    if (previous?.value !== "(" || previous.range[0] < owner.range[0]) {
      return false;
    }
    current = previous;
  }
};

const hasSafetyComment = (
  sourceCode: SourceCode,
  assertion: TypeAssertion,
): boolean => {
  const owner = commentOwner(assertion);
  let current: ESTree.Node = assertion;
  for (;;) {
    if (hasJustificationBefore(sourceCode, owner, current)) {
      return true;
    }
    if (current === owner || current.parent === null) {
      return false;
    }
    current = current.parent;
  }
};

export const requireSafetyCommentForTypeAssertion = defineRule({
  createOnce: (context) => {
    const checkAssertion = (assertion: TypeAssertion): void => {
      if (
        !isConstAssertion(assertion) &&
        !hasSafetyComment(context.sourceCode, assertion)
      ) {
        context.report({ messageId: "safetyComment", node: assertion });
      }
    };

    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    };
  },
  meta: {
    messages: {
      safetyComment:
        "Explain why this assertion is valid in a preceding SAFETY: comment. Const assertions do not need a justification.",
    },
    schema: [],
    type: "problem",
  },
});
