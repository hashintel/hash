import { Array, HashMap, Match, Option, Order, Result, pipe } from "effect";

import * as Content from "./Content.js";
import * as Entry from "./Entry.js";
import * as Import from "./Import.js";
import * as Related from "./internal/related.js";
import * as Placement from "./Placement.js";
import * as Relations from "./Relations.js";
import * as Tree from "./Tree/index.js";

import type * as AST from "./AST/index.js";
import type * as Catalogue from "./Catalogue.js";

type Row = Tree.Row.Row;
type Local = Extract<
  AST.Reference.Reference.Target,
  { readonly _tag: "Local" }
>;

/** The reference's pages as documentation trees, before any output. The output reads the placement and the entries to decide where each page and each anchor goes. */
export interface Document {
  readonly catalogue: Catalogue.Catalogue;
  readonly placement: Placement.Placement;
  readonly entries: HashMap.HashMap<Catalogue.DeclarationId, Tree.Export.Own>;
  /** The export each documented member belongs to, by the member's identity. */
  readonly owners: HashMap.HashMap<AST.Node.Interned, Catalogue.DeclarationId>;
  readonly pages: readonly Tree.Page.Page[];
}

interface Composition extends Related.Context, Relations.Index {}

/** The prose a trait's row summarises: its comment's description, or the reference's explanation. */
const traitSummary = (
  description: Tree.Trait.Trait["description"],
): Option.Option<readonly Tree.Prose.Block[]> => {
  if (description.type === "explanation") {
    return Option.some(description.children);
  }

  return Related.summary(Option.some(description));
};

const traitRow = (trait: Relations.Described): Row => ({
  type: "row",
  kind: "trait",
  label: [trait.vertex.label],
  depth: 0,
  summary: traitSummary(trait.description),
  deprecated:
    trait.description.type === "comment" &&
    Option.isSome(trait.description.facts.deprecation),
  origin: { _tag: "Trait", trait: trait.vertex.target },
});

/** The names a reader sees on a row. Lists of rows sort by them, so they scan like an index. */
const labelOf = ({ label }: Row): string => label.join(".");

const rowsOf = (
  targets: readonly AST.Reference.Reference.Target[],
  composition: Composition,
): readonly Row[] =>
  pipe(
    targets,
    Array.flatMap((target) => {
      if (target._tag !== "Local") {
        return [];
      }

      return Option.toArray(Related.row(composition)(target));
    }),
    Array.sortWith(labelOf, Order.String),
  );

const relatedOf = (
  relations: Relations.Relations,
  composition: Composition,
): Tree.Row.Related => ({
  traits: pipe(
    relations.traits,
    Array.flatMap((index) =>
      pipe(
        HashMap.get(composition.traits, index),
        Option.map(traitRow),
        Option.toArray,
      ),
    ),
    Array.sortWith(labelOf, Order.String),
  ),
  implementedBy: rowsOf(relations.implementedBy, composition),
  acceptedBy: rowsOf(relations.acceptedBy, composition),
  returnedBy: rowsOf(relations.returnedBy, composition),
});

const exportOf = (
  own: Tree.Export.Own,
  namespace: Option.Option<Tree.Export.Namespace>,
  composition: Composition,
): Tree.Export.Export => {
  const relations = Relations.of(own.origin, composition);

  return {
    ...own,
    namespace,
    hierarchy: relations.hierarchy,
    related: relatedOf(relations, composition),
  };
};

/** The exports this page documents in full: each canonical name the page holds, with its namespace's exports beside it. */
const declarations = (
  exports: readonly Placement.Export[],
  composition: Composition,
): readonly Tree.Export.Export[] =>
  Array.flatMap(exports, (exported) => {
    const entry = Related.entryAt(exported.target, composition);
    const place = HashMap.get(composition.placement.places, exported.target);
    if (
      !exported.canonical ||
      !Option.exists(
        place,
        ({ page, names }) =>
          names.length > 0 &&
          Option.exists(composition.page, (current) => current === page),
      )
    ) {
      return [];
    }

    const namespace = Option.map(
      entry.namespace,
      (value): Tree.Export.Namespace => {
        const nested = Placement.exportsOf(composition.catalogue, entry.origin);

        return {
          ...value,
          index: Related.listing({ context: composition, depth: 0 })(nested),
          exports: declarations(nested, composition),
        };
      },
    );

    return [exportOf(entry, namespace, composition)];
  });

interface Classified {
  readonly grouping: Tree.Page.Grouping;
  readonly rank: number;
  readonly exported: Placement.Export;
}

/** Each group's rank, before groups of equal rank sort by name: modules first, then categories, then what the exports declare. */
const ranks = {
  modules: -2,
  category: -1,
  types: 0,
  classes: 1,
  functions: 2,
  constants: 3,
} as const;

const declaredOf = (
  kind: Tree.Export.Kind,
): Extract<Tree.Page.Grouping, { readonly _tag: "Declared" }>["kind"] =>
  Match.value(kind).pipe(
    Match.when("module", () => "modules" as const),
    Match.when("entrypoint", () => "modules" as const),
    Match.when("class", () => "classes" as const),
    Match.when("function", () => "functions" as const),
    Match.when("const", () => "constants" as const),
    Match.orElse(() => "types" as const),
  );

