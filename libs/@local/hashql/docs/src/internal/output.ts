import { Array, HashMap, Option, pipe } from "effect";

import * as Anchor from "../Anchor.js";
import * as AST from "../AST/index.js";
import * as Destinations from "../Destinations.js";
import * as Tree from "../Tree/index.js";
import * as Related from "./related.js";

import type * as Code from "../Code.js";
import type * as Document from "../Document.js";
import type * as Print from "./print.js";
import type { Node } from "typescript/ast";

type Target = AST.Target.Interned;

/** What an adapter reads to write one page. Its links resolve through the destinations and the pages of the items outside the package, and the reference prints its code before it writes any page. */
export interface Output {
  readonly file: Anchor.File;
  readonly document: Document.Document;
  readonly destinations: Destinations.Destinations;
  readonly printed: Print.Printed;
  /** The URL of where `node` is declared, which the host builds from the node's position in its source. */
  readonly source: (node: Node) => Option.Option<string>;
}

export type Failure = Code.CodeError;

/** The item outside the package that `target` names, or none for a node the package declares. */
export const external =
  (output: Output) =>
  (target: Target): Option.Option<AST.ExternalItem.ExternalItem> => {
    const { ast } = output.document.catalogue;

    return Option.map(
      ast.narrow(target, AST.ExternalItem.isExternalItem),
      ast.get,
    );
  };

/** The URL of what `target` names as a name with `meaning` reads it, relative to the page's file for a node the reference documents. */
const urlOf = (
  output: Output,
  target: Target,
  meaning: Code.Link["meaning"],
): Option.Option<string> =>
  Option.match(external(output)(target), {
    onSome: (item) => Option.map(item.page(meaning), ({ href: url }) => url),
    onNone: () =>
      Destinations.local(output.destinations, target).pipe(
        Option.map((anchor) => Anchor.href(anchor, output.file)),
      ),
  });

/** The URL of what `target` names, relative to the page's file for a node the reference documents. A private declaration, a parameter and an external type no page documents have none, and a name of theirs is not a link. An external type links to the page of its type. */
export const href =
  (output: Output) =>
  (target: Target): Option.Option<string> =>
    urlOf(output, target, "type");

/** The URL a name links to. An external name links to the page of what it means where it stands, which for a namespace that shares its name with a type is the namespace's page. */
export const link =
  (output: Output) =>
  ({
    target,
    meaning,
  }: Pick<Code.Link, "target" | "meaning">): Option.Option<string> =>
    urlOf(output, target, meaning);

/** The URL a comment's link points to: what its name resolved to, or the address it writes. */
export const destination =
  (output: Output) =>
  (value: Tree.Prose.Link["destination"]): Option.Option<string> => {
    if (value instanceof URL) {
      return Option.some(value.href);
    }

    return href(output)(value);
  };

/** The URL a row links to: what its reference names, or a trait's section on the traits page. */
export const row =
  (output: Output) =>
  ({ origin }: Tree.Row.Row): Option.Option<string> => {
    if (origin._tag === "Reference") {
      return href(output)(origin.target);
    }

    return Destinations.trait(output.destinations, origin.trait).pipe(
      Option.map((anchor) => Anchor.href(anchor, output.file)),
    );
  };

/** A trait in a hierarchy links to its section on the traits page, and any other type to what its reference names. */
export const hierarchyNode =
  (output: Output) =>
  ({ origin }: Tree.Hierarchy.HierarchyNode): Option.Option<string> =>
    Destinations.trait(output.destinations, origin).pipe(
      Option.map((anchor) => Anchor.href(anchor, output.file)),
      Option.orElse(() => href(output)(origin)),
    );

/** The id of an anchor on this page. A page itself has none. */
const id = (anchor: Anchor.Anchor): string =>
  Option.getOrElse(anchor.id, () => "");

/** Where an export is documented and what its heading shows. */
export interface Place {
  readonly id: string;
  /** Its last name, or the entrypoint for an entrypoint's root. */
  readonly title: string;
  /** Its names below its page's own. */
  readonly names: readonly string[];
}

/** The place of an export this page documents. */
export const place =
  (output: Output) =>
  (value: Tree.Export.Export): Place => ({
    id: pipe(
      HashMap.get(output.destinations.declarations, value.origin.id),
      Option.map(id),
      Option.getOrElse(() => ""),
    ),
    title: Related.titleOf(value.origin),
    names: pipe(
      HashMap.get(output.document.placement.places, value.origin.id),
      Option.map(({ names }) => names),
      Option.getOrElse((): readonly string[] => []),
    ),
  });

/** The id of a member's anchor beside its owner's. */
export const memberId =
  (output: Output) =>
  (value: Tree.Member.Member): string =>
    pipe(
      HashMap.get(output.destinations.members, value.id),
      Option.map(id),
      Option.getOrElse(() => ""),
    );

