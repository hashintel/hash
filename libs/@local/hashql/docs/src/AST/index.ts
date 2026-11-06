import { Context, Effect, Function, Layer } from "effect";

import * as store from "../internal/ast/store.js";

import type * as Interned from "./Interned.js";
import type * as Node from "./Node.js";
import type * as Target from "./Target.js";
import type { Array } from "effect";
import type { Symbol as CompilerSymbol } from "typescript/async";

export * as Accessor from "./Accessor.js";
export * as Alias from "./Alias.js";
export * as CallSignature from "./CallSignature.js";
export * as CallableConstant from "./CallableConstant.js";
export * as FunctionOverloads from "./FunctionOverloads.js";
export * as ParseError from "./ParseError.js";
export * as ClassDeclaration from "./ClassDeclaration.js";
export * as ConstantDeclaration from "./ConstantDeclaration.js";
export * as Constructor from "./Constructor.js";
export * as ConstructorType from "./ConstructorType.js";
export * as ConstructSignature from "./ConstructSignature.js";
export * as Declaration from "./Declaration.js";
export * as Documentation from "./Documentation/index.js";
export * as ExternalItem from "./ExternalItem.js";
export * as EnumDeclaration from "./EnumDeclaration.js";
export * as EnumMember from "./EnumMember.js";
export * as FunctionDeclaration from "./FunctionDeclaration.js";
export * as FunctionType from "./FunctionType.js";
export * as Getter from "./Getter.js";
export * as IndependentDeclarations from "./IndependentDeclarations.js";
export * as IndexSignature from "./IndexSignature.js";
export * as InterfaceDeclaration from "./InterfaceDeclaration.js";
export type * as Interned from "./Interned.js";
export * as JointDeclaration from "./JointDeclaration.js";
export type * as LeafDeclaration from "./LeafDeclaration.js";
export type * as Member from "./Member.js";
export * as Method from "./Method.js";
export * as NamespaceDeclaration from "./NamespaceDeclaration.js";
export type * as Node from "./Node.js";
export * as ObjectType from "./ObjectType.js";
export * as Parameter from "./Parameter.js";
export * as Property from "./Property.js";
export * as Setter from "./Setter.js";
export type * as Signature from "./Signature.js";
export type * as Target from "./Target.js";
export * as TypeAliasDeclaration from "./TypeAliasDeclaration.js";
export type * as TypeDeclaration from "./TypeDeclaration.js";
export type * as ValueDeclaration from "./ValueDeclaration.js";
export * as TypeExpression from "./TypeExpression.js";
export type * as TypeNode from "./TypeNode.js";
export * as TypeParameter from "./TypeParameter.js";
export * as TypeReference from "./TypeReference.js";

/**
 * Owns the typed identities of one graph, the symbols that name them, and what the names outside the graph resolve to.
 *
 * @effect-leakable-service
 */
export class Store extends Context.Service<Store, store.Store>()(
  "@local/hashql-docs/AST/Store",
) {}

/** What a `{@link}` in a comment or a name in an example's code resolves to. */
export type Name = store.Name;

export const make = store.make;

export const layer = Layer.sync(Store, make);

/** Reserves an identity in the current graph and builds its node with it, so recursive references can precede the node they name. */
export const reserve = <T extends Node.Node, E, R>(
  build: store.Build<T, E, R>,
): Effect.Effect<Interned.Interned<T>, E, R | Store> =>
  Effect.flatMap(Store, (graph) => graph.reserve(build));

/** Interns `node` in the current graph, returning the identity of an equal node it already holds. */
export const intern = <T extends Node.Node>(
  node: T,
): Effect.Effect<Interned.Interned<T>, never, Store> =>
  Effect.flatMap(Store, (graph) => graph.intern(node));

/** Reserves the identity `symbols` name and builds its node with it, or returns the identity the first of them already names, finished or not. */
export const reserveSymbol: {
  <T extends Target.Target, E, R>(
    build: store.Build<T, E, R>,
  ): (
    symbols: Array.NonEmptyReadonlyArray<CompilerSymbol>,
  ) => Effect.Effect<Interned.Interned<T>, E, R | Store>;
  <T extends Target.Target, E, R>(
    symbols: Array.NonEmptyReadonlyArray<CompilerSymbol>,
    build: store.Build<T, E, R>,
  ): Effect.Effect<Interned.Interned<T>, E, R | Store>;
} = Function.dual(
  2,
  <T extends Target.Target, E, R>(
    symbols: Array.NonEmptyReadonlyArray<CompilerSymbol>,
    build: store.Build<T, E, R>,
  ): Effect.Effect<Interned.Interned<T>, E, R | Store> =>
    Effect.flatMap(Store, (graph) => graph.reserveSymbol(symbols, build)),
);
