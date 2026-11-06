import { Array, Effect, Equal, Hash, Option, pipe } from "effect";
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
import { afterAll, describe, expect, test } from "vitest";

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

const { file, api, project, source, exported } = await Compiler.open();

describe("compiler", () => {
  afterAll(async () => {
    await api.close();
  });

  describe("compiler declarations", () => {
    test("export_aliases", async () => {
      expect.hasAssertions();
      const renamed = exported("if");
      const typeOnlyExport = exported("TypeBox");
      expect(TypeScript.Symbol.hasFlag(renamed, SymbolFlags.Alias)).toBe(true);
      expect(TypeScript.Symbol.hasFlag(typeOnlyExport, SymbolFlags.Alias)).toBe(
        true,
      );
      const functionTarget = await project.checker.getAliasedSymbol(renamed);
      const classTarget =
        await project.checker.getAliasedSymbol(typeOnlyExport);
      expect([renamed.name, functionTarget.name]).toStrictEqual([
        "if",
        "conditional",
      ]);
      expect([typeOnlyExport.name, classTarget.id]).toStrictEqual([
        "TypeBox",
        exported("Box").id,
      ]);
    });

    test("mixed_declarations_visible", async () => {
      expect.hasAssertions();
      const resolved = await Promise.all(
        Array.map(exported("Mixed").declarations, async (handle) =>
          handle.resolve(project),
        ),
      );
      const kinds = Array.map(
        resolved,
        (declaration) =>
          Option.getOrThrow(Option.fromUndefinedOr(declaration)).kind,
      );
      expect(kinds).toStrictEqual([
        SyntaxKind.ClassDeclaration,
        SyntaxKind.InterfaceDeclaration,
      ]);
    });

    test("symbol_identity", () => {
      expect.hasAssertions();
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
    });

    test("opaque_symbol", () => {
      expect.hasAssertions();
      const node = Nodes.Declaration.make({
        symbol: shield(exported("Box")),
        leaf: Option.none(),
        namespace: Option.none(),
        bases: [],
      });
      expect(() => Hash.hash(node)).not.toThrow();
      expect(() => node.toString()).not.toThrow();
    });

    test("intern_hash_collision", () => {
      expect.hasAssertions();
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
      const firstId = Effect.runSync(ast.intern(first));
      const secondId = Effect.runSync(ast.intern(second));
      expect(Hash.hash(first)).toBe(Hash.hash(second));
      expect(firstId).not.toBe(secondId);
      expect(ast.get(firstId)).toBe(first);
      expect(ast.get(secondId)).toBe(second);
      expect(
        Effect.runSync(
          ast.intern(
            new CollidingDeclaration({
              symbol: exported("Box"),
              leaf: Option.none(),
              namespace: Option.none(),
              bases: [],
            }),
          ),
        ),
      ).toBe(firstId);
    });

    test("external_reference_identity", () => {
      expect.hasAssertions();
      const node = Array.head(source.statements).pipe(Option.getOrThrow);
      const symbol = exported("Link");
      const external = {
        _tag: "External",
        symbol,
        name: symbol.name,
        url: Option.none(),
        bases: [],
      } as const;
      const fields = { node, url: Option.none(), quickInfo: Option.none() };
      const first = Nodes.Reference.make({ ...fields, target: external });
      const second = Nodes.Reference.make({ ...fields, target: external });
      const distinct = Nodes.Reference.make({
        ...fields,
        target: { ...external, symbol: shield(symbol) },
      });
      expect(Equal.equals(first, second)).toBe(true);
      expect(Hash.hash(first)).toBe(Hash.hash(second));
      expect(first[Equal.symbol](distinct)).toBe(false);
      expect(() => Hash.hash(distinct)).not.toThrow();
      expect(Object.isFrozen(first.target)).toBe(true);
    });
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

    test.each(unchanged)("%s", async (name, matches) => {
      expect.hasAssertions();
      const original = Array.findFirst(source.statements, matches).pipe(
        Option.getOrThrow,
      );
      const node = Print.cloneWithoutComments(original);
      const text = await api.printer.printNode(node);
      await expect(text).toMatchFileSnapshot(`./fixtures/printed/${name}.txt`);
      const parsed = await api.createSourceFile(`${file}.${name}.d.ts`, text);
      try {
        expect(
          Array.map(
            TypeScript.Node.identifiers(parsed.sourceFile),
            (identifier) => identifier.text,
          ),
        ).toStrictEqual(
          Array.map(
            TypeScript.Node.identifiers(node),
            (identifier) => identifier.text,
          ),
        );
      } finally {
        await parsed.dispose();
      }
    });

    test("type_only_class", async () => {
      expect.hasAssertions();
      const original = Array.findFirst(
        source.statements,
        isClassDeclaration,
      ).pipe(Option.getOrThrow);
      const before = original.getText();
      const projected = Print.instanceClass(original);
      const text = await api.printer.printNode(projected);
      await expect(text).toMatchFileSnapshot(
        "./fixtures/printed/type_only_class.txt",
      );
      expect(original.getText()).toBe(before);
      expect(original.name?.text).toBe("Box");
      expect(
        original.members.some(
          (member) => member.kind === SyntaxKind.Constructor,
        ),
      ).toBe(true);
      expect(original.jsDoc?.length).toBeGreaterThan(0);
      const parsed = await api.createSourceFile(`${file}.instance.d.ts`, text);
      try {
        expect(
          Array.map(
            TypeScript.Node.identifiers(parsed.sourceFile),
            (identifier) => identifier.text,
          ),
        ).toStrictEqual(
          Array.map(
            TypeScript.Node.identifiers(projected),
            (identifier) => identifier.text,
          ),
        );
      } finally {
        await parsed.dispose();
      }
    });

    test("standalone_getter", async () => {
      expect.hasAssertions();
      const original = Array.findFirst(
        source.statements,
        isClassDeclaration,
      ).pipe(Option.getOrThrow);
      const getter = Array.findFirst(
        Print.instanceClass(original).members,
        isGetAccessorDeclaration,
      ).pipe(Option.getOrThrow);
      await expect(api.printer.printNode(getter)).resolves.toMatchFileSnapshot(
        "./fixtures/printed/standalone_getter.txt",
      );
    });

    test("shadowed_reference_offsets", async () => {
      expect.hasAssertions();
      const interfaces = Array.filter(
        source.statements,
        isInterfaceDeclaration,
      );
      const original = Array.findFirst(
        interfaces,
        (node) => node.name.text === "Shadow",
      ).pipe(Option.getOrThrow);
      const originalIdentifiers = TypeScript.Node.identifiers(original);
      const symbols =
        await project.checker.getSymbolAtLocation(originalIdentifiers);
      const projected = Print.cloneWithoutComments(original);
      const text = await api.printer.printNode(projected);
      const parsed = await api.createSourceFile(`${file}.shadow.d.ts`, text);
      try {
        const emittedIdentifiers = TypeScript.Node.identifiers(
          parsed.sourceFile,
        );
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
            target: symbol?.id,
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
      } finally {
        await parsed.dispose();
      }
    });
  });
});
