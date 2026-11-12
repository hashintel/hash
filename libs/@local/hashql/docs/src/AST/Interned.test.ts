import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Chunk, Effect, Exit, Option } from "effect";
import { SyntaxKind } from "typescript/ast";
import * as factory from "typescript/ast/factory";

import * as Nodes from "../../tests/fixtures/nodes.js";
import * as AST from "./index.js";

const keyword = (
  kind: SyntaxKind.StringKeyword | SyntaxKind.NumberKeyword,
): Nodes.TypeExpression.TypeExpression =>
  Nodes.TypeExpression.make({
    node: factory.createKeywordTypeNode(kind),
    children: Chunk.empty(),
    references: Chunk.empty(),
  });

describe("interned", () => {
  it.effect(
    "abandoned_after_failure",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = AST.make();
      yield* ast.intern(keyword(SyntaxKind.StringKeyword));
      let reserved = Option.none<AST.TypeExpression.Interned>();
      const exit = yield* Effect.exit(
        ast.reserve<Nodes.TypeExpression.TypeExpression, string, never>(
          (id) => {
            reserved = Option.some(id);
            return Effect.fail("unsupported");
          },
        ),
      );
      const next = yield* ast.intern(keyword(SyntaxKind.NumberKeyword));
      const abandoned = Option.getOrThrow(reserved);
      expect(Exit.isFailure(exit)).toBe(true);
      expect(next).not.toBe(abandoned);
      expect(() => ast.get(abandoned)).toThrow(/abandoned/u);
    }),
  );

  it.effect(
    "abandoned_after_duplicate",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = AST.make();
      const held = keyword(SyntaxKind.StringKeyword);
      const existing = yield* ast.intern(held);
      let reserved = Option.none<AST.TypeExpression.Interned>();
      const returned = yield* ast.reserve<
        Nodes.TypeExpression.TypeExpression,
        never,
        never
      >((id) => {
        reserved = Option.some(id);
        return Effect.succeed(held);
      });
      const next = yield* ast.intern(keyword(SyntaxKind.NumberKeyword));
      const abandoned = Option.getOrThrow(reserved);
      expect(returned).toBe(existing);
      expect(next).not.toBe(abandoned);
      expect(() => ast.get(abandoned)).toThrow(/abandoned/u);
    }),
  );

  it.effect(
    "typed_get",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = AST.make();
      const node = Nodes.TypeExpression.make({
        node: factory.createKeywordTypeNode(SyntaxKind.StringKeyword),
        children: Chunk.empty(),
        references: Chunk.empty(),
      });
      const id = yield* ast.intern(node);
      expectTypeOf(
        ast.get(id),
      ).toEqualTypeOf<Nodes.TypeExpression.TypeExpression>();
      expect(ast.get(id)).toBe(node);
    }),
  );

  it.effect(
    "joint_declaration",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = AST.make();
      const node = Nodes.ClassDeclaration.make({
        node: factory.createClassDeclaration(
          undefined,
          factory.createIdentifier("Box"),
          undefined,
          undefined,
          [],
        ),
        typeParameters: Chunk.empty(),
        extends: Option.none(),
        implements: Chunk.empty(),
        members: Chunk.empty(),
        documentation: Option.none(),
      });
      const id = yield* ast.intern(node);
      expectTypeOf(id).toExtend<
        Nodes.JointDeclaration.JointDeclaration.Fields["declaration"]
      >();
      expectTypeOf(Option.some(id)).not.toExtend<
        Nodes.IndependentDeclarations.IndependentDeclarations.Fields["type"]
      >();
      expect(Nodes.JointDeclaration.make({ declaration: id }).declaration).toBe(
        id,
      );
    }),
  );
});
