import { Array, HashMap, HashSet, Option, pipe } from "effect";
import { beforeAll, describe, expect, test } from "vitest";

import * as Related from "../src/internal/related.js";
import * as Page from "../src/Page.js";
import * as Tree from "../src/Tree/index.js";
import * as Reference from "./fixtures/reference.js";

import type * as AST from "../src/AST/index.js";
import type * as Placement from "../src/Placement.js";

type Local = Extract<
  AST.Reference.Reference.Target,
  { readonly _tag: "Local" }
>;

let loaded: Reference.Reference | null = null;
const reference = (): Reference.Reference =>
  Option.fromNullishOr(loaded).pipe(Option.getOrThrow);

const moduleAt = (file: string): Tree.Page.Module => {
  const { tree } = Reference.page(reference(), file);
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
  | readonly ["link", AST.Reference.Reference.Target | string, readonly Shape[]]
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
            : node.destination.target,
          shapeOf(node.children),
        ];
      }
      case "paragraph": {
        return ["paragraph", shapeOf(node.children)];
      }
    }
  });

const local = (node: Local["node"]): Local => ({ _tag: "Local", node });

describe("document", () => {
  beforeAll(async () => {
    loaded = await Reference.success({
      source: Reference.source,
      other: 'export { Value as Renamed } from "./index.js";',
    });
  });

  test("rich_page_lead", () => {
    expect.hasAssertions();
    const root = Reference.page(reference(), "pkg/index.html");
    expect(Page.description(root)).toBe("Module with code and Value.");
    const lead = moduleAt("pkg/index.html").comment.pipe(
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
            local(Reference.id(reference(), ["Value"])),
            [["inlineCode", "Value"]],
          ],
          ["text", "."],
        ],
      ],
    ]);
  });

  test("canonical_entries", () => {
    expect.hasAssertions();
    const root = moduleAt("pkg/index.html");
    const labels = Array.map(rowsOf(root), ({ label }) => label.join("."));
    expect(Array.filter(labels, (label) => label === "again")).toHaveLength(1);
    expect(Array.filter(labels, (label) => label === "Cycle")).toHaveLength(1);
    const choose = Reference.id(reference(), ["choose"]);
    expect(
      Array.filter(exportsOf(root), ({ origin }) => origin.id === choose),
    ).toHaveLength(1);
  });

  test("alias_rows", () => {
    expect.hasAssertions();
    const other = moduleAt("pkg/Other.html");
    expect(exportsOf(other)).toStrictEqual([]);
    const [renamed] = rowsOf(other);
    expect(renamed?.label).toStrictEqual(["Renamed"]);
    expect(
      Option.flatMap(Option.fromUndefinedOr(renamed), summaryOf),
    ).toStrictEqual(Option.some("A value. More detail."));
    expect(renamed?.origin).toStrictEqual({
      _tag: "Reference",
      target: local(Reference.id(reference(), ["Value"])),
    });
  });

  test("attached_namespace_and_members", () => {
    expect.hasAssertions();
    const root = moduleAt("pkg/index.html");
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
      Array.map(exportsOf(moduleAt("pkg/Model/Helpers.html")), titleOf),
    ).toStrictEqual(["nested"]);
  });

  test("complete_placement", () => {
    expect.hasAssertions();
    const { document } = reference();
    const documented = documentedOf(reference());
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
  });

  test("navigation_directories", () => {
    expect.hasAssertions();
    expect(reference().folders).toStrictEqual([
      { directory: "", pages: ["pkg", "pkg/Other", "traits"] },
      { directory: "pkg", pages: ["Model"] },
      { directory: "pkg/Model", pages: ["Helpers"] },
    ]);
  });

  test("relation_labels_and_member_docs", () => {
    expect.hasAssertions();
    const { document } = reference();
    const model = HashMap.get(
      document.entries,
      Reference.id(reference(), ["Model"]),
    ).pipe(Option.getOrThrow);
    const member = Array.head(model.members).pipe(Option.getOrThrow);
    const pageOf = (file: string): Option.Option<Placement.Page> =>
      Array.findFirst(
        document.placement.pages,
        ({ entry }) => Reference.page(reference(), file).tree.origin === entry,
      );
    const row = (file: string): Tree.Row.Row =>
      Related.row({ ...document, page: pageOf(file) })(local(member.id)).pipe(
        Option.getOrThrow,
      );
    expect(row("pkg/Other.html")).toMatchObject({
      label: ["pkg", "Model", "make"],
    });
    expect(summaryOf(row("pkg/Other.html"))).toStrictEqual(
      Option.some("Static make."),
    );
    expect(row("pkg/index.html").label).toStrictEqual(["Model", "make"]);
  });

  test("category_and_heading_collisions", async () => {
    expect.hasAssertions();
    const result = await Reference.success({
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
  });

  test("deprecation_scope", () => {
    expect.hasAssertions();
    const rows = rowsOf(moduleAt("pkg/index.html"));
    const deprecated = (label: string): boolean =>
      Array.findFirst(rows, (row) => row.label.join(".") === label).pipe(
        Option.getOrThrow,
      ).deprecated;
    expect(deprecated("choose")).toBe(false);
    expect(deprecated("old")).toBe(true);
  });

  test("deprecated_entrypoint", async () => {
    expect.hasAssertions();
    const result = await Reference.success({
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
  });
});
