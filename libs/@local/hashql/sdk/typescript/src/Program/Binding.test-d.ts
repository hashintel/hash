import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import * as Referential from "../internal/referential.js";
import * as JExpr from "../JExpr/index.js";
import * as AST from "./AST/index.js";
import * as TAST from "./TAST/index.js";

import type * as Binding from "./Binding.js";

const produce = Referential.referenceProducer(Symbol("binding"));
const ident = Result.getOrThrow(JExpr.Ident.decodeResult("x"));
const value = new AST.Expr(JExpr.literal(1n));
const type = new TAST.Reference(
  Result.getOrThrow(JExpr.Path.decodeResult("Integer")),
  [],
);

describe("make", () => {
  test("universe_pairs", () => {
    expectTypeOf(
      AST.make(produce("value", ident), value),
    ).toEqualTypeOf<Binding.Binding.Value>();
    expectTypeOf(
      AST.make(produce("type", ident), type),
    ).toEqualTypeOf<Binding.Binding.Type>();

    // @ts-expect-error a type binding binds a type node
    AST.make(produce("type", ident), value);
    // @ts-expect-error a value binding binds a value node
    AST.make(produce("value", ident), type);
    // @ts-expect-error a module name binds no node
    AST.make(produce("module", ident), value);
  });
});
