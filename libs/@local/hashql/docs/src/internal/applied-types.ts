import { Array, Chunk, HashMap, Option, pipe } from "effect";
import * as Syntax from "typescript/ast";
import { visitEachChild } from "typescript/ast/visitor";

import * as AST from "../AST/index.js";

import type * as Parts from "./parts.js";
import type * as References from "./references.js";

type TypeNode = AST.TypeNode.TypeNode["node"];
type Parameter = AST.Interned.Interned<AST.TypeParameter.TypeParameter>;

/** The type each type parameter of an applied declaration stands for, by the parameter. */
type Bound = HashMap.HashMap<AST.Target.Interned, TypeNode>;

/** `type` with each reference to a type parameter in `bound` replaced by the type bound to it. A node it leaves alone keeps its nodes, so each of its names still finds its reference. */
const fill = (
  names: References.Names,
  bound: Bound,
  type: TypeNode,
): TypeNode => {
  const visit = <N extends Syntax.Node>(node: N): N | TypeNode => {
    if (
      Syntax.isTypeReferenceNode(node) &&
      Syntax.isIdentifier(node.typeName) &&
      node.typeArguments === undefined
    ) {
      const standsFor = Option.flatMap(names(node.typeName), (target) =>
        HashMap.get(bound, target),
      );
      if (Option.isSome(standsFor)) {
        return standsFor.value;
      }
    }

    return visitEachChild(node, visit);
  };

  return visit(type);
};

/** The type parameters of the type alias or the interface `annotation` names, in order. An annotation that names anything else has none. */
const parametersOf = (
  ast: AST.Store["Service"],
  annotation: AST.TypeNode.TypeNode,
): readonly Parameter[] =>
  pipe(
    Option.liftPredicate(annotation, AST.TypeReference.isTypeReference),
    Option.map(({ target }) => ast.getBySymbol(target)),
    Option.filter(AST.Declaration.isDeclaration),
    Option.flatMap(({ leaf }) => leaf),
    Option.map(ast.get),
    Option.filter(AST.IndependentDeclarations.isIndependentDeclarations),
    Option.flatMap(({ type }) => type),
    Option.map(ast.get),
    Option.map(({ typeParameters }) => Chunk.toReadonlyArray(typeParameters)),
    Option.getOrElse((): readonly Parameter[] => []),
  );

/** What each type parameter of the declaration `annotation` applies stands for. It is the argument the annotation writes for the parameter, or else the parameter's default. A default may name the parameters before it. */
const boundBy = (
  ast: AST.Store["Service"],
  names: References.Names,
  annotation: AST.TypeNode.TypeNode,
): Bound => {
  const written = pipe(
    Option.liftPredicate(annotation, AST.TypeReference.isTypeReference),
    Option.map(({ typeArguments }) => Chunk.toReadonlyArray(typeArguments)),
    Option.getOrElse((): readonly AST.TypeNode.Interned[] => []),
  );

  return Array.reduce(
    parametersOf(ast, annotation),
    HashMap.empty<AST.Target.Interned, TypeNode>(),
    (bound, parameter, index) =>
      pipe(
        Array.get(written, index),
        Option.map((argument) => ast.get(argument).node),
        Option.orElse(() =>
          pipe(
            ast.get(parameter).default,
            Option.map((fallback) =>
              fill(names, bound, ast.get(fallback).node),
            ),
          ),
        ),
        Option.match({
          onNone: () => bound,
          onSome: (type) => HashMap.set(bound, parameter, type),
        }),
      ),
  );
};

/**
 * How `type`, written in one of the calls of `part`, reads for `part`.
 *
 * A callable constant or property can take its calls from the generic declaration its annotation names, as `program: Draft<Prelude.Builtin>` takes them from `Draft<S>`. There the calls write `S`, and to the constant `S` means `Prelude.Builtin`. Each type parameter of the declaration therefore reads as the type the annotation gives it. Every other part reads its types as written.
 */
export const of =
  ({
    ast,
    names,
  }: {
    readonly ast: AST.Store["Service"];
    readonly names: References.Names;
  }) =>
  (part: Parts.Part, type: AST.TypeNode.Interned): TypeNode => {
    const { node } = ast.get(type);
    if (
      !AST.CallableConstant.isCallableConstant(part.source) &&
      !AST.CallableProperty.isCallableProperty(part.source)
    ) {
      return node;
    }

    return fill(names, boundBy(ast, names, ast.get(part.source.type)), node);
  };
