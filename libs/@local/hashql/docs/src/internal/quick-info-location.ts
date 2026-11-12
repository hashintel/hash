import { HashMap, HashSet, Option, Predicate } from "effect";
import {
  ModifierFlags,
  NodeFlags,
  SyntaxKind,
  isCallOrNewExpression,
  isClassDeclaration,
  isEnumDeclaration,
  isExpressionWithTypeArguments,
  isHeritageClause,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isImportTypeNode,
  isInterfaceDeclaration,
  isModuleBlock,
  isModuleDeclaration,
  isParameterDeclaration,
  isPropertyAccessExpression,
  isQualifiedName,
  isSourceFile,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeReferenceNode,
  isVariableDeclarationList,
} from "typescript/ast";

import * as Node from "../TypeScript/Node.js";

import type {
  CallOrNewExpression,
  Declaration,
  ExpressionWithTypeArguments,
  Identifier,
  ModuleDeclaration,
} from "typescript/ast";

/**
 * What a name means where it stands, for a symbol that declares more than one of a value, a type and a namespace.
 *
 * Quick info shows the meaning the position asks for. A position that asks for none in particular, such as an import, shows every meaning.
 */
export type Meaning = "value" | "type" | "namespace" | "any";

/** Whether the declarations of `module` leave a value behind at run time, which makes its name a value as well as a namespace. */
const isInstantiated = (module: ModuleDeclaration): boolean => {
  const { body } = module;
  if (body === undefined) {
    return false;
  }

  if (!isModuleBlock(body)) {
    return isModuleDeclaration(body) && isInstantiated(body);
  }

  return body.statements.some((statement) => {
    if (
      isInterfaceDeclaration(statement) ||
      isTypeAliasDeclaration(statement) ||
      isImportDeclaration(statement) ||
      isImportEqualsDeclaration(statement)
    ) {
      return false;
    }

    if (isEnumDeclaration(statement)) {
      return !Node.hasModifier(statement, ModifierFlags.Const);
    }

    return !isModuleDeclaration(statement) || isInstantiated(statement);
  });
};

/** What the name of each kind of declaration means. A declaration of another kind has a meaning of its own, or none. */
const meanings = HashMap.fromIterable<SyntaxKind, Meaning>([
  [SyntaxKind.VariableDeclaration, "value"],
  [SyntaxKind.Parameter, "value"],
  [SyntaxKind.BindingElement, "value"],
  [SyntaxKind.PropertyDeclaration, "value"],
  [SyntaxKind.PropertySignature, "value"],
  [SyntaxKind.PropertyAssignment, "value"],
  [SyntaxKind.ShorthandPropertyAssignment, "value"],
  [SyntaxKind.MethodDeclaration, "value"],
  [SyntaxKind.MethodSignature, "value"],
  [SyntaxKind.GetAccessor, "value"],
  [SyntaxKind.SetAccessor, "value"],
  [SyntaxKind.FunctionDeclaration, "value"],
  [SyntaxKind.FunctionExpression, "value"],
  [SyntaxKind.TypeParameter, "type"],
  [SyntaxKind.InterfaceDeclaration, "type"],
  [SyntaxKind.TypeAliasDeclaration, "type"],
  [SyntaxKind.EnumMember, "any"],
  [SyntaxKind.ClassDeclaration, "any"],
  [SyntaxKind.ClassExpression, "any"],
  [SyntaxKind.EnumDeclaration, "any"],
  [SyntaxKind.NamespaceImport, "any"],
  [SyntaxKind.NamespaceExport, "any"],
  [SyntaxKind.NamedTupleMember, "any"],
]);

/** What the name of `declaration` means, or none for a node whose name declares nothing, such as a property access. */
const declared = (declaration: Node.Node): Option.Option<Meaning> => {
  if (!isModuleDeclaration(declaration)) {
    return HashMap.get(meanings, declaration.kind);
  }

  // A module declared by its specifier is a value, as is a namespace that holds one.
  const typesOnly =
    !isStringLiteral(declaration.name) && !isInstantiated(declaration);

  return Option.some(typesOnly ? "namespace" : "any");
};

/** Whether a heritage clause names a type with `node`. A class names the value it extends, and every other clause names a type. */
const isTypeHeritage = (node: ExpressionWithTypeArguments): boolean => {
  const clause = node.parent;
  if (!isHeritageClause(clause)) {
    return false;
  }

  const keyword = isInterfaceDeclaration(clause.parent)
    ? SyntaxKind.ExtendsKeyword
    : SyntaxKind.ImplementsKeyword;

  return clause.token === keyword;
};

