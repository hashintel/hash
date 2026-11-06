import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Chunk, Effect, Option } from "effect";
import { SyntaxKind } from "typescript/ast";
import * as factory from "typescript/ast/factory";

import * as Nodes from "../../tests/fixtures/nodes.js";
import * as AST from "./index.js";

describe("interned", () => {
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
