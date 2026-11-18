/**
 * Requires a name for each number whose position does not explain it.
 *
 * A number inside an expression leaves the reader to guess what it measures, and a second occurrence leaves them to guess whether both must change together. A `const` declaration names the number once. The rule accepts a number where its position supplies that name:
 *
 * - a `const` initializer
 * - a default value
 * - an object property or a class field
 * - an enum member
 * - a JSX expression
 * - a literal type in a type alias, or a type index
 * - an assignment to a member
 * - an argument of `parseInt`
 *
 * The rule accepts the integers from -2 to 2 in every position. It reports a `let` or `var` initializer instead, because that name does not keep its value.
 *
 * An expression built from number literals and arithmetic operators counts as one number, so the rule accepts `60 * 60 * 24` in a `const` initializer. An operand that is not a literal ends that expression: in `price * 1.2`, the `1.2` stands in a multiplication and needs its own name. Names end the expression the same way, even when they name a `const`, because a name declared in another module has no value the rule could read.
 *
 * @example Accepted
 * ```ts
 * const SECONDS_PER_DAY = 60 * 60 * 24;
 * const MEBIBYTE = 2 ** 20;
 * const retry = { attempts: 3, backoff: 1.5 };
 * function connect(timeout = 30_000) {}
 * ```
 *
 * @example Rejected
 * ```ts
 * const total = price * 1.2;
 * setTimeout(refresh, 60 * 1000);
 * let limit = 100;
 * ```
 *
 * @module
 */

import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const messages = {
  magicNumber:
    "The number {{ number }} has no name in this position. Declare a `const` whose name says what it means, and use that name here.",
  mutableName:
    "A named number belongs in a `const` declaration. Declare it with `const` so that its name keeps its value.",
};

type Verdict = keyof typeof messages | null;
type NumberLiteral = ESTree.NumericLiteral | ESTree.BigIntLiteral;

const largestUnnamedInteger = 2;

const arithmeticOperators: ReadonlySet<ESTree.BinaryExpression["operator"]> =
  new Set(["+", "-", "*", "/", "%", "**", "<<", ">>", ">>>", "&", "|", "^"]);

const isNumberLiteral = (node: ESTree.Node): node is NumberLiteral =>
  node.type === "Literal" &&
  (typeof node.value === "number" || typeof node.value === "bigint");

// Signs, indices and small bounds read as themselves, as numbers and as bigints. A literal's value is never negative, because the sign parses as a unary minus around it. The upper bound alone therefore accepts -2 to 2.
const isSmallInteger = ({ value }: NumberLiteral): boolean => {
  if (typeof value === "bigint") {
    return value <= BigInt(largestUnnamedInteger);
  }

  return Number.isInteger(value) && value <= largestUnnamedInteger;
};

const isLiteralArithmetic = (node: ESTree.Node): boolean => {
  if (node.type === "UnaryExpression") {
    return node.operator === "-" && isLiteralArithmetic(node.argument);
  }

  if (node.type === "BinaryExpression") {
    return (
      arithmeticOperators.has(node.operator) &&
      isLiteralArithmetic(node.left) &&
      isLiteralArithmetic(node.right)
    );
  }

  return isNumberLiteral(node);
};

// A number stands in the position of the largest arithmetic over literals that contains it.
const positionOf = (subject: ESTree.Node): ESTree.Node => {
  let position = subject;
  while (position.parent !== null && isLiteralArithmetic(position.parent)) {
    position = position.parent;
  }

  return position;
};

const isParseInt = ({ callee }: ESTree.CallExpression): boolean => {
  if (callee.type === "Identifier") {
    return callee.name === "parseInt";
  }

  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Number" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "parseInt"
  );
};

// A literal type names its number when it is an alias's member or a type index.
const isNamedLiteralType = (type: ESTree.TSLiteralType): boolean => {
  let node = type.parent;
  while (node.type === "TSUnionType" || node.type === "TSIntersectionType") {
    node = node.parent;
  }

  return (
    node.type === "TSTypeAliasDeclaration" ||
    node.type === "TSIndexedAccessType"
  );
};

const verdictFor = (position: ESTree.Node, parent: ESTree.Node): Verdict => {
  if (
    parent.type === "AssignmentPattern" ||
    parent.type === "JSXExpressionContainer" ||
    parent.type === "TSEnumMember"
  ) {
    return null;
  }

  if (parent.type === "AssignmentExpression") {
    return parent.left.type === "Identifier" ? "magicNumber" : null;
  }

  if (parent.type === "CallExpression") {
    return isParseInt(parent) ? null : "magicNumber";
  }

  if (parent.type === "Property") {
    return parent.parent.type === "ObjectExpression" ? null : "magicNumber";
  }

  if (parent.type === "PropertyDefinition") {
    return parent.value === position ? null : "magicNumber";
  }

  if (parent.type === "TSLiteralType") {
    return isNamedLiteralType(parent) ? null : "magicNumber";
  }

  if (parent.type === "VariableDeclarator") {
    const declaration = parent.parent;
    const constant =
      declaration.type === "VariableDeclaration" &&
      declaration.kind === "const";
    return constant ? null : "mutableName";
  }

  return "magicNumber";
};

export const noMagicNumbers = defineRule({
  createOnce: (context) => {
    // The literals of one arithmetic expression share its position, so the rule reports a `let` initializer once for all of them.
    const reported = new Set<ESTree.Node>();
    return {
      before: (): void => {
        reported.clear();
      },
      after: (): void => {
        reported.clear();
      },
      Literal: (literal): void => {
        if (!isNumberLiteral(literal)) {
          return;
        }

        if (isSmallInteger(literal)) {
          return;
        }

        // A unary operator applied to a literal forms one number with it.
        const subject =
          literal.parent.type === "UnaryExpression" ? literal.parent : literal;

        const position = positionOf(subject);
        const { parent } = position;
        if (parent === null) {
          return;
        }

        const verdict = verdictFor(position, parent);
        if (verdict === "magicNumber") {
          context.report({
            data: { number: context.sourceCode.getText(subject) },
            messageId: verdict,
            node: subject,
          });
        } else if (verdict === "mutableName" && !reported.has(position)) {
          reported.add(position);
          context.report({ messageId: verdict, node: position });
        }
      },
    };
  },
  meta: { messages, schema: [], type: "suggestion" },
});
