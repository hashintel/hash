import { Array, Option, Result } from "effect";
import { assert, describe, expect, test } from "vitest";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";
import * as AST from "./index.js";

const ident = Result.getOrThrow(JExpr.Ident.decodeResult("x"));
const path = Result.getOrThrow(JExpr.Path.decodeResult("x"));

const depth = 20_000;

/** One id per binding of `x`, where the id at each index has that generation. */
const next = Referential.referenceProducer(Symbol("resolve_references"));
const ids = Array.makeBy(depth, () => next("value", ident));
const id = (generation: number): Referential.ReferenceId<"value"> =>
  Option.getOrThrow(Array.get(ids, generation));

/** Nests `depth` lets of `x`, each value reading the previous one, around a read of generation `last`. */
const chain = (last: number): AST.Node.Any => {
  let node: AST.Node.Any = new AST.Path(path, id(last));
  for (let generation = depth - 1; generation >= 0; generation -= 1) {
    let value: AST.Node.Any = new AST.Expr(JExpr.literal(0n));
    if (generation > 0) {
      value = new AST.Path(path, id(generation - 1));
    }

    node = new AST.Let(AST.make(id(generation), value), node);
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
