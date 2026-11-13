import { Array, Function, HashMap, Option, pipe } from "effect";

import * as AST from "../AST/index.js";
import * as Catalogue from "../Catalogue.js";
import * as Entry from "../Entry.js";
import * as Placement from "../Placement.js";
import * as Tree from "../Tree/index.js";

import type * as ExternalTarget from "../ExternalTarget.js";

type Row = Tree.Row.Row;
type Local = AST.Interned.Interned<AST.Target.Local>;

/** What rows read besides the catalogue: where each export is documented and what its entry distilled. */
export interface Context {
  readonly catalogue: Catalogue.Catalogue;
  readonly placement: Placement.Placement;
  /** Each public declaration's export, which is its type's where its type and its value are declared apart. */
  readonly entries: HashMap.HashMap<Catalogue.DeclarationId, Tree.Export.Own>;
  /** The export of each value whose type is declared apart from it. */
  readonly values: HashMap.HashMap<Catalogue.DeclarationId, Tree.Export.Own>;
  /** The export each documented member belongs to, by the member's identity. */
  readonly owners: HashMap.HashMap<AST.Node.Interned, Catalogue.DeclarationId>;
  /** The module page the rows are written on, where a label leaves out its module's name. On a page that is no module's, every label carries it. */
  readonly page: Option.Option<Placement.Page>;
}

/** The prose an index shows the first sentence of. */
export const summary = (
  comment: Option.Option<Tree.Comment.Comment>,
): Option.Option<readonly Tree.Prose.Block[]> =>
  Option.flatMap(comment, ({ description }) =>
    Option.map(description, ({ children }) => children),
  );

/** An entry's own name as its page's title shows it: the last name of its path, or the entrypoint for an entrypoint's root. */
export const titleOf = (entry: Catalogue.Entry): string =>
  Array.last(entry.name.path).pipe(
    Option.getOrElse(() => entry.name.entrypoint),
  );

/** The name a page's exports are qualified by on another page, such as `JExpr` for `JExpr.parse`. An entrypoint's root is named by the last part of its specifier. */
const moduleOf = (page: Placement.Page): string =>
  Array.last(page.entry.name.path).pipe(
    Option.getOrElse(() =>
      Array.lastNonEmpty(Catalogue.segmentsOf(page.entry.name.entrypoint)),
    ),
  );

/** The names a reader on the context's page sees for something placed at `place`. Another page's declaration carries its module's name, unless its first name is that name already. */
const labelOf = (
  place: Placement.Place,
  names: readonly string[],
  context: Context,
): Array.NonEmptyReadonlyArray<string> => {
  if (!Array.isReadonlyArrayNonEmpty(names)) {
    return [titleOf(place.page.entry)];
  }

  const qualifier = moduleOf(place.page);
  if (
    Option.exists(context.page, (page) => page === place.page) ||
    names[0] === qualifier
  ) {
    return names;
  }

  return Array.prepend(names, qualifier);
};

type Placed = Pick<Context, "placement">;
type Documented = Pick<Tree.Export.Own, "origin" | "meaning">;

/** The place of an export. Every export of a catalogued declaration has one. */
export const placeOf: {
  (context: Placed): (own: Documented) => Placement.Place;
  (own: Documented, context: Placed): Placement.Place;
} = Function.dual(2, (own: Documented, context: Placed): Placement.Place =>
  Placement.placeOf(context.placement, {
    id: own.origin.id,
    meaning: own.meaning,
  }).pipe(Option.getOrThrow),
);

/** The export the reference distilled for a catalogued declaration. Every catalogued declaration has one. */
export const entryAt: {
  (
    context: Pick<Context, "entries">,
  ): (id: Catalogue.DeclarationId) => Tree.Export.Own;
  (
    id: Catalogue.DeclarationId,
    context: Pick<Context, "entries">,
  ): Tree.Export.Own;
} = Function.dual(
  2,
  (
    id: Catalogue.DeclarationId,
    context: Pick<Context, "entries">,
  ): Tree.Export.Own =>
    HashMap.get(context.entries, id).pipe(Option.getOrThrow),
);

type Exports = Pick<Context, "entries" | "values">;

/** A catalogued declaration, and what a name that reads it means where the name stands. */
export interface Reading {
  readonly id: Catalogue.DeclarationId;
  readonly meaning: ExternalTarget.Meaning;
}

/**
 * The export of a catalogued declaration that a name reads.
 *
 * A type and a value declared apart are an export each. A name that means the value reads the value's, and any other name reads the type's, which documents the namespace as well.
 */
export const exportAt: {
  (context: Exports): (reading: Reading) => Tree.Export.Own;
  (reading: Reading, context: Exports): Tree.Export.Own;
} = Function.dual(2, ({ id, meaning }: Reading, context: Exports) => {
  const entry = entryAt(id, context);
  if (meaning !== "value") {
    return entry;
  }

  return Option.getOrElse(HashMap.get(context.values, id), () => entry);
});

/** What a row for `own` links to: its declaration, or the declaration's value where the export documents that alone. */
const originOf = (own: Tree.Export.Own): Tree.Row.Target => {
  if (Option.contains(own.meaning, "value")) {
    return { _tag: "Value", declaration: own.origin.id };
  }

  return { _tag: "Reference", target: own.origin.id };
};

