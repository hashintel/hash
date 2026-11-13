import { Array, Chunk, Equivalence, Option } from "effect";
import * as Syntax from "typescript/ast";

import * as AST from "../AST/index.js";
import * as Source from "./ast/source.js";
import * as SignatureSyntax from "./signature-syntax.js";

/** What an identifier in the AST's type syntax resolves to, or none for one no node of the AST resolves, such as a property's name. */
export type Names = (
  name: Syntax.Identifier,
) => Option.Option<AST.Target.Interned>;

/**
 * The names the AST's nodes resolve, by the identifiers that spell them: each type reference's target and qualifiers, and the parameter a type predicate tests.
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
