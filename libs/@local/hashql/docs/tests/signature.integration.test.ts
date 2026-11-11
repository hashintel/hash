import { expect, layer } from "@effect/vitest";
import { Array, Effect, Option, Result, pipe } from "effect";

import * as AST from "../src/AST/index.js";
import * as Catalogue from "../src/Catalogue.js";
import * as Parts from "../src/internal/parts.js";
import * as References from "../src/internal/references.js";
import * as Syntax from "../src/internal/signature-syntax.js";
import * as Signature from "../src/Signature.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as Reference from "./fixtures/reference.js";

/** A public declaration's parts, as a page prints them. */
interface Fixture {
  readonly ast: AST.Store["Service"];
  readonly exported: Catalogue.Entry;
  readonly parts: readonly Parts.Part[];
}

const fixture = Effect.fnUntraced(function* (
  source: string,
  name: string,
): Effect.fn.Return<Fixture, Reference.Failure> {
  const { document } = yield* Reference.success({ source });
  const { catalogue } = document;
  const exported = Catalogue.lookup(catalogue, {
    entrypoint: "@scope/pkg",
    path: [name],
  }).pipe(Option.getOrThrow);

  return {
    ast: catalogue.ast,
    exported,
    parts: Parts.of(catalogue.ast, exported),
  };
});

const exportedOf = ({ ast, exported }: Fixture): Syntax.Exported => ({
  entry: exported,
  names: Catalogue.namesOf(ast, exported),
});

const printed = (input: Fixture): ReturnType<typeof Signature.print> => {
  const part = Array.head(input.parts).pipe(Option.getOrThrow);
  return Signature.print(
    Syntax.project(part, { exported: Option.some(exportedOf(input)) }),
  );
};

const targetNames = (
  signature: Signature.Printed,
  ast: AST.Store["Service"],
): readonly (readonly [string, string])[] =>
  Array.flatMap(signature.occurrences, ({ offset, length, node }) => {
    const target = References.linksOf(ast)(node);
    if (Option.isNone(target)) {
      return [];
    }

    const resolved = ast.get(target.value);
    let name = "external";
    if (!AST.ExternalItem.isExternalItem(resolved)) {
      name =
        resolved._tag === "Declaration" ? resolved.symbol.name : resolved._tag;
    }
    return [[signature.text.slice(offset, offset + length), name] as const];
  });

