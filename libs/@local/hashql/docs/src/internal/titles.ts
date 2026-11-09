import { Array, Data, Option } from "effect";

import * as Tree from "../Tree/index.js";

const declared: Record<
  Extract<Tree.Page.Grouping, { readonly _tag: "Declared" }>["kind"],
  string
> = {
  modules: "Modules",
  types: "Types",
  classes: "Classes",
  functions: "Functions",
  constants: "Constants",
};

/** The heading of a group of a module's exports. */
export const grouping: (value: Tree.Page.Grouping) => string =
  Tree.Page.matchGrouping({
    Category: ({ name }) => name,
    Declared: ({ kind }) => declared[kind],
  });

/** The heading of a group of related exports. */
export const related: Record<keyof Tree.Row.Related, string> = {
  traits: "Traits",
  implementedBy: "Implemented by",
  acceptedBy: "Accepted by",
  returnedBy: "Returned by",
};

/** The heading of an export's declarations, which counts its overloads when it has several. */
export const signatures = (overloads: number): string =>
  overloads > 1 ? `Signatures · ${overloads} overloads` : "Signature";

export const sections = {
  typeParameters: "Type parameters",
  parameters: "Parameters",
  returns: "Returns",
  throws: "Throws",
  members: "Members",
  remarks: "Remarks",
  example: "Example",
  see: "See also",
  exports: "Exports",
  index: "Index",
  entrypoints: "Entrypoints",
  traits: "Traits",
  deprecated: "Deprecated:",
} as const;

/** What the reference's own pages are about, for search and metadata and as the first paragraph of each one. */
export const descriptions = {
  overview: "Package entrypoints and the traits of their types.",
  traits: "Shared interfaces and the types that implement them.",
} as const;

/** One piece of the sentences after a trait's description. Its declaration's link reads as the trait's name in code. */
export type Piece = Data.TaggedEnum<{
  Text: { readonly value: string };
  Declaration: { readonly href: string };
  Guide: { readonly href: string; readonly label: string };
}>;

export const { $match: matchPiece } = Data.taggedEnum<Piece>();

const { Text, Declaration, Guide } = Data.taggedEnum<Piece>();

/**
 * The pieces of the sentences after a trait's description, which name its declaration and the guide that explains it.
 *
 * A trait the package declares without exporting it says so. An external trait without a page names no declaration.
 */
export const traitPieces = ({
  trait,
  declaration,
  external,
}: {
  readonly trait: Tree.Trait.Trait;
  readonly declaration: Option.Option<string>;
  /** Declared outside the package, such as one of Effect's interfaces. */
  readonly external: boolean;
}): readonly Piece[] => {
  const unexported: Piece[] = [];
  if (!external) {
    unexported.push(
      Text({ value: "Declared inside the package, which does not export it." }),
    );
  }
  let guide = Option.none<URL>();
  if (trait.description.type === "explanation") {
    ({ guide } = trait.description);
  }
  const where = Option.match(declaration, {
    onNone: () => unexported,
    onSome: (href): Piece[] => [
      Text({ value: "Declared as " }),
      Declaration({ href }),
      Text({ value: "." }),
    ],
  });
  const explained = Option.match(guide, {
    onNone: (): Piece[] => [],
    onSome: ({ href }): Piece[] => [
      Text({ value: "Effect explains it in " }),
      Guide({ href, label: "its guide" }),
      Text({ value: "." }),
    ],
  });

  return Array.flatten(
    Array.intersperse(
      Array.filter([where, explained], Array.isReadonlyArrayNonEmpty),
      [Text({ value: " " })],
    ),
  );
};
