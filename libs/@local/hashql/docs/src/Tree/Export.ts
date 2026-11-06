import type * as AST from "../AST/index.js";
import type * as Catalogue from "../Catalogue.js";
import type * as Callable from "./Callable.js";
import type * as Comment from "./Comment.js";
import type * as Declaration from "./Declaration.js";
import type * as Hierarchy from "./Hierarchy.js";
import type * as Member from "./Member.js";
import type * as Node from "./Node.js";
import type * as Row from "./Row.js";
import type { Option } from "effect";

/** What a public declaration declares, by its first declaration. A declaration that is only a namespace is a module, and an entrypoint's root is an entrypoint. */
export type Kind =
  | "type"
  | "interface"
  | "class"
  | "enum"
  | "function"
  | "const"
  | "module"
  | "entrypoint";

/** A namespace merged with an export, with its own comment, never its module's. */
export interface OwnNamespace extends Node.Node<
  "namespace",
  AST.NamespaceDeclaration.NamespaceDeclaration
> {
  readonly comment: Option.Option<Comment.Comment>;
}

/** A namespace merged with an export, with the exports it documents below its export. */
export interface Namespace extends OwnNamespace {
  readonly index: readonly Row.Row[];
  readonly exports: readonly Export[];
}

/**
 * A public declaration as its own declarations and comments document it, under its canonical name. The catalogue's entry holds its identity, which local references name, and that name.
 *
 * Another declaration's row reads this, so the reference distils it for every declaration before any page relates one to another.
 */
export interface Own
  extends Node.Node<"export", Catalogue.Entry>, Callable.Callable {
  readonly kind: Kind;
  /** None for a declaration that is only a namespace. */
  readonly signatures: Option.Option<Declaration.Signatures>;
  readonly comments: readonly Comment.Comment[];
  readonly members: readonly Member.Member[];
  readonly namespace: Option.Option<OwnNamespace>;
  /** Every overload's comment carries `@deprecated`, or a namespace's comment does. */
  readonly deprecated: boolean;
}

/** A public declaration on the page that documents it, with what relates it to the reference's other declarations. */
export interface Export extends Own {
  readonly namespace: Option.Option<Namespace>;
  readonly hierarchy: Option.Option<Hierarchy.Hierarchy>;
  readonly related: Row.Related;
}
