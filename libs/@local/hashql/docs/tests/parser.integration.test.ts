import { DocLinkTag } from "@microsoft/tsdoc";
import { Array, Chunk, HashMap, Option, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as AST from "../src/AST/index.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as ParserFixture from "./fixtures/parser.js";

import type { DocNode } from "@microsoft/tsdoc";
import type { Predicate } from "effect";

const { parse, success } = ParserFixture;

const exported = (ast: AST.Store["Service"], name: string): AST.Alias.Alias => {
  const root = HashMap.get(ast.entrypoints, "fixture").pipe(
    Option.getOrThrow,
    ast.get,
  );
  const namespace = root.namespace.pipe(Option.getOrThrow, ast.get);
  return pipe(
    namespace.exports,
    Array.fromIterable,
    Array.map(ast.get),
    Array.findFirst((alias) => alias.name === name),
    Option.getOrThrow,
  );
};

const first = <T extends AST.Node.Node>(
  ast: AST.Store["Service"],
  guard: Predicate.Refinement<AST.Node.Node, T>,
): T =>
  pipe(
    ast.nodes(),
    Array.fromIterable,
    Array.findFirst(guard),
    Option.getOrThrow,
  );

const targetOf = (
  ast: AST.Store["Service"],
  reference: AST.TypeReference.TypeReference,
): AST.Reference.Reference.Target => ast.get(reference.reference).target;

const leaf = (
  ast: AST.Store["Service"],
  name: string,
): AST.LeafDeclaration.LeafDeclaration =>
  ast.get(exported(ast, name).target).leaf.pipe(Option.getOrThrow, ast.get);

const localNames = (ast: AST.Store["Service"]): readonly string[] =>
  pipe(
    ast.nodes(),
    Array.fromIterable,
    Array.filter(AST.TypeReference.isTypeReference),
    Array.map((reference) => targetOf(ast, reference)),
    Array.filter(
      (
        target,
      ): target is Extract<
        AST.Reference.Reference.Target,
        { readonly _tag: "Local" }
      > => target._tag === "Local",
    ),
    Array.map((target) => ast.get(target.node)),
    Array.filter(AST.Declaration.isDeclaration),
    Array.map((declaration) => declaration.symbol.name),
  );

/** Each `{@link}` of every comment the AST holds, by the text of its destination. */
const linksOf = (
  ast: AST.Store["Service"],
): HashMap.HashMap<string, Option.Option<AST.Reference.Reference>> => {
  const tags: DocLinkTag[] = [];
  const walk = (node: DocNode): void => {
    if (node instanceof DocLinkTag) {
      tags.push(node);
    }
    for (const child of node.getChildNodes()) {
      walk(child);
    }
  };
  for (const node of ast.nodes()) {
    if (AST.Documentation.isDocumentation(node)) {
      walk(node.source);
    }
  }
  return HashMap.fromIterable(
    Array.map(
      tags,
      (tag) =>
        [
          tag.codeDestination?.emitAsTsdoc() ?? tag.urlDestination ?? "",
          ast.referenceAt(tag),
        ] as const,
    ),
  );
};

const declarationOf = (
  ast: AST.Store["Service"],
  name: string,
): AST.Declaration.Interned => exported(ast, name).target;

describe("parser", () => {
  test("recursive_interface", async () => {
    expect.hasAssertions();
    const ast = await success({
      source: "export interface Link { next?: Link }",
    });
    const reference = first(ast, AST.TypeReference.isTypeReference);
    expect(targetOf(ast, reference)).toStrictEqual({
      _tag: "Local",
      node: exported(ast, "Link").target,
    });
    expect(
      Array.fromIterable(ast.nodes()).filter(
        AST.InterfaceDeclaration.isInterfaceDeclaration,
      ),
    ).toHaveLength(1);
  });

  test("joint_independent", async () => {
    expect.hasAssertions();
    const ast = await success({
      source:
        "export class Box {}\nexport type Both = string; export const Both: number;",
    });
    const both = pipe(
      leaf(ast, "Both"),
      Option.liftPredicate(
        AST.IndependentDeclarations.isIndependentDeclarations,
      ),
      Option.getOrThrow,
    );
    expect(leaf(ast, "Box")._tag).toBe("JointDeclaration");
    expect([both.type._tag, both.value._tag]).toStrictEqual(["Some", "Some"]);
  });

  test("class_interface_merge", async () => {
    expect.hasAssertions();
    const result = await parse({
      source: "export class Mixed {}\nexport interface Mixed { extra: string }",
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "UnsupportedMerge", name: "Mixed" } },
    });
  });

  test("documentation_attachment", async () => {
    expect.hasAssertions();
    const ast = await success({
      source: `/** @module */
/** Box documentation. */
export declare class Box {
  /** Value description. */
  value: string;
  label: string;
}
/** Callable documentation. */
export declare const choose: {
  /** First overload. */
  (value: string): string;
  /** Second overload. */
  (value: number): number;
};`,
    });
    const text = (node: {
      readonly documentation: Option.Option<AST.Documentation.Interned>;
    }): Option.Option<string> =>
      Option.map(node.documentation, (id) => ast.get(id).node.getText());
    const nodes = Array.fromIterable(ast.nodes());
    const root = HashMap.get(ast.entrypoints, "fixture").pipe(
      Option.getOrThrow,
      ast.get,
    );
    expect(
      text(ast.get(Option.getOrThrow(root.namespace))).pipe(Option.getOrThrow),
    ).toContain("@module");
    expect(
      Array.getSomes(
        Array.map(nodes.filter(AST.ClassDeclaration.isClassDeclaration), text),
      ),
    ).toStrictEqual(["/** Box documentation. */"]);
    expect(
      Array.map(
        nodes.filter(AST.CallableConstant.isCallableConstant),
        (constant) => [
          text(constant),
          Array.map(Array.fromIterable(constant.overloads), (id) =>
            text(ast.get(id)),
          ),
        ],
      ),
    ).toStrictEqual([
      [
        Option.some("/** Callable documentation. */"),
        [
          Option.some("/** First overload. */"),
          Option.some("/** Second overload. */"),
        ],
      ],
    ]);
    expect(
      Array.getSomes(Array.map(nodes.filter(AST.Property.isProperty), text)),
    ).toStrictEqual(["/** Value description. */"]);
  });

  test.each([
    [
      "export interface Value {}\n/** Helpers. @module */\nexport declare namespace Helpers { const x: number; }",
      26,
    ],
    [
      "/** File. @module */\n/** Again. @module */\nexport interface Value {}",
      21,
    ],
    [
      "export interface Value {\n  /** Field. @module */\n  field: string;\n}",
      27,
    ],
  ])("stray_module_comment_%#", async (source, start) => {
    expect.hasAssertions();
    await expect(parse({ source })).resolves.toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "DocumentationError",
        reason: { _tag: "StrayModuleComment", start },
      },
    });
  });

  test("shared_documentation", async () => {
    expect.hasAssertions();
    const ast = await success({
      source: "/** Both. */ export declare const left: string, right: string;",
    });
    const documentation = Array.fromIterable(ast.nodes())
      .filter(AST.ConstantDeclaration.isConstantDeclaration)
      .map((constant) => constant.documentation);
    expect(documentation).toHaveLength(2);
    expect(Array.dedupe(documentation)).toHaveLength(1);
    expect(
      Array.map(documentation, (id) =>
        ast.get(Option.getOrThrow(id)).node.getText(),
      ),
    ).toStrictEqual(["/** Both. */", "/** Both. */"]);
  });

  test("malformed_private_documentation", async () => {
    expect.hasAssertions();
    const result = await parse({
      source:
        "/**\n * Hidden.\n * @unknownTag text\n */\ndeclare interface Hidden {}\nexport declare const value: Hidden;",
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "DocumentationError",
        reason: { _tag: "InvalidComment" },
      },
    });
  });

  test("overloads_accessors", async () => {
    expect.hasAssertions();
    const ast = await success({
      source: `
      /** String overload. */
      export function choose(value: string): string;
      /** Numeric overload. */
      export function choose(value: number): number;
      export class Box {
        constructor(value: string);
        constructor(value: number);
        method(value: string): string;
        method(value: number): number;
        get value(): string;
        set value(value: string);
        static value: number;
      }
    `,
    });
    const accessor = first(ast, AST.Accessor.isAccessor);
    const overloads = Array.fromIterable(
      first(ast, AST.FunctionOverloads.isFunctionOverloads).overloads,
    ).map(ast.get);
    expect(
      overloads.map((call) =>
        ast.get(Option.getOrThrow(call.documentation)).node.getText(),
      ),
    ).toStrictEqual(["/** String overload. */", "/** Numeric overload. */"]);
    expect([
      Chunk.size(
        first(ast, AST.FunctionOverloads.isFunctionOverloads).overloads,
      ),
      Chunk.size(first(ast, AST.Method.isMethod).overloads),
      Chunk.size(first(ast, AST.Constructor.isConstructor).overloads),
    ]).toStrictEqual([2, 2, 2]);
    expect([accessor.get._tag, accessor.set._tag]).toStrictEqual([
      "Some",
      "Some",
    ]);
    expect(
      Array.fromIterable(ast.nodes()).filter(AST.Property.isProperty),
    ).toHaveLength(1);
  });

  test("callable_constant", async () => {
    expect.hasAssertions();
    const ast = await success({
      source:
        "export const choose: { (value: string): string; <T>(value: T): T; new (): object; readonly marker: string }",
    });
    const callable = first(ast, AST.CallableConstant.isCallableConstant);
    const type = pipe(
      ast.get(callable.type),
      Option.liftPredicate(AST.ObjectType.isObjectType),
      Option.getOrThrow,
    );
    expect(Chunk.size(callable.overloads)).toBe(2);
    expect(
      Array.fromIterable(type.members)
        .map(ast.get)
        .map((node) => node._tag)
        .toSorted(),
    ).toStrictEqual([
      "CallSignature",
      "CallSignature",
      "ConstructSignature",
      "Property",
    ]);
  });

  test("shadowed_parameters", async () => {
    expect.hasAssertions();
    const ast = await success({
      source:
        "export interface Link {}\nexport interface Shadow { global: Link; local<Link>(value: Link): Link }",
    });
    const references = Array.fromIterable(ast.nodes()).filter(
      AST.TypeReference.isTypeReference,
    );
    const targets = references.map((reference) => targetOf(ast, reference));
    const parameter = first(ast, AST.TypeParameter.isTypeParameter);
    expect(targets).toContainEqual({
      _tag: "Local",
      node: exported(ast, "Link").target,
    });
    expect(targets).toContainEqual({
      _tag: "Local",
      node: ast.intern(parameter),
    });
  });

  test("mapped_parameter", async () => {
    expect.hasAssertions();
    const ast = await success({
      source:
        "export type Select<T> = { [K in keyof T as K extends string ? K : never]: T[K] };",
    });
    const parameters = Array.fromIterable(ast.nodes())
      .filter(AST.TypeParameter.isTypeParameter)
      .map((node) => node.name)
      .toSorted();
    const references = Array.fromIterable(ast.nodes())
      .filter(AST.TypeReference.isTypeReference)
      .filter((node) => node.node.getText() === "K");
    expect(parameters).toStrictEqual(["K", "T"]);
    expect(references).toHaveLength(3);
    expect(
      references.map((reference) => targetOf(ast, reference)._tag),
    ).toStrictEqual(["Local", "Local", "Local"]);
  });

  test("alias_names", async () => {
    expect.hasAssertions();
    const ast = await success({
      source:
        "declare function conditional(): void; export { conditional as if }; export class Box {}; export type { Box as TypeBox };",
    });
    expect(ast.get(exported(ast, "if").target).symbol.name).toBe("conditional");
    expect(exported(ast, "TypeBox").typeOnlyExport).toBe(true);
    expect(exported(ast, "TypeBox").target).toBe(exported(ast, "Box").target);
  });

  test("namespace_cycle", async () => {
    expect.hasAssertions();
    const ast = await success({
      source:
        "export namespace A { export import other = B; export interface Value {} } export namespace B { export import other = A }",
    });
    const aDeclaration = exported(ast, "A").target;
    const bDeclaration = exported(ast, "B").target;
    const aNamespace = ast
      .get(aDeclaration)
      .namespace.pipe(Option.getOrThrow, ast.get);
    const bNamespace = ast
      .get(bDeclaration)
      .namespace.pipe(Option.getOrThrow, ast.get);
    const aOther = pipe(
      aNamespace.exports,
      Array.fromIterable,
      Array.map(ast.get),
      Array.findFirst((alias) => alias.name === "other"),
      Option.getOrThrow,
    );
    const bOther = pipe(
      bNamespace.exports,
      Array.fromIterable,
      Array.map(ast.get),
      Array.findFirst((alias) => alias.name === "other"),
      Option.getOrThrow,
    );
    expect(aOther.target).toBe(bDeclaration);
    expect(bOther.target).toBe(aDeclaration);
  });

  test("named_tuple_label", async () => {
    expect.hasAssertions();
    const ast = await success({
      source: "export type Annotation = [type: string];",
    });
    expect(
      first(ast, AST.TypeAliasDeclaration.isTypeAliasDeclaration).node.name
        .text,
    ).toBe("Annotation");
    expect(
      Array.fromIterable(ast.nodes())
        .filter(AST.Reference.isReference)
        .map((node) => node.node.getText()),
    ).not.toContain("type");
  });

  test("destructured_parameter", async () => {
    expect.hasAssertions();
    const ast = await success({
      source:
        "export function pick({ value }: { value: string }): typeof value;",
    });
    const parameter = first(ast, AST.Parameter.isParameter);
    expect(
      targetOf(ast, first(ast, AST.TypeReference.isTypeReference)),
    ).toStrictEqual({ _tag: "Local", node: ast.intern(parameter) });
  });

  test("private_dependency", async () => {
    expect.hasAssertions();
    const ast = await success({
      source: 'export { Public } from "./hidden.js";',
      files: {
        "hidden.d.ts":
          "interface Private { next: Private }; export type Public = Private; export {};",
      },
    });
    expect(localNames(ast)).toContain("Private");
    expect(
      Array.fromIterable(ast.nodes()).filter(
        AST.InterfaceDeclaration.isInterfaceDeclaration,
      ),
    ).toHaveLength(1);
  });

  test.each([
    ['export type * from "./origin.js";', true],
    ['export * from "./origin.js";', false],
    [
      'export type { Box } from "./origin.js"; export * from "./origin.js";',
      true,
    ],
    ['import type { Box } from "./origin.js"; export { Box };', true],
    ['import { Box } from "./middle.js"; export { Box };', true],
    ['export * from "./middle.js";', true],
    ['export * from "./middle.js"; export { Box } from "./origin.js";', false],
    ['export * from "./middle.js"; export * from "./origin.js";', false],
  ])("export_restriction_%#", async (source, typeOnlyExport) => {
    expect.hasAssertions();
    const ast = await success({
      source,
      files: {
        "origin.d.ts": "export class Box {}",
        "middle.d.ts": 'export type * from "./origin.js";',
      },
    });
    expect(exported(ast, "Box").typeOnlyExport).toBe(typeOnlyExport);
    expect(leaf(ast, "Box")._tag).toBe("JointDeclaration");
  });

  test.each([
    ["type ", true],
    ["", false],
  ])("export_cycle_%#", async (type, restricted) => {
    expect.hasAssertions();
    const ast = await success({
      source: `export ${type}* from "./cycle.js";`,
      files: {
        "cycle.d.ts":
          'export * from "./declarations.js"; export { Box } from "./origin.js";',
        "origin.d.ts": "export class Box {}",
      },
    });
    expect(exported(ast, "Box").typeOnlyExport).toBe(restricted);
  });

  test("enum_namespace", async () => {
    expect.hasAssertions();
    const ast = await success({
      source:
        "export enum Code { A = 1 }; export namespace Code { export type Value = Code.A }",
    });
    const namespace = ast
      .get(exported(ast, "Code").target)
      .namespace.pipe(Option.getOrThrow, ast.get);
    expect(
      Array.fromIterable(namespace.exports)
        .map(ast.get)
        .map((alias) => alias.name),
    ).toStrictEqual(["Value"]);
    const member = first(ast, AST.EnumMember.isEnumMember);
    expect(
      targetOf(ast, first(ast, AST.TypeReference.isTypeReference)),
    ).toStrictEqual({ _tag: "Local", node: ast.intern(member) });
  });

  test.each(["", "type "])("missing_star_module_%#", async (type) => {
    expect.hasAssertions();
    const result = await parse({
      source: `export ${type}* from "./missing.js";`,
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "UnresolvedReference", text: '"./missing.js"' },
      },
    });
  });

  test.each(["typeof import('./hidden.js')", "import('./hidden.js').Hidden"])(
    "import_type_%#",
    async (type) => {
      expect.hasAssertions();
      const ast = await success({
        source: `export type Value = ${type};`,
        files: { "hidden.d.ts": "export class Hidden {}" },
      });
      expect(
        targetOf(ast, first(ast, AST.TypeReference.isTypeReference))._tag,
      ).toBe("Local");
    },
  );

  test("class_namespace", async () => {
    expect.hasAssertions();
    const ast = await success({
      source:
        "export class Box { static create(): Box } export namespace Box { export type Value = string }",
    });
    const declaration = ast.get(exported(ast, "Box").target);
    const namespace = declaration.namespace.pipe(Option.getOrThrow, ast.get);
    expect(
      Array.fromIterable(namespace.exports)
        .map(ast.get)
        .map((alias) => alias.name),
    ).toStrictEqual(["Value"]);
    expect(leaf(ast, "Box")._tag).toBe("JointDeclaration");
  });

  describe("links", () => {
    test("bound_name", async () => {
      expect.hasAssertions();
      const ast = await success({
        source:
          "/** Holds a {@link Value}. */ export interface Box {} interface Value {} export { Value as Renamed };",
      });
      const reference = HashMap.get(linksOf(ast), "Value").pipe(
        Option.flatten,
        Option.getOrThrow,
      );
      expect(reference.target).toStrictEqual({
        _tag: "Local",
        node: declarationOf(ast, "Renamed"),
      });
    });

    test("member_by_public_name", async () => {
      expect.hasAssertions();
      const ast = await success({
        source:
          "/** Reads {@link Renamed.value}. */ export interface Reader {} interface Box { value: string } export { Box as Renamed };",
      });
      const reference = HashMap.get(linksOf(ast), "Renamed.value").pipe(
        Option.flatten,
        Option.getOrThrow,
      );
      const node = Option.getOrThrow(
        Option.liftPredicate(
          reference.target,
          (target) => target._tag === "Local",
        ),
      );
      expect(ast.get(node.node)).toMatchObject({
        _tag: "Property",
        name: "value",
      });
    });

    test("package_qualified", async () => {
      expect.hasAssertions();
      // The namespace's own Value is nearer the comment than the entrypoint's.
      const ast = await success({
        source: `export interface Value {}
export declare namespace Inner {
  /** Holds a {@link fixture#Value}. */
  export interface Box {}
  export interface Value {}
}`,
      });
      const reference = HashMap.get(linksOf(ast), "fixture#Value").pipe(
        Option.flatten,
        Option.getOrThrow,
      );
      expect(reference.target).toStrictEqual({
        _tag: "Local",
        node: declarationOf(ast, "Value"),
      });
    });

    test("url_destination", async () => {
      expect.hasAssertions();
      const ast = await success({
        source:
          "/** See {@link https://example.com | the site}. */ export interface Box {}",
      });
      expect(HashMap.get(linksOf(ast), "https://example.com")).toStrictEqual(
        Option.some(Option.none()),
      );
    });

    test("unresolved_public", async () => {
      expect.hasAssertions();
      await expect(
        parse({
          source: "/** Holds a {@link Missing}. */ export interface Box {}",
        }),
      ).resolves.toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "DocumentationError",
          reason: { _tag: "UnresolvedLink", destination: "Missing" },
        },
      });
    });

    test("unresolved_private", async () => {
      expect.hasAssertions();
      const ast = await success({
        source:
          "/** Holds a {@link Missing}. */ interface Hidden {} export type Box = Hidden; export {};",
      });
      expect(HashMap.get(linksOf(ast), "Missing")).toStrictEqual(
        Option.some(Option.none()),
      );
    });

    test("selector", async () => {
      expect.hasAssertions();
      await expect(
        parse({
          source:
            "/** Holds a {@link (Value:interface)}. */ export interface Box {} export interface Value {}",
        }),
      ).resolves.toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "DocumentationError",
          reason: { _tag: "UnsupportedReference" },
        },
      });
    });
  });

  describe("examples", () => {
    const source = `/**
 * Makes a box.
 *
 * @example
 * \`\`\`ts
 * import { make } from "./declarations.js";
 * const box = make();
 * \`\`\`
 * @example
 * \`\`\`json
 * { "box": true }
 * \`\`\`
 */
export declare function make(): Box;
export interface Box {}`;

    test("compiled_program", async () => {
      expect.hasAssertions();
      const ast = await success({ source });
      const examples = pipe(
        Array.fromIterable(ast.nodes()),
        Array.filter(AST.Documentation.isDocumentation),
        Array.flatMap((documentation) => documentation.examples),
      );
      expect(
        Array.map(examples, (example) => Option.isSome(ast.programOf(example))),
      ).toStrictEqual([true, false]);
    });

    test("name_references", async () => {
      expect.hasAssertions();
      const ast = await success({ source });
      const program = pipe(
        Array.fromIterable(ast.nodes()),
        Array.filter(AST.Documentation.isDocumentation),
        Array.flatMap((documentation) => documentation.examples),
        Array.head,
        Option.flatMap(ast.programOf),
        Option.getOrThrow,
      );
      const names = Array.map(TypeScript.Node.identifiers(program), (name) => {
        const reference = ast.referenceAt(name).pipe(Option.getOrThrow);
        return [
          name.text,
          reference.target._tag,
          Option.isSome(reference.quickInfo),
        ] as const;
      });
      expect(names).toStrictEqual([
        ["make", "Local", true],
        ["box", "External", true],
        ["make", "Local", true],
      ]);
    });
  });

  describe("bases", () => {
    test("private_base", async () => {
      expect.hasAssertions();
      // The base reaches the package through a value's type alone, as tsc emits a class that extends a factory's result.
      const ast = await success({
        source:
          'import { Base } from "./base.js"; export declare class Box extends Base {} export {};',
        files: {
          "base.d.ts":
            "interface Hidden {} export declare const Base: new () => Hidden; export {};",
        },
      });
      const [base] = ast.get(declarationOf(ast, "Box")).bases;
      const node = Option.getOrThrow(
        Option.liftPredicate(base, (target) => target?._tag === "Local"),
      );
      expect(ast.get(node.node)).toMatchObject({
        _tag: "Declaration",
        symbol: { name: "Hidden" },
      });
    });

    test("implemented_interface", async () => {
      expect.hasAssertions();
      const ast = await success({
        source:
          "export interface Shape {} export declare class Box implements Shape {}",
      });
      expect(ast.get(declarationOf(ast, "Box")).bases).toStrictEqual([
        { _tag: "Local", node: declarationOf(ast, "Shape") },
      ]);
    });
  });

  describe("parameters", () => {
    test.each([
      [
        "/** @param missing - Nothing. */ export declare function make(input: string): void;",
        "UnknownParameter",
        "missing",
      ],
      [
        "/** @param missing - Nothing. */ export declare const make: { (input: string): void };",
        "UnknownParameter",
        "missing",
      ],
      [
        "/** @typeParam U - Nothing. */ export declare function make<T>(input: T): void;",
        "UnknownTypeParameter",
        "U",
      ],
    ])("unknown_name_%#", async (source, reason, name) => {
      expect.hasAssertions();
      await expect(parse({ source })).resolves.toMatchObject({
        _tag: "Failure",
        failure: { _tag: "DocumentationError", reason: { _tag: reason, name } },
      });
    });

    test("known_names", async () => {
      expect.hasAssertions();
      await expect(
        success({
          source:
            "/** @typeParam T - The input. @param input - The input. */ export declare function make<T>(input: T): void;",
        }),
      ).resolves.toBeDefined();
    });
  });
});
