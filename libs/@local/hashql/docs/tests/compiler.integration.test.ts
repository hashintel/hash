import { describe, expect, layer } from "@effect/vitest";
import {
  Array,
  Context,
  Effect,
  Equal,
  Hash,
  HashMap,
  Layer,
  Option,
  pipe,
} from "effect";
import {
  SyntaxKind,
  isClassDeclaration,
  isGetAccessorDeclaration,
  isInterfaceDeclaration,
  isModuleDeclaration,
  isTypeAliasDeclaration,
  isVariableStatement,
} from "typescript/ast";
import { SymbolFlags } from "typescript/async";

import * as AST from "../src/AST/index.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as Compiler from "./fixtures/compiler.js";
import { shield } from "./fixtures/node-case.js";
import * as Nodes from "./fixtures/nodes.js";
import * as Print from "./fixtures/print.js";

import type { Node } from "typescript/ast";

class CollidingDeclaration extends Nodes.Declaration.Declaration {
  override [Hash.symbol](): number {
    return Hash.string(this._tag);
  }
}

layer(Compiler.layer(), { excludeTestServices: true })("compiler", (it) => {
  describe("compiler declarations", () => {
    it.effect(
      "export_aliases",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const { exported } = yield* Compiler.Fixture;
        const checker = yield* TypeScript.Checker.Checker;
        const renamed = exported("if");
        const typeOnlyExport = exported("TypeBox");
        expect(TypeScript.Symbol.hasFlag(renamed, SymbolFlags.Alias)).toBe(
          true,
        );
        expect(
          TypeScript.Symbol.hasFlag(typeOnlyExport, SymbolFlags.Alias),
        ).toBe(true);
        const functionTarget = yield* checker.getAliasedSymbol(renamed);
        const classTarget = yield* checker.getAliasedSymbol(typeOnlyExport);
        expect([renamed.name, functionTarget.name]).toStrictEqual([
          "if",
          "conditional",
        ]);
        expect([typeOnlyExport.name, classTarget.id]).toStrictEqual([
          "TypeBox",
          exported("Box").id,
        ]);
      }),
    );

    it.effect(
      "mixed_declarations_visible",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const { exported } = yield* Compiler.Fixture;
        const resolved = yield* Effect.forEach(
          exported("Mixed").declarations,
          (handle) => TypeScript.Program.resolve(handle),
        );
        const kinds = Array.map(
          resolved,
          (declaration) => Option.getOrThrow(declaration).kind,
        );
        expect(kinds).toStrictEqual([
          SyntaxKind.ClassDeclaration,
          SyntaxKind.InterfaceDeclaration,
        ]);
      }),
    );

    it.effect(
      "symbol_identity",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const { exported } = yield* Compiler.Fixture;
        const symbol = exported("Box");
        const fields = {
          symbol,
          leaf: Option.none(),
          namespace: Option.none(),
          bases: [],
        };
        const first = Nodes.Declaration.make(fields);
        const second = Nodes.Declaration.make(fields);
        const distinct = Nodes.Declaration.make({
          symbol: shield(symbol),
          leaf: Option.none(),
          namespace: Option.none(),
          bases: [],
        });
        expect(Equal.equals(first, second)).toBe(true);
        expect(Hash.hash(first)).toBe(Hash.hash(second));
        expect(first[Equal.symbol](distinct)).toBe(false);
        expect(Option.isNone(first.documentation)).toBe(true);
      }),
    );

    it.effect(
      "opaque_symbol",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const { exported } = yield* Compiler.Fixture;
        const node = Nodes.Declaration.make({
          symbol: shield(exported("Box")),
          leaf: Option.none(),
          namespace: Option.none(),
          bases: [],
        });
        expect(() => Hash.hash(node)).not.toThrow();
        expect(() => node.toString()).not.toThrow();
      }),
    );

    it.effect(
      "intern_hash_collision",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const { exported } = yield* Compiler.Fixture;
        const ast = AST.make();
        const first = new CollidingDeclaration({
          symbol: exported("Box"),
          leaf: Option.none(),
          namespace: Option.none(),
          bases: [],
        });
        const second = new CollidingDeclaration({
          symbol: exported("Link"),
          leaf: Option.none(),
          namespace: Option.none(),
          bases: [],
        });
        const firstId = yield* ast.intern(first);
        const secondId = yield* ast.intern(second);
        expect(Hash.hash(first)).toBe(Hash.hash(second));
        expect(firstId).not.toBe(secondId);
        expect(ast.get(firstId)).toBe(first);
        expect(ast.get(secondId)).toBe(second);
        const again = yield* ast.intern(
          new CollidingDeclaration({
            symbol: exported("Box"),
            leaf: Option.none(),
            namespace: Option.none(),
            bases: [],
          }),
        );
        expect(again).toBe(firstId);
      }),
    );

    it.effect(
      "external_item_identity",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const { exported } = yield* Compiler.Fixture;
        const symbol = exported("Link");
        // SAFETY: The test compares the base by identity and never resolves it.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- No store looks this base up.
        const base = exported("Box") as AST.ExternalItem.InternedSymbol;
        const fields = {
          symbol,
          name: symbol.name,
          pages: {
            type: Option.none(),
            value: Option.none(),
            namespace: Option.none(),
          },
          bases: [base],
        };
        const first = Nodes.ExternalItem.make(fields);
        const second = Nodes.ExternalItem.make(fields);
        const distinct = Nodes.ExternalItem.make({
          ...fields,
          symbol: shield(symbol),
          bases: [shield(base)],
        });
        expect(Equal.equals(first, second)).toBe(true);
        expect(Hash.hash(first)).toBe(Hash.hash(second));
        expect(first[Equal.symbol](distinct)).toBe(false);
        expect(() => Hash.hash(distinct)).not.toThrow();
        expect([
          Object.isFrozen(first.pages),
          Object.isFrozen(first.bases),
        ]).toStrictEqual([true, true]);
      }),
    );
  });

  describe("syntax printing", () => {
    const unchanged = [
      ["mapped_type", (node: Node): boolean => isTypeAliasDeclaration(node)],
      [
        "callable_constant",
        (node: Node): boolean =>
          isVariableStatement(node) &&
          node.declarationList.declarations[0]?.name.getText() === "choose",
      ],
      [
        "recursive_interface",
        (node: Node): boolean =>
          isInterfaceDeclaration(node) && node.name.text === "Link",
      ],
      ["nested_namespace", (node: Node): boolean => isModuleDeclaration(node)],
      [
        "shadowed_names",
        (node: Node): boolean =>
          isInterfaceDeclaration(node) && node.name.text === "Shadow",
      ],
    ] as const;

    it.effect.each(unchanged)(
      "%s",
      Effect.fnUntraced(function* ([
        name,
        matches,
      ]: (typeof unchanged)[number]) {
        expect.hasAssertions();
        const { source } = yield* Compiler.Fixture;
        const original = Array.findFirst(source.statements, matches).pipe(
          Option.getOrThrow,
        );
        const node = Print.cloneWithoutComments(original);
        const text = yield* Compiler.print(node);
        yield* Effect.promise(() =>
          expect(text).toMatchFileSnapshot(`./fixtures/printed/${name}.txt`),
        );
        const parsed = yield* Compiler.parse(text, name);
        expect(
          Array.map(
            TypeScript.Node.identifiers(parsed),
            (identifier) => identifier.text,
          ),
        ).toStrictEqual(
          Array.map(
            TypeScript.Node.identifiers(node),
            (identifier) => identifier.text,
          ),
        );
      }),
    );

    it.effect(
      "type_only_class",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const { source } = yield* Compiler.Fixture;
        const original = Array.findFirst(
          source.statements,
          isClassDeclaration,
        ).pipe(Option.getOrThrow);
        const before = original.getText();
        const projected = Print.instanceClass(original);
        const text = yield* Compiler.print(projected);
        yield* Effect.promise(() =>
          expect(text).toMatchFileSnapshot(
            "./fixtures/printed/type_only_class.txt",
          ),
        );
        expect(original.getText()).toBe(before);
        expect(original.name?.text).toBe("Box");
        expect(
          original.members.some(
            (member) => member.kind === SyntaxKind.Constructor,
          ),
        ).toBe(true);
        expect(original.jsDoc?.length).toBeGreaterThan(0);
        const parsed = yield* Compiler.parse(text, "instance");
        expect(
          Array.map(
            TypeScript.Node.identifiers(parsed),
            (identifier) => identifier.text,
          ),
        ).toStrictEqual(
          Array.map(
            TypeScript.Node.identifiers(projected),
            (identifier) => identifier.text,
          ),
        );
      }),
    );

    it.effect(
      "standalone_getter",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const { source } = yield* Compiler.Fixture;
        const original = Array.findFirst(
          source.statements,
          isClassDeclaration,
        ).pipe(Option.getOrThrow);
        const getter = Array.findFirst(
          Print.instanceClass(original).members,
          isGetAccessorDeclaration,
        ).pipe(Option.getOrThrow);
        const text = yield* Compiler.print(getter);
        yield* Effect.promise(() =>
          expect(text).toMatchFileSnapshot(
            "./fixtures/printed/standalone_getter.txt",
          ),
        );
      }),
    );

    it.effect(
      "shadowed_reference_offsets",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const { source, exported } = yield* Compiler.Fixture;
        const checker = yield* TypeScript.Checker.Checker;
        const interfaces = Array.filter(
          source.statements,
          isInterfaceDeclaration,
        );
        const original = Array.findFirst(
          interfaces,
          (node) => node.name.text === "Shadow",
        ).pipe(Option.getOrThrow);
        const originalIdentifiers = TypeScript.Node.identifiers(original);
        const symbols = yield* checker.getSymbolAtLocation(originalIdentifiers);
        const projected = Print.cloneWithoutComments(original);
        const text = yield* Compiler.print(projected);
        const parsed = yield* Compiler.parse(text, "shadow");
        const emittedIdentifiers = TypeScript.Node.identifiers(parsed);
        expect(
          Array.map(emittedIdentifiers, (identifier) => identifier.text),
        ).toStrictEqual(
          Array.map(originalIdentifiers, (identifier) => identifier.text),
        );
        const links = pipe(
          Array.zip(emittedIdentifiers, symbols),
          Array.filter(([identifier]) => identifier.text === "Link"),
          Array.map(([identifier, symbol]) => ({
            text: text.slice(identifier.getStart(), identifier.end),
            target: Option.getOrUndefined(Option.map(symbol, ({ id }) => id)),
          })),
        );
        expect(Array.map(links, (link) => link.text)).toStrictEqual([
          "Link",
          "Link",
          "Link",
          "Link",
        ]);
        const local = links[1]?.target;
        expect(local).toBeDefined();
        expect(local).not.toBe(exported("Link").id);
        expect(Array.map(links, (link) => link.target)).toStrictEqual([
          exported("Link").id,
          local,
          local,
          local,
        ]);
      }),
    );
  });

  describe("program files", () => {
    it.effect(
      "own_below_node_modules",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const directory = "/consumer/node_modules/package/declarations";
        const main = `${directory}/main.d.ts`;
        const part = `${directory}/nested/part.d.ts`;
        const dependency = "/consumer/node_modules/dependency/index.d.ts";
        const nested = `${directory}/node_modules/nested/index.d.ts`;
        const files = HashMap.make(
          [
            main,
            'export * from "./nested/part.js";\nexport type { Dependency } from "dependency";\nexport type { Nested } from "./node_modules/nested/index.js";\n',
          ],
          [part, "export declare const part: string;\n"],
          [
            "/consumer/node_modules/dependency/package.json",
            '{ "name": "dependency", "types": "index.d.ts" }',
          ],
          [dependency, "export interface Dependency {}\n"],
          [nested, "export interface Nested {}\n"],
        );
        const context = yield* Layer.build(
          TypeScript.Program.layer([main], {
            directory,
            paths: {},
            files,
          }).pipe(Layer.provide(TypeScript.Api.layer)),
        );
        const program = Context.get(context, TypeScript.Program.Program);
        const external = yield* Effect.forEach(
          [main, part, dependency, nested],
          (file) =>
            Effect.map(
              program.sourceFile(file),
              Option.map(program.isExternal),
            ),
        );
        expect(external).toStrictEqual([
          Option.some(false),
          Option.some(false),
          Option.some(true),
          Option.some(true),
        ]);
      }),
    );
  });
});
