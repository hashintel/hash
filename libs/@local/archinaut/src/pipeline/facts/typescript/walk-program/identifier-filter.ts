/**
 * Which identifiers of a file the checker must be asked about.
 *
 * - A label is never a symbol.
 * - A member name is always asked: a property, method, enum member, JSX
 *   attribute or parameter property, and the qualified names of a type.
 *   Inference lets another file reference any of them.
 * - A name bound below the module scope resolves to that local binding,
 *   which no other file can reference, so its declaration and its uses in
 *   the matching space are skipped.
 * - Everything else is asked.
 *
 * The filter follows the walk: `enter` and `leave` bracket a node's
 * children, and `query` answers for an identifier inside them.
 */

import {
  ModifierFlags,
  SyntaxKind,
  getCombinedModifierFlags,
  getNameOfDeclaration,
  isBindingElement,
  isBreakOrContinueStatement,
  isClassLikeDeclaration,
  isExportSpecifier,
  isExpressionWithTypeArguments,
  isHeritageClause,
  isImportSpecifier,
  isImportTypeNode,
  isJsxNamespacedName,
  isLabeledStatement,
  isParameterDeclaration,
  isPropertyAccessExpression,
  isQualifiedName,
  isTypePredicateNode,
  isTypeQueryNode,
  type Declaration,
  type Identifier,
  type Node,
} from "typescript-7/ast";

import { scopeBindings, type ScopeBindings } from "./scope-bindings";

export interface IdentifierFilter {
  enter: (node: Node) => void;
  leave: (node: Node) => void;
  query: (identifier: Identifier) => boolean;
}

type Space = keyof ScopeBindings;

const memberParents = new Set<SyntaxKind>([
  SyntaxKind.PropertyAssignment,
  SyntaxKind.ShorthandPropertyAssignment,
  SyntaxKind.PropertySignature,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.EnumMember,
  SyntaxKind.JsxAttribute,
  SyntaxKind.NamedTupleMember,
  SyntaxKind.MetaProperty,
]);

const namesDeclaration = (identifier: Identifier): boolean =>
  getNameOfDeclaration(identifier.parent as Declaration) === identifier;

const isLabel = (identifier: Identifier): boolean =>
  isLabeledStatement(identifier.parent) ||
  isBreakOrContinueStatement(identifier.parent);

/** A name resolved as a member of something, never by lexical scope. */
const isMemberName = (identifier: Identifier): boolean => {
  const { parent } = identifier;
  if (isPropertyAccessExpression(parent)) {
    return parent.name === identifier;
  }
  if (isBindingElement(parent) || isImportSpecifier(parent)) {
    return parent.propertyName === identifier;
  }
  if (isParameterDeclaration(parent)) {
    return (
      parent.name === identifier &&
      (getCombinedModifierFlags(parent) &
        ModifierFlags.ParameterPropertyModifier) !==
        0
    );
  }
  return (
    isExportSpecifier(parent) ||
    isQualifiedName(parent) ||
    isJsxNamespacedName(parent) ||
    isImportTypeNode(parent) ||
    (memberParents.has(parent.kind) && namesDeclaration(identifier))
  );
};

/** The space a use is resolved in, or null when it is not lexical. */
const useSpace = (identifier: Identifier): Space | null => {
  const { parent } = identifier;
  if (isTypeQueryNode(parent) || isTypePredicateNode(parent)) {
    return "values";
  }
  if (isExpressionWithTypeArguments(parent)) {
    const clause = parent.parent;
    if (!isHeritageClause(clause)) {
      return null;
    }
    return clause.token === SyntaxKind.ExtendsKeyword &&
      isClassLikeDeclaration(clause.parent)
      ? "values"
      : "types";
  }
  return parent.kind >= SyntaxKind.FirstTypeNode &&
    parent.kind <= SyntaxKind.LastTypeNode
    ? "types"
    : "values";
};

export const createIdentifierFilter = (): IdentifierFilter => {
  const scopes: { node: Node; bindings: ScopeBindings }[] = [];

  /** Whether a scope other than `excluded` binds `name` in a space given. */
  const bound = (name: string, spaces: Space[], excluded: Node | null) =>
    scopes.some(
      (scope) =>
        scope.node !== excluded &&
        spaces.some((space) => scope.bindings[space].has(name)),
    );

  return {
    enter: (node) => {
      const bindings = scopeBindings(node);
      if (bindings !== null) {
        scopes.push({ node, bindings });
      }
    },
    leave: (node) => {
      if (scopes.at(-1)?.node === node) {
        scopes.pop();
      }
    },
    query: (identifier) => {
      if (isLabel(identifier)) {
        return false;
      }
      if (isMemberName(identifier)) {
        return true;
      }
      if (namesDeclaration(identifier)) {
        // A scope's own name belongs to the scope around it.
        return !bound(identifier.text, ["values", "types"], identifier.parent);
      }
      const space = useSpace(identifier);
      return space === null || !bound(identifier.text, [space], null);
    },
  };
};
