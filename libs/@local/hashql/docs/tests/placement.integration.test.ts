import { Array, HashMap, Option } from "effect";
import { beforeAll, describe, expect, test } from "vitest";

import * as Catalogue from "../src/Catalogue.js";
import * as Related from "../src/internal/related.js";
import * as Reference from "./fixtures/reference.js";

import type * as Placement from "../src/Placement.js";

const source = `
export interface Value { readonly text: string; }
export namespace Outer {
  export namespace Inner { export const value: number; }
  export interface Shape { readonly size: number; }
}
export class Model {
  static make(): Model;
  make(): Model;
  get value(): string;
  set value(input: string);
  ["a#b"]: string;
}
export namespace Model {
  export const child: number;
  export namespace Helpers { export const nested: boolean; }
}
export function choose(): Value;
export type choose = Value;
export enum Mode { One, Two }
export { Outer as Again, Value as Alias };
export type { Model as Restricted };
export * as Cycle from "./index.js";
interface Hidden { secret: true; }
export function hidden(): Hidden;
`;

let loaded: Reference.Reference | null = null;
const reference = (): Reference.Reference =>
  Option.fromNullishOr(loaded).pipe(Option.getOrThrow);

const idOf = (
  { document }: Reference.Reference,
  path: readonly string[],
): Catalogue.DeclarationId =>
  Catalogue.lookup(document.catalogue, { entrypoint: "@scope/pkg", path }).pipe(
    Option.getOrThrow,
    ({ id }) => id,
  );

const rootOf = ({ document }: Reference.Reference): Placement.Page =>
  Array.head(document.placement.pages).pipe(Option.getOrThrow);

const exportNamed = (page: Placement.Page, name: string): Placement.Export =>
  Array.findFirst(page.exports, (entry) => entry.name === name).pipe(
    Option.getOrThrow,
  );

describe("placement", () => {
  beforeAll(async () => {
    loaded = await Reference.success({ source });
  });

  test("namespace_pages", () => {
    expect.hasAssertions();
    const { document } = reference();
    expect(
      Array.map(document.placement.pages, ({ entry }) =>
        Related.titleOf(entry),
      ),
    ).toStrictEqual(["@scope/pkg", "Outer", "Inner", "Helpers"]);
  });

  test("alias_destinations", () => {
    expect.hasAssertions();
    const root = rootOf(reference());
    expect(exportNamed(root, "Restricted")).toStrictEqual({
      name: "Restricted",
      target: idOf(reference(), ["Model"]),
      typeOnlyExport: true,
      canonical: false,
    });
    expect(
      Array.map(
        ["Value", "Alias"],
        (name) => exportNamed(root, name).canonical,
      ),
    ).toStrictEqual([true, false]);
  });

  test("namespace_cycles", () => {
    expect.hasAssertions();
    expect(reference().document.placement.pages).toHaveLength(4);
    expect(exportNamed(rootOf(reference()), "Cycle").canonical).toBe(false);
  });

  test("member_identity", () => {
    expect.hasAssertions();
    const model = HashMap.get(
      reference().document.entries,
      idOf(reference(), ["Model"]),
    ).pipe(Option.getOrThrow);
    expect(
      Array.map(model.members, ({ type, static: isStatic }) => [
        type,
        isStatic,
      ]),
    ).toStrictEqual([
      ["method", true],
      ["method", false],
      ["accessor", false],
      ["property", false],
    ]);
  });

  test("declaration_kinds", () => {
    expect.hasAssertions();
    const { document } = reference();
    expect(
      Array.map(
        [
          [],
          ["Value"],
          ["Outer"],
          ["Model"],
          ["choose"],
          ["Mode"],
          ["Outer", "Inner", "value"],
        ],
        (path) =>
          HashMap.get(document.entries, idOf(reference(), path)).pipe(
            Option.map(({ kind }) => kind),
          ),
      ),
    ).toStrictEqual(
      Array.map(
        ["entrypoint", "interface", "module", "class", "type", "enum", "const"],
        Option.some,
      ),
    );
  });

  test("alias_only_entrypoint", async () => {
    expect.hasAssertions();
    const result = await Reference.success({
      source: "export interface Value { x: string }",
      other: 'export { Value as Renamed } from "./index.js";',
    });
    const other = Array.findFirst(
      result.document.placement.pages,
      ({ entry }) => entry.name.entrypoint === "@scope/pkg/Other",
    ).pipe(Option.getOrThrow);
    expect(other.exports).toStrictEqual([
      {
        name: "Renamed",
        target: idOf(result, ["Value"]),
        typeOnlyExport: false,
        canonical: false,
      },
    ]);
  });
});
