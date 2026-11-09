import { expect, layer } from "@effect/vitest";
import { Array, Effect, HashMap, HashSet, Option, pipe } from "effect";

import * as Catalogue from "../src/Catalogue.js";
import * as Related from "../src/internal/related.js";
import * as Page from "../src/Page.js";
import * as Tree from "../src/Tree/index.js";
import * as Reference from "./fixtures/reference.js";

import type * as AST from "../src/AST/index.js";
import type * as Placement from "../src/Placement.js";

const moduleAt = (
  reference: Reference.Reference,
  file: string,
): Tree.Page.Module => {
  const { tree } = Reference.page(reference, file);
  if (tree.type !== "module") {
    throw new Error(`${file} is not a module page`);
  }
  return tree;
};

/** An export, then every export below its namespace. */
const withNested = (
  exported: Tree.Export.Export,
): readonly Tree.Export.Export[] =>
  Array.prepend(
    Array.flatMap(Option.toArray(exported.namespace), ({ exports }) =>
      Array.flatMap(exports, withNested),
    ),
    exported,
  );

/** Every export a page documents, those below a namespace included. */
const exportsOf = (page: Tree.Page.Module): readonly Tree.Export.Export[] =>
  Array.flatMap(page.groups, ({ exports }) =>
    Array.flatMap(exports, withNested),
  );

/** Every export the reference documents, on any page. */
const documentedOf = ({
  pages,
}: Reference.Reference): readonly Tree.Export.Export[] =>
  Array.flatMap(pages, ({ tree }) => {
    if (tree.type !== "module") {
      return [];
    }

    return exportsOf(tree);
  });

const rowsOf = (page: Tree.Page.Module): readonly Tree.Row.Row[] =>
  Array.flatMap(page.groups, ({ rows }) => rows);

const titleOf = ({ origin }: Tree.Export.Export): string =>
  Array.last(origin.name.path).pipe(Option.getOrElse(() => ""));

const summaryOf = (row: Tree.Row.Row): Option.Option<string> =>
  Option.flatMap(row.summary, Tree.Prose.plain);

/** Prose without its origins: each node's type with its text, and each link's target. */
type Shape =
  | readonly ["text" | "inlineCode" | "code", string]
  | readonly ["link", AST.Target.Interned | string, readonly Shape[]]
  | readonly ["paragraph", readonly Shape[]];

const shapeOf = (
  nodes: readonly (Tree.Prose.Block | Tree.Prose.Phrasing)[],
): readonly Shape[] =>
  Array.map(nodes, (node): Shape => {
    switch (node.type) {
      case "text":
      case "inlineCode":
      case "code": {
        return [node.type, node.value];
      }
      case "link": {
        return [
          "link",
          node.destination instanceof URL
            ? node.destination.href
            : node.destination,
          shapeOf(node.children),
        ];
      }
      case "paragraph": {
        return ["paragraph", shapeOf(node.children)];
      }
    }
  });

