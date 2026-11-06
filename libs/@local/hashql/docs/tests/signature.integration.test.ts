import { Array, Effect, ManagedRuntime, Option, Result, pipe } from "effect";
import { afterAll, describe, expect, test } from "vitest";

import * as AST from "../src/AST/index.js";
import * as Catalogue from "../src/Catalogue.js";
import * as Parts from "../src/internal/parts.js";
import * as Syntax from "../src/internal/signature-syntax.js";
import * as Signature from "../src/Signature.js";
import * as Api from "../src/TypeScript/Api.js";
import * as Node from "../src/TypeScript/Node.js";
import * as Reference from "./fixtures/reference.js";

const runtime = ManagedRuntime.make(Api.layer);

/** A public declaration's parts, as a page prints them. */
interface Fixture {
  readonly ast: AST.Store["Service"];
  readonly exported: Catalogue.Entry;
  readonly parts: readonly Parts.Part[];
}

const fixture = async (source: string, name: string): Promise<Fixture> => {
  const { document } = await Reference.success({ source });
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
};

const printed = async ({
  exported,
  parts,
}: Fixture): Promise<Signature.Printed> => {
  const part = Array.head(parts).pipe(Option.getOrThrow);
  return runtime.runPromise(
    Signature.print(Syntax.project(part, { exported: Option.some(exported) })),
  );
};

const targetNames = (
  signature: Signature.Printed,
  ast: AST.Store["Service"],
): readonly (readonly [string, string])[] =>
  Array.flatMap(signature.occurrences, ({ offset, length, node }) => {
    const reference = ast.referenceAt(node);
    if (Option.isNone(reference)) {
      return [];
    }

    const target = reference.value.target;
    let name = "external";
    if (target._tag === "Local") {
      const node = ast.get(target.node);
      name = node._tag === "Declaration" ? node.symbol.name : node._tag;
    }
    return [[signature.text.slice(offset, offset + length), name] as const];
  });

describe("signature", () => {
  afterAll(async () => {
    await runtime.dispose();
  });

  test("type_only_class", async () => {
    expect.hasAssertions();
    const input = await fixture(
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
    const signature = await printed(input);
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
  });

  test("unchanged_node_identity", async () => {
    expect.hasAssertions();
    const input = await fixture("export type Ref = string;", "Ref");
    const part = Array.head(input.parts).pipe(Option.getOrThrow);
    const projected = Syntax.project(part, {
      exported: Option.some(input.exported),
    });
    expect(projected[0]).toBe(part.source.node);
    expect(projected).not.toHaveProperty("text");
  });

  test("original_parent_identity", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `export interface Ref {} export declare class Box { value: Ref; map(input: Ref): Ref; }`,
      "Box",
    );
    const node = Array.head(input.parts).pipe(Option.getOrThrow).source.node;
    const parents = Array.map(
      Node.identifiers(node),
      (identifier) => [identifier, identifier.parent] as const,
    );
    await printed(input);
    expect(
      Array.every(
        parents,
        ([identifier, parent]) => identifier.parent === parent,
      ),
    ).toBe(true);
  });

  test("canonical_type_alias", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `declare class Box { static create(): Box; value: string; } export type { Box as TypeBox }; export { Box };`,
      "TypeBox",
    );
    const signature = await printed(input);
    expect(signature.text).toContain("static create(): Box");
    expect(signature.text).toContain("export type { Box as TypeBox };");
    expect([
      input.exported.typeOnlyExport,
      input.exported.nameTypeOnlyExport,
    ]).toStrictEqual([false, true]);
  });

  test("keyword_export", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `declare function conditional(value: string): string; export { conditional as if };`,
      "if",
    );
    const signature = await printed(input);
    expect(signature.text).toContain(
      "function conditional(value: string): string",
    );
    expect(signature.text).toContain("export { conditional as if };");
    expect(signature.text).not.toContain("function if(");
  });

  test("renamed_export", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `declare const inferred: "_"; export { inferred as infer };`,
      "infer",
    );
    const signature = await printed(input);
    expect(signature.text).toBe('export const infer: "_";');
  });

  test("strict_reserved_export", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `declare const binding: number; export { binding as let };`,
      "let",
    );
    const signature = await printed(input);
    expect(signature.text).toBe(
      "const binding: number;\nexport { binding as let };",
    );
  });

  test("type_only_interface", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `interface Declaration { readonly value: string; } export type { Declaration };`,
      "Declaration",
    );
    const signature = await printed(input);
    expect(signature.text).toBe(
      "export interface Declaration {\n  readonly value: string;\n}",
    );
  });

  test("string_export_name", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `declare const pageIndex: number; export { pageIndex as "page-index" };`,
      "page-index",
    );
    const signature = await printed(input);
    expect(signature.text).toBe(
      'const pageIndex: number;\nexport { pageIndex as "page-index" };',
    );
  });

  test("anonymous_default", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `export default class { value: string; }`,
      "default",
    );
    const signature = await printed(input);
    expect(signature.text).toContain("export default class");
    expect(signature.text).toContain("value: string");
  });

  test("single_variable", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `export interface Ref {} export declare const first: Ref, second: string;`,
      "first",
    );
    const signature = await printed(input);
    expect(signature.text).toBe("export const first: Ref;");
    expect(targetNames(signature, input.ast)).toContainEqual(["Ref", "Ref"]);
    expect(signature.text).not.toContain("second");
  });

  test("callable_members", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `export interface Ref {} export declare const choose: { /** Call. */ (value: Ref): Ref; readonly metadata: "a  b"; new (): Ref; };`,
      "choose",
    );
    const signature = await printed(input);
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
  });

  test("member_and_type_fragments", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `export interface Ref {} export declare class Box { get value(): Ref; set value(input: Ref); }`,
      "Box",
    );
    const member = Array.head(
      Parts.members(input.parts, { ast: input.ast, entry: input.exported }),
    ).pipe(Option.getOrThrow);
    const parts = await Promise.all(
      Array.map(member.parts, async (part) =>
        runtime.runPromise(
          Signature.print(Syntax.project(part, { exported: Option.none() })),
        ),
      ),
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
    const fragment = await runtime.runPromise(Signature.print([returns.node]));
    expect(fragment.text).toBe("Ref");
    expect(targetNames(fragment, input.ast)).toStrictEqual([["Ref", "Ref"]]);
  });

  test.each([
    [
      "identifier_mismatch",
      "export const changed: string;",
      "IdentifierMismatch",
    ],
    ["invalid_syntax", "export const = ;", "InvalidSyntax"],
  ])("%s", async (_name, replacement, expected) => {
    expect.hasAssertions();
    const input = await fixture("export declare const value: string;", "value");
    const api = await runtime.runPromise(Api.Api);
    const part = Array.head(input.parts).pipe(Option.getOrThrow);
    const result = await runtime.runPromise(
      Signature.print(
        Syntax.project(part, { exported: Option.some(input.exported) }),
      ).pipe(
        Effect.provideService(Api.Api, {
          ...api,
          print: () => Effect.succeed(replacement),
        }),
        Effect.result,
      ),
    );
    expect(Result.isFailure(result)).toBe(true);
    expect(Result.getFailure(result).pipe(Option.getOrThrow)).toMatchObject({
      _tag: "PrintError",
      reason: { _tag: expected },
    });
  });

  test("shadowed_occurrences", async () => {
    expect.hasAssertions();
    const input = await fixture(
      `export interface Ref {} export interface Box { outer: Ref; map<Ref>(input: Ref): Ref; }`,
      "Box",
    );
    const signature = await printed(input);
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
  });
});
