import type * as AST from "../AST/index.js";
import type * as Parts from "../internal/parts.js";
import type * as Callable from "./Callable.js";
import type * as Comment from "./Comment.js";
import type * as Node from "./Node.js";
import type { Array, Option } from "effect";
import type * as TypeScript from "typescript/ast";

/** One numbered call, or a declaration that states no call, which counts as one overload. */
export interface Overload extends Node.Node<
  "overload",
  AST.CallSignature.CallSignature | Parts.Source
> {
  readonly index: Callable.OverloadIndex;
}

/**
 * One declaration as a reader sees it, printed whole, with the overloads it numbers.
 *
 * A function declares each overload separately, while a constant whose type has several calls declares them together, so one signature can number several overloads. The origin's compiler node locates the declaration in its source.
 */
export interface Signature extends Node.Node<"signature", Parts.Source> {
  /**
   * The compiler's declaration after the tree's transforms, exported under its public name, or after an export statement where it cannot carry that name or is a value exported type-only.
   *
   * A transform keeps every child it leaves unchanged, so each name in it still finds its reference in the AST.
   */
  readonly syntax: Array.NonEmptyReadonlyArray<TypeScript.Node>;
  readonly overloads: Array.NonEmptyReadonlyArray<Overload>;
  /** What this declaration's own comment states, which can differ between the declarations of one export. */
  readonly facts: Option.Option<Comment.Facts>;
}

/** Every declaration of an export or a member, in source order. Their overloads count from 1 across all of them. */
export interface Signatures extends Node.Parent<
  "signatures",
  Array.NonEmptyReadonlyArray<Parts.Source>,
  Signature
> {}
