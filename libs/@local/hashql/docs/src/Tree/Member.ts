import { Array } from "effect";

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
  /** Every comment on the member's declarations carries `@deprecated`. */
  readonly deprecated: boolean;
}

/** A member whose declarations number their overloads together, so a comment names the overloads it documents. */
interface Declared<Type extends string, Origin extends AST.Member.Member>
  extends Owned<Type, Origin>, Callable.Callable {
  readonly signatures: Declaration.Signatures;
  readonly comments: readonly Comment.Comment[];
}

export interface Property extends Declared<"property", AST.Property.Property> {}

export interface Method extends Declared<"method", AST.Method.Method> {}

/** A getter or a setter, with what its own comment alone documents about reading or writing the member. */
export interface Half<Type extends string, Origin>
  extends Node.Node<Type, Origin>, Callable.Callable {
  readonly signature: Declaration.Signature;
  readonly comment: Option.Option<Comment.Comment>;
}

export interface Getter extends Half<"getter", AST.Getter.Getter> {}

export interface Setter extends Half<"setter", AST.Setter.Setter> {}

/** A getter and a setter remain the two halves of one member, in source order. */
export interface Accessor extends Owned<"accessor", AST.Accessor.Accessor> {
  readonly halves: Array.NonEmptyReadonlyArray<Getter | Setter>;
}

export interface EnumMember extends Declared<
  "enumMember",
  AST.EnumMember.EnumMember
> {}

/** A member a class, an interface or an enum documents. Constructors, index signatures and call or construct signatures are part of their owner's declaration instead. */
export type Member = Property | Method | Accessor | EnumMember;

/** The comments on a member's declarations, in source order. */
export const comments = (member: Member): readonly Comment.Comment[] => {
  if (member.type === "accessor") {
    return Array.getSomes(Array.map(member.halves, ({ comment }) => comment));
  }

  return member.comments;
};
