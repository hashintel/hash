import { Context, Effect } from "effect";

import * as Comments from "./ast-comments.js";

import type * as AST from "../AST/index.js";
import type * as DocumentationError from "../DocumentationError.js";
import type * as Names from "./ast-names.js";
import type { Cause, Chunk, Option } from "effect";
import type * as Syntax from "typescript/ast";

export type TypeSource = Syntax.TypeNode | Syntax.ExpressionWithTypeArguments;

/** What parsing a declaration, a type or a member fails with. They parse through each other, so any of them can reach a comment. */
export type Failure =
  | Cause.UnknownError
  | AST.ParseError.ParseError
  | DocumentationError.DocumentationError;

type Parsed<T> = Effect.Effect<T, Failure, AST.Store | Names.Reach>;

/**
 * Parses type syntax and the signatures and members built from it.
 *
 * The service lives apart from its implementation in `ast-types`, so member and declaration parsing can depend on it without importing the implementation that depends on them.
 */
export class TypeParser extends Context.Service<TypeParser, TypeParser.Shape>()(
  "@local/hashql-docs/internal/ast-type-parser/TypeParser",
) {}

export declare namespace TypeParser {
  export interface Shape {
    readonly optional: (
      node: Option.Option<TypeSource>,
    ) => Parsed<Option.Option<AST.TypeNode.Interned>>;
    readonly typeParameter: (
      node: Syntax.TypeParameterDeclaration,
    ) => Parsed<AST.TypeParameter.Interned>;
    readonly typeParameters: (
      nodes: readonly Syntax.TypeParameterDeclaration[],
    ) => Parsed<readonly AST.TypeParameter.Interned[]>;
    readonly signature: (
      node: Syntax.SignatureDeclaration,
    ) => Parsed<AST.Signature.Signature>;
    readonly call: (
      node: AST.CallSignature.CallSignature["node"],
    ) => Parsed<AST.CallSignature.Interned>;
    readonly construct: (
      node: AST.ConstructSignature.ConstructSignature["node"],
    ) => Parsed<AST.ConstructSignature.Interned>;
    readonly typeMembers: (
      nodes: readonly Syntax.TypeElement[],
    ) => Parsed<Chunk.Chunk<AST.Member.InternedType>>;
    readonly classMembers: (
      nodes: readonly Syntax.ClassElement[],
    ) => Parsed<Chunk.Chunk<AST.Member.InternedClass>>;
    readonly type: (node: TypeSource) => Parsed<AST.TypeNode.Interned>;
  }
}

/** The type `node` denotes, or none when the syntax states no type. */
export const optional = (
  node: Option.Option<TypeSource>,
): Effect.Effect<
  Option.Option<AST.TypeNode.Interned>,
  Failure,
  TypeParser | AST.Store | Names.Reach
> => Effect.flatMap(TypeParser, (parser) => parser.optional(node));

/** A type parameter, parsed once per declaration and bound to its symbol. */
export const typeParameter = (
  node: Syntax.TypeParameterDeclaration,
): Effect.Effect<
  AST.TypeParameter.Interned,
  Failure,
  TypeParser | AST.Store | Names.Reach
> => Effect.flatMap(TypeParser, (parser) => parser.typeParameter(node));

/** The type parameters of one list. The parse reserves each before it reads any, so a constraint can name a type parameter declared after it. */
export const typeParameters = (
  nodes: readonly Syntax.TypeParameterDeclaration[],
): Effect.Effect<
  readonly AST.TypeParameter.Interned[],
  Failure,
  TypeParser | AST.Store | Names.Reach
> => Effect.flatMap(TypeParser, (parser) => parser.typeParameters(nodes));

/** The type parameters, parameters and stated return type of one signature. */
const signature = (
  node: Syntax.SignatureDeclaration,
): Effect.Effect<
  AST.Signature.Signature,
  Failure,
  TypeParser | AST.Store | Names.Reach
> => Effect.flatMap(TypeParser, (parser) => parser.signature(node));

/** The fields every signature-shaped node holds: its signature, then the comment of its own declaration. */
export const signed = <N extends Syntax.SignatureDeclaration>(
  node: N,
): Effect.Effect<
  AST.Signature.Signature & {
    readonly node: N;
    readonly documentation: Option.Option<AST.Documentation.Interned>;
  },
  Failure,
  TypeParser | Comments.CommentParser | AST.Store | Names.Reach
> =>
  Effect.all({
    parsed: signature(node),
    documentation: Comments.documentation(node),
  }).pipe(
    Effect.tap(({ parsed, documentation }) =>
      Comments.checkParameters(documentation, [parsed]),
    ),
    Effect.map(({ parsed, documentation }) => ({
      node,
      ...parsed,
      documentation,
    })),
  );

/** One call, with the documentation of its own declaration. */
export const call = (
  node: AST.CallSignature.CallSignature["node"],
): Effect.Effect<
  AST.CallSignature.Interned,
  Failure,
  TypeParser | AST.Store | Names.Reach
> => Effect.flatMap(TypeParser, (parser) => parser.call(node));

/** One construct signature, with the documentation of its own declaration. */
export const construct = (
  node: AST.ConstructSignature.ConstructSignature["node"],
): Effect.Effect<
  AST.ConstructSignature.Interned,
  Failure,
  TypeParser | AST.Store | Names.Reach
> => Effect.flatMap(TypeParser, (parser) => parser.construct(node));

/** The members of an interface or type literal, with same-named declarations grouped into one member. */
export const typeMembers = (
  nodes: readonly Syntax.TypeElement[],
): Effect.Effect<
  Chunk.Chunk<AST.Member.InternedType>,
  Failure,
  TypeParser | AST.Store | Names.Reach
> => Effect.flatMap(TypeParser, (parser) => parser.typeMembers(nodes));

/** The members of a class, with its constructors grouped into one member. */
export const classMembers = (
  nodes: readonly Syntax.ClassElement[],
): Effect.Effect<
  Chunk.Chunk<AST.Member.InternedClass>,
  Failure,
  TypeParser | AST.Store | Names.Reach
> => Effect.flatMap(TypeParser, (parser) => parser.classMembers(nodes));

/** The type `node` denotes, parsed once per syntax node. Names stay references, without expanding what they refer to. */
export const type = (
  node: TypeSource,
): Effect.Effect<
  AST.TypeNode.Interned,
  Failure,
  TypeParser | AST.Store | Names.Reach
> => Effect.flatMap(TypeParser, (parser) => parser.type(node));