/** A row for an export on any page, under the names of its place. */
export const exportRow: {
  (context: Context): (own: Tree.Export.Own) => Row;
  (own: Tree.Export.Own, context: Context): Row;
} = Function.dual(2, (own: Tree.Export.Own, context: Context): Row => {
  const place = placeOf(own, context);

  return {
    type: "row",
    kind: own.kind,
    label: labelOf(place, place.names, context),
    depth: 0,
    summary: summary(Entry.summary(own)),
    deprecated: own.deprecated,
    origin: originOf(own),
  };
});

const memberRow = (
  member: Tree.Member.Member,
  owner: Catalogue.DeclarationId,
  context: Context,
): Row => {
  const place = placeOf(entryAt(owner, context), context);

  return {
    type: "row",
    kind: member.type,
    label: labelOf(place, Array.append(place.names, member.name), context),
    depth: 0,
    summary: summary(Array.head(Tree.Member.comments(member))),
    deprecated: member.deprecated,
    origin: { _tag: "Reference", target: member.id },
  };
};

/** A row for what a name with `meaning` reads at `target`, or none for a target that names neither a public declaration nor one of its members. */
const read =
  (context: Context, meaning: ExternalTarget.Meaning) =>
  (target: Local): Option.Option<Row> => {
    const { ast } = context.catalogue;
    const declaration = ast.narrow(target, AST.Declaration.isDeclaration);

    if (Option.isSome(declaration)) {
      return Option.some(
        exportRow(
          exportAt({ id: declaration.value, meaning }, context),
          context,
        ),
      );
    }

    return HashMap.get(context.owners, target).pipe(
      Option.flatMap((owner) =>
        Array.findFirst(
          entryAt(owner, context).members,
          ({ id }) => id === target,
        ).pipe(Option.map((member) => memberRow(member, owner, context))),
      ),
    );
  };

/** A row for a public declaration or one of its members, or none for a target that names neither. A member's row reads the member's own documentation rather than its owner's. */
export const row = (
  context: Context,
): ((target: Local) => Option.Option<Row>) => read(context, "type");

/** A row for a public declaration or member whose calls use another declaration. What makes calls is a value, so a declaration's row is its value's where its type is declared apart. */
export const user = (
  context: Context,
): ((target: Local) => Option.Option<Row>) => read(context, "value");

/** One export a namespace lists: a name the namespace exports, and an export that documents the name's declaration. */
export interface Listed {
  readonly exported: Placement.Export;
  readonly own: Tree.Export.Own;
  /** The name is the export's canonical one, so the namespace documents the export rather than only listing it. A value declared apart from its type has a canonical name of its own. */
  readonly canonical: boolean;
}

/** The value a name exports where it is declared apart from its type, or none for a name that exports the type alone. */
const valueOf = (
  exported: Placement.Export,
  context: Exports,
): Option.Option<Tree.Export.Own> => {
  if (exported.typeOnlyExport) {
    return Option.none();
  }

  return HashMap.get(context.values, exported.target);
};

/** What the namespace of `owner` lists for the names it exports: each name's export, or its type's and then its value's where the two are declared apart. */
export const listed =
  ({
    context,
    owner,
  }: {
    readonly context: Exports & Pick<Context, "catalogue">;
    readonly owner: Catalogue.Entry;
  }) =>
  (exports: readonly Placement.Export[]): readonly Listed[] =>
    Array.flatMap(exports, (exported) =>
      Array.prepend(
        Array.map(
          Option.toArray(valueOf(exported, context)),
          (own): Listed => ({
            exported,
            own,
            canonical: Placement.namesValue(context.catalogue, {
              owner,
              exported,
            }),
          }),
        ),
        {
          exported,
          own: entryAt(exported.target, context),
          canonical: exported.canonical,
        },
      ),
    );

/** The index of `exports` at `depth`. A canonical export documented on this page lists its members and its namespace's exports below it. */
export const listing =
  ({ context, depth }: { readonly context: Context; readonly depth: number }) =>
  (exports: readonly Listed[]): readonly Row[] =>
    Array.flatMap(exports, ({ exported, own: entry, canonical }) => {
      const place = placeOf(entry, context);
      const own: Row = {
        type: "row",
        kind: entry.kind,
        label: [exported.name],
        depth,
        summary: summary(Entry.summary(entry)),
        deprecated: entry.deprecated,
        origin: originOf(entry),
      };
      if (
        !canonical ||
        !Option.exists(context.page, (page) => page === place.page) ||
        place.names.length === 0
      ) {
        return [own];
      }

      const members = Array.map(entry.members, (member): Row => ({
        type: "row",
        kind: member.type,
        label: [member.name],
        depth: depth + 1,
        summary: summary(Array.head(Tree.Member.comments(member))),
        deprecated: member.deprecated,
        origin: { _tag: "Reference", target: member.id },
      }));
      const nested = pipe(
        Option.toArray(entry.namespace),
        Array.flatMap(() =>
          Placement.exportsOf(context.catalogue, entry.origin),
        ),
        listed({ context, owner: entry.origin }),
        listing({ context, depth: depth + 1 }),
      );

      return Array.flatten([[own], members, nested]);
    });
