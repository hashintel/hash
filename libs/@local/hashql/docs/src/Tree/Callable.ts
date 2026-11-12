import { Array, Brand } from "effect";

import type * as AST from "../AST/index.js";
import type * as Node from "./Node.js";
import type * as Prose from "./Prose.js";
import type { Option } from "effect";

/** An overload's place among its owner's calls, counting from 1. A declaration that states no call is one overload. */
export type OverloadIndex = number & Brand.Brand<"OverloadIndex">;
export const OverloadIndex = Brand.nominal<OverloadIndex>();

/** The overloads something holds in, in order, and how many its owner has. It holds in every overload when it names all of them. */
export interface Applies {
  readonly overloads: Array.NonEmptyReadonlyArray<OverloadIndex>;
  readonly total: number;
}

/** The overloads `overloads` names, each once. */
export const applies = ({ overloads, total }: Applies): Applies => ({
  overloads: Array.dedupe(overloads),
  total,
});

/** What a comment on a declaration without calls documents: its one overload. */
export const whole: Applies = { overloads: [OverloadIndex(1)], total: 1 };

/** Whether `value` holds in every overload of its owner, in which case a reader is told no numbers. */
export const isEvery = ({ overloads, total }: Applies): boolean =>
  overloads.length === total;

/** What states an overload's parameters and result. Reading a member calls its getter, and writing it calls its setter. */
export type Call =
  | AST.CallSignature.CallSignature
  | AST.Getter.Getter
  | AST.Setter.Setter;

/**
 * A type a parameter or a call's result has, in the overloads it has it in. Equal types of different overloads form one form.
 *
 * The type is the compiler's syntax as a reader sees it, after the tree's transforms. A transform keeps every child it leaves unchanged, so each name in it still finds its reference in the AST.
 */
export interface Form<Origin> {
  readonly applies: Applies;
  readonly origins: Array.NonEmptyReadonlyArray<Origin>;
  readonly type: AST.TypeNode.TypeNode["node"];
}

/** What the comments say about a parameter, a type parameter, a result or an error, in the overloads they say it for. Equal descriptions of different overloads form one. */
export interface Described<Origin> extends Node.Parent<
  "described",
  Array.NonEmptyReadonlyArray<Origin>,
  Prose.Block
> {
  readonly applies: Applies;
}

/** A parameter its comments document, by the name they give it. Its declarations decide whether a call may omit it or pass several. */
export interface Parameter extends Node.Node<
  "parameter",
  Array.NonEmptyReadonlyArray<AST.Documentation.Parameter.Parameter>
> {
  readonly name: string;
  readonly declarations: readonly AST.Parameter.Parameter[];
  /** Every declaration of the name is optional. */
  readonly optional: boolean;
  /** A declaration of the name collects the remaining arguments. */
  readonly rest: boolean;
  readonly forms: readonly Form<AST.Parameter.Parameter>[];
  readonly descriptions: readonly Described<AST.Documentation.Parameter.Parameter>[];
}

/** A type parameter its comments document, by the name they give it. */
export interface TypeParameter extends Node.Node<
  "typeParameter",
  Array.NonEmptyReadonlyArray<AST.Documentation.TypeParameter.TypeParameter>
> {
  readonly name: string;
  readonly descriptions: readonly Described<AST.Documentation.TypeParameter.TypeParameter>[];
}

/** What the calls return, present when a comment documents it. */
export interface Returns extends Node.Node<
  "returns",
  Array.NonEmptyReadonlyArray<AST.Documentation.Returns.Returns>
> {
  readonly forms: readonly Form<Call>[];
  readonly descriptions: readonly Described<AST.Documentation.Returns.Returns>[];
}

/**
 * An error the calls throw. A `@throws` that opens with code, or a link to it, names the error, and the rest describes it.
 *
 * The error owns its descriptions. A description's total counts the overloads that throw the error, and a description all of them give holds in every overload of its owner.
 */
export interface Throw extends Node.Node<
  "throw",
  Array.NonEmptyReadonlyArray<AST.Documentation.Throws.Throws>
> {
  readonly error: Option.Option<Prose.InlineCode | Prose.Link>;
  readonly applies: Applies;
  readonly descriptions: readonly Described<AST.Documentation.Throws.Throws>[];
}

/** The documented parts of the calls an export or a member declares. */
export interface Callable {
  readonly typeParameters: readonly TypeParameter[];
  readonly parameters: readonly Parameter[];
  readonly returns: Option.Option<Returns>;
  readonly throws: readonly Throw[];
}