/** Whether `name` stands in the place of a type, as the name of a type reference or the last name of a qualified one. */
const isTypeReference = (name: Identifier): boolean => {
  const last =
    (isQualifiedName(name.parent) && name.parent.right === name) ||
    (isPropertyAccessExpression(name.parent) && name.parent.name === name);
  const { parent } = last ? name.parent : name;

  if (isImportTypeNode(parent)) {
    return !parent.isTypeOf;
  }

  return (
    isTypeReferenceNode(parent) ||
    (isExpressionWithTypeArguments(parent) && isTypeHeritage(parent))
  );
};

/** Whether `name` qualifies the type that a type reference or a heritage clause names, as `Space` does in `Space.Kind`. */
const isNamespaceReference = (name: Identifier): boolean => {
  let root: Node.Node = name;
  while (isQualifiedName(root.parent)) {
    root = root.parent;
  }

  if (isQualifiedName(root)) {
    return isTypeReferenceNode(root.parent) && root.right !== name;
  }

  while (isPropertyAccessExpression(root.parent)) {
    root = root.parent;
  }

  return (
    isPropertyAccessExpression(root) &&
    root.name !== name &&
    isExpressionWithTypeArguments(root.parent) &&
    isTypeHeritage(root.parent)
  );
};

/** The syntax in which a name brings a symbol in or sends one out, whatever the symbol means. */
const passing = HashSet.make(
  SyntaxKind.ExportAssignment,
  SyntaxKind.ExportSpecifier,
  SyntaxKind.ExternalModuleReference,
  SyntaxKind.ImportSpecifier,
  SyntaxKind.ImportClause,
  SyntaxKind.ImportEqualsDeclaration,
);

/** What `name` means where it stands. */
export const meaningOf = (name: Identifier): Meaning => {
  const { parent } = name;
  if (HashSet.has(passing, parent.kind)) {
    return "any";
  }

  if (Predicate.hasProperty(parent, "name") && parent.name === name) {
    const meaning = declared(parent);
    if (Option.isSome(meaning)) {
      return meaning.value;
    }
  }

  if (isTypeReference(name)) {
    return "type";
  }

  return isNamespaceReference(name) ? "namespace" : "value";
};

const containers = HashSet.make(
  SyntaxKind.SourceFile,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.ModuleDeclaration,
);

/** The declaration around `name` that quick info writes its types for: the nearest function, method, accessor, class, interface, enum, namespace or source file. */
export const containerOf = (name: Identifier): Node.Node => {
  let current = name.parent;
  while (!HashSet.has(containers, current.kind)) {
    current = current.parent;
  }

  return current;
};

/** The call or `new` expression that `name` is the callee of, also as the member that a property access names. */
export const callOf = (
  name: Identifier,
): Option.Option<CallOrNewExpression> => {
  let callee: Node.Node = name;
  if (isPropertyAccessExpression(name.parent) && name.parent.name === name) {
    callee = name.parent;
  }

  const { parent } = callee;
  if (isCallOrNewExpression(parent) && parent.expression === callee) {
    return Option.some(parent);
  }

  return Option.none();
};

/** The keyword quick info shows before a variable declared at or above `node`: `(parameter)`, or the keyword of the declaration list that declares it. */
export const bindingOf = (node: Node.Node): string => {
  if (isParameterDeclaration(node)) {
    return "(parameter) ";
  }

  if (isVariableDeclarationList(node)) {
    const constant = Node.hasFlag(node, NodeFlags.Const);
    if (Node.hasFlag(node, NodeFlags.Using)) {
      // The compiler marks `await using` as both constant and disposed.
      return constant ? "await using " : "using ";
    }

    if (constant) {
      return "const ";
    }

    return Node.hasFlag(node, NodeFlags.Let) ? "let " : "var ";
  }

  // A binding element inside the declaration list declares a destructured name.
  if (isSourceFile(node.parent)) {
    return "var ";
  }

  return bindingOf(node.parent);
};

/** Whether `declaration` declares an abstract class. */
export const isAbstractClass = (declaration: Declaration): boolean =>
  isClassDeclaration(declaration) &&
  Node.hasModifier(declaration, ModifierFlags.Abstract);
