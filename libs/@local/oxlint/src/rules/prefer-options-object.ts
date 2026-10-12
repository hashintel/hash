/**
 * Requires optional or defaulted scalar parameters to move into an options object.
 *
 * Checks written scalar annotations and recognizable scalar defaults, without resolving aliases or contextual callback types. Provides no autofix because changing a signature also requires updating its callers.
 *
 * @example Incorrect
 * ```ts
 * type Query = (retry?: boolean) => void;
 * ```
 *
 * @example Correct
 * ```ts
 * type Query = (options?: { retry?: boolean }) => void;
 * ```
 *
 * @module
 */

import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

type ParameterOwner =
  | ESTree.Function
  | ESTree.ArrowFunctionExpression
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature;

const scalarAnnotations: ReadonlySet<ESTree.TSType["type"]> = new Set([
  "TSBigIntKeyword",
  "TSBooleanKeyword",
  "TSLiteralType",
  "TSNumberKeyword",
  "TSStringKeyword",
  "TSSymbolKeyword",
  "TSTemplateLiteralType",
]);

// The public binding type declares optional as false, but parsed optional parameters carry true.
const isOptional = (parameter: { readonly optional?: boolean }): boolean =>
  parameter.optional === true;

const hasScalarAnnotation = (parameter: ESTree.BindingIdentifier): boolean =>
  parameter.typeAnnotation !== undefined &&
  parameter.typeAnnotation !== null &&
  scalarAnnotations.has(parameter.typeAnnotation.typeAnnotation.type);

const isScalarDefault = (expression: ESTree.Expression): boolean => {
  if (expression.type === "Literal") {
    return expression.value !== null && typeof expression.value !== "object";
  }

  if (expression.type === "TemplateLiteral") {
    return true;
  }

  return (
    expression.type === "UnaryExpression" &&
    (expression.operator === "-" || expression.operator === "+") &&
    expression.argument.type === "Literal" &&
    (typeof expression.argument.value === "number" ||
      typeof expression.argument.value === "bigint")
  );
};

export const preferOptionsObject = defineRule({
  createOnce: (context) => {
    const checkParameters = (node: ParameterOwner): void => {
      for (const original of node.params) {
        let parameter = original;
        if (parameter.type === "TSParameterProperty") {
          parameter = parameter.parameter;
        }

        const optionalScalar =
          parameter.type === "Identifier" &&
          isOptional(parameter) &&
          hasScalarAnnotation(parameter);

        const defaultScalar =
          parameter.type === "AssignmentPattern" &&
          parameter.left.type === "Identifier" &&
          (hasScalarAnnotation(parameter.left) ||
            isScalarDefault(parameter.right));

        if (optionalScalar || defaultScalar) {
          context.report({ messageId: "optionsObject", node: original });
        }
      }
    };

    return {
      ArrowFunctionExpression: checkParameters,
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
      TSConstructorType: checkParameters,
      TSDeclareFunction: checkParameters,
      TSEmptyBodyFunctionExpression: checkParameters,
      TSFunctionType: checkParameters,
      TSMethodSignature: checkParameters,
    };
  },
  meta: {
    messages: {
      optionsObject:
        "Move optional or defaulted scalar parameters into an options object. Justify externally imposed signatures with a local suppression.",
    },
    schema: [],
    type: "suggestion",
  },
});