layer(TypeScript.Api.layer, { excludeTestServices: true })(
  "signature",
  (it) => {
    it.effect(
      "type_only_class",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `
      export interface Ref { value: string; }
      /** Box. */ declare class Box<T> {
        /** Construct. */ constructor(value: Ref);
        /** Static. */ static make(): Box<Ref>;
        /** Kept. */ readonly value: Ref;
        map<Ref>(input: Ref): Ref;
      }
      export type { Box as TypeBox };
    `,
          "TypeBox",
        );
        const original = input.parts[0]?.source.node.getText();
        const signature = yield* printed(input);
        expect(signature.text).not.toMatch(/constructor|static|\/\*\*/u);
        expect(signature.text).toContain("export type { Box as TypeBox };");
        expect(targetNames(signature, input.ast)).toStrictEqual(
          expect.arrayContaining([
            ["Ref", "Ref"],
            ["Ref", "TypeParameter"],
          ]),
        );
        expect(input.parts[0]?.source.node.getText()).toBe(original);
        expect(original).toContain("constructor");
      }),
    );

    it.effect(
      "unchanged_node_identity",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture("export type Ref = string;", "Ref");
        const part = Array.head(input.parts).pipe(Option.getOrThrow);
        const projected = Syntax.project(part, {
          exported: Option.some(exportedOf(input)),
        });
        expect(projected[0]).toBe(part.source.node);
        expect(projected).not.toHaveProperty("text");
      }),
    );

    it.effect(
      "original_parent_identity",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `export interface Ref {} export declare class Box { value: Ref; map(input: Ref): Ref; }`,
          "Box",
        );
        const node = Array.head(input.parts).pipe(Option.getOrThrow).source
          .node;
        const parents = Array.map(
          TypeScript.Node.identifiers(node),
          (identifier) => [identifier, identifier.parent] as const,
        );
        yield* printed(input);
        expect(
          Array.every(
            parents,
            ([identifier, parent]) => identifier.parent === parent,
          ),
        ).toBe(true);
      }),
    );

    it.effect(
      "canonical_type_alias",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `declare class Box { static create(): Box; value: string; } export type { Box as TypeBox }; export { Box };`,
          "TypeBox",
        );
        const signature = yield* printed(input);
        expect(signature.text).toContain("static create(): Box");
        expect(signature.text).toContain("export type { Box as TypeBox };");
        expect([
          input.exported.typeOnlyExport,
          input.exported.nameTypeOnlyExport,
        ]).toStrictEqual([false, true]);
      }),
    );

    it.effect(
      "keyword_export",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `declare function conditional(value: string): string; export { conditional as if };`,
          "if",
        );
        const signature = yield* printed(input);
        expect(signature.text).toContain(
          "function conditional(value: string): string",
        );
        expect(signature.text).toContain("export { conditional as if };");
        expect(signature.text).not.toContain("function if(");
      }),
    );

    it.effect(
      "renamed_export",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `declare const inferred: "_"; export { inferred as infer };`,
          "infer",
        );
        const signature = yield* printed(input);
        expect(signature.text).toBe(
          'const inferred: "_";\nexport { inferred as infer };',
        );
      }),
    );

    it.effect(
      "strict_reserved_export",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `declare const binding: number; export { binding as let };`,
          "let",
        );
        const signature = yield* printed(input);
        expect(signature.text).toBe(
          "const binding: number;\nexport { binding as let };",
        );
      }),
    );

    it.effect(
      "type_only_interface",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `interface Declaration { readonly value: string; } export type { Declaration };`,
          "Declaration",
        );
        const signature = yield* printed(input);
        expect(signature.text).toBe(
          "export interface Declaration {\n  readonly value: string;\n}",
        );
      }),
    );

    it.effect(
      "string_export_name",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `declare const pageIndex: number; export { pageIndex as "page-index" };`,
          "page-index",
        );
        const signature = yield* printed(input);
        expect(signature.text).toBe(
          'const pageIndex: number;\nexport { pageIndex as "page-index" };',
        );
      }),
    );

    it.effect(
      "anonymous_default",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `export default class { value: string; }`,
          "default",
        );
        const signature = yield* printed(input);
        expect(signature.text).toContain("export default class");
        expect(signature.text).toContain("value: string");
      }),
    );

    it.effect(
      "single_variable",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `export interface Ref {} export declare const first: Ref, second: string;`,
          "first",
        );
        const signature = yield* printed(input);
        expect(signature.text).toBe("export const first: Ref;");
        expect(targetNames(signature, input.ast)).toContainEqual([
          "Ref",
          "Ref",
        ]);
        expect(signature.text).not.toContain("second");
      }),
    );

    it.effect(
      "callable_members",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `export interface Ref {} export declare const choose: { /** Call. */ (value: Ref): Ref; readonly metadata: "a  b"; new (): Ref; };`,
          "choose",
        );
        const signature = yield* printed(input);
        expect(signature.text).toContain('readonly metadata: "a  b"');
        expect(signature.text).toContain("new (): Ref");
        expect(signature.text).not.toContain("/**");
        const references = Array.filter(
          targetNames(signature, input.ast),
          ([name]) => name === "Ref",
        );
        expect(references).toStrictEqual([
          ["Ref", "Ref"],
          ["Ref", "Ref"],
          ["Ref", "Ref"],
        ]);
      }),
    );

    it.effect(
      "member_and_type_fragments",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `export interface Ref {} export declare class Box { get value(): Ref; set value(input: Ref); }`,
          "Box",
        );
        const member = Array.head(
          Parts.members(input.parts, { ast: input.ast, entry: input.exported }),
        ).pipe(Option.getOrThrow);
        const parts = yield* Effect.forEach(member.parts, (part) =>
          Signature.print(Syntax.project(part, { exported: Option.none() })),
        );
        expect(Array.map(parts, ({ text }) => text)).toStrictEqual([
          "get value(): Ref;",
          "set value(input: Ref);",
        ]);
        const source = pipe(
          member.parts,
          Array.map(({ source }) => source),
          Array.findFirst(AST.Getter.isGetter),
          Option.getOrThrow,
        );
        const returns = source.returns.pipe(
          Option.map(input.ast.get),
          Option.getOrThrow,
        );
        const fragment = yield* Signature.print([returns.node]);
        expect(fragment.text).toBe("Ref");
        expect(targetNames(fragment, input.ast)).toStrictEqual([
          ["Ref", "Ref"],
        ]);
      }),
    );

    it.effect.each([
      [
        "identifier_mismatch",
        "export const changed: string;",
        "IdentifierMismatch",
      ],
      ["invalid_syntax", "export const = ;", "InvalidSyntax"],
    ] as const)(
      "%s",
      Effect.fnUntraced(function* ([, replacement, expected]: readonly [
        string,
        string,
        string,
      ]) {
        expect.hasAssertions();
        const input = yield* fixture(
          "export declare const value: string;",
          "value",
        );
        const api = yield* TypeScript.Api.Api;
        const part = Array.head(input.parts).pipe(Option.getOrThrow);
        const result = yield* Signature.print(
          Syntax.project(part, { exported: Option.some(exportedOf(input)) }),
        ).pipe(
          Effect.provideService(TypeScript.Api.Api, {
            ...api,
            print: () => Effect.succeed(replacement),
          }),
          Effect.result,
        );
        expect(Result.isFailure(result)).toBe(true);
        expect(Result.getFailure(result).pipe(Option.getOrThrow)).toMatchObject(
          {
            _tag: "PrintError",
            reason: { _tag: expected },
          },
        );
      }),
    );

    it.effect(
      "shadowed_occurrences",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const input = yield* fixture(
          `export interface Ref {} export interface Box { outer: Ref; map<Ref>(input: Ref): Ref; }`,
          "Box",
        );
        const signature = yield* printed(input);
        expect(
          Array.filter(
            targetNames(signature, input.ast),
            ([name]) => name === "Ref",
          ),
        ).toStrictEqual([
          ["Ref", "Ref"],
          ["Ref", "TypeParameter"],
          ["Ref", "TypeParameter"],
          ["Ref", "TypeParameter"],
        ]);
      }),
    );
  },
);