layer(
  Reference.layer({
    source: Reference.source,
    other: 'export { Value as Renamed } from "./index.js";',
  }),
  { excludeTestServices: true },
)("document", (it) => {
  it.effect(
    "rich_page_lead",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const root = Reference.page(reference, "pkg/index.html");
      expect(Page.description(root)).toBe("Module with code and Value.");
      const lead = moduleAt(reference, "pkg/index.html").comment.pipe(
        Option.flatMap(({ description }) => description),
        Option.getOrThrow,
      );
      expect(shapeOf(lead.children)).toStrictEqual([
        [
          "paragraph",
          [
            ["text", "Module with "],
            ["inlineCode", "code"],
            ["text", " and "],
            [
              "link",
              Reference.id(reference, ["Value"]),
              [["inlineCode", "Value"]],
            ],
            ["text", "."],
          ],
        ],
      ]);
    }),
  );

  it.effect(
    "canonical_entries",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const root = moduleAt(reference, "pkg/index.html");
      const labels = Array.map(rowsOf(root), ({ label }) => label.join("."));
      expect(Array.filter(labels, (label) => label === "again")).toHaveLength(
        1,
      );
      expect(Array.filter(labels, (label) => label === "Cycle")).toHaveLength(
        1,
      );
      const choose = Reference.id(reference, ["choose"]);
      expect(
        Array.filter(exportsOf(root), ({ origin }) => origin.id === choose),
      ).toHaveLength(1);
    }),
  );

  it.effect(
    "alias_rows",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const other = moduleAt(reference, "pkg/Other.html");
      expect(exportsOf(other)).toStrictEqual([]);
      const [renamed] = rowsOf(other);
      expect(renamed?.label).toStrictEqual(["Renamed"]);
      expect(
        Option.flatMap(Option.fromUndefinedOr(renamed), summaryOf),
      ).toStrictEqual(Option.some("A value. More detail."));
      expect(renamed?.origin).toStrictEqual({
        _tag: "Reference",
        target: Reference.id(reference, ["Value"]),
      });
    }),
  );

  it.effect(
    "attached_namespace_and_members",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const root = moduleAt(reference, "pkg/index.html");
      const model = Array.findFirst(
        exportsOf(root),
        (exported) => titleOf(exported) === "Model",
      ).pipe(Option.getOrThrow);
      const namespace = Option.getOrThrow(model.namespace);
      expect(Array.map(namespace.exports, titleOf)).toStrictEqual(["child"]);
      expect(
        Array.map(namespace.index, ({ label }) => label.join(".")),
      ).toStrictEqual(["child", "Alias", "Helpers"]);
      expect(
        pipe(
          rowsOf(root),
          Array.filter(({ label }) => label.join(".") === "make"),
          Array.map((row) => [row.depth, summaryOf(row)]),
        ),
      ).toStrictEqual([
        [1, Option.some("Static make.")],
        [1, Option.some("Instance make.")],
      ]);
      expect(
        Array.map(
          exportsOf(moduleAt(reference, "pkg/Model/Helpers.html")),
          titleOf,
        ),
      ).toStrictEqual(["nested"]);
    }),
  );

  it.effect(
    "complete_placement",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const { document } = reference;
      const documented = documentedOf(reference);
      const placed = pipe(
        document.placement.places,
        Array.fromIterable,
        Array.filter(([, place]) => place.names.length > 0),
        Array.map(([id]) => id),
        HashSet.fromIterable,
      );
      expect(
        HashSet.fromIterable(Array.map(documented, ({ origin }) => origin.id)),
      ).toStrictEqual(placed);
      expect(documented).toHaveLength(HashSet.size(placed));
      expect(Array.flatMap(documented, ({ members }) => members)).toHaveLength(
        HashMap.size(document.owners),
      );
    }),
  );

  it.effect(
    "navigation_directories",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      expect(reference.folders).toStrictEqual([
        { directory: "", pages: ["index", "pkg", "traits"] },
        { directory: "pkg", pages: ["index", "Other", "Model"] },
        { directory: "pkg/Model", pages: ["Helpers"] },
      ]);
    }),
  );

  it.effect(
    "relation_labels_and_member_docs",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const { document } = reference;
      const model = HashMap.get(
        document.entries,
        Reference.id(reference, ["Model"]),
      ).pipe(Option.getOrThrow);
      const member = Array.head(model.members).pipe(Option.getOrThrow);
      const pageOf = (file: string): Option.Option<Placement.Page> =>
        Array.findFirst(
          document.placement.pages,
          ({ entry }) => Reference.page(reference, file).tree.origin === entry,
        );
      const row = (file: string): Tree.Row.Row =>
        Related.row({ ...document, page: pageOf(file) })(member.id).pipe(
          Option.getOrThrow,
        );
      expect(row("pkg/Other.html")).toMatchObject({
        label: ["pkg", "Model", "make"],
      });
      expect(summaryOf(row("pkg/Other.html"))).toStrictEqual(
        Option.some("Static make."),
      );
      expect(row("pkg/index.html").label).toStrictEqual(["Model", "make"]);
    }),
  );

  it.effect(
    "category_and_heading_collisions",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const result = yield* Reference.success({
        source: `
      declare const pageIndex: number;
      declare const categoryName: number;
      export { pageIndex as "page-index", categoryName as "category-a-b" };
      /** One. @category A+B */ export const first: number;
      /** Two. @category A B */ export const second: number;
      /** Explicit. @category Types */ export const named: number;
      /** Last explicit. @category Zulu */ export const last: number;
      export class Model {}
    `,
      });
      // With no page below it, the root is a file of its own.
      const { markdown } = Reference.page(result, "pkg.html");
      expect(
        Array.map(
          [
            ...markdown.matchAll(
              /^## <a id="(?<id>[^"]+)"><\/a>(?<heading>.+)$/gmu,
            ),
          ],
          ({ groups }) => [groups?.["heading"], groups?.["id"]],
        ),
      ).toStrictEqual([
        ["Index", "page-index-2"],
        ["A B", "category-a-b-2"],
        ["A+B", "category-a-b-3"],
        ["Types", "category-types"],
        ["Zulu", "category-zulu"],
        ["Classes", "category-classes"],
        ["Constants", "category-constants"],
      ]);
    }),
  );

  it.effect(
    "deprecation_scope",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const rows = rowsOf(moduleAt(reference, "pkg/index.html"));
      const deprecated = (label: string): boolean =>
        Array.findFirst(rows, (row) => row.label.join(".") === label).pipe(
          Option.getOrThrow,
        ).deprecated;
      expect(deprecated("choose")).toBe(false);
      expect(deprecated("old")).toBe(true);
    }),
  );

  it.effect(
    "reexported_entrypoint",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: 'export * as Other from "./other.js";',
        other:
          "export interface Item {}\nexport namespace Nested { export interface Deep {} }",
      });
      const { document } = reference;
      const item = Catalogue.lookup(document.catalogue, {
        entrypoint: "@scope/pkg",
        path: ["Other", "Item"],
      }).pipe(Option.getOrThrow);
      expect(item.name).toStrictEqual({
        entrypoint: "@scope/pkg/Other",
        path: ["Item"],
      });
      expect(
        HashMap.get(document.placement.places, item.id).pipe(
          Option.map(({ page }) => page.entry.name),
        ),
      ).toStrictEqual(
        Option.some({ entrypoint: "@scope/pkg/Other", path: [] }),
      );
      expect(
        Array.map(documentedOf(reference), ({ origin }) => origin.name),
      ).toStrictEqual([
        { entrypoint: "@scope/pkg/Other", path: ["Item"] },
        { entrypoint: "@scope/pkg/Other", path: ["Nested", "Deep"] },
      ]);
    }),
  );

  it.effect(
    "reexported_entrypoint_category",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `export * as Other from "./other.js";
/** Inner. @category Tools */ export namespace Inner { export interface Deep {} }
/** Kept. @category Tools */ export interface Kept {}`,
        other:
          "/** Other. @category Tools @module */\nexport interface Item {}",
      });
      expect(
        Array.map(
          moduleAt(reference, "pkg/index.html").groups,
          ({ grouping, rows }) => [
            Tree.Page.slugOf(grouping),
            Array.map(rows, ({ label }) => label.join(".")),
          ],
        ),
      ).toStrictEqual([
        ["modules", ["Other", "Inner"]],
        ["tools", ["Kept"]],
      ]);
    }),
  );

  it.effect(
    "deprecated_entrypoint",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const result = yield* Reference.success({
        source:
          "/** Old. @deprecated Use the other one. @module */ export interface Value {}",
      });
      const overview = Array.findFirst(
        result.document.pages,
        (tree) => tree.type === "overview",
      ).pipe(Option.getOrThrow);
      expect(
        Array.map(overview.entrypoints, ({ deprecated }) => deprecated),
      ).toStrictEqual([true]);
    }),
  );
});
