import { Array, Option, Result, pipe } from "effect";
import { assert, describe, expect, test } from "vitest";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";
import * as TAST from "../TAST/index.js";
import * as AST from "./index.js";

const next = Referential.referenceProducer(Symbol("deep_nesting"));
const ident = Result.getOrThrow(JExpr.Ident.decodeResult("x"));
const path = Result.getOrThrow(JExpr.Path.decodeResult("x"));

const depth = 20_000;

const emit = (node: AST.Node.Any): string =>
  node.pipe(AST.compile, JExpr.compile);

/** One id per binding of `x` in a chain, where the id at each index has that generation. */
const chainIds = pipe(
  Referential.referenceProducer(Symbol("resolve_references")),
  (produce) => Array.makeBy(depth, () => produce("value", ident)),
);
const id = (generation: number): Referential.ReferenceId<"value"> =>
  Option.getOrThrow(Array.get(chainIds, generation));

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

describe("compile", () => {
  test("annotations", () => {
    expect.hasAssertions();
    const integer = new TAST.Reference(
      Result.getOrThrow(JExpr.Path.decodeResult("Integer")),
      [],
    );
    const one = new AST.Expr(JExpr.literal(1n));

    expect(
      emit(new AST.Tuple([one, one], new TAST.Tuple([integer, integer]))),
    ).toBe(
      '{"#tuple":[{"#literal":1},{"#literal":1}],"#type":"(Integer, Integer)"}',
    );
    expect(
      emit(new AST.Struct([[ident, one]], new TAST.Struct([[ident, integer]]))),
    ).toBe('{"#struct":{"x":{"#literal":1}},"#type":"(x: Integer)"}');
    expect(
      emit(
        new AST.Let(
          AST.make(next("value", ident), one),
          new AST.Path(path),
          integer,
        ),
      ),
    ).toBe('["::kernel::special_form::let","x","Integer",{"#literal":1},"x"]');
  });

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
      node = new AST.Import(
        new AST.Path(path),
        { syntax: "*", bindings: [] },
        node,
      );
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

describe("resolve_references", () => {
  test("let_annotation", () => {
    expect.hasAssertions();
    const produce = Referential.referenceProducer(Symbol("let_annotation"));
    const name = Result.getOrThrow(JExpr.Ident.decodeResult("T"));
    const first = produce("type", name);
    const second = produce("type", name);
    const integer = new TAST.Reference(
      Result.getOrThrow(JExpr.Path.decodeResult("Integer")),
      [],
    );

    // `type T = Integer in type T = Integer in let x: T = 1 in x`, where the annotation's `T` came from `reference`.
    const program = (
      reference: Referential.ReferenceId<"type">,
    ): AST.Node.Any =>
      new AST.Type(
        AST.make(first, integer),
        new AST.Type(
          AST.make(second, integer),
          new AST.Let(
            AST.make(produce("value", ident), new AST.Expr(JExpr.literal(1n))),
            new AST.Path(path),
            new TAST.Reference(
              Result.getOrThrow(JExpr.Path.decodeResult("T")),
              [],
              reference,
            ),
          ),
        ),
      );

    expect(Result.isSuccess(AST.resolveReferences(program(second)))).toBe(true);

    const stale = AST.resolveReferences(program(first));
    assert(Result.isFailure(stale));
    expect(stale.failure.reason).toStrictEqual({
      _tag: "StaleReference",
      name: "T",
    });
  });

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
