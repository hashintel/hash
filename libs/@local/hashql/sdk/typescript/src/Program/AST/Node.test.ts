import { Result } from "effect";
import { describe, expect, test } from "vitest";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";
import * as TAST from "../TAST/index.js";
import * as AST from "./index.js";

const next = Referential.referenceProducer(Symbol("deep_nesting"));
const ident = Result.getOrThrow(JExpr.Ident.decodeResult("x"));

describe("compile", () => {
  test("deep_nesting", () => {
    expect.hasAssertions();
    const integer = new TAST.Reference(
      Result.getOrThrow(JExpr.Path.decodeResult("Integer")),
      [],
    );
    const path = Result.getOrThrow(JExpr.Path.decodeResult("::core::math"));

    // Each round nests through every node kind, and through both children of `Let`.
    let node: AST.Node.Any = new AST.Expr("x");
    for (let round = 0; round < 20_000; round += 1) {
      node = new AST.If(
        new AST.Expr(JExpr.literal(true)),
        node,
        new AST.Expr(JExpr.literal(0n)),
      );
      node = new AST.Let(
        AST.make(next("value", ident), node),
        new AST.Expr("y"),
      );
      node = new AST.Let(
        AST.make(next("value", ident), new AST.Expr("y")),
        node,
      );
      node = new AST.Type(AST.make(next("type", ident), integer), node);
      node = new AST.Newtype(
        AST.make(next("type", ident), integer),
        next("value", ident),
        node,
      );
      node = new AST.Import(new AST.Path(path), "*", node);
    }

    const open = [
      '["::kernel::special_form::use","::core::math","*",',
      '["::kernel::special_form::newtype","x","Integer",',
      '["::kernel::special_form::type","x","Integer",',
      '["::kernel::special_form::let","x","y",',
      '["::kernel::special_form::let","x",',
      '["::kernel::special_form::if",{"#literal":true},',
    ].join("");
    const close = ',{"#literal":0}],"y"]]]]]';
    expect(JExpr.compile(AST.compile(node))).toBe(
      `${open.repeat(20_000)}"x"${close.repeat(20_000)}`,
    );
  });
});