const classify = (
  exported: Placement.Export,
  composition: Composition,
): Classified => {
  const entry = Related.entryAt(exported.target, composition);
  const category = Entry.summary(entry).pipe(
    Option.flatMap(({ origin }) => origin.category),
  );
  if (Option.isSome(category) && entry.kind !== "module") {
    return {
      grouping: Tree.Page.Category({
        name: category.value.name,
        origin: category.value,
      }),
      rank: ranks.category,
      exported,
    };
  }

  const kind = declaredOf(entry.kind);

  return {
    grouping: Tree.Page.Declared({ kind }),
    rank: ranks[kind],
    exported,
  };
};

const byRank = Order.mapInput(
  Order.Number,
  ({ rank }: { readonly rank: number }) => rank,
);
const bySlug = Order.mapInput(
  Order.String,
  ({ grouping }: { readonly grouping: Tree.Page.Grouping }) =>
    Tree.Page.slugOf(grouping),
);

/** What tells two groupings of one kind apart: a category's name, or the kind of declaration. */
const keyOf = (grouping: Tree.Page.Grouping): string =>
  grouping._tag === "Category" ? grouping.name : grouping.kind;

const byKey = Order.mapInput(
  Order.String,
  ({ grouping }: { readonly grouping: Tree.Page.Grouping }) => keyOf(grouping),
);

/** Exports share a group when their groupings are of one kind with one key. A category never merges with a group of what exports declare, and two categories whose slugs collide keep a heading each. */
const sameGrouping = (self: Classified, that: Classified): boolean =>
  self.grouping._tag === that.grouping._tag &&
  keyOf(self.grouping) === keyOf(that.grouping);

const modulePage = (
  page: Placement.Page,
  composition: Composition,
): Tree.Page.Module => {
  // The sort is stable, so exports keep their order within a group.
  const groups = pipe(
    page.exports,
    Array.map((exported) => classify(exported, composition)),
    Array.sortBy(byRank, bySlug, byKey),
    Array.match({
      onEmpty: () => [],
      onNonEmpty: Array.groupWith(sameGrouping),
    }),
    Array.map((members) => ({
      grouping: members[0].grouping,
      exports: Array.map(members, ({ exported }) => exported),
    })),
    Array.map((group): Tree.Page.Group => ({
      grouping: group.grouping,
      rows: Related.listing({ context: composition, depth: 0 })(group.exports),
      exports: declarations(group.exports, composition),
    })),
  );

  return {
    type: "module",
    kind: page.kind,
    namespace: page.namespace,
    comment: Entry.summary(Related.entryAt(page.entry.id, composition)),
    import: Import.fromEntry(page.entry, composition.catalogue),
    groups,
    origin: page.entry,
  };
};

const traitsPage = (composition: Composition): Tree.Trait.Traits => ({
  type: "traits",
  traits: pipe(
    HashMap.values(composition.traits),
    Array.fromIterable,
    Array.sortWith(({ vertex }) => vertex.label, Order.String),
    Array.map((trait): Tree.Trait.Trait => ({
      type: "trait",
      name: trait.vertex.label,
      description: trait.description,
      implementors: rowsOf(trait.implementors, composition),
      hierarchy: trait.hierarchy,
      origin: trait.vertex.target,
    })),
  ),
  origin: composition.catalogue,
});

const overviewPage = (composition: Composition): Tree.Page.Overview => ({
  type: "overview",
  entrypoints: pipe(
    composition.placement.pages,
    Array.filter(({ kind }) => kind === "entrypoint"),
    Array.map((page): Row => {
      const entry = Related.entryAt(page.entry.id, composition);

      return {
        type: "row",
        kind: "entrypoint",
        label: [Related.titleOf(page.entry)],
        depth: 0,
        summary: Related.summary(Entry.summary(entry)),
        deprecated: false,
        origin: {
          _tag: "Reference",
          target: { _tag: "Local", node: page.entry.id } satisfies Local,
        },
      };
    }),
  ),
  traits: pipe(
    HashMap.values(composition.traits),
    Array.fromIterable,
    Array.sortWith(({ vertex }) => vertex.label, Order.String),
    Array.map(traitRow),
  ),
  origin: composition.catalogue,
});

/** Distils every page of the reference, from the overview to the traits, before any page is printed. */
export const collect = (
  catalogue: Catalogue.Catalogue,
): Result.Result<Document, Entry.Failure> =>
  Result.gen(function* () {
    const { ast } = catalogue;
    const placement = Placement.collect(catalogue);
    const distilled = yield* pipe(
      catalogue.entries,
      Array.map(Entry.from({ ast, content: Content.contextOf(ast) })),
      Result.all,
    );
    const entries = HashMap.fromIterable(
      Array.map(distilled, (entry) => [entry.origin.id, entry] as const),
    );
    const owners = HashMap.fromIterable(
      Array.flatMap(distilled, (entry) =>
        Array.map(
          entry.members,
          ({ id }): readonly [AST.Node.Interned, Catalogue.DeclarationId] => [
            id,
            entry.origin.id,
          ],
        ),
      ),
    );
    const relations = yield* Relations.collect(catalogue);
    const composition = (page: Option.Option<Placement.Page>): Composition => ({
      catalogue,
      placement,
      entries,
      owners,
      page,
      ...relations,
    });
    const unplaced = composition(Option.none());

    return {
      catalogue,
      placement,
      entries,
      owners,
      pages: Array.flatten([
        [overviewPage(unplaced), traitsPage(unplaced)],
        Array.map(placement.pages, (page) =>
          modulePage(page, composition(Option.some(page))),
        ),
      ]),
    };
  });
