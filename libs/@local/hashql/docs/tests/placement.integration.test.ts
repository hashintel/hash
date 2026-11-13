import { expect, layer } from "@effect/vitest";
import { Array, Effect, HashMap, Option } from "effect";

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

layer(Reference.layer({ source }), { excludeTestServices: true })(
  "placement",
  (it) => {
    it.effect(
      "namespace_pages",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const { document } = reference;
        expect(
          Array.map(document.placement.pages, ({ entry }) =>
            Related.titleOf(entry),
          ),
        ).toStrictEqual(["@scope/pkg", "Outer", "Inner", "Helpers"]);
      }),
    );

    it.effect(
      "alias_destinations",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const root = rootOf(reference);
        expect(exportNamed(root, "Restricted")).toStrictEqual({
          name: "Restricted",
          target: idOf(reference, ["Model"]),
          typeOnlyExport: true,
          canonical: false,
        });
        expect(
          Array.map(
            ["Value", "Alias"],
            (name) => exportNamed(root, name).canonical,
          ),
        ).toStrictEqual([true, false]);
      }),
    );

    it.effect(
      "namespace_cycles",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        expect(reference.document.placement.pages).toHaveLength(4);
        expect(exportNamed(rootOf(reference), "Cycle").canonical).toBe(false);
      }),
    );

    it.effect(
      "member_identity",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const model = HashMap.get(
          reference.document.entries,
          idOf(reference, ["Model"]),
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
      }),
    );

    it.effect(
      "declaration_kinds",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const { document } = reference;
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
              HashMap.get(document.entries, idOf(reference, path)).pipe(
                Option.map(({ kind }) => kind),
              ),
          ),
        ).toStrictEqual(
          Array.map(
            [
              "entrypoint",
              "interface",
              "module",
              "class",
              "type",
              "enum",
              "const",
            ],
            Option.some,
          ),
        );
      }),
    );

    it.effect(
      "alias_only_entrypoint",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const result = yield* Reference.success({
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
      }),
    );
  },
);
