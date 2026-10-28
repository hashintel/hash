import { Option, Result } from "effect";
import { describe, expect, test } from "vitest";

import * as JExpr from "../../JExpr/index.js";
import * as AST from "./index.js";

const bind = <V>(value: V): AST.Binding<V> =>
  Result.getOrThrow(AST.make("x", value));

describe("compile", () => {
  test("deep_nesting", () => {
    expect.hasAssertions();
    const integer = Option.getOrThrow(JExpr.Type.reference("Integer"));
    const path = Result.getOrThrow(JExpr.Path.decodeResult("::core::math"));

    // Each round nests through every node kind, and through both children of `Let`.
    let node: AST.Node = new AST.Expr("x");
    for (let round = 0; round < 20_000; round += 1) {
      node = new AST.If(
        new AST.Expr(JExpr.literal(true)),
        node,
        new AST.Expr(JExpr.literal(0n)),
      );
      node = new AST.Let(bind(node), new AST.Expr("y"));
      node = new AST.Let(bind(new AST.Expr("y")), node);
      node = new AST.Type(bind(integer), node);
      node = new AST.Newtype(bind(integer), node);
      node = new AST.Import(path, "*", node);
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
