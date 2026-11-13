import {
  Array,
  HashMap,
  Match,
  Option,
  Order,
  Predicate,
  Result,
  pipe,
} from "effect";

import * as Entry from "./Entry.js";
import * as Import from "./Import.js";
import * as Related from "./internal/related.js";
import * as Placement from "./Placement.js";
import * as Relations from "./Relations.js";
import * as Tree from "./Tree/index.js";

import type * as AST from "./AST/index.js";
import type * as Catalogue from "./Catalogue.js";

type Row = Tree.Row.Row;
type Local = AST.Interned.Interned<AST.Target.Local>;

/** The reference's pages as documentation trees, before any output. The output reads the placement and the entries to decide where each page and each anchor goes. */
export interface Document {
  readonly catalogue: Catalogue.Catalogue;
  readonly placement: Placement.Placement;
  /** Each public declaration's export, which is its type's where its type and its value are declared apart. */
  readonly entries: HashMap.HashMap<Catalogue.DeclarationId, Tree.Export.Own>;
  /** The export of each value whose type is declared apart from it. */
  readonly values: HashMap.HashMap<Catalogue.DeclarationId, Tree.Export.Own>;
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

/** The row of each target, which `row` reads as a declaration or as something that uses one. */
const rowsOf = (
  targets: readonly Local[],
  row: (target: Local) => Option.Option<Row>,
): readonly Row[] =>
  pipe(
    targets,
    Array.flatMap((target) => Option.toArray(row(target))),
    Array.sortWith(labelOf, Order.String),
  );

/** The row of the export that shares `own`'s name with the meaning `own` does not document, or none for an export that documents its name whole. */
const counterpart = (
  own: Tree.Export.Own,
  meaning: Tree.Export.Meaning,
  composition: Composition,
): readonly Row[] =>
  pipe(
    own.meaning,
    Option.filter((documented) => documented !== meaning),
    Option.map(() =>
      Related.exportAt({ id: own.origin.id, meaning }, composition),
    ),
    Option.map(Related.exportRow(composition)),
    Option.toArray,
  );

const relatedOf = (
  own: Tree.Export.Own,
  relations: Relations.Relations,
  composition: Composition,
): Tree.Row.Related => ({
  type: counterpart(own, "type", composition),
  value: counterpart(own, "value", composition),
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
  implementedBy: rowsOf(relations.implementedBy, Related.row(composition)),
  acceptedBy: rowsOf(relations.acceptedBy, Related.user(composition)),
  returnedBy: rowsOf(relations.returnedBy, Related.user(composition)),
});

const exportOf = (
  own: Tree.Export.Own,
  namespace: Option.Option<Tree.Export.Namespace>,
  composition: Composition,
): Tree.Export.Export => {
  const relations = Relations.of(own, composition);

  return {
    ...own,
    namespace,
    hierarchy: relations.hierarchy,
    related: relatedOf(own, relations, composition),
  };
};

/** The exports this page documents in full: each canonical name the page holds, with its namespace's exports beside it. */
const declarations = (
  exports: readonly Related.Listed[],
  composition: Composition,
): readonly Tree.Export.Export[] =>
  Array.flatMap(exports, ({ exported, own: entry }) => {
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
        const nested = pipe(
          Placement.exportsOf(composition.catalogue, entry.origin),
          Related.listed(composition),
        );

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
  readonly listed: Related.Listed;
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

/** The group of one listed export, by its own comment and what it declares. A type and a value declared apart can be in two groups. */
const classify = (listed: Related.Listed): Classified => {
  const category = Entry.summary(listed.own).pipe(
    Option.flatMap(({ origin }) => origin.category),
  );
  const kind = declaredOf(listed.own.kind);
  if (Option.isSome(category) && kind !== "modules") {
    return {
      grouping: Tree.Page.Category({
        name: category.value.name,
        origin: category.value,
      }),
      rank: ranks.category,
      listed,
    };
  }

  return {
    grouping: Tree.Page.Declared({ kind }),
    rank: ranks[kind],
    listed,
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
    Related.listed(composition),
    Array.map(classify),
    Array.sortBy(byRank, bySlug, byKey),
    Array.match({
      onEmpty: () => [],
      onNonEmpty: Array.groupWith(sameGrouping),
    }),
    Array.map((members) => ({
      grouping: members[0].grouping,
      exports: Array.map(members, ({ listed }) => listed),
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
      implementors: rowsOf(trait.implementors, Related.row(composition)),
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
        deprecated: entry.deprecated,
        origin: { _tag: "Reference", target: page.entry.id },
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

/** Whether an export documents a value alone, whose type is declared apart from it. */
const isValue = ({ meaning }: Tree.Export.Own): boolean =>
  Option.contains(meaning, "value");

const byDeclaration = (
  exports: readonly Tree.Export.Own[],
): Document["entries"] =>
  HashMap.fromIterable(
    Array.map(exports, (entry) => [entry.origin.id, entry] as const),
  );

/** Distils every page of the reference, from the overview to the traits, before any page is printed. */
export const collect = (
  catalogue: Catalogue.Catalogue,
): Result.Result<Document, Entry.Failure> =>
  Result.gen(function* () {
    const { ast } = catalogue;
    const placement = Placement.collect(catalogue);
    const distilled = yield* pipe(
      catalogue.entries,
      Array.map(Entry.from(Entry.contextOf(ast))),
      Result.all,
      Result.map(Array.flatten),
    );
    const entries = byDeclaration(
      Array.filter(distilled, Predicate.not(isValue)),
    );
    const values = byDeclaration(Array.filter(distilled, isValue));
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
      values,
      owners,
      page,
      ...relations,
    });
    const unplaced = composition(Option.none());

    return {
      catalogue,
      placement,
      entries,
      values,
      owners,
      pages: Array.flatten([
        [overviewPage(unplaced), traitsPage(unplaced)],
        Array.map(placement.pages, (page) =>
          modulePage(page, composition(Option.some(page))),
        ),
      ]),
    };
  });
