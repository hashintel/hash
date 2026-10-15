import { Cause, Result, pipe } from "effect";
import { assert, describe, expect, test } from "vitest";

import { Expression } from "../main.js";
import {
  Type as DeclareType,
  Do,
  Import,
  Let,
  Newtype,
  withPrelude,
} from "./index.js";

import type { Inputs, ProgramError, Type } from "../main.js";

const identity: unique symbol = Symbol("Exception");
type ConstructionResult = Result.Result<
  Expression.Any,
  ProgramError.Construction
>;
type SuccessBody = () => Expression.Expression<
  Type.PrimitiveInteger,
  Inputs.Empty
>;
type Vertex = Type.Struct<{ readonly enabled: Type.PrimitiveBoolean }>;
type Graph = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Vertex }>
>;
const queryContext = withPrelude({
  values: {
    entities: Expression.fromJExpr<
      Type.Function<readonly [], Graph>,
      Inputs.Empty
    >("entities"),
  },
});

describe("do_exceptions", () => {
  test.each([new Error("user exception"), "non-error", undefined])(
    "host_exception_%#",
    (thrown) => {
      expect.hasAssertions();
      const result = Do(() => {
        // oxlint-disable-next-line typescript/only-throw-error -- unchecked JavaScript callbacks can throw arbitrary values
        throw thrown;
      });
      const failure = pipe(result, Result.flip, Result.getOrThrow);
      assert(failure.reason._tag === "CallbackException");
      expect(failure.reason.cause).toBeInstanceOf(Cause.UnknownError);
      expect(failure.reason.cause.cause).toBe(thrown);
      expect(failure.message).toBe("A program callback threw an exception");
    },
  );

  test.each([
    {
      name: "let",
      run: (fail: () => never, later: SuccessBody): ConstructionResult =>
        Do(Let("value", fail), Let("later", later), later),
    },
    {
      name: "type",
      run: (fail: () => never, later: SuccessBody): ConstructionResult =>
        Do(DeclareType("Value", fail), Let("later", later), later),
    },
    {
      name: "newtype",
      run: (fail: () => never, later: SuccessBody): ConstructionResult =>
        Do(Newtype("Value", identity, fail), Let("later", later), later),
    },
    {
      name: "import",
      run: (fail: () => never, later: SuccessBody): ConstructionResult =>
        Do(Import(fail), Let("later", later), later),
    },
  ])("declaration_$name", ({ run }) => {
    expect.hasAssertions();
    const thrown = new Error("declaration callback");
    const calls: string[] = [];
    const result = run(
      () => {
        calls.push("declaration");
        throw thrown;
      },
      () => {
        calls.push("later");
        return Expression.integer(1);
      },
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "CallbackException", cause: { cause: thrown } },
      },
    });
    expect(calls).toStrictEqual(["declaration"]);
  });

  test("nested_declaration", () => {
    expect.hasAssertions();
    const thrown = new Error("nested declaration");
    let continued = false;
    const result = Do(($) => {
      const expression = $.Let("value", () => {
        throw thrown;
      }).Expr(($) => $.integer(1));
      continued = true;
      return expression;
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "CallbackException", cause: { cause: thrown } },
      },
    });
    expect(continued).toBe(true);
  });

  test("nested_body", () => {
    expect.hasAssertions();
    const thrown = new Error("nested body");
    let continued = false;
    const result = Do(($) => {
      const expression = $.Let("value", ($) => $.integer(1)).Expr(() => {
        throw thrown;
      });
      continued = true;
      return expression;
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "CallbackException", cause: { cause: thrown } },
      },
    });
    expect(continued).toBe(true);
  });

  test("consequent_exception", () => {
    expect.hasAssertions();
    const thrown = new Error("consequent callback");
    const calls: string[] = [];
    const result = Do(($) => {
      const expression = $.if(
        false,
        () => {
          calls.push("then");
          throw thrown;
        },
        () => {
          calls.push("else");
          return 1n;
        },
      );
      calls.push("body");
      return expression;
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "CallbackException", cause: { cause: thrown } },
      },
    });
    expect(calls).toStrictEqual(["then", "else", "body"]);
  });

  test("alternate_exception", () => {
    expect.hasAssertions();
    const thrown = new Error("alternate callback");
    let continued = false;
    const result = Do(($) => {
      const expression = $.if(
        true,
        () => 1n,
        () => {
          throw thrown;
        },
      );
      continued = true;
      return expression;
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "CallbackException", cause: { cause: thrown } },
      },
    });
    expect(continued).toBe(true);
  });

  test("branch_failure_priority", () => {
    expect.hasAssertions();
    const invalid = Expression.integer(Number.NaN);
    const failure = pipe(
      invalid,
      Expression.toNode,
      Result.flip,
      Result.getOrThrow,
    );
    let alternateCalled = false;
    const result = Do(($) =>
      $.if(
        false,
        () => invalid,
        () => {
          alternateCalled = true;
          throw new Error("alternate callback");
        },
      ),
    );
    expect(pipe(result, Result.flip, Result.getOrThrow)).toBe(failure);
    expect(alternateCalled).toBe(true);
  });

  test("predicate_exception", () => {
    expect.hasAssertions();
    const thrown = new Error("predicate callback");
    let continued = false;
    let laterPredicate = false;
    const result = queryContext.Do(($) => {
      const expression = $.query
        .entities()
        .filter("vertex", (): boolean => {
          throw thrown;
        })
        .filter("later", () => {
          laterPredicate = true;
          return true;
        })
        .collect();
      continued = true;
      return expression;
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "CallbackException", cause: { cause: thrown } },
      },
    });
    expect(continued).toBe(true);
    expect(laterPredicate).toBe(false);
  });
});
