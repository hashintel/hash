import { Result, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as Referential from "../internal/referential.js";
import * as JExpr from "../JExpr/index.js";
import * as AST from "./AST/index.js";
import * as Program from "./index.js";

import type * as Type from "../Type.js";

const compileTrusted = (
  syntax: JExpr.Expression,
): Program.ProgramError.Construction =>
  pipe(
    new AST.Expr(syntax),
    Program.Expression.fromNode<Type.Unknown, Program.Inputs.Empty>,
    Program.program,
    Program.compile,
    Result.flip,
    Result.getOrThrow,
  );

describe("compile", () => {
  test.each([
    ["nan_integer", JExpr.integer(Number.NaN)],
    ["fraction_integer", JExpr.integer(1.5)],
    ["infinite_float", JExpr.float(Number.POSITIVE_INFINITY)],
  ] as const)("%s", (_, literal) => {
    expect.hasAssertions();
    expect(compileTrusted(literal).reason._tag).toBe("InvalidExpression");
  });

  test("missing_constructor_key", () => {
    expect.hasAssertions();
    // SAFETY: none, on purpose. The test needs a tree its type forbids, as a cast or an untyped caller can build.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the assertion is the point of the test
    const unknown = {} as JExpr.Expression;
    expect(compileTrusted(JExpr.tuple(unknown)).reason._tag).toBe(
      "InvalidExpression",
    );
  });

  test("stale_reference", () => {
    expect.hasAssertions();
    const ident = Result.getOrThrow(JExpr.Ident.decodeResult("x"));
    // The handle's binding of `x` belongs to another program.
    const reference = Referential.referenceProducer(Symbol("stale_reference"))(
      "value",
      ident,
    );
    const failure = pipe(
      new AST.Path(Result.getOrThrow(JExpr.Path.decodeResult("x")), reference),
      Program.Expression.fromNode<Type.Unknown, Program.Inputs.Empty>,
      Program.program,
      Program.compile,
      Result.flip,
      Result.getOrThrow,
    );
    expect(failure.reason).toStrictEqual({
      _tag: "StaleReference",
      name: "x",
    });
  });
});
