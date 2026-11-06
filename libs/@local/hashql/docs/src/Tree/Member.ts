import type * as AST from "../AST/index.js";
import type * as Callable from "./Callable.js";
import type * as Comment from "./Comment.js";
import type * as Declaration from "./Declaration.js";
import type * as Node from "./Node.js";
import type { Option } from "effect";

interface Owned<
  Type extends string,
  Origin extends AST.Member.Member,
> extends Node.Node<Type, Origin> {
  /** The member's identity, which local references name. */
  readonly id: AST.Member.Interned;
  /** The member's declared name, without the quotes of a string-literal name. */
  readonly name: string;
  /** Static and instance members may share a name and stay two members. */
  readonly static: boolean;
  readonly comments: readonly Comment.Comment[];
  /** Every overload's comment carries `@deprecated`. */
  readonly deprecated: boolean;
}

export interface Property extends Owned<"property", AST.Property.Property> {
  readonly signatures: Declaration.Signatures;
}

export interface Method
  extends Owned<"method", AST.Method.Method>, Callable.Callable {
  readonly signatures: Declaration.Signatures;
}

/** A getter and a setter remain the two halves of one member, each with its own declaration and comment. */
export interface Accessor extends Owned<"accessor", AST.Accessor.Accessor> {
  readonly get: Option.Option<Declaration.Signature>;
  readonly set: Option.Option<Declaration.Signature>;
}

export interface EnumMember extends Owned<
  "enumMember",
  AST.EnumMember.EnumMember
> {
  readonly signatures: Declaration.Signatures;
}

/** A member a class, an interface or an enum documents. Constructors, index signatures and call or construct signatures are part of their owner's declaration instead. */
export type Member = Property | Method | Accessor | EnumMember;
