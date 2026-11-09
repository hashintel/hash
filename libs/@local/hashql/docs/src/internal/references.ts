import { Array, Chunk, Equivalence, Option } from "effect";
import * as Syntax from "typescript/ast";
import { getNameOfDeclaration } from "typescript/ast/utils";

import * as AST from "../AST/index.js";
import * as Source from "./ast/source.js";
import * as SignatureSyntax from "./signature-syntax.js";

/** What an identifier in the AST's syntax names, or none for one that names nothing the AST holds. */
export type Names = (
  name: Syntax.Identifier,
) => Option.Option<AST.Target.Interned>;

/**
 * The names the AST's nodes resolve, by the identifiers that spell them: each type reference's target and qualifiers, and the parameter a type predicate tests. A name that declares something, such as a property's, resolves to none.
 *
 * A reference's identifiers spell its symbols from the end, since an import type's module is a string and spells no identifier.
 */
export const namesOf = (ast: AST.Store["Service"]): Names => {
  const names = new WeakMap<Syntax.Node, AST.Target.Interned>();

  for (const node of ast.nodes()) {
    if (AST.TypeReference.isTypeReference(node)) {
      const spelled = Source.segments(Source.referenceName(node.node));
      const symbols = Array.append(
        Chunk.toReadonlyArray(node.qualifiers),
        node.target,
      );

      for (const [name, symbol] of Array.zip(
        spelled.toReversed(),
        symbols.toReversed(),
      )) {
        names.set(name, ast.idOf(symbol));
      }
    } else if (
      AST.TypeExpression.isTypeExpression(node) &&
      Syntax.isTypePredicateNode(node.node)
    ) {
      const tested = Chunk.head(node.references);

      if (Option.isSome(tested)) {
        names.set(node.node.parameterName, ast.idOf(tested.value));
      }
    }
  }

  return (name) => Option.fromUndefinedOr(names.get(name));
};

/** The compiler node `node` stores as its declaration, or none for a node that groups others or that no name declares, such as a file's namespace. */
const declarationOf = (
  node: AST.Node.Node,
): Option.Option<Syntax.Declaration> => {
  if (
    AST.TypeParameter.isTypeParameter(node) ||
    AST.Parameter.isParameter(node) ||
    AST.Property.isProperty(node) ||
    AST.EnumMember.isEnumMember(node) ||
    AST.Getter.isGetter(node) ||
    AST.Setter.isSetter(node) ||
    AST.CallSignature.isCallSignature(node) ||
    AST.InterfaceDeclaration.isInterfaceDeclaration(node) ||
    AST.TypeAliasDeclaration.isTypeAliasDeclaration(node) ||
    AST.ClassDeclaration.isClassDeclaration(node) ||
    AST.EnumDeclaration.isEnumDeclaration(node) ||
    AST.ConstantDeclaration.isConstantDeclaration(node) ||
    AST.CallableConstant.isCallableConstant(node)
  ) {
    return Option.some(node.node);
  }

  if (
    AST.NamespaceDeclaration.isNamespaceDeclaration(node) &&
    !Syntax.isSourceFile(node.node)
  ) {
    return Option.some(node.node);
  }

  return Option.none();
};

/** What `node` groups. A method or a function groups its overloads and an accessor its halves, while a declaration groups the declarations and the namespace it merges. */
const partsOf = (node: AST.Node.Node): readonly AST.Node.Interned[] => {
  if (
    AST.Method.isMethod(node) ||
    AST.FunctionOverloads.isFunctionOverloads(node)
  ) {
    return Chunk.toReadonlyArray(node.overloads);
  }

  if (AST.Accessor.isAccessor(node)) {
    return Array.appendAll(Option.toArray(node.get), Option.toArray(node.set));
  }

  if (AST.Declaration.isDeclaration(node)) {
    return Array.appendAll(
      Option.toArray(node.leaf),
      Option.toArray(node.namespace),
    );
  }

  if (AST.IndependentDeclarations.isIndependentDeclarations(node)) {
    return Array.appendAll(
      Option.toArray(node.type),
      Option.toArray(node.value),
    );
  }

  return AST.JointDeclaration.isJointDeclaration(node)
    ? [node.declaration]
    : [];
};

/** The compiler nodes whose names declare `node`: its own, or those of the nodes it groups. */
const declarationsOf = (
  ast: AST.Store["Service"],
  node: AST.Node.Node,
): readonly Syntax.Declaration[] =>
  Option.match(declarationOf(node), {
    onSome: Array.of,
    onNone: () =>
      Array.flatMap(partsOf(node), (part) =>
        declarationsOf(ast, ast.get(part)),
      ),
  });

/** The identifiers `declaration` binds: its name, or each name a destructured parameter binds. A string, computed or private name binds none. */
const boundBy = (
  declaration: Syntax.Declaration,
): readonly Syntax.Identifier[] => {
  const bound: Syntax.Identifier[] = [];
  const pending: Syntax.Node[] = Option.toArray(
    Option.fromUndefinedOr(getNameOfDeclaration(declaration)),
  );

  while (pending.length > 0) {
    const current = pending.pop();

    if (current !== undefined && Syntax.isIdentifier(current)) {
      bound.push(current);
    } else if (current !== undefined && Syntax.isBindingPattern(current)) {
      for (const element of current.elements) {
        if (Syntax.isBindingElement(element) && element.name !== undefined) {
          pending.push(element.name);
        }
      }
    }
  }

  return bound;
};

/** The node of the AST each declaring identifier declares, including each name a destructured parameter binds, which declares the parameter. */
const declaredOf = (ast: AST.Store["Service"]): Names => {
  const declared = new WeakMap<Syntax.Node, AST.Target.Interned>();

  for (const id of ast.targets()) {
    for (const declaration of declarationsOf(ast, ast.get(id))) {
      for (const name of boundBy(declaration)) {
        declared.set(name, id);
      }
    }
  }

  return (name) => Option.fromUndefinedOr(declared.get(name));
};

/** What each name in printed syntax links to: what a reference resolves to, or what a declaring name declares. */
export const linksOf = (ast: AST.Store["Service"]): Names => {
  const references = namesOf(ast);
  const declared = declaredOf(ast);

  return (name) => Option.orElse(references(name), () => declared(name));
};

const sameTarget = Option.makeEquivalence(
  Equivalence.strictEqual<AST.Target.Interned>(),
);

/** Syntax is equal when it has the same spelling and each of its names resolves to the same thing, so equal spellings of different types stay apart. */
export const syntax =
  (
    names: Names,
  ): ((
    self: readonly Syntax.Node[],
    that: readonly Syntax.Node[],
  ) => boolean) =>
  (self, that) =>
    SignatureSyntax.equivalence((left, right) =>
      sameTarget(names(left), names(right)),
    )(self, that);
