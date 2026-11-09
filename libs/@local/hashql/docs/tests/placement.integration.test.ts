import { expect, layer } from "@effect/vitest";
import { Array, Effect, HashMap, Option, pipe } from "effect";

import * as Anchor from "../src/Anchor.js";
import * as Destinations from "../src/Destinations.js";
import * as References from "../src/internal/references.js";
import * as Related from "../src/internal/related.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as Reference from "./fixtures/reference.js";

import type * as AST from "../src/AST/index.js";
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

/** Every page of one reference shares its destinations. */
const destinationsOf = ({
  pages,
}: Reference.Reference): Destinations.Destinations =>
  Array.head(pages).pipe(Option.getOrThrow).output.destinations;

/** Where the reference writes what `node` is, as a file and an element id. */
const anchorOf = (
  value: Reference.Reference,
  node: AST.Target.Interned,
): Option.Option<Anchor.Anchor> =>
  Destinations.local(destinationsOf(value), node);

const anchorAt = (
  value: Reference.Reference,
  path: readonly string[],
): Option.Option<Anchor.Anchor> => anchorOf(value, Reference.id(value, path));

/** A page's own anchor, which has no element id. */
const page = (file: string): Option.Option<Anchor.Anchor> =>
  Option.some({ file: Anchor.File(file), id: Option.none() });

/** An element's anchor on a page. */
const element = (file: string, id: string): Option.Option<Anchor.Anchor> =>
  Option.some({
    file: Anchor.File(file),
    id: Option.some(Anchor.AnchorId(id)),
  });

/** The local targets of each `name` in the signatures of the export at `path`. */
const namedIn = (
  value: Reference.Reference,
  path: readonly string[],
  name: string,
): readonly AST.Target.Interned[] => {
  const { document } = value;
  const { ast } = document.catalogue;

  return pipe(
    HashMap.get(document.entries, Reference.id(value, path)),
    Option.flatMap(({ signatures }) => signatures),
    Option.toArray,
    Array.flatMap(({ children }) => children),
    Array.flatMap(({ syntax }) =>
      Array.flatMap(syntax, TypeScript.Node.identifiers),
    ),
    Array.filter(({ text }) => text === name),
    Array.flatMap((identifier) =>
      Option.toArray(References.namesOf(ast)(identifier)),
    ),
    Array.filter((target) => ast.get(target)._tag !== "ExternalItem"),
  );
};

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
        const destinations = destinationsOf(reference);
        expect(
          Array.map(document.placement.pages, ({ entry }) => [
            Related.titleOf(entry),
            HashMap.get(destinations.pages, entry.id),
          ]),
        ).toStrictEqual([
          ["@scope/pkg", Option.some("pkg/index.html")],
          ["Outer", Option.some("pkg/Outer/index.html")],
          ["Inner", Option.some("pkg/Outer/Inner.html")],
          ["Helpers", Option.some("pkg/Model/Helpers.html")],
        ]);
        expect(anchorAt(reference, ["Outer", "Shape"])).toStrictEqual(
          element("pkg/Outer/index.html", "Shape"),
        );
        expect(anchorAt(reference, ["Outer", "Inner", "value"])).toStrictEqual(
          element("pkg/Outer/Inner.html", "value"),
        );
      }),
    );

    it.effect(
      "attached_namespace",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        expect(anchorAt(reference, ["Model"])).toStrictEqual(
          element("pkg/index.html", "Model"),
        );
        expect(anchorAt(reference, ["Model", "child"])).toStrictEqual(
          element("pkg/index.html", "Model.child"),
        );
        expect(anchorAt(reference, ["Model", "Helpers"])).toStrictEqual(
          page("pkg/Model/Helpers.html"),
        );
      }),
    );

    it.effect(
      "alias_destinations",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        expect(anchorAt(reference, ["Again", "Inner", "value"])).toStrictEqual(
          anchorAt(reference, ["Outer", "Inner", "value"]),
        );
        expect(anchorAt(reference, ["Alias"])).toStrictEqual(
          anchorAt(reference, ["Value"]),
        );
        const root = rootOf(reference);
        expect(exportNamed(root, "Restricted")).toStrictEqual({
          name: "Restricted",
          target: Reference.id(reference, ["Model"]),
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
        expect(anchorAt(reference, ["Cycle", "Cycle", "Value"])).toStrictEqual(
          anchorAt(reference, ["Value"]),
        );
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
          Reference.id(reference, ["Model"]),
        ).pipe(Option.getOrThrow);
        expect(
          Array.map(model.members, ({ id, type, static: isStatic }) => [
            anchorOf(reference, id).pipe(
              Option.flatMap(({ id: element }) => element),
            ),
            type,
            isStatic,
          ]),
        ).toStrictEqual([
          [Option.some("Model.make"), "method", true],
          [Option.some("Model.make-2"), "method", false],
          [Option.some("Model.value"), "accessor", false],
          [Option.some('Model.["a#b"]'), "property", false],
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
              HashMap.get(document.entries, Reference.id(reference, path)).pipe(
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
      "every_public_identity",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const { document } = reference;
        const destinations = destinationsOf(reference);
        expect(
          Array.every(document.catalogue.entries, ({ id }) =>
            Option.isSome(anchorOf(reference, id)),
          ),
        ).toBe(true);
        expect(HashMap.size(destinations.members)).toBe(
          HashMap.size(document.owners),
        );
        const ids = pipe(
          Array.appendAll(
            Array.fromIterable(HashMap.values(destinations.declarations)),
            Array.fromIterable(HashMap.values(destinations.members)),
          ),
          Array.flatMap(({ file, id }) =>
            Array.map(Option.toArray(id), (element) => `${file}#${element}`),
          ),
        );
        expect(Array.dedupe(ids)).toStrictEqual(ids);
        expect(HashMap.size(document.catalogue.byName)).toBeGreaterThan(
          document.catalogue.entries.length,
        );
      }),
    );

    it.effect(
      "links",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const shape = Option.getOrThrow(
          anchorAt(reference, ["Outer", "Shape"]),
        );
        expect(Anchor.href(shape, "pkg/Outer/index.html")).toBe("#Shape");
        expect(Anchor.href(shape, "pkg/Model/Helpers.html")).toBe(
          "../Outer/index.html#Shape",
        );
      }),
    );

    it.effect(
      "private_destinations",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const targets = namedIn(reference, ["hidden"], "Hidden");
        expect(targets).toHaveLength(1);
        expect(
          Array.map(targets, (target) =>
            Destinations.local(destinationsOf(reference), target),
          ),
        ).toStrictEqual([Option.none()]);
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
            target: Reference.id(result, ["Value"]),
            typeOnlyExport: false,
            canonical: false,
          },
        ]);
        expect(anchorAt(result, ["Value"])).toStrictEqual(
          element("pkg/index.html", "Value"),
        );
      }),
    );

    it.effect(
      "declaration_member_collision",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const result = yield* Reference.success({
          source:
            "export class Model { value: string; } export namespace Model { export const value: number; }",
        });
        const owner = HashMap.get(
          result.document.entries,
          Reference.id(result, ["Model"]),
        ).pipe(Option.getOrThrow);
        const [member] = owner.members;
        expect([
          anchorAt(result, ["Model", "value"]).pipe(
            Option.flatMap(({ id }) => id),
          ),
          Option.flatMap(Option.fromUndefinedOr(member), ({ id }) =>
            anchorOf(result, id).pipe(Option.flatMap((value) => value.id)),
          ),
        ]).toStrictEqual([
          Option.some("Model.value"),
          Option.some("Model.value-2"),
        ]);
      }),
    );
  },
);