/** The id of a group's heading on its module page, or none for a group the page only links to. */
export const groupId =
  (output: Output) =>
  (page: Tree.Page.Module, group: Tree.Page.Group): Option.Option<string> =>
    HashMap.get(output.destinations.groups, page.origin.id).pipe(
      Option.flatMap((groups) => HashMap.get(groups, group.grouping)),
    );

/** The id of a module page's index heading. */
export const indexId =
  (output: Output) =>
  (page: Tree.Page.Module): string =>
    HashMap.get(output.destinations.indexes, page.origin.id).pipe(
      Option.getOrElse(() => "page-index"),
    );

/** The id of a trait's section on the traits page. */
export const traitId =
  (output: Output) =>
  (trait: Tree.Trait.Trait): string =>
    Destinations.trait(output.destinations, trait.origin).pipe(
      Option.map(id),
      Option.getOrElse(() => ""),
    );

/** The overloads `applies` names, or none when it names every overload, in which case a reader is told nothing. */
export const overloads = (
  applies: Tree.Callable.Applies,
): Option.Option<Array.NonEmptyReadonlyArray<Tree.Callable.OverloadIndex>> =>
  Option.liftPredicate(
    applies.overloads,
    () => !Tree.Callable.isEvery(applies),
  );

/** Whether one of `values` holds in some overloads only. Such a list tells its reader where each value holds, and one that holds in every overload says so. */
export const varies = (
  values: readonly { readonly applies: Tree.Callable.Applies }[],
): boolean =>
  Array.some(values, ({ applies }) => !Tree.Callable.isEvery(applies));

/** The facts a declaration's comment states, with the URL of where it is declared. */
export interface Facts {
  readonly since: Option.Option<string>;
  readonly stability: Option.Option<string>;
  readonly internal: boolean;
  readonly deprecated: boolean;
  readonly source: Option.Option<string>;
}

/** The facts a comment states about a declaration, and where the declaration is, when it is somewhere. */
export const facts =
  (output: Output) =>
  ({
    facts: stated,
    origin,
  }: {
    readonly facts: Option.Option<Tree.Comment.Facts>;
    readonly origin: Option.Option<{ readonly node: Node }>;
  }): Facts => ({
    since: Option.flatMap(stated, ({ since }) =>
      Option.map(since, ({ version }) => version),
    ),
    stability: Option.flatMap(stated, ({ stability }) =>
      Option.map(stability, ({ level }) => level),
    ),
    internal: Option.exists(stated, ({ internal }) => Option.isSome(internal)),
    deprecated: Option.exists(stated, ({ deprecation }) =>
      Option.isSome(deprecation),
    ),
    source: Option.flatMap(origin, ({ node }) => output.source(node)),
  });

/** The facts of one declaration: its own comment's, at the declaration. */
export const signatureFacts =
  (output: Output) =>
  (value: Tree.Declaration.Signature): Facts =>
    facts(output)({ facts: value.facts, origin: Option.some(value.origin) });

/** The facts of an export or a member: its first comment's, at its first declaration. */
export const leading =
  (output: Output) =>
  ({
    comments,
    signatures,
  }: {
    readonly comments: readonly Tree.Comment.Comment[];
    readonly signatures: readonly Tree.Declaration.Signature[];
  }): Facts =>
    facts(output)({
      facts: Option.map(Array.head(comments), ({ facts: stated }) => stated),
      origin: Option.map(Array.head(signatures), ({ origin }) => origin),
    });

/** How many overloads the declarations number between them. */
export const count = (
  values: Option.Option<Tree.Declaration.Signatures>,
): number =>
  Option.match(values, {
    onNone: () => 0,
    onSome: ({ children }) =>
      Array.reduce(
        children,
        0,
        (total, { overloads: numbered }) => total + numbered.length,
      ),
  });

/** What a reader calls the things `count` counts. They are overloads where each one is a call. Where one states no call, as a type merged with a constant does, they are declarations. */
export const counted = (
  values: Option.Option<Tree.Declaration.Signatures>,
): "overloads" | "declarations" =>
  pipe(
    Option.toArray(values),
    Array.flatMap(({ children }) => children),
    Array.flatMap(({ overloads }) => overloads),
    Array.every(({ origin }) => AST.CallSignature.isCallSignature(origin)),
  )
    ? "overloads"
    : "declarations";

/** The declarations of a member in source order, which for an accessor are its getter's and its setter's. */
export const declarationsOf = (
  value: Tree.Member.Member,
): readonly Tree.Declaration.Signature[] => {
  if (value.type === "accessor") {
    return Array.map(value.halves, ({ signature }) => signature);
  }

  return value.signatures.children;
};
