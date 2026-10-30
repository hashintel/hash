/**
 * The names a node binds for its subtree below the module scope: a
 * function its parameters and type parameters, a block its declarations,
 * a loop or catch clause its variables, a generic type its type
 * parameters. Value and type space are kept apart, as the checker keeps
 * them: a parameter never shadows an interface of the same name.
 *
 * A name is only ever registered on the nearest binding node, so a `var`
 * hoisted out of a nested block goes unregistered. Missing a binding costs
 * one checker query; claiming one the checker would not see would lose a
 * reference, so every rule here errs towards missing.
 */

import {
  isBindingElement,
  isBlock,
  isCatchClause,
  isClassDeclaration,
  isClassExpression,
  isEnumDeclaration,
  isForInStatement,
  isForOfStatement,
  isForStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isInferTypeNode,
  isInterfaceDeclaration,
  isMappedTypeNode,
  isSignatureDeclaration,
  isTypeAliasDeclaration,
  isVariableDeclarationList,
  isVariableStatement,
  type BindingName,
  type Node,
  type Statement,
  type TypeParameterDeclaration,
  type VariableDeclarationList,
} from "typescript-7/ast";

export interface ScopeBindings {
  values: Set<string>;
  types: Set<string>;
}

const addBindingName = (
  names: Set<string>,
  name: BindingName | undefined,
): void => {
  if (name === undefined) {
    return;
  }
  if (isIdentifier(name)) {
    names.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (isBindingElement(element)) {
      addBindingName(names, element.name);
    }
  }
};

const addVariables = (
  names: Set<string>,
  list: VariableDeclarationList,
): void => {
  for (const declaration of list.declarations) {
    addBindingName(names, declaration.name);
  }
};

const addTypeParameters = (
  names: Set<string>,
  parameters: readonly TypeParameterDeclaration[] | undefined,
): void => {
  for (const parameter of parameters ?? []) {
    names.add(parameter.name.text);
  }
};

const addStatements = (
  bindings: ScopeBindings,
  statements: readonly Statement[],
): void => {
  for (const statement of statements) {
    if (isVariableStatement(statement)) {
      addVariables(bindings.values, statement.declarationList);
    } else if (isFunctionDeclaration(statement)) {
      if (statement.name !== undefined) {
        bindings.values.add(statement.name.text);
      }
    } else if (isClassDeclaration(statement) || isEnumDeclaration(statement)) {
      if (statement.name !== undefined) {
        bindings.values.add(statement.name.text);
        bindings.types.add(statement.name.text);
      }
    } else if (
      isInterfaceDeclaration(statement) ||
      isTypeAliasDeclaration(statement)
    ) {
      bindings.types.add(statement.name.text);
    }
  }
};

/** What `node` binds for its subtree, or null when it opens no scope. */
export const scopeBindings = (node: Node): ScopeBindings | null => {
  const bindings: ScopeBindings = { values: new Set(), types: new Set() };
  if (isBlock(node)) {
    addStatements(bindings, node.statements);
  } else if (
    isForStatement(node) ||
    isForInStatement(node) ||
    isForOfStatement(node)
  ) {
    if (
      node.initializer !== undefined &&
      isVariableDeclarationList(node.initializer)
    ) {
      addVariables(bindings.values, node.initializer);
    }
  } else if (isCatchClause(node)) {
    addBindingName(bindings.values, node.variableDeclaration?.name);
  } else if (isMappedTypeNode(node) || isInferTypeNode(node)) {
    bindings.types.add(node.typeParameter.name.text);
  } else if (isClassExpression(node)) {
    if (node.name !== undefined) {
      bindings.values.add(node.name.text);
      bindings.types.add(node.name.text);
    }
    addTypeParameters(bindings.types, node.typeParameters);
  } else if (
    isClassDeclaration(node) ||
    isInterfaceDeclaration(node) ||
    isTypeAliasDeclaration(node)
  ) {
    addTypeParameters(bindings.types, node.typeParameters);
  } else if (isSignatureDeclaration(node)) {
    for (const parameter of node.parameters) {
      addBindingName(bindings.values, parameter.name);
    }
    addTypeParameters(bindings.types, node.typeParameters);
    if (isFunctionExpression(node) && node.name !== undefined) {
      bindings.values.add(node.name.text);
    }
  } else {
    return null;
  }
  return bindings;
};
