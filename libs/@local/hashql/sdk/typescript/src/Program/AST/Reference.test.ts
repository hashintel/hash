import { Result } from "effect";
import { assert, describe, expect, test } from "vitest";

import * as JExpr from "../../JExpr/index.js";
import * as AST from "./index.js";

const draft = Symbol("resolve_references");
const ident = Result.getOrThrow(JExpr.Ident.decodeResult("x"));
const id = (generation: number): AST.ReferenceId => ({
  draft,
  universe: "value",
  ident,
  generation,
});

const depth = 20_000;

/** Nests `depth` lets of `x`, each value reading the previous one, around a read of generation `last`. */
const chain = (last: number): AST.Node => {
  let node: AST.Node = new AST.Reference(id(last));
  for (let generation = depth - 1; generation >= 0; generation -= 1) {
    let value: AST.Node = new AST.Expr(JExpr.literal(0n));
    if (generation > 0) {
      value = new AST.Reference(id(generation - 1));
    }

    node = new AST.Let(
      Result.getOrThrow(AST.make("x", value)),
      id(generation),
      node,
    );
  }

  return node;
};

describe("resolve_references", () => {
  test("deep_nesting", () => {
    expect.hasAssertions();
    expect(Result.isSuccess(AST.resolveReferences(chain(depth - 1)))).toBe(
      true,
    );

    const stale = AST.resolveReferences(chain(0));
    assert(Result.isFailure(stale));
    expect(stale.failure.reason).toStrictEqual({
      _tag: "StaleReference",
      name: "x",
    });
  });
});
